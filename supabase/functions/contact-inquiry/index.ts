import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Public contact form -> this function. Two jobs, in order of priority:
//   1. Persist the lead in Postgres (the durability guarantee).
//   2. Best-effort notify info@yam.limited via Resend.
// A Resend outage must never lose a lead that already made it to the DB.

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface InquiryInput {
  name: string;
  email: string;
  phone?: string;
  projectType: string;
  message: string;
}

type ValidationResult =
  | { ok: true; data: InquiryInput }
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
  const fromAddress = Deno.env.get("RESEND_FROM_EMAIL") || "YAM Website <onboarding@resend.dev>";

  if (!resendApiKey) {
    console.error("RESEND_API_KEY not set -- inquiry saved but no email sent");
    return json({ ok: true }, 200, origin);
  }

  const label = PROJECT_TYPE_LABELS[inquiry.projectType] ?? inquiry.projectType;
  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [CONTACT_INBOX],
        reply_to: inquiry.email,
        subject: `YAM Inquiry: ${label}`,
        html: `
          <p><strong>Name:</strong> ${escapeHtml(inquiry.name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(inquiry.email)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(inquiry.phone || "Not provided")}</p>
          <p><strong>Project Type:</strong> ${escapeHtml(label)}</p>
          <p><strong>Message:</strong></p>
          <p>${escapeHtml(inquiry.message).replace(/\n/g, "<br>")}</p>
        `,
      }),
    });

    if (!resendRes.ok) {
      console.error("Resend send failed", resendRes.status, await resendRes.text());
    }
  } catch (err) {
    console.error("Resend request threw", err);
  }

  return json({ ok: true }, 200, origin);
});
