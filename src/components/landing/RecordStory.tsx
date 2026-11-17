import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Clock, Sparkles } from "lucide-react";
import DigitalLogbook from "@/components/DigitalLogbook";

// What the software does, told as one morning in a yard instead of a feature
// grid. The figures are an illustration and the section says so; the shapes
// (numbers, links, who decides, what moves) are exactly the app's.

interface Frame {
  time: string;
  verb: string;
  line: string;
  card: { tag: string; tone: "red" | "amber" | "ink" | "sea"; number: string; title: string; rows: Array<[string, string]> };
}

const FRAMES: Frame[] = [
  {
    time: "Day 3 · 09:12",
    verb: "Found",
    line: "The yard opens the stern gland and finds pitting on the starboard shaft bracket. It is recorded against the part, with photographs, before anyone has had time to call it minor.",
    card: { tag: "NCR", tone: "red", number: "NCR-014", title: "Pitting, stbd shaft bracket", rows: [["Severity", "High"], ["Part", "Shaft bracket, stbd"], ["Work package", "WP-MECH-006 Running gear"], ["Found by", "Yard surveyor"]] },
  },
  {
    time: "09:40",
    verb: "Priced",
    line: "The yard quotes a replacement. We check it against the drawing and the original scope: is it necessary, is it the right fix, is the price the market's.",
    card: { tag: "Change order", tone: "amber", number: "CO-007", title: "Replace stbd shaft bracket", rows: [["Cost", "+ €18,400"], ["Schedule", "+ 6 days"], ["Raised from", "NCR-014"], ["Checked by", "Owner's representative"]] },
  },
  {
    time: "10:05",
    verb: "Decided",
    line: "The owner sees the finding, the price and the days on one screen, and decides from a phone. The decision and its reason are kept.",
    card: { tag: "Owner approval", tone: "ink", number: "APPR-011", title: "Approved, with a note", rows: [["Tier", "2 · Owner"], ["Note", "Proceed. Bronze, not stainless."], ["Decided", "10:05, from a phone"], ["Linked", "CO-007 · NCR-014"]] },
  },
  {
    time: "10:06",
    verb: "Moved",
    line: "The schedule moves by itself, and the agent tells the team what it touches: launch, the packages waiting on the running gear, the haul-out booking.",
    card: { tag: "Agent", tone: "sea", number: "Noticed", title: "Launch moves 6 days", rows: [["Waits on it", "WP-PAINT-002 Antifouling"], ["Haul-out", "Extend booking to 14 Mar"], ["Budget", "Contingency 61% → 49%"], ["Ask", "What else is on the critical path?"]] },
  },
];

const TONE: Record<Frame["card"]["tone"], string> = {
  red: "text-[hsl(var(--mark))] border-[hsl(var(--mark)/0.4)] bg-[hsl(var(--mark)/0.08)]",
  amber: "text-amber-700 dark:text-amber-400 border-amber-600/40 bg-amber-500/10",
  ink: "ink border-[hsl(var(--ink)/0.35)] bg-[hsl(var(--ink)/0.06)]",
  sea: "sea border-[hsl(var(--sea)/0.4)] bg-[hsl(var(--sea)/0.08)]",
};

const RecordStory = () => {
  const [at, setAt] = useState(0);
  const [held, setHeld] = useState(false);
  const navigate = useNavigate();

  // Plays through once on its own; a click takes over.
  useEffect(() => {
    if (held || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setAt((i) => (i + 1) % FRAMES.length), 4500);
    return () => clearInterval(id);
  }, [held]);

  const f = FRAMES[at];

  return (
    <section id="record" className="border-b rule">
      <div className="container mx-auto px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mb-14 grid gap-6 lg:grid-cols-12">
          <p className="label lg:col-span-3">The record</p>
          <div className="lg:col-span-9">
            <h2 className="serif mb-5 text-3xl font-semibold leading-tight sm:text-5xl">
              What happens when the yard finds something.
            </h2>
            <p className="soft max-w-2xl text-lg leading-relaxed">
              Behind the representation is a live record of the project. A finding, its price, the
              owner's decision and the schedule are one chain of linked records, not four emails.
            </p>
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-12">
          {/* The timeline */}
          <ol className="lg:col-span-5">
            {FRAMES.map((fr, i) => (
              <li key={fr.verb}>
                <button
                  type="button"
                  onClick={() => {
                    setAt(i);
                    setHeld(true);
                  }}
                  className={`group grid w-full grid-cols-[5.5rem_1fr] gap-4 border-t rule py-5 text-left transition-opacity ${i === at ? "" : "opacity-55 hover:opacity-90"}`}
                  aria-current={i === at ? "step" : undefined}
                >
                  <span className="mono pt-1 text-xs soft">{fr.time}</span>
                  <span>
                    <span className="serif flex items-center gap-2 text-2xl font-semibold">
                      {i < at ? <Check className="h-4 w-4 sea" /> : <span className={`h-2 w-2 rounded-full ${i === at ? "bg-[hsl(var(--mark))]" : "bg-[hsl(var(--rule))]"}`} />}
                      {fr.verb}
                    </span>
                    {i === at && <span className="mt-2 block text-[15px] leading-relaxed soft">{fr.line}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          {/* The record card, as the app shows it */}
          <div className="lg:col-span-7">
            <div className="bg-paper-2 border rule p-4 sm:p-8">
              <div className="mb-4 flex items-center justify-between">
                <span className="label">yam.limited/app · Example refit</span>
                <span className="label flex items-center gap-1.5"><Clock className="h-3 w-3" /> {f.time}</span>
              </div>
              <div key={at} className="bg-paper animate-in fade-in slide-in-from-bottom-1 border rule p-5 duration-500 sm:p-6">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className={`mono rounded-sm border px-2 py-0.5 text-xs font-medium ${TONE[f.card.tone]}`}>
                    {f.card.tone === "sea" && <Sparkles className="-mt-0.5 mr-1 inline h-3 w-3" />}
                    {f.card.tag}
                  </span>
                  <span className="mono text-sm font-medium">{f.card.number}</span>
                </div>
                <p className="serif mb-5 text-2xl font-semibold sm:text-3xl">{f.card.title}</p>
                <dl className="grid gap-x-6 sm:grid-cols-2">
                  {f.card.rows.map(([k, v]) => (
                    <div key={k} className="border-t rule py-2.5">
                      <dt className="label text-[10px]">{k}</dt>
                      <dd className="mt-0.5 text-[15px]">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              {/* The chain so far */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {FRAMES.slice(0, at + 1).map((fr, i) => (
                  <span key={fr.verb} className="flex items-center gap-2">
                    {i > 0 && <ArrowRight className="h-3.5 w-3.5 soft" />}
                    <span className={`mono rounded-sm border px-2 py-0.5 text-[11px] ${TONE[fr.card.tone]}`}>{fr.card.number}</span>
                  </span>
                ))}
              </div>
              <p className="label mt-5 text-[10px]">Illustration · names and figures are an example</p>
            </div>
          </div>
        </div>

        {/* The agent, and the record after the yard */}
        <div className="mt-20 grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="label mb-4">The agent</p>
            <h3 className="serif mb-4 text-3xl font-semibold leading-tight">It reads the record before you do.</h3>
            <p className="soft text-[15px] leading-relaxed">
              An AI agent works on the same record, with the same permissions as the person asking.
              It writes the morning brief, notices when a finding touches the schedule or the money,
              and answers questions about any part, package or decision, citing the records it read.
              It never decides for the owner.
            </p>
          </div>
          <div className="lg:col-span-7">
            <div className="border rule bg-paper-2 p-5 sm:p-6">
              <p className="label mb-3">06:30 · Morning brief · by email and in the app</p>
              <p className="serif mb-3 text-xl font-semibold">Running gear decides the launch date this week.</p>
              <ul className="space-y-2 text-[15px] leading-relaxed">
                <li className="flex gap-3"><span className="mark">—</span>CO-007 approved; the bracket ships Thursday, fitting needs 4 days.</li>
                <li className="flex gap-3"><span className="mark">—</span>Antifouling cannot start until the bracket is in: WP-PAINT-002 has no slack left.</li>
                <li className="flex gap-3"><span className="mark">—</span>Class survey on the rudder stock is booked for Monday; the surveyor needs the drawings by Friday.</li>
              </ul>
              <p className="mt-4 text-[15px]"><span className="mono text-xs soft">Next</span> · Confirm the haul-out extension with the yard today.</p>
            </div>
          </div>
        </div>

        <div className="mt-20">
          <DigitalLogbook />
        </div>

        <div className="mt-12 flex flex-wrap gap-3">
          <button type="button" onClick={() => navigate("/ontology")} className="btn-line">
            Read the ontology behind it <ArrowRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => navigate("/login")} className="btn-line">
            Clients: sign in
          </button>
        </div>
      </div>
    </section>
  );
};

export default RecordStory;
