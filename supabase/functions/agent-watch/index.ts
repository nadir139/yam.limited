import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

// agent-watch: the agent speaking first (migration 046).
//
// Called by the database, never by a browser:
//   { mode: "event", event_id }   -- from the trigger on world_model_events
//   { mode: "morning", project_id?, email? } -- from pg_cron at 05:30 UTC
//
// It reads the record around what happened (service role), asks Claude for a
// short note in structured JSON, and writes it to agent_notes, which members
// read under RLS and the app shows live. The morning run also writes a brief
// per project, notes for payment stages coming due, and emails the brief to
// members who turned that on (project_members.agent_brief_email).
//
// Auth: the caller sends x-agent-watch, compared with the secret the database
// keeps in Vault (agent_watch_secret()); deployed with verify_jwt off.

const MODEL = "claude-opus-5-5";
const APP_URL = "https://yam.limited";
const MONEY_ROLES = new Set(["OWNER", "OWNERS_REP", "CAPTAIN", "YARD_PM"]);

const db: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

type Ref = { type: string; id: string; label: string };
type Refs = Record<string, Ref>;
interface Written {
  title: string;
  body: string;
  suggestion: string;
}

// ─── Auth ──────────────────────────────────────────────────────────────────

let secret: string | null = null;
async function authorised(req: Request): Promise<boolean> {
  const sent = req.headers.get("x-agent-watch");
  if (!sent) return false;
  if (!secret) {
    const { data, error } = await db.rpc("agent_watch_secret");
    if (error || !data) {
      console.error("agent_watch_secret unavailable", error);
      return false;
    }
    secret = data as string;
  }
  // Constant-time comparison.
  if (sent.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < sent.length; i++) diff |= sent.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

// ─── Claude ────────────────────────────────────────────────────────────────

const NOTE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Under 80 characters. Starts with the record number when there is one." },
    body: { type: "string" },
    suggestion: { type: "string", description: "One question the reader could ask the agent next, under 120 characters." },
  },
  required: ["title", "body", "suggestion"],
  additionalProperties: false,
} as const;

const SYSTEM = `You are YAM's agent, the project's world-model assistant for yacht refits, surveys and operations. ` +
  `You write short notes that people read on a phone between jobs. Be concrete and specific to the data given: ` +
  `name records by their number exactly as written (NCR-2026-001, WP-MECH-004, CO-2026-002, APPR-2026-003), ` +
  `give amounts with the euro sign, and never invent a record, date or amount that is not in the data. ` +
  `Plain sentences, no headings, no emoji, no greeting.`;

/** One structured call. Returns null on refusal or unusable output; the caller skips the note. */
async function write(prompt: string, effort: "low" | "medium"): Promise<Written | null> {
  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
      output_config: { effort, format: { type: "json_schema", schema: NOTE_SCHEMA } },
      // Opus 5.5's classifiers can decline; "default" re-runs on the recommended fallback.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      console.warn("note not written", response.stop_reason);
      return null;
    }
    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text;
    if (!text) return null;
    const parsed = JSON.parse(text) as Written;
    if (!parsed.title?.trim() || !parsed.body?.trim()) return null;
    return {
      title: parsed.title.trim().slice(0, 140),
      body: parsed.body.trim().slice(0, 2000),
      suggestion: (parsed.suggestion ?? "").trim().slice(0, 200),
    };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) console.error("Claude rate limited", err.message);
    else if (err instanceof Anthropic.APIError) console.error(`Claude API error ${err.status}`, err.message);
    else console.error("note failed", err);
    return null;
  }
}

// ─── Reading the record ──────────────────────────────────────────────────────

const euro = (n: unknown) => (typeof n === "number" || typeof n === "string") && Number(n) ? `€${Number(n).toLocaleString("en-GB")}` : null;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);

async function projectHeader(projectId: string) {
  const { data } = await db
    .from("projects")
    .select("id, name, project_type, phase, yard_name, yard_location, vessel:vessels(name, asset_kind)")
    .eq("id", projectId)
    .maybeSingle();
  return data as null | {
    id: string; name: string; project_type: string; phase: string;
    yard_name: string | null; yard_location: string | null;
    vessel: { name: string; asset_kind: string } | null;
  };
}

const describeProject = (p: NonNullable<Awaited<ReturnType<typeof projectHeader>>>) =>
  `Project "${p.name}"${p.vessel?.name ? ` on ${p.vessel.name}` : ""}, a ${p.project_type.replace(/_/g, " ").toLowerCase()} ` +
  `in the ${p.phase.replace(/_/g, " ").toLowerCase()} phase${p.yard_name ? ` at ${[p.yard_name, p.yard_location].filter(Boolean).join(", ")}` : ""}.`;

// ─── Event notes ───────────────────────────────────────────────────────────────

async function onEvent(eventId: string) {
  const { data: ev } = await db.from("world_model_events").select("*").eq("id", eventId).maybeSingle();
  if (!ev) return { skipped: "no event" };
  const project = await projectHeader(ev.project_id);
  if (!project) return { skipped: "no project" };

  const refs: Refs = {};
  const facts: string[] = [];
  let number: string | null = null;
  const add = (type: string, id: string, num: string | null, label: string) => {
    if (num) refs[num] = { type, id, label };
  };

  // What followed from it in the same Action (NCR → change order → approval).
  const { data: cascade } = await db
    .from("world_model_events")
    .select("event_type, object_type, object_id, after_state")
    .eq("cascade_from_event_id", ev.id);

  switch (ev.object_type) {
    case "DEFECT_RECORD": {
      const { data: d } = await db.from("defect_records").select("*").eq("id", ev.object_id).maybeSingle();
      if (!d) return { skipped: "no NCR" };
      number = d.ncr_number;
      add("DEFECT_RECORD", d.id, d.ncr_number, d.title);
      facts.push(`NCR ${d.ncr_number}: "${d.title}". Severity ${d.severity}, status ${d.status}.` +
        (d.location_on_vessel ? ` Location: ${d.location_on_vessel}.` : "") +
        (euro(d.cost_impact) ? ` Cost impact ${euro(d.cost_impact)}.` : "") +
        (d.schedule_impact_days ? ` Schedule impact ${d.schedule_impact_days} days.` : "") +
        (d.is_class_defect ? ` Class item${d.class_item_ref ? ` ${d.class_item_ref}` : ""}.` : "") +
        (d.description ? ` Description: ${String(d.description).slice(0, 600)}` : ""));
      if (d.work_package_id) {
        const { data: wp } = await db.from("work_packages").select("id, wp_number, title, status, planned_end").eq("id", d.work_package_id).maybeSingle();
        if (wp) {
          add("WORK_PACKAGE", wp.id, wp.wp_number, wp.title);
          facts.push(`It is on work package ${wp.wp_number} "${wp.title}" (${wp.status}${wp.planned_end ? `, planned to end ${wp.planned_end}` : ""}).`);
        }
      }
      const { count } = await db.from("defect_records").select("id", { count: "exact", head: true })
        .eq("project_id", ev.project_id).neq("status", "CLOSED");
      facts.push(`Open NCRs on the project now: ${count ?? "unknown"}.`);
      break;
    }
    case "CHANGE_ORDER": {
      const { data: c } = await db.from("change_orders").select("*").eq("id", ev.object_id).maybeSingle();
      if (!c) return { skipped: "no CO" };
      number = c.co_number;
      add("CHANGE_ORDER", c.id, c.co_number, c.title);
      facts.push(`Change order ${c.co_number}: "${c.title}". Status ${c.status}.` +
        (euro(c.cost_delta) ? ` Cost ${euro(c.cost_delta)}.` : "") +
        (c.schedule_delta_days ? ` Schedule ${c.schedule_delta_days} days.` : "") +
        (c.description ? ` ${String(c.description).slice(0, 600)}` : ""));
      if (c.defect_record_id) {
        const { data: d } = await db.from("defect_records").select("id, ncr_number, title, severity").eq("id", c.defect_record_id).maybeSingle();
        if (d) {
          add("DEFECT_RECORD", d.id, d.ncr_number, d.title);
          facts.push(`Raised from NCR ${d.ncr_number} "${d.title}" (${d.severity}).`);
        }
      }
      break;
    }
    case "OWNER_APPROVAL": {
      const { data: a } = await db.from("owner_approvals").select("*").eq("id", ev.object_id).maybeSingle();
      if (!a) return { skipped: "no approval" };
      number = a.approval_number;
      add("OWNER_APPROVAL", a.id, a.approval_number, a.title);
      facts.push(`Owner approval ${a.approval_number}: "${a.title}". ${a.tier}, status ${a.status}.` +
        (euro(a.cost_amount) ? ` Amount ${euro(a.cost_amount)}.` : "") +
        (a.deadline ? ` Decision needed by ${a.deadline}.` : "") +
        (a.description ? ` ${String(a.description).slice(0, 600)}` : ""));
      if (a.change_order_id) {
        const { data: c } = await db.from("change_orders").select("id, co_number, title, schedule_delta_days").eq("id", a.change_order_id).maybeSingle();
        if (c) {
          add("CHANGE_ORDER", c.id, c.co_number, c.title);
          facts.push(`For change order ${c.co_number} "${c.title}"${c.schedule_delta_days ? `, ${c.schedule_delta_days} days on the schedule` : ""}.`);
        }
      }
      break;
    }
    case "INSPECTION_EVENT": {
      const { data: i } = await db.from("inspection_events").select("*").eq("id", ev.object_id).maybeSingle();
      if (!i || i.result === "PASS" || i.result === "PENDING") return { skipped: "inspection passed or pending" };
      number = i.inspection_number;
      add("INSPECTION_EVENT", i.id, i.inspection_number, i.title);
      facts.push(`Inspection ${i.inspection_number} "${i.title}" came back ${i.result}.` +
        (i.inspector_name ? ` Inspector: ${i.inspector_name}.` : "") +
        (i.is_class_inspection ? " Class inspection." : "") +
        (i.notes ? ` Notes: ${String(i.notes).slice(0, 600)}` : ""));
      const { data: ds } = await db.from("defect_records").select("id, ncr_number, title, severity").eq("inspection_event_id", i.id).limit(10);
      for (const d of ds ?? []) {
        add("DEFECT_RECORD", d.id, d.ncr_number, d.title);
        facts.push(`Finding: NCR ${d.ncr_number} "${d.title}" (${d.severity}).`);
      }
      break;
    }
    case "WORK_PACKAGE": {
      const { data: w } = await db.from("work_packages").select("*").eq("id", ev.object_id).maybeSingle();
      if (!w || w.status !== "ON_HOLD") return { skipped: "not on hold" };
      number = w.wp_number;
      add("WORK_PACKAGE", w.id, w.wp_number, w.title);
      facts.push(`Work package ${w.wp_number} "${w.title}" was put ON HOLD.` +
        (w.planned_end ? ` It was planned to end ${w.planned_end}.` : "") +
        (w.trade_contractor ? ` Contractor: ${w.trade_contractor}.` : ""));
      const { data: next } = await db.from("work_package_dependencies").select("successor_id").eq("predecessor_id", w.id).is("removed_at", null);
      if (next?.length) {
        const { data: succ } = await db.from("work_packages").select("id, wp_number, title").in("id", next.map((n) => n.successor_id));
        for (const s of succ ?? []) {
          add("WORK_PACKAGE", s.id, s.wp_number, s.title);
          facts.push(`Waits on it: ${s.wp_number} "${s.title}".`);
        }
      }
      break;
    }
    default:
      return { skipped: `object type ${ev.object_type}` };
  }

  for (const c of cascade ?? []) {
    const label = c.after_state?.title ?? "";
    const num = c.after_state?.co_number ?? c.after_state?.approval_number ?? c.after_state?.ncr_number ?? null;
    if (num && c.object_id) add(c.object_type, c.object_id, num, label);
    facts.push(`In the same step the system created ${c.object_type.replace(/_/g, " ").toLowerCase()}${num ? ` ${num}` : ""}${label ? ` "${label}"` : ""}.`);
  }

  const note = await write(
    `${describeProject(project)}\n\nJust now ${ev.triggered_by_name ?? "someone"} recorded: ${ev.event_type.replace(/_/g, " ").toLowerCase()}.\n\n` +
      facts.join("\n") +
      `\n\nWrite a note for the team. title: what happened, starting with the record number. ` +
      `body: one to three sentences on why it matters and what it touches (work, cost, schedule, class, who must act). ` +
      `suggestion: the most useful next question to ask you about it.`,
    "low",
  );
  if (!note) return { skipped: "not written" };

  const { error } = await db.from("agent_notes").insert({
    project_id: ev.project_id,
    kind: "NOTICE",
    audience: "ALL",
    title: note.title,
    body: note.body,
    suggestion: note.suggestion || null,
    object_type: ev.object_type,
    object_id: ev.object_id,
    object_number: number,
    refs,
    source_event_id: ev.id,
    dedupe_key: `event:${ev.id}`,
  });
  if (error && error.code !== "23505") throw error;
  return { written: note.title };
}

// ─── Morning ───────────────────────────────────────────────────────────────────

async function gather(projectId: string, withMoney: boolean) {
  const t = today();
  const soon = addDays(t, 7);
  const refs: Refs = {};
  const lines: string[] = [];
  const add = (type: string, id: string, num: string | null, label: string) => {
    if (num) refs[num] = { type, id, label };
  };

  const [ncrs, appr, cos, wps, insp, certs, items, events] = await Promise.all([
    db.from("defect_records").select("id, ncr_number, title, severity, status, cost_impact, discovered_date")
      .eq("project_id", projectId).neq("status", "CLOSED").order("discovered_date").limit(25),
    db.from("owner_approvals").select("id, approval_number, title, tier, requested_date, deadline, cost_amount")
      .eq("project_id", projectId).eq("status", "PENDING").limit(15),
    db.from("change_orders").select("id, co_number, title, status, cost_delta, schedule_delta_days")
      .eq("project_id", projectId).in("status", ["DRAFT", "PENDING_APPROVAL"]).limit(15),
    db.from("work_packages").select("id, wp_number, title, status, planned_end, baseline_end")
      .eq("project_id", projectId).not("status", "in", "(COMPLETE,DRAFT)").lte("planned_end", soon).limit(20),
    db.from("inspection_events").select("id, inspection_number, title, scheduled_date, is_class_inspection")
      .eq("project_id", projectId).eq("result", "PENDING").gte("scheduled_date", t).lte("scheduled_date", soon).limit(10),
    db.from("crew_certificates").select("id, title, expires_on, crew:crew(first_name, last_name)")
      .eq("project_id", projectId).is("retired_at", null).lte("expires_on", addDays(t, 60)).limit(10),
    db.from("action_items").select("id, body, assignee_name, due_date, status")
      .eq("project_id", projectId).in("status", ["OPEN", "ACKNOWLEDGED"]).limit(15),
    db.from("world_model_events").select("event_type")
      .eq("project_id", projectId).gte("triggered_at", new Date(Date.now() - 86_400_000).toISOString()).limit(500),
  ]);

  for (const d of ncrs.data ?? []) {
    add("DEFECT_RECORD", d.id, d.ncr_number, d.title);
    lines.push(`Open NCR ${d.ncr_number} "${d.title}": ${d.severity}, ${d.status}, found ${d.discovered_date}${euro(d.cost_impact) ? `, ${euro(d.cost_impact)}` : ""}.`);
  }
  for (const a of appr.data ?? []) {
    add("OWNER_APPROVAL", a.id, a.approval_number, a.title);
    lines.push(`Pending owner approval ${a.approval_number} "${a.title}" (${a.tier}) since ${a.requested_date}${a.deadline ? `, needed by ${a.deadline}` : ""}${euro(a.cost_amount) ? `, ${euro(a.cost_amount)}` : ""}.`);
  }
  for (const c of cos.data ?? []) {
    add("CHANGE_ORDER", c.id, c.co_number, c.title);
    lines.push(`Change order ${c.co_number} "${c.title}" ${c.status}${euro(c.cost_delta) ? `, ${euro(c.cost_delta)}` : ""}${c.schedule_delta_days ? `, ${c.schedule_delta_days} days` : ""}.`);
  }
  for (const w of wps.data ?? []) {
    add("WORK_PACKAGE", w.id, w.wp_number, w.title);
    const late = w.planned_end && w.planned_end < t;
    lines.push(`Work package ${w.wp_number} "${w.title}" ${w.status}, ${late ? "LATE: was due" : "due"} ${w.planned_end}${w.baseline_end && w.baseline_end !== w.planned_end ? ` (baseline ${w.baseline_end})` : ""}.`);
  }
  for (const i of insp.data ?? []) {
    add("INSPECTION_EVENT", i.id, i.inspection_number, i.title);
    lines.push(`Inspection ${i.inspection_number} "${i.title}" scheduled ${i.scheduled_date}${i.is_class_inspection ? " (class)" : ""}.`);
  }
  for (const c of certs.data ?? []) {
    const who = (c as { crew?: { first_name?: string; last_name?: string } }).crew;
    lines.push(`Crew certificate "${c.title}"${who ? ` of ${[who.first_name, who.last_name].filter(Boolean).join(" ")}` : ""} expires ${c.expires_on}.`);
  }
  for (const a of items.data ?? []) {
    lines.push(`Open action item for ${a.assignee_name ?? "someone"}: "${String(a.body).slice(0, 140)}"${a.due_date ? `, due ${a.due_date}` : ""}.`);
  }
  try {
    const { data: due } = await db.rpc("service_due", { p_project_id: projectId });
    for (const s of ((due ?? []) as Array<Record<string, unknown>>).filter((s) => s.status !== "OK").slice(0, 10)) {
      lines.push(`Service "${s.title}" on ${s.part_name}: ${s.status}${s.due_on ? `, due ${s.due_on}` : ""}${s.hours_left != null ? `, ${s.hours_left} h left` : ""}.`);
    }
  } catch { /* projects without maintenance */ }

  const money: Array<{ id: string; title: string; amount: number; due_date: string; status: string; payee: string; currency: string }> = [];
  if (withMoney) {
    const { data: ms } = await db.from("payment_milestones")
      .select("id, title, amount, due_date, status, agreement:payment_agreements!inner(project_id, payee, currency, status)")
      .eq("agreement.project_id", projectId).in("status", ["PENDING", "RELEASE_REQUESTED", "APPROVED"])
      .lte("due_date", addDays(t, 7)).limit(10);
    type Stage = { id: string; title: string; amount: number | string; due_date: string; status: string; agreement?: { payee?: string; currency?: string } };
    for (const m of (ms ?? []) as unknown as Stage[]) {
      money.push({ id: m.id, title: m.title, amount: Number(m.amount), due_date: m.due_date, status: m.status, payee: m.agreement?.payee ?? "", currency: m.agreement?.currency ?? "EUR" });
      lines.push(`Payment stage "${m.title}" to ${m.agreement?.payee ?? "the payee"}: ${m.amount} ${m.agreement?.currency ?? "EUR"}, ${m.status}, ${m.due_date < t ? "OVERDUE since" : "due"} ${m.due_date}.`);
    }
  }

  const counts = new Map<string, number>();
  for (const e of events.data ?? []) counts.set(e.event_type, (counts.get(e.event_type) ?? 0) + 1);
  const yesterday = [...counts].map(([k, n]) => `${n}× ${k.replace(/_/g, " ").toLowerCase()}`).join(", ");

  return { refs, lines, yesterday, money };
}

async function morning(onlyProject?: string, sendEmail = true) {
  let q = db.from("projects").select("id");
  if (onlyProject) q = q.eq("id", onlyProject);
  const { data: projects } = await q;
  const out: Array<Record<string, unknown>> = [];
  const t = today();

  for (const { id } of projects ?? []) {
    const project = await projectHeader(id);
    if (!project) continue;
    const briefs: Partial<Record<"ALL" | "MONEY", Written & { refs: Refs }>> = {};

    for (const audience of ["ALL", "MONEY"] as const) {
      const g = await gather(id, audience === "MONEY");
      // The money brief only when there is money to talk about.
      if (audience === "MONEY" && g.money.length === 0) break;
      if (g.lines.length === 0 && !g.yesterday) continue; // a quiet project gets no brief

      const note = await write(
        `${describeProject(project)} Today is ${t}.\n\n` +
          `In the last 24 hours: ${g.yesterday || "nothing was recorded"}.\n\nThe record this morning:\n` +
          (g.lines.join("\n") || "Nothing open.") +
          `\n\nWrite the morning brief. title: one line on the state of the project today. ` +
          `body: 3 to 5 bullets, each starting with "- ", most urgent first, then a last line starting "Next: " with the one thing to do first today. ` +
          `suggestion: the most useful question to ask you this morning.`,
        "medium",
      );
      if (!note) continue;
      briefs[audience] = { ...note, refs: g.refs };
      await db.from("agent_notes").upsert({
        project_id: id, kind: "BRIEF", audience, title: note.title, body: note.body,
        suggestion: note.suggestion || null, refs: g.refs, dedupe_key: `brief:${id}:${t}:${audience}`,
      }, { onConflict: "dedupe_key", ignoreDuplicates: true });

      // Payment stages coming due: a plain note each, once a day, money audience only.
      for (const m of g.money) {
        await db.from("agent_notes").upsert({
          project_id: id, kind: "NOTICE", audience: "MONEY",
          title: `Payment stage ${m.due_date < t ? "overdue" : "due"}: ${m.title}`,
          body: `${m.amount.toLocaleString("en-GB")} ${m.currency} to ${m.payee || "the payee"}, ${m.status.replace(/_/g, " ").toLowerCase()}, ${m.due_date < t ? "was due" : "due"} ${m.due_date}.`,
          suggestion: `Is "${m.title}" ready to release, and what is still missing?`,
          object_type: null, object_id: null, dedupe_key: `payment-due:${m.id}:${t}`,
        }, { onConflict: "dedupe_key", ignoreDuplicates: true });
      }
    }

    let emailed = 0;
    if (sendEmail && (briefs.ALL || briefs.MONEY)) emailed = await emailBrief(project, briefs);
    out.push({ project: project.name, briefs: Object.keys(briefs), emailed });
  }
  return out;
}

// ─── Email ─────────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function briefHtml(projectName: string, brief: Written) {
  const lines = brief.body.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => l.startsWith("- ")).map((l) => `<li style="margin:0 0 6px">${esc(l.slice(2))}</li>`).join("");
  const rest = lines.filter((l) => !l.startsWith("- ")).map((l) => `<p style="margin:12px 0 0">${esc(l)}</p>`).join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
  <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#0d9488;margin:0 0 4px">YAM · ${esc(projectName)}</p>
  <h1 style="font-size:18px;margin:0 0 12px">${esc(brief.title)}</h1>
  <ul style="padding-left:18px;margin:0;font-size:14px;line-height:1.5">${bullets}</ul>${rest}
  <p style="margin:20px 0"><a href="${APP_URL}/app/dashboard" style="background:#0f766e;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-size:14px">Open YAM</a></p>
  <p style="font-size:11px;color:#64748b">Written by the YAM agent from the project record. You get this because you turned on the morning email in YAM; turn it off on the dashboard.</p>
</div>`;
}

async function emailBrief(
  project: NonNullable<Awaited<ReturnType<typeof projectHeader>>>,
  briefs: Partial<Record<"ALL" | "MONEY", Written>>,
): Promise<number> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    console.warn("RESEND_API_KEY is not set; no brief emails");
    return 0;
  }
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "YAM <info@yam.limited>";
  const { data: members } = await db.from("project_members").select("email, role")
    .eq("project_id", project.id).eq("agent_brief_email", true).neq("status", "LEFT");
  let sent = 0;
  for (const m of members ?? []) {
    if (!m.email) continue;
    const brief = (MONEY_ROLES.has(m.role) && briefs.MONEY) || briefs.ALL;
    if (!brief) continue;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [m.email],
        subject: `${project.vessel?.name ?? project.name} · ${brief.title}`.slice(0, 150),
        html: briefHtml(project.name, brief),
      }),
    });
    if (res.ok) sent++;
    else console.error("brief email failed", res.status, await res.text().catch(() => ""));
  }
  return sent;
}

// ─── Entry ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!(await authorised(req))) return new Response("Forbidden", { status: 403 });

  let body: { mode?: string; event_id?: string; project_id?: string; email?: boolean; wait?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const job = (async () => {
    if (body.mode === "event" && body.event_id) return await onEvent(body.event_id);
    if (body.mode === "morning") return await morning(body.project_id, body.email !== false);
    return { skipped: "unknown mode" };
  })().catch((err) => {
    console.error("agent-watch failed", err);
    return { error: String(err?.message ?? err) };
  });

  // pg_net does not wait for the answer: reply at once and finish in the
  // background, unless the caller asked to wait (a manual test).
  if (body.wait) return Response.json(await job);
  const runtime = (globalThis as unknown as { EdgeRuntime: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  runtime.waitUntil(job.then((r) => console.log("agent-watch", body.mode, JSON.stringify(r))));
  return Response.json({ accepted: true }, { status: 202 });
});
