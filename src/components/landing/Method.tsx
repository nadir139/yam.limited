// How YAM works, as the four moments where a refit is won or lost. Written as
// numbered notes on a drawing rather than as service cards: what goes wrong,
// then what we do about it.

const STEPS = [
  {
    n: "01",
    phase: "Before the yard",
    risk: "Most overruns are written into the specification and the contract.",
    we: "We write the specification with the captain, compare yards on the same scope, read the contract for what it leaves open, and set a budget with its contingency stated rather than hidden.",
  },
  {
    n: "02",
    phase: "In the yard",
    risk: "Findings arrive as a phone call and leave as an invoice.",
    we: "We are on site. Every finding is recorded against the part it concerns, with photographs, severity and who found it, the day it is found.",
  },
  {
    n: "03",
    phase: "Variations and decisions",
    risk: "A variation order is approved by email, before anyone has checked it was necessary.",
    we: "Each variation is priced, checked against the drawings and the original scope, and put to the owner with its cost and its days on the schedule. Nothing is approved in a thread.",
  },
  {
    n: "04",
    phase: "Delivery, and after",
    risk: "The knowledge of the refit leaves with the project team.",
    we: "Snag list, sea trials, warranty. Then the record stays with the boat: parts, service intervals, the logbook. The next yard period starts from what is known, not from memory.",
  },
];

const Method = () => (
  <section id="method" className="border-b rule">
    <div className="container mx-auto px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mb-14 grid gap-6 lg:grid-cols-12">
        <p className="label lg:col-span-3">Method</p>
        <h2 className="serif text-3xl font-semibold leading-tight sm:text-5xl lg:col-span-9">
          Refits are lost in the detail of a variation order. <span className="soft font-normal italic">We read every one.</span>
        </h2>
      </div>
      <ol className="grid border-t rule lg:grid-cols-4">
        {STEPS.map((s) => (
          <li key={s.n} className="border-b rule py-8 lg:border-b-0 lg:border-r lg:px-6 lg:py-2 lg:first:pl-0 lg:last:border-r-0">
            <p className="mono mark mb-6 text-sm">{s.n}</p>
            <h3 className="serif mb-3 text-2xl font-semibold">{s.phase}</h3>
            <p className="mb-4 text-[15px] italic leading-relaxed soft">{s.risk}</p>
            <p className="text-[15px] leading-relaxed">{s.we}</p>
          </li>
        ))}
      </ol>
    </div>
  </section>
);

export default Method;
