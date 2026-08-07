import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  acknowledgementEmail,
  notificationEmail,
  type Inquiry,
} from "./email.ts";

// Public contact form -> this function. Three jobs, in order of priority:
//   1. Persist the lead in Postgres (the durability guarantee).
//   2. Best-effort notify info@yam.limited via Resend.
//   3. Best-effort acknowledge to the person who wrote in.
// A Resend outage must never lose a lead that already made it to the DB, so
// both sends are after the insert and neither can fail the request.

const ALLOWED_ORIGINS = new Set([
  "https://yam.limited",
  "http://localhost:8080",
]);

const PROJECT_TYPE_LABELS: Record<string, string> = {
  "new-build": "New Build Project",
  "refit": "Refit Project",
  "racing": "Racing Program",
  "consultation": "General Consultation",
  "other": "Other",
};

const CONTACT_INBOX = "info@yam.limited";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

type ValidationResult =
  | { ok: true; data: Inquiry }
  | { ok: false; error: string };

function validate(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Invalid request body" };
  }
  const { name, email, phone, projectType, message } = input as Record<string, unknown>;

  if (typeof name !== "string" || name.trim().length < 2 || name.length > 100) {
    return { ok: false, error: "Name must be 2-100 characters" };
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Please provide a valid email address" };
  }
  if (phone !== undefined && phone !== null && typeof phone !== "string") {
    return { ok: false, error: "Invalid phone number" };
  }
  if (typeof projectType !== "string" || !(projectType in PROJECT_TYPE_LABELS)) {
    return { ok: false, error: "Invalid project type" };
  }
  if (typeof message !== "string" || message.trim().length < 10 || message.length > 1000) {
    return { ok: false, error: "Message must be 10-1000 characters" };
  }

  return {
    ok: true,
    data: {
      name: name.trim(),
      email: email.trim(),
      phone: typeof phone === "string" && phone.trim() ? phone.trim() : undefined,
      projectType,
      message: message.trim(),
    },
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405, origin);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400, origin);
  }

  const validated = validate(body);
  if (!validated.ok) {
    return json({ ok: false, error: validated.error }, 400, origin);
  }
  const inquiry = validated.data;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return json({ ok: false, error: "Server misconfiguration" }, 500, origin);
  }

  // Insert first: the DB write is the durability guarantee. If Resend has an
  // outage, the lead is still on record and recoverable from the table.
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { error: insertError } = await supabase.from("contact_inquiries").insert({
    name: inquiry.name,
    email: inquiry.email,
    phone: inquiry.phone ?? null,
    project_type: inquiry.projectType,
    message: inquiry.message,
  });

  if (insertError) {
    console.error("Failed to store contact inquiry", insertError);
    return json({ ok: false, error: "Could not save your inquiry" }, 500, origin);
  }

  // From here, email is best-effort: the lead is already durably saved, so a
  // Resend failure is logged server-side, not surfaced as a failure to the visitor.
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  // yam.limited is verified in Resend (DKIM + SPF on the `send` subdomain), so
  // this can send as info@yam.limited directly -- no more shared-address
  // sandbox restriction, no more resend.dev showing up in the inbox.
  const fromAddress = Deno.env.get("RESEND_FROM_EMAIL") ||
    "YAM Yacht Architectural Management <info@yam.limited>";

  if (!resendApiKey) {
    console.error("RESEND_API_KEY not set -- inquiry saved but no email sent");
    return json({ ok: true }, 200, origin);
  }

  const label = PROJECT_TYPE_LABELS[inquiry.projectType] ?? inquiry.projectType;

  // Acknowledging the sender means this function now emails an address a
  // stranger typed in, which is a mail cannon if left unmetered: point a script
  // at it and YAM's verified domain delivers unwanted mail to whoever they
  // name. Two counters, both read off the table we just wrote to, no extra
  // schema. The lead is stored either way -- only the sending is throttled.
  const { canSend, reason } = await withinSendingLimits(supabase, inquiry.email);
  if (!canSend) {
    console.warn(`Inquiry stored but emails suppressed: ${reason}`, {
      email: inquiry.email,
    });
    return json({ ok: true }, 200, origin);
  }

  const notification = notificationEmail(inquiry, label);
  const acknowledgement = acknowledgementEmail(inquiry, label);

  // Sent in parallel and awaited together: the acknowledgement is the half the
  // visitor is waiting on, and neither should queue behind the other.
  await Promise.allSettled([
    send(resendApiKey, {
      from: fromAddress,
      to: [CONTACT_INBOX],
      // Hitting Reply in the inbox answers the client, not ourselves.
      reply_to: inquiry.email,
      ...notification,
    }, "notification"),
    send(resendApiKey, {
      from: fromAddress,
      to: [inquiry.email],
      reply_to: CONTACT_INBOX,
      ...acknowledgement,
    }, "acknowledgement"),
  ]);

  return json({ ok: true }, 200, origin);
});

interface ResendPayload {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  html: string;
  text: string;
}

async function send(apiKey: string, payload: ResendPayload, what: string): Promise<void> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`Resend ${what} failed`, res.status, await res.text());
    }
  } catch (err) {
    console.error(`Resend ${what} threw`, err);
  }
}

/**
 * Per-address and global throttles on *sending*, not on accepting.
 *
 * Per address stops the ordinary case: a double-click, or somebody submitting
 * five times because nothing seemed to happen. The global ceiling is the one
 * that matters for abuse — rotating the address defeats a per-address limit,
 * so a burst of unrelated addresses trips the circuit instead. Both are
 * deliberately generous; a real business day will not come close.
 */
async function withinSendingLimits(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  email: string,
): Promise<{ canSend: boolean; reason?: string }> {
  const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  try {
    const [{ count: fromThisAddress }, { count: fromEveryone }] = await Promise.all([
      supabase
        .from("contact_inquiries")
        .select("id", { count: "exact", head: true })
        .ilike("email", email)
        .gte("created_at", anHourAgo),
      supabase
        .from("contact_inquiries")
        .select("id", { count: "exact", head: true })
        .gte("created_at", anHourAgo),
    ]);

    if ((fromThisAddress ?? 0) > 3) {
      return { canSend: false, reason: "more than 3 from this address in an hour" };
    }
    if ((fromEveryone ?? 0) > 20) {
      return { canSend: false, reason: "more than 20 inquiries in an hour overall" };
    }
    return { canSend: true };
  } catch (err) {
    // A counting failure must not swallow a genuine enquiry's notification.
    console.error("Rate-limit check failed; sending anyway", err);
    return { canSend: true };
  }
}
