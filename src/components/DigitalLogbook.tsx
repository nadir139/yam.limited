import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Users,
  BedDouble,
  Gauge,
  Droplets,
  BadgeCheck,
  Wrench,
  WifiOff,
  ArrowRight,
} from "lucide-react";

// The logbook used to be advertised as a separate app (digital-logbook.com).
// Since migration 032 it lives inside YAM: log days, crew, hours of rest,
// readings and the Oil Record Book are object types in the same ontology as
// the refit, linked to the same vessel and parts. So it is shown here as the
// in-service half of the world model, not as a product of its own.
//
// Each item names the ontology type it is recorded as (ontology_object_types).
const inService = [
  { icon: BookOpen, label: "Daily log", type: "LOG_DAY · LOG_ENTRY" },
  { icon: Users, label: "Crew & sea time", type: "CREW" },
  { icon: BadgeCheck, label: "Crew certificates", type: "CREW_CERTIFICATE" },
  { icon: BedDouble, label: "Hours of rest (STCW/MLC)", type: "REST_RECORD" },
  { icon: Gauge, label: "Engine hours & readings", type: "READING" },
  { icon: Wrench, label: "Service intervals", type: "SERVICE_INTERVAL" },
  { icon: Droplets, label: "Oil Record Book, Part I", type: "ORB_ENTRY" },
  { icon: WifiOff, label: "Works without signal", type: "offline outbox" },
];

/**
 * The logbook as part of the ontology. Rendered inside the Refit Intelligence
 * section (id "logbook" kept so old links still scroll here).
 */
const DigitalLogbook = ({ isVisible = true }: { isVisible?: boolean }) => {
  const navigate = useNavigate();

  return (
    <div
      id="logbook"
      className={`mb-16 rounded-2xl border border-border bg-muted/30 p-6 sm:p-8 transition-all duration-700 delay-200 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-accent">
            In service · the same record
          </span>
          <h3 className="mb-2 text-2xl font-bold text-foreground">The logbook is part of the world model</h3>
          <p className="text-muted-foreground">
            When the yard hands her back, the record keeps going. Every log day, crew member,
            rest hour, engine reading and Oil Record Book entry is an object in the same ontology
            as the refit, linked to the same parts. A defect logged at sea becomes an NCR for the
            next yard period, and engine hours move the service intervals by themselves.
          </p>
        </div>
        <button
          onClick={() => navigate("/ontology")}
          className="inline-flex flex-shrink-0 items-center gap-2 text-sm font-medium text-accent transition-colors hover:text-accent/80"
        >
          Explore the ontology
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {inService.map((item, index) => (
          <div
            key={item.label}
            className={`flex items-start gap-3 rounded-lg border border-border/50 bg-background/60 p-3 transition-all duration-500 hover:border-accent/30 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{ transitionDelay: `${index * 50}ms` }}
          >
            <item.icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent/70" />
            <span className="min-w-0">
              <span className="block text-sm text-foreground">{item.label}</span>
              <span className="block truncate font-mono text-[10px] text-muted-foreground">{item.type}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DigitalLogbook;
