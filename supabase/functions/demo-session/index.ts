import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// yam.limited/demo -> this function. Gives a visitor their own demo boat.
//
//   1. Purge a few expired sandboxes: Storage files, rows (demo_purge), user.
//   2. Create a throwaway user: visitor-<id>@demo.yam.limited, confirmed, with
//      app_metadata.yam_demo = true (only the service role can set that; the
//      database guards in migration 049 key off it). No email is ever sent.
//   3. Seed their sandbox (demo_create_sandbox: rate-limited to 60 an hour).
//   4. Return a one-time sign-in token hash. The browser exchanges it with
//      supabase.auth.verifyOtp(); no password, nothing to leak.
//
// Public (verify_jwt = false): it is the way in for people with no account.

const ALLOWED_ORIGINS = new Set([
  "https://yam.limited",
  "https://www.yam.limited",
  "http://localhost:8080",
]);

const BUCKET = "project-documents";
const PURGE_PER_REQUEST = 5;

function corsHeaders(origin: string | null): HeadersInit {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://yam.limited";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

/** Every object under a folder, depth-first. Storage lists one level at a time. */
async function listAll(service: SupabaseClient, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 4) return [];
  const { data, error } = await service.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error || !data) return [];
  const paths: string[] = [];
  for (const entry of data) {
    const path = `${prefix}/${entry.name}`;
    // Folders come back without an id.
    if (entry.id) paths.push(path);
    else paths.push(...(await listAll(service, path, depth + 1)));
  }
  return paths;
}

/** Remove expired sandboxes. Best effort: a failure here must not block a visitor. */
async function purgeExpired(service: SupabaseClient) {
  const { data: expired, error } = await service
    .from("demo_sessions")
    .select("user_id, project_id")
    .lt("expires_at", new Date().toISOString())
    .order("expires_at")
    .limit(PURGE_PER_REQUEST);
  if (error) {
    console.error("demo-session: could not list expired sandboxes", error);
    return;
  }
  for (const s of expired ?? []) {
    try {
      const files = await listAll(service, s.project_id);
      if (files.length > 0) await service.storage.from(BUCKET).remove(files);
      const { error: purgeError } = await service.rpc("demo_purge", { p_user_id: s.user_id });
      if (purgeError) throw purgeError;
      await service.auth.admin.deleteUser(s.user_id);
    } catch (err) {
      console.error("demo-session: purge failed for", s.user_id, err);
    }
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  await purgeExpired(service);

  const email = `visitor-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}@demo.yam.limited`;
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { yam_demo: true },
    user_metadata: { name: "Demo visitor" },
  });
  if (createError || !created?.user) {
    console.error("demo-session: createUser failed", createError);
    return json({ error: "The demo could not start. Try again in a minute." }, 503, origin);
  }
  const userId = created.user.id;

  const { data: projectId, error: seedError } = await service.rpc("demo_create_sandbox", {
    p_user_id: userId,
    p_email: email,
  });
  if (seedError || !projectId) {
    console.error("demo-session: seeding failed", seedError);
    await service.auth.admin.deleteUser(userId);
    // P0001 messages from the seed are written for visitors ("The demo is busy…").
    const message = seedError?.code === "P0001" ? seedError.message : "The demo could not start. Try again in a minute.";
    return json({ error: message }, 503, origin);
  }

  const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error("demo-session: generateLink failed", linkError);
    await service.rpc("demo_purge", { p_user_id: userId });
    await service.auth.admin.deleteUser(userId);
    return json({ error: "The demo could not start. Try again in a minute." }, 503, origin);
  }

  return json({ token_hash: tokenHash, project_id: projectId }, 200, origin);
});
