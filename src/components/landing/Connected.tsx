import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import OntologyMap from "@/components/landing/OntologyMap";

// The record as a graph: the object types and how they link, so a reader sees
// why a finding on a part reaches the schedule, the money and the logbook.

const Connected = () => (
  <section id="graph" className="border-b rule">
    <div className="container mx-auto px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mb-12 grid gap-6 lg:grid-cols-12">
        <p className="label lg:col-span-3">The ontology</p>
        <div className="lg:col-span-9">
          <h2 className="serif mb-5 text-3xl font-semibold leading-tight sm:text-5xl">
            One record. <span className="italic font-normal">Everything connected to the part it concerns.</span>
          </h2>
          <p className="soft max-w-2xl text-lg leading-relaxed">
            Every finding, change, decision, reading and log entry is a typed record with typed
            links. That is why a defect logged at sea reaches the next yard period, and why a
            change order can show what it touches before anyone approves it.
          </p>
        </div>
      </div>
      <OntologyMap />
      <Link to="/ontology" className="underline-mark mt-8 inline-flex items-center gap-2 text-[15px] font-medium">
        The full ontology, with every Action <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  </section>
);

export default Connected;
