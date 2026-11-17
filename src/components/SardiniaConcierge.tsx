import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

// The Sardinia concierge: holiday and yacht services on the island, its own
// page since Nov 2026 (/sardinia). Same services as before, in the public
// site's drawing-office style.

const SERVICES = [
  { label: "Moorings & dockages", note: "Berths and anchorages, booked ahead of the season." },
  { label: "Charter services", note: "Day charters and weeks aboard, matched to the party." },
  { label: "Villa brokerage", note: "Villas on the coast, for a stay or to buy." },
  { label: "Watersports", note: "Diving, foiling, kiting, with the right local people." },
  { label: "Hotels & stays", note: "Where to stay ashore, and getting the room you want." },
  { label: "Regatta planning", note: "Entries, logistics and crew for the island's regattas." },
  { label: "Boat repair & surveyors", note: "Yards, technicians and surveyors on the island." },
  { label: "Emergency assistance", note: "One number when something goes wrong, on land or afloat." },
];

const SardiniaConcierge = () => (
  <section id="sardinia" className="drafting border-b rule">
    <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mb-14 grid gap-6 lg:grid-cols-12">
        <p className="label lg:col-span-3">Sardinia concierge</p>
        <div className="lg:col-span-9">
          <h1 className="serif mb-5 text-4xl font-semibold leading-tight sm:text-6xl">
            Sardinia, <span className="italic font-normal">arranged.</span>
          </h1>
          <p className="soft max-w-2xl text-lg leading-relaxed">
            Holiday and yacht services on the island, from planning before you arrive to help during
            the stay.
          </p>
        </div>
      </div>

      <ul className="grid border-l border-t rule bg-paper sm:grid-cols-2 lg:grid-cols-4">
        {SERVICES.map((s, i) => (
          <li key={s.label} className="border-b border-r rule p-6">
            <span className="mono mark text-xs">{String(i + 1).padStart(2, "0")}</span>
            <h2 className="serif mt-4 mb-2 text-xl font-semibold">{s.label}</h2>
            <p className="soft text-[15px] leading-relaxed">{s.note}</p>
          </li>
        ))}
      </ul>

      <div className="mt-12 flex flex-wrap items-center gap-4">
        <Link to="/#contact" className="btn-ink">
          Plan a stay <ArrowRight className="h-4 w-4" />
        </Link>
        <Link to="/" className="btn-line">
          Owner's representation
        </Link>
      </div>
    </div>
  </section>
);

export default SardiniaConcierge;
