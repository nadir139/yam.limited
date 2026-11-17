import { Check, Minus } from "lucide-react";

// Where YAM differs, against the two things an owner usually compares it with.
// Columns describe kinds of service, not named firms, and say "partly" where
// that is the honest answer.

type Mark = "yes" | "part" | "no";
const ROWS: Array<{ what: string; yam: Mark; pm: Mark; sw: Mark; note?: string }> = [
  { what: "Acts only for the owner", yam: "yes", pm: "part", sw: "no", note: "Project management is often one service of a group that also sells, charters or manages yachts. Software is a tool, not a representative." },
  { what: "A naval architect reads every variation", yam: "yes", pm: "part", sw: "no" },
  { what: "Finding, price, decision and schedule linked in one record", yam: "yes", pm: "part", sw: "part" },
  { what: "An agent that notices, briefs and answers from the record", yam: "yes", pm: "no", sw: "no" },
  { what: "The record stays with the owner after delivery", yam: "yes", pm: "no", sw: "part" },
  { what: "Works without signal, in the yard and at sea", yam: "yes", pm: "no", sw: "part" },
];

const Cell = ({ m }: { m: Mark }) =>
  m === "yes" ? (
    <Check className="mx-auto h-5 w-5 mark" aria-label="Yes" />
  ) : m === "part" ? (
    <span className="mono block text-center text-[11px] soft" aria-label="Partly">partly</span>
  ) : (
    <Minus className="mx-auto h-4 w-4 soft opacity-50" aria-label="No" />
  );

const WhyYam = () => (
  <section id="why" className="border-b rule bg-paper-2">
    <div className="container mx-auto px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mb-12 grid gap-6 lg:grid-cols-12">
        <p className="label lg:col-span-3">Why YAM</p>
        <h2 className="serif text-3xl font-semibold leading-tight sm:text-5xl lg:col-span-9">
          Representation and the record, <span className="italic font-normal">from the same people.</span>
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b rule">
              <th className="w-1/2 py-3 font-normal" />
              <th className="serif py-3 text-center text-lg font-semibold">YAM</th>
              <th className="label py-3 text-center text-[10px]">Brokerage project management</th>
              <th className="label py-3 text-center text-[10px]">Refit worklist software</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.what} className="border-b rule align-middle">
                <td className="py-4 pr-6 text-[15px]">{r.what}</td>
                <td className="py-4"><Cell m={r.yam} /></td>
                <td className="py-4"><Cell m={r.pm} /></td>
                <td className="py-4"><Cell m={r.sw} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="soft mt-5 max-w-3xl text-[13px] leading-relaxed">
        A general comparison of kinds of service, not of any one firm. {ROWS[0].note}
      </p>
    </div>
  </section>
);

export default WhyYam;
