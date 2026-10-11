import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Receipts and invoices behind bank transactions (migration 040).
//
// They live in the private `finance-receipts` bucket, which has no storage
// policies at all: no browser can list or read it. This function is the only
// way in. Every request is checked with the CALLER's own session first: the
// transaction (or receipt) must be visible to them under the finance read
// rule (owner, owner's rep, captain). Only then does it use the service role
// to store or sign. The receipt is registered through action_attach_receipt,
// also with the caller's session, so the permission check and the record of
// who attached it are theirs, not this function's.
//
// POST multipart {project_id, transaction_id, file}  -> {receipt}
// GET  ?receipt_id=...                               -> {url} (5 minutes)

const BUCKET = "finance-receipts";
const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png", "image/heic", "image/webp"]);
const ALLOWED_ORIGINS = new Set(["https://yam.limited", "https://www.yam.limited", "http://localhost:8080"]);

function cors(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://yam.limited",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Sign in first." }, 401, origin);
  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: who, error: whoError } = await asUser.auth.getUser();
  if (whoError || !who?.user) return json({ error: "Your session has expired. Sign in again." }, 401, origin);
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  try {
    if (req.method === "GET") {
      const receiptId = new URL(req.url).searchParams.get("receipt_id");
      if (!receiptId) return json({ error: "Which receipt?" }, 400, origin);
      // Visible only if the caller may read this transaction's money.
      const { data: receipt } = await asUser
        .from("finance_receipts")
        .select("id, storage_path, file_name, removed_at")
        .eq("id", receiptId)
        .maybeSingle();
      if (!receipt) return json({ error: "No receipt you can read." }, 404, origin);
      const { data: signed, error } = await service.storage.from(BUCKET).createSignedUrl(receipt.storage_path, 300, {
        download: receipt.file_name,
      });
      if (error || !signed) return json({ error: "Could not open the receipt." }, 500, origin);
      return json({ url: signed.signedUrl, file_name: receipt.file_name }, 200, origin);
    }

    if (req.method === "POST") {
      const form = await req.formData();
      const projectId = String(form.get("project_id") ?? "");
      const transactionId = String(form.get("transaction_id") ?? "");
      const file = form.get("file");
      if (!projectId || !transactionId || !(file instanceof File)) {
        return json({ error: "Send the project, the transaction and the file." }, 400, origin);
      }
      if (file.size === 0 || file.size > MAX_BYTES) return json({ error: "A receipt is up to 20 MB." }, 400, origin);
      if (!ALLOWED.has(file.type)) return json({ error: "A receipt is a PDF or a photo (JPEG, PNG, HEIC, WebP)." }, 400, origin);

      const { data: tx } = await asUser
        .from("finance_transactions")
        .select("id, project_id")
        .eq("id", transactionId)
        .maybeSingle();
      if (!tx) return json({ error: "No transaction you keep." }, 404, origin);

      const bytes = await file.arrayBuffer();
      const sha256 = await sha256Hex(bytes);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "receipt";
      const path = `${tx.project_id}/${tx.id}/${crypto.randomUUID()}_${safeName}`;

      const { error: upError } = await service.storage.from(BUCKET).upload(path, bytes, {
        contentType: file.type,
        upsert: false,
      });
      if (upError) return json({ error: `Could not store the receipt: ${upError.message}` }, 500, origin);

      const { data: attached, error: attachError } = await asUser.rpc("action_attach_receipt", {
        p_project_id: projectId,
        p_transaction_id: tx.id,
        p_storage_path: path,
        p_file_name: file.name,
        p_mime_type: file.type,
        p_size_bytes: file.size,
        p_sha256: sha256,
      });
      if (attachError) {
        // Not recorded, so not kept: a stored file nobody can find is not a receipt.
        await service.storage.from(BUCKET).remove([path]);
        return json({ error: attachError.message }, 400, origin);
      }
      return json(attached, 200, origin);
    }

    return json({ error: "Use GET or POST." }, 405, origin);
  } catch (e) {
    console.error("finance-files", e);
    return json({ error: "Something went wrong with the receipt." }, 500, origin);
  }
});
