import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

// The logbook used to be advertised as a separate app (digital-logbook.com).
// Since migration 032 it lives inside YAM: log days, crew, hours of rest,
// readings and the Oil Record Book are object types in the same ontology as
// the refit, linked to the same vessel and parts. So it is shown as the
// in-service half of the record, each item with the type it is recorded as
// (ontology_object_types). Styled for the public site (landing.css).

const inService = [
  { label: "Daily log", type: "LOG_DAY · LOG_ENTRY" },
  { label: "Crew & sea time", type: "CREW" },
  { label: "Crew certificates", type: "CREW_CERTIFICATE" },
  { label: "Hours of rest (STCW/MLC)", type: "REST_RECORD" },
  { label: "Engine hours & readings", type: "READING" },
  { label: "Service intervals", type: "SERVICE_INTERVAL" },
  { label: "Oil Record Book, Part I", type: "ORB_ENTRY" },
  { label: "Works without signal", type: "offline outbox" },
];

const DigitalLogbook = () => {
  const navigate = useNavigate();
  return (
    <div id="logbook" className="grid gap-10 border-t rule pt-12 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <p className="label mb-4">In service · the same record</p>
        <h3 className="serif mb-4 text-3xl font-semibold leading-tight">The logbook is part of it.</h3>
        <p className="soft text-[15px] leading-relaxed">
          When the yard hands her back, the record keeps going. Log days, crew, rest hours, engine
          readings and the Oil Record Book sit in the same ontology as the refit, linked to the same
          parts. A defect logged at sea becomes a finding for the next yard period, and engine hours
          move the service intervals by themselves.
        </p>
        <button type="button" onClick={() => navigate("/ontology")} className="underline-mark mt-5 inline-flex items-center gap-2 text-[15px] font-medium">
          Explore the ontology <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <ul className="grid grid-cols-1 border-t rule sm:grid-cols-2 lg:col-span-7">
        {inService.map((item) => (
          <li key={item.label} className="flex items-baseline justify-between gap-4 border-b rule py-3 sm:odd:pr-6 sm:even:pl-6 sm:even:border-l">
            <span className="text-[15px]">{item.label}</span>
            <span className="mono shrink-0 text-[10px] soft">{item.type}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DigitalLogbook;
