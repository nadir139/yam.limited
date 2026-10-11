import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  clientAssertion,
  consentUrl,
  createKeyMaterial,
  REVOLUT,
  toImportRows,
  verifyWebhook,
  type RevolutEnvironment,
  type RevolutTransaction,
} from "./revolut.ts";

// Revolut Business, connected to the ledger (migration 041).
//
// Two kinds of caller:
//   - a person, with their session (Authorization header): every operation is
//     checked first with THEIR session through finance_connect_check /
//     finance_connection_check (owner and owner's rep connect; the captain may
//     sync). Only then is the service role used, for the vault and the import.
//   - Revolut's webhook (?webhook=<connection id>): no session; the request
//     must carry a valid HMAC signature made with the secret Revolut gave when
//     the webhook was registered, and a fresh timestamp. It is never trusted
//     for content: it only prompts a sync, which reads from Revolut itself.
// Deployed with verify_jwt off for that reason; people are authenticated here.
//
// Body {op, ...}:
//   create      {project_id, environment, redirect_uri} -> {connection, certificate_pem}
//   client_id   {connection_id, client_id}              -> {connection, consent_url}
//   exchange    {connection_id, code}                   -> {connection, sync}
//   sync        {connection_id}                         -> {connection, sync}
//   disconnect  {connection_id, reason}                 -> {connection}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const ALLOWED_ORIGINS = new Set(["https://yam.limited", "https://www.yam.limited", "http://localhost:8080"]);
const REDIRECT_PATH = "/app/finance/revolut";
const FIRST_SYNC_DAYS = 400;
const OVERLAP_DAYS = 3;
const PAGE = 1000;
const MAX_PAGES = 25;

function cors(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://yam.limited",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

class UserError extends Error {}

interface Connection {
  id: string;
  project_id: string;
  vessel_id: string | null;
  environment: RevolutEnvironment;
  redirect_uri: string;
  client_id: string | null;
  status: string;
  webhook_id: string | null;
  last_synced_at: string | null;
}

const url = Deno.env.get("SUPABASE_URL")!;
const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

async function rpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new UserError(error.message);
  return data as T;
}

async function secret(connectionId: string, kind: string): Promise<string | null> {
  const value = await rpc<string | null>(service, "finance_secret_get", { p_connection_id: connectionId, p_kind: kind });
  return value ? value : null;
}

const update = (connectionId: string, patch: Record<string, unknown>, event: string | null, actor: string) =>
  rpc<Connection>(service, "finance_connection_update", { p_connection_id: connectionId, p_patch: patch, p_event: event, p_actor_name: actor });

// ─── Talking to Revolut ───────────────────────────────────────────────────────

async function token(conn: Connection, grant: Record<string, string>): Promise<{ access_token: string; refresh_token?: string }> {
  const key = await secret(conn.id, "PRIVATE_KEY");
  if (!key || !conn.client_id) throw new UserError("This connection has no key or client id: start it again.");
  const body = new URLSearchParams({
    ...grant,
    client_id: conn.client_id,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: await clientAssertion(key, conn.client_id, conn.redirect_uri),
  });
  const res = await fetch(`${REVOLUT.apiBase(conn.environment)}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    // Revolut answers a refresh token that expired or was revoked with 400/401;
    // the owner has to approve again in Revolut.
    const err = new UserError(`Revolut refused the token request (${res.status}): ${text.slice(0, 300)}`);
    (err as UserError & { reconsent?: boolean }).reconsent = grant.grant_type === "refresh_token" && (res.status === 400 || res.status === 401);
    throw err;
  }
  return JSON.parse(text);
}

async function accessToken(conn: Connection): Promise<string> {
  const refresh = await secret(conn.id, "REFRESH_TOKEN");
  if (!refresh) throw new UserError("Not connected: approve the connection in Revolut first.");
  const t = await token(conn, { grant_type: "refresh_token", refresh_token: refresh });
  // Revolut may rotate the refresh token; keep the newest.
  if (t.refresh_token && t.refresh_token !== refresh) {
    await rpc(service, "finance_secret_put", { p_connection_id: conn.id, p_kind: "REFRESH_TOKEN", p_value: t.refresh_token });
  }
  return t.access_token;
}

async function revolutGet<T>(conn: Connection, access: string, path: string): Promise<T> {
  const res = await fetch(`${REVOLUT.apiBase(conn.environment)}${path}`, { headers: { Authorization: `Bearer ${access}` } });
  const text = await res.text();
  if (!res.ok) throw new UserError(`Revolut ${path.split("?")[0]} answered ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

// ─── Sync ────────────────────────────────────────────────────────────────────

interface SyncResult {
  accounts: number;
  transactions_read: number;
  new: number;
  changed: number;
  unchanged: number;
  skipped: Array<{ id: string; reason: string }>;
  from: string;
}

async function sync(conn: Connection, actor: string): Promise<{ connection: Connection; sync: SyncResult }> {
  try {
    const access = await accessToken(conn);
    const accounts = await revolutGet<Array<{ id: string; name?: string; currency: string; state?: string }>>(conn, access, "/accounts");
    const ledgerAccount = new Map<string, string>();
    for (const a of accounts) {
      if (a.state && a.state !== "active") continue;
      const acc = await rpc<{ id: string }>(service, "finance_api_account", {
        p_connection_id: conn.id,
        p_external_id: a.id,
        p_name: a.name ?? "",
        p_currency: a.currency,
        p_actor_name: actor,
      });
      ledgerAccount.set(a.id, acc.id);
    }

    // From the last sync, with a few days of overlap so a transaction that
    // changed state since is read again; the first sync goes back a year.
    const fromMs = conn.last_synced_at
      ? Date.parse(conn.last_synced_at) - OVERLAP_DAYS * 86_400_000
      : Date.now() - FIRST_SYNC_DAYS * 86_400_000;
    const from = new Date(fromMs).toISOString();
    const txs: RevolutTransaction[] = [];
    let to = new Date().toISOString();
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = new URLSearchParams({ from, to, count: String(PAGE) });
      const batch = await revolutGet<RevolutTransaction[]>(conn, access, `/transactions?${q}`);
      txs.push(...batch);
      if (batch.length < PAGE) break;
      // Newest first: the next page ends where this one's oldest began.
      to = batch[batch.length - 1].created_at;
    }
    const unique = [...new Map(txs.map((t) => [t.id, t])).values()];
    const { byAccount, skipped } = toImportRows(unique);
    const result: SyncResult = { accounts: ledgerAccount.size, transactions_read: unique.length, new: 0, changed: 0, unchanged: 0, skipped, from };
    for (const [revolutAccountId, rows] of byAccount) {
      const accountId = ledgerAccount.get(revolutAccountId);
      if (!accountId) {
        skipped.push({ id: revolutAccountId, reason: `${rows.length} rows on an account Revolut did not list as active` });
        continue;
      }
      for (let i = 0; i < rows.length; i += 1000) {
        const imp = await rpc<{ new_count: number; changed_count: number; unchanged_count: number }>(service, "finance_api_import", {
          p_account_id: accountId,
          p_rows: rows.slice(i, i + 1000),
          p_actor_name: actor,
        });
        result.new += imp.new_count;
        result.changed += imp.changed_count;
        result.unchanged += imp.unchanged_count;
      }
    }
    const connection = await update(conn.id, { last_synced_at: new Date().toISOString(), last_sync_result: result, last_error: null, last_error_at: null }, null, actor);
    return { connection, sync: result };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const reconsent = (e as { reconsent?: boolean }).reconsent === true;
    await update(
      conn.id,
      { last_error: message, last_error_at: new Date().toISOString(), ...(reconsent ? { status: "NEEDS_RECONSENT" } : {}) },
      reconsent ? "FINANCE_CONNECTION_NEEDS_RECONSENT" : null,
      actor,
    ).catch(() => {});
    throw e;
  }
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

async function webhook(req: Request, connectionId: string): Promise<Response> {
  const body = await req.text();
  const { data: conn } = await service.from("finance_connections").select("*").eq("id", connectionId).maybeSingle();
  const signingSecret = conn ? await secret(connectionId, "WEBHOOK_SECRET") : null;
  const ok = !!conn && !!signingSecret &&
    (await verifyWebhook(signingSecret, req.headers.get("Revolut-Signature"), req.headers.get("Revolut-Request-Timestamp"), body));
  // Same answer for an unknown connection and a bad signature: nothing to learn.
  if (!ok) return new Response("invalid signature", { status: 401 });
  if (conn.status !== "CONNECTED") return new Response("ok", { status: 200 });
  // Answer at once; read from Revolut after. The payload itself is not used.
  const work = sync(conn as Connection, "Revolut (webhook)").catch((e) => console.error("webhook sync", connectionId, e));
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
  else await work;
  return new Response("ok", { status: 200 });
}

// ─── People ───────────────────────────────────────────────────────────────────

async function handle(req: Request, origin: string | null): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Sign in first." }, 401, origin);
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: who, error: whoError } = await asUser.auth.getUser();
  if (whoError || !who?.user) return json({ error: "Your session has expired. Sign in again." }, 401, origin);

  const body = await req.json().catch(() => ({}));
  const op = String(body.op ?? "");

  if (op === "create") {
    const check = await rpc<{ project_id: string; actor_name: string }>(asUser, "finance_connect_check", { p_project_id: body.project_id });
    const environment = body.environment === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
    let redirect: URL;
    try {
      redirect = new URL(String(body.redirect_uri));
    } catch {
      throw new UserError("The redirect address is not a URL.");
    }
    if (!ALLOWED_ORIGINS.has(redirect.origin) || redirect.pathname !== REDIRECT_PATH) {
      throw new UserError(`The redirect address must be ${[...ALLOWED_ORIGINS][0]}${REDIRECT_PATH}.`);
    }
    const km = await createKeyMaterial(redirect.host);
    const connection = await rpc<Connection>(service, "finance_connection_create", {
      p_project_id: check.project_id,
      p_environment: environment,
      p_redirect_uri: redirect.origin + REDIRECT_PATH,
      p_certificate_pem: km.certificatePem,
      p_private_key: km.privateKeyPem,
      p_actor_name: check.actor_name,
    });
    return json({ connection, certificate_pem: km.certificatePem }, 200, origin);
  }

  const manage = op !== "sync";
  const check = await rpc<{ connection: Connection; actor_name: string }>(asUser, "finance_connection_check", {
    p_connection_id: body.connection_id,
    p_manage: manage,
  });
  const conn = check.connection;
  const actor = check.actor_name;

  if (op === "client_id") {
    const clientId = String(body.client_id ?? "").trim();
    if (!/^[A-Za-z0-9_\-.]{8,200}$/.test(clientId)) throw new UserError("That does not look like a Revolut client ID.");
    if (conn.status === "DISCONNECTED") throw new UserError("This connection was disconnected: start a new one.");
    const connection = await update(conn.id, { client_id: clientId, status: "AWAITING_CONSENT" }, "FINANCE_CONNECTION_CLIENT_ID", actor);
    return json({ connection, consent_url: consentUrl(conn.environment, clientId, conn.redirect_uri) }, 200, origin);
  }

  if (op === "exchange") {
    const code = String(body.code ?? "").trim();
    if (!code) throw new UserError("Revolut sent no code back.");
    if (!["AWAITING_CONSENT", "NEEDS_RECONSENT"].includes(conn.status)) throw new UserError("This connection is not waiting for approval.");
    const t = await token(conn, { grant_type: "authorization_code", code });
    if (!t.refresh_token) throw new UserError("Revolut sent no refresh token.");
    await rpc(service, "finance_secret_put", { p_connection_id: conn.id, p_kind: "REFRESH_TOKEN", p_value: t.refresh_token });
    let connection = await update(
      conn.id,
      { status: "CONNECTED", connected_at: new Date().toISOString(), connected_by_name: actor, last_error: null, last_error_at: null },
      "FINANCE_CONNECTED",
      actor,
    );
    // Live updates. Best effort: without a webhook, "Sync now" still works.
    if (!conn.webhook_id) {
      try {
        const res = await fetch(`${REVOLUT.webhookBase(conn.environment)}/webhooks`, {
          method: "POST",
          headers: { Authorization: `Bearer ${t.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: `${url}/functions/v1/revolut?webhook=${conn.id}`, events: ["TransactionCreated", "TransactionStateChanged"] }),
        });
        const hook = await res.json();
        if (!res.ok || !hook.id || !hook.signing_secret) throw new Error(`webhook ${res.status}: ${JSON.stringify(hook).slice(0, 200)}`);
        await rpc(service, "finance_secret_put", { p_connection_id: conn.id, p_kind: "WEBHOOK_SECRET", p_value: hook.signing_secret });
        connection = await update(conn.id, { webhook_id: hook.id }, "FINANCE_CONNECTION_WEBHOOK", actor);
      } catch (e) {
        connection = await update(conn.id, { last_error: `Live updates not set up: ${e instanceof Error ? e.message : e}`, last_error_at: new Date().toISOString() }, null, actor);
      }
    }
    const result = await sync(connection, actor);
    return json(result, 200, origin);
  }

  if (op === "sync") {
    if (conn.status !== "CONNECTED") throw new UserError("Not connected.");
    return json(await sync(conn, actor), 200, origin);
  }

  if (op === "disconnect") {
    const reason = String(body.reason ?? "").trim();
    if (reason.length < 3) throw new UserError("Say why it is disconnected.");
    if (conn.webhook_id) {
      try {
        const access = await accessToken(conn);
        await fetch(`${REVOLUT.webhookBase(conn.environment)}/webhooks/${conn.webhook_id}`, { method: "DELETE", headers: { Authorization: `Bearer ${access}` } });
      } catch (e) {
        console.error("webhook delete", conn.id, e);
      }
    }
    await rpc(service, "finance_secrets_revoke", { p_connection_id: conn.id });
    const connection = await update(
      conn.id,
      { status: "DISCONNECTED", disconnected_at: new Date().toISOString(), disconnected_by_name: actor, disconnected_reason: reason },
      "FINANCE_DISCONNECTED",
      actor,
    );
    return json({ connection }, 200, origin);
  }

  return json({ error: `Unknown operation "${op}"` }, 400, origin);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, origin);
  const hook = new URL(req.url).searchParams.get("webhook");
  try {
    if (hook) return await webhook(req, hook);
    return await handle(req, origin);
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, 400, origin);
    console.error("revolut", e);
    return json({ error: "Something went wrong talking to Revolut. Try again." }, 500, origin);
  }
});
