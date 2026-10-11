// Revolut Business API: the parts that need no network (migration 041).
//
// Kept free of imports so the same file runs in the Edge Function (Deno) and
// in the app's unit tests (Node): the key pair and the certificate the owner
// uploads to Revolut, the signed client assertion that proves this app is the
// one holding that key, the webhook signature check, and the mapping of a
// Revolut transaction to the ledger's import rows.
//
// The connection asks Revolut for READ only. It can see accounts and
// transactions; it cannot make a payment. Moving money is a separate,
// deliberate step (F3), never a side effect of syncing.
//
// API facts used here (Revolut Business API docs; check against the live
// sandbox before production):
//   base      https://b2b.revolut.com/api/1.0  (sandbox: sandbox-b2b.revolut.com)
//   consent   https://business.revolut.com/app-confirm?client_id&redirect_uri&response_type=code&scope
//   token     POST {base}/auth/token, form: grant_type, code | refresh_token, client_id,
//             client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer,
//             client_assertion=<JWT RS256 {iss: redirect host, sub: client_id, aud: https://revolut.com, exp}>
//   webhooks  POST https://b2b.revolut.com/api/2.0/webhooks {url, events} -> {id, signing_secret}
//             signature header Revolut-Signature: v1=<hex HMAC-SHA256 of "v1.{timestamp}.{body}">,
//             timestamp header Revolut-Request-Timestamp (ms)

export type RevolutEnvironment = "SANDBOX" | "PRODUCTION";

export const REVOLUT = {
  apiBase: (env: RevolutEnvironment) => (env === "PRODUCTION" ? "https://b2b.revolut.com/api/1.0" : "https://sandbox-b2b.revolut.com/api/1.0"),
  webhookBase: (env: RevolutEnvironment) => (env === "PRODUCTION" ? "https://b2b.revolut.com/api/2.0" : "https://sandbox-b2b.revolut.com/api/2.0"),
  consentBase: (env: RevolutEnvironment) => (env === "PRODUCTION" ? "https://business.revolut.com/app-confirm" : "https://sandbox-business.revolut.com/app-confirm"),
  scope: "READ",
};

// ─── base64 / PEM ────────────────────────────────────────────────────────────

export function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function b64url(bytes: Uint8Array): string {
  return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s.replace(/\s+/g, ""));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function toPem(label: string, der: Uint8Array): string {
  const body = b64(der).match(/.{1,64}/g)!.join("\n");
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}

export function fromPem(pem: string): Uint8Array {
  return fromB64(pem.replace(/-----(BEGIN|END) [^-]+-----/g, ""));
}

// ─── A minimal DER writer: enough for one self-signed certificate ───────────

function len(n: number): number[] {
  if (n < 0x80) return [n];
  const out: number[] = [];
  while (n > 0) {
    out.unshift(n & 0xff);
    n >>= 8;
  }
  return [0x80 | out.length, ...out];
}

function tlv(tag: number, ...parts: Uint8Array[]): Uint8Array {
  const body = concat(...parts);
  return concat(new Uint8Array([tag, ...len(body.length)]), body);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const seq = (...p: Uint8Array[]) => tlv(0x30, ...p);
const set = (...p: Uint8Array[]) => tlv(0x31, ...p);
const nul = () => new Uint8Array([0x05, 0x00]);
const utf8 = (s: string) => tlv(0x0c, new TextEncoder().encode(s));
const explicit = (n: number, inner: Uint8Array) => tlv(0xa0 + n, inner);

function int(bytes: Uint8Array): Uint8Array {
  // Positive INTEGER: no leading zeros, a 0x00 pad when the top bit is set.
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  const b = bytes.slice(i);
  return tlv(0x02, b[0] & 0x80 ? concat(new Uint8Array([0]), b) : b);
}

function oid(dotted: string): Uint8Array {
  const [a, b, ...rest] = dotted.split(".").map(Number);
  const out = [40 * a + b];
  for (const n of rest) {
    const chunk: number[] = [n & 0x7f];
    let v = Math.floor(n / 128);
    while (v > 0) {
      chunk.unshift((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    out.push(...chunk);
  }
  return tlv(0x06, new Uint8Array(out));
}

function time(d: Date): Uint8Array {
  // UTCTime up to 2049, GeneralizedTime after (RFC 5280 4.1.2.5).
  const p = (n: number) => String(n).padStart(2, "0");
  const rest = `${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  const y = d.getUTCFullYear();
  return y < 2050
    ? tlv(0x17, new TextEncoder().encode(`${String(y).slice(2)}${rest}`))
    : tlv(0x18, new TextEncoder().encode(`${y}${rest}`));
}

const SHA256_RSA = "1.2.840.113549.1.1.11";
const RSA_ALG = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

export interface KeyMaterial {
  /** PKCS#8 private key, PEM: goes to the vault, never to the browser. */
  privateKeyPem: string;
  /** Self-signed X.509 certificate, PEM: the owner uploads it to Revolut. */
  certificatePem: string;
}

/** A new RSA 2048 key pair and a self-signed certificate for it (5 years). */
export async function createKeyMaterial(commonName: string, now = new Date()): Promise<KeyMaterial> {
  const keys = (await crypto.subtle.generateKey(
    { ...RSA_ALG, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keys.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
  const serial = crypto.getRandomValues(new Uint8Array(16));
  serial[0] &= 0x7f;
  const name = seq(set(seq(oid("2.5.4.3"), utf8(commonName))));
  const alg = seq(oid(SHA256_RSA), nul());
  const notAfter = new Date(now.getTime());
  notAfter.setUTCFullYear(notAfter.getUTCFullYear() + 5);
  const tbs = seq(
    explicit(0, int(new Uint8Array([2]))), // v3
    int(serial),
    alg,
    name,
    seq(time(new Date(now.getTime() - 60_000)), time(notAfter)),
    name,
    spki,
  );
  const sig = new Uint8Array(await crypto.subtle.sign(RSA_ALG, keys.privateKey, tbs));
  const cert = seq(tbs, alg, tlv(0x03, concat(new Uint8Array([0]), sig)));
  return { privateKeyPem: toPem("PRIVATE KEY", pkcs8), certificatePem: toPem("CERTIFICATE", cert) };
}

// ─── Client assertion ──────────────────────────────────────────────────────

/** The host Revolut expects as `iss`: the redirect URI's domain, without the scheme. */
export function issuerOf(redirectUri: string): string {
  return new URL(redirectUri).host;
}

/** RS256 JWT proving this app holds the key whose certificate was uploaded. */
export async function clientAssertion(privateKeyPem: string, clientId: string, redirectUri: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = await crypto.subtle.importKey("pkcs8", fromPem(privateKeyPem), RSA_ALG, false, ["sign"]);
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const input = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iss: issuerOf(redirectUri), sub: clientId, aud: "https://revolut.com", iat: nowSec, exp: nowSec + 3600 })}`;
  const sig = new Uint8Array(await crypto.subtle.sign(RSA_ALG, key, new TextEncoder().encode(input)));
  return `${input}.${b64url(sig)}`;
}

export function consentUrl(env: RevolutEnvironment, clientId: string, redirectUri: string): string {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: REVOLUT.scope });
  return `${REVOLUT.consentBase(env)}?${q}`;
}

// ─── Webhook signature ───────────────────────────────────────────────────────

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function webhookSignature(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `v1=${hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v1.${timestamp}.${body}`)))}`;
}

/**
 * Whether a webhook came from Revolut: one of the signatures in the header
 * (Revolut sends several while a secret is being rotated) matches, and the
 * timestamp is within five minutes, so a captured request cannot be replayed
 * later.
 */
export async function verifyWebhook(secret: string, header: string | null, timestamp: string | null, body: string, nowMs = Date.now()): Promise<boolean> {
  if (!header || !timestamp || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowMs - Number(timestamp)) > 5 * 60_000) return false;
  const expected = await webhookSignature(secret, timestamp, body);
  return header.split(",").map((s) => s.trim()).some((s) => s.length === expected.length && timingSafeEqual(s, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ─── Transactions to import rows ─────────────────────────────────────────────

export interface RevolutLeg {
  leg_id: string;
  account_id: string;
  amount: number;
  fee?: number;
  currency: string;
  bill_amount?: number;
  bill_currency?: string;
  description?: string;
  balance?: number;
  counterparty?: { account_id?: string; account_type?: string; id?: string };
}

export interface RevolutTransaction {
  id: string;
  type: string;
  state: string;
  created_at: string;
  updated_at?: string;
  completed_at?: string;
  reference?: string;
  merchant?: { name?: string; city?: string; category_code?: string; country?: string };
  legs: RevolutLeg[];
}

export interface ApiImportRow {
  external_id: string;
  booked_at: string;
  amount: number;
  currency: string;
  fee: number | null;
  original_amount: number | null;
  original_currency: string | null;
  counterparty: string | null;
  description: string | null;
  reference: string | null;
  bank_category: string | null;
  state: "COMPLETED" | "PENDING" | "REVERTED" | "DECLINED" | "FAILED";
  raw: unknown;
}

const STATES: Record<string, ApiImportRow["state"]> = {
  created: "PENDING",
  pending: "PENDING",
  completed: "COMPLETED",
  declined: "DECLINED",
  failed: "FAILED",
  reverted: "REVERTED",
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One import row per leg, grouped by the Revolut account the leg is on.
 *
 * The row id is Revolut's transaction id, the same "ID" the CSV export
 * carries, so a statement imported by hand and the same transactions synced
 * from the API meet on one row instead of doubling. A transaction with two
 * legs on the same account (rare) keeps the id on the first and
 * `id:leg_id` on the others. The amount is what left or entered the account,
 * fee included, as in the CSV's "Total amount". The whole transaction is
 * kept as it came in `raw`.
 */
export function toImportRows(txs: RevolutTransaction[]): { byAccount: Map<string, ApiImportRow[]>; skipped: Array<{ id: string; reason: string }> } {
  const byAccount = new Map<string, ApiImportRow[]>();
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const tx of txs) {
    const state = STATES[String(tx.state ?? "").toLowerCase()];
    if (!state) {
      skipped.push({ id: tx.id, reason: `unknown state "${tx.state}"` });
      continue;
    }
    const seen = new Set<string>();
    for (const leg of tx.legs ?? []) {
      if (!leg.account_id || typeof leg.amount !== "number" || !/^[A-Z]{3}$/.test(leg.currency ?? "")) {
        skipped.push({ id: tx.id, reason: "a leg without account, amount or currency" });
        continue;
      }
      const external_id = seen.has(leg.account_id) ? `${tx.id}:${leg.leg_id}` : tx.id;
      seen.add(leg.account_id);
      const fee = typeof leg.fee === "number" && leg.fee !== 0 ? -Math.abs(leg.fee) : null;
      const rows = byAccount.get(leg.account_id) ?? [];
      rows.push({
        external_id,
        booked_at: new Date(tx.completed_at ?? tx.created_at).toISOString(),
        amount: round2(leg.amount + (fee ?? 0)),
        currency: leg.currency,
        fee,
        original_amount: leg.bill_currency && leg.bill_currency !== leg.currency && typeof leg.bill_amount === "number" ? leg.bill_amount : null,
        original_currency: leg.bill_currency && leg.bill_currency !== leg.currency ? leg.bill_currency : null,
        counterparty: tx.merchant?.name?.trim() || leg.description?.trim() || null,
        description: leg.description?.trim() || null,
        reference: tx.reference?.trim() || null,
        bank_category: tx.type ? String(tx.type).toUpperCase() : null,
        state,
        raw: tx,
      });
      byAccount.set(leg.account_id, rows);
    }
  }
  return { byAccount, skipped };
}
