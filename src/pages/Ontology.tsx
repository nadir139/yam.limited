import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Database,
  ArrowRight,
  CheckCircle2,
  Clock,
  Circle,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

// ─── Entity type data ────────────────────────────────────────────────────────

type BadgeColor =
  | "blue"
  | "navy"
  | "teal"
  | "orange"
  | "purple"
  | "green"
  | "red"
  | "gold"
  | "slate"
  | "cyan";

interface EntityType {
  name: string;
  badgeColor: BadgeColor;
  description: string;
  properties: string[];
  links: string[];
}

const entityTypes: EntityType[] = [
  {
    name: "Vessel",
    badgeColor: "blue",
    description: "The platform object. Root node of all refit object relationships.",
    properties: [
      "hullId: String",
      "flagState: String",
      "classNotation: String",
      "grossTonnage: Float",
      "loa: Float",
    ],
    links: ["RefitProject", "SystemComponent"],
  },
  {
    name: "RefitProject",
    badgeColor: "navy",
    description:
      "Lifecycle container for a complete refit engagement. Tracks phase, budget, and milestone state.",
    properties: [
      "projectId: String",
      "phase: Enum",
      "budgetLocked: Float",
      "plannedDelivery: Date",
      "actualDelivery: Date",
    ],
    links: ["Vessel", "WorkPackage", "ChangeOrder"],
  },
  {
    name: "WorkPackage",
    badgeColor: "teal",
    description:
      "Discrete unit of scope within a refit. Assigned to a discipline and trade.",
    properties: [
      "wpId: String",
      "discipline: Enum",
      "tradeCode: String",
      "plannedHours: Float",
      "status: Enum",
    ],
    links: ["RefitProject", "Subcontractor", "InspectionEvent"],
  },
  {
    name: "ChangeOrder",
    badgeColor: "orange",
    description:
      "Scope deviation event triggered by defect discovery, owner request, or class requirement.",
    properties: [
      "coId: String",
      "triggerType: Enum",
      "costDelta: Float",
      "scheduleDelta: Integer",
      "approvalStatus: Enum",
    ],
    links: ["RefitProject", "DefectRecord", "OwnerApproval"],
  },
  {
    name: "SystemComponent",
    badgeColor: "purple",
    description:
      "Equipment and system hierarchy node. Maps to physical asset on vessel.",
    properties: [
      "componentId: String",
      "equipmentClass: String",
      "maker: String",
      "serialNumber: String",
      "installFrame: Integer",
    ],
    links: ["Vessel", "WorkPackage", "DefectRecord"],
  },
  {
    name: "InspectionEvent",
    badgeColor: "green",
    description:
      "QA/QC milestone. Triggered at phase gates and on-demand by yard, class, or owner rep.",
    properties: [
      "inspectionId: String",
      "inspector: Enum",
      "result: Enum",
      "date: Date",
      "linkedDefects: Integer",
    ],
    links: ["WorkPackage", "DefectRecord", "OwnerApproval"],
  },
  {
    name: "DefectRecord",
    badgeColor: "red",
    description:
      "Non-conformance record (NCR / punch item). Captures root cause, severity, and disposition.",
    properties: [
      "ncrId: String",
      "severity: Enum",
      "rootCause: Enum",
      "disposition: Enum",
      "closedDate: Date",
    ],
    links: ["InspectionEvent", "ChangeOrder", "SystemComponent"],
  },
  {
    name: "OwnerApproval",
    badgeColor: "gold",
    description:
      "Owner or owner's rep sign-off. Tier-gated by value threshold and decision type.",
    properties: [
      "approvalId: String",
      "approver: String",
      "tier: Enum",
      "linkedDeliverable: String",
      "signedDate: Date",
    ],
    links: ["ChangeOrder", "InspectionEvent", "RefitProject"],
  },
  {
    name: "Subcontractor",
    badgeColor: "slate",
    description:
      "Trade vendor entity. Scoped to discipline, linked to PO and work packages.",
    properties: [
      "vendorId: String",
      "discipline: String",
      "poReference: String",
      "mobilizationDate: Date",
      "status: Enum",
    ],
    links: ["WorkPackage", "ChangeOrder"],
  },
  {
    name: "DocumentRevision",
    badgeColor: "cyan",
    description:
      "Drawing or specification version. Tracks revision history and distribution state.",
    properties: [
      "docId: String",
      "revision: String",
      "status: Enum",
      "issueDate: Date",
      "distribution: Array<String>",
    ],
    links: ["WorkPackage", "OwnerApproval"],
  },
];

// ─── Badge colour map ─────────────────────────────────────────────────────────

const badgeColorClasses: Record<BadgeColor, string> = {
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  navy: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  teal: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  purple: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  green: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  gold: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  slate: "bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-300",
  cyan: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
};

// ─── Lifecycle phases ─────────────────────────────────────────────────────────

type PhaseStatus = "COMPLETE" | "ACTIVE" | "UPCOMING";

interface LifecyclePhase {
  number: number;
  name: string;
  duration: string;
  activities: string[];
  activeEntities: string[];
  status: PhaseStatus;
}

const lifecyclePhases: LifecyclePhase[] = [
  {
    number: 1,
    name: "Pre-Refit Planning",
    duration: "4–6 weeks",
    activities: [
      "Work package definition and scope lock",
      "Budget baseline and contingency allocation",
      "Subcontractor pre-qualification",
      "Owner requirements review and sign-off",
    ],
    activeEntities: ["RefitProject", "WorkPackage", "OwnerApproval", "DocumentRevision"],
    status: "COMPLETE",
  },
  {
    number: 2,
    name: "Haul-Out & Initial Survey",
    duration: "1–2 weeks",
    activities: [
      "Dry dock entry and cradle positioning",
      "Class surveyor hull and structural inspection",
      "Owner rep inspection and defect log initiation",
      "As-found condition documentation",
    ],
    activeEntities: ["Vessel", "InspectionEvent", "DefectRecord", "ChangeOrder"],
    status: "COMPLETE",
  },
  {
    number: 3,
    name: "Structural & Hull Works",
    duration: "3–6 weeks",
    activities: [
      "Steel renewal and frame repairs",
      "Abrasive blast and anti-corrosion coating",
      "Hull fittings service and replacement",
      "Underwater gear: shaft, propeller, rudder",
    ],
    activeEntities: ["WorkPackage", "SystemComponent", "Subcontractor", "DefectRecord"],
    status: "ACTIVE",
  },
  {
    number: 4,
    name: "Systems & Engineering",
    duration: "4–8 weeks",
    activities: [
      "Propulsion system overhaul",
      "Piping and seacock service",
      "Electrical panel and distribution renewal",
      "HVAC and refrigeration service",
    ],
    activeEntities: ["WorkPackage", "SystemComponent", "InspectionEvent", "DocumentRevision"],
    status: "UPCOMING",
  },
  {
    number: 5,
    name: "Interior & Outfitting",
    duration: "3–6 weeks",
    activities: [
      "Joinery repair and refinishing",
      "Soft furnishings and upholstery",
      "Systems integration testing",
      "Snagging and punch-list closure",
    ],
    activeEntities: ["WorkPackage", "OwnerApproval", "DefectRecord", "InspectionEvent"],
    status: "UPCOMING",
  },
  {
    number: 6,
    name: "Sea Trials & Delivery",
    duration: "1–2 weeks",
    activities: [
      "Commissioning and functional testing",
      "Owner acceptance trials",
      "Flag state and class final survey",
      "Documentation handover",
    ],
    activeEntities: ["RefitProject", "OwnerApproval", "DocumentRevision", "InspectionEvent"],
    status: "UPCOMING",
  },
];

// ─── Change order cascade data ────────────────────────────────────────────────

interface CascadeStep {
  step: number;
  entityType: string;
  badgeColor: BadgeColor;
  objectId: string;
  stateBefore: string;
  stateAfter: string;
  explanation: string;
}

const cascadeSteps: CascadeStep[] = [
  {
    step: 1,
    entityType: "DefectRecord",
    badgeColor: "red",
    objectId: "NCR-2026-047",
    stateBefore: "NEW",
    stateAfter: "OPEN",
    explanation:
      "Non-conformance record raised. Severity: HIGH. Root cause: CORROSION_MOISTURE_INGRESS. Disposition: PENDING.",
  },
  {
    step: 2,
    entityType: "InspectionEvent",
    badgeColor: "green",
    objectId: "INSP-HULL-003",
    stateBefore: "PASS",
    stateAfter: "CONDITIONAL_PASS",
    explanation:
      "Class hull survey result revised. Conditional approval pending steel renewal at frames 47–49.",
  },
  {
    step: 3,
    entityType: "WorkPackage",
    badgeColor: "teal",
    objectId: "WP-STRUCT-002 (Steel Renewal)",
    stateBefore: "SCOPED",
    stateAfter: "EXPANDED",
    explanation:
      "Scope extended: 3 additional frames added. Planned hours: 240h → 318h. Material order triggered.",
  },
  {
    step: 4,
    entityType: "WorkPackage",
    badgeColor: "teal",
    objectId: "WP-COAT-001 (Blast & Paint)",
    stateBefore: "SCHEDULED",
    stateAfter: "ON_HOLD",
    explanation:
      "Coating work on portside bilge section placed on hold pending steel renewal completion.",
  },
  {
    step: 5,
    entityType: "ChangeOrder",
    badgeColor: "orange",
    objectId: "CO-2026-009",
    stateBefore: "—",
    stateAfter: "CREATED",
    explanation:
      "New change order raised. Cost delta: +€47,200. Schedule delta: +12 calendar days. Trigger: CLASS_REQUIREMENT.",
  },
  {
    step: 6,
    entityType: "RefitProject",
    badgeColor: "navy",
    objectId: "PROJ-TESSERA-2026",
    stateBefore: "ON_SCHEDULE",
    stateAfter: "DELAYED",
    explanation:
      "Planned delivery revised: 19 Jun → 1 Jul 2026. Critical path impact confirmed.",
  },
  {
    step: 7,
    entityType: "OwnerApproval",
    badgeColor: "gold",
    objectId: "APPR-2026-031",
    stateBefore: "—",
    stateAfter: "PENDING",
    explanation:
      "Tier-2 approval triggered (budget threshold >€25k). Owner rep notified. Decision required within 48h.",
  },
  {
    step: 8,
    entityType: "Subcontractor",
    badgeColor: "slate",
    objectId: "Marintek Acciaio S.r.l.",
    stateBefore: "MOBILIZED",
    stateAfter: "SCHEDULE_REVISED",
    explanation:
      "Steel fabrication contractor schedule revised. Revised mobilization: +4 days. PO amendment issued.",
  },
];

// ─── Entity-name → badge color lookup ────────────────────────────────────────

const entityBadgeColor: Record<string, BadgeColor> = {
  Vessel: "blue",
  RefitProject: "navy",
  WorkPackage: "teal",
  ChangeOrder: "orange",
  SystemComponent: "purple",
  InspectionEvent: "green",
  DefectRecord: "red",
  OwnerApproval: "gold",
  Subcontractor: "slate",
  DocumentRevision: "cyan",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function EntityBadge({ name }: { name: string }) {
  const color = entityBadgeColor[name] ?? "slate";
  return (
    <span
      className={`inline-block font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded ${badgeColorClasses[color as BadgeColor]}`}
    >
      {name}
    </span>
  );
}

function EntityCard({ entity }: { entity: EntityType }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card
      className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all duration-200"
      onClick={() => setExpanded((v) => !v)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <span
              className={`inline-block font-mono text-[11px] font-bold px-2 py-0.5 rounded mb-2 ${badgeColorClasses[entity.badgeColor]}`}
            >
              {entity.name}
            </span>
            <CardTitle className="text-base leading-snug">{entity.name}</CardTitle>
          </div>
          <button className="mt-1 text-muted-foreground flex-shrink-0" aria-label="Toggle details">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-sm text-muted-foreground">{entity.description}</p>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Properties
          </p>
          <div className="bg-muted/50 rounded-md px-3 py-2 font-mono text-xs space-y-0.5">
            {(expanded ? entity.properties : entity.properties.slice(0, 3)).map((prop) => (
              <div key={prop} className="text-foreground/80">
                {prop}
              </div>
            ))}
            {!expanded && entity.properties.length > 3 && (
              <div className="text-muted-foreground">
                +{entity.properties.length - 3} more…
              </div>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Linked Objects
          </p>
          <div className="flex flex-wrap gap-1">
            {entity.links.map((link) => (
              <EntityBadge key={link} name={link} />
            ))}
          </div>
        </div>

        {expanded && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground font-mono">
              // Full property schema — Foundry-compatible object type definition
            </p>
            <pre className="mt-2 bg-muted/50 rounded-md px-3 py-2 text-xs font-mono overflow-x-auto text-foreground/80">
              {`interface ${entity.name} {\n${entity.properties.map((p) => `  ${p};`).join("\n")}\n}`}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PhaseStatusBadge({ status }: { status: PhaseStatus }) {
  if (status === "COMPLETE") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
        <CheckCircle2 className="h-3 w-3" />
        COMPLETE
      </span>
    );
  }
  if (status === "ACTIVE") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 animate-pulse-soft">
        <Clock className="h-3 w-3" />
        ACTIVE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
      <Circle className="h-3 w-3" />
      UPCOMING
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const Ontology = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="hero-gradient pt-32 pb-20 text-primary-foreground">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-accent-foreground/80 bg-white/10 px-3 py-1 rounded-full mb-4">
            Naval Domain Knowledge
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-5 text-primary-foreground">
            Refit Process Ontology
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-primary-foreground/80 mb-8">
            A field-accurate data model of superyacht refit operations — structured
            for digital twin, MES, and Foundry-compatible systems.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-white/15 border border-white/20 text-primary-foreground">
              <GitBranch className="h-3.5 w-3.5" />
              Palantir Foundry–aligned
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-white/15 border border-white/20 text-primary-foreground">
              <Database className="h-3.5 w-3.5" />
              10 Entity Types · 6 Lifecycle Phases
            </span>
          </div>
        </div>
      </section>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <section className="py-12 container mx-auto px-4 sm:px-6 lg:px-8">
        <Tabs defaultValue="entities">
          <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-grid mb-10 gap-0">
            <TabsTrigger value="entities">Entity Types</TabsTrigger>
            <TabsTrigger value="lifecycle">Refit Lifecycle</TabsTrigger>
            <TabsTrigger value="cascade">Change Order Cascade</TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Entity Types ───────────────────────────────────────── */}
          <TabsContent value="entities">
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">Ontology Entity Types</h2>
              <p className="text-muted-foreground">
                10 typed objects forming the refit knowledge graph. Click any card
                to expand the full property schema.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {entityTypes.map((entity) => (
                <EntityCard key={entity.name} entity={entity} />
              ))}
            </div>
          </TabsContent>

          {/* ── Tab 2: Refit Lifecycle ────────────────────────────────────── */}
          <TabsContent value="lifecycle">
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-2">Refit Lifecycle</h2>
              <p className="text-muted-foreground mb-6">
                Six structured phases from planning through delivery. Each phase
                activates a defined subset of entity types.
              </p>

              {/* Demo project card */}
              <Card className="mb-10 border-accent/40 bg-accent/5">
                <CardContent className="pt-5">
                  <div className="flex flex-wrap items-start gap-4 justify-between">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Demo Project
                      </p>
                      <p className="text-lg font-bold">
                        M/Y TESSERA
                        <span className="ml-3 text-sm font-normal text-muted-foreground">
                          56.4m · GRP/Steel · Refit 2026 · La Spezia, Italy
                        </span>
                      </p>
                    </div>
                    <PhaseStatusBadge status="ACTIVE" />
                  </div>
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Budget</p>
                      <p className="font-semibold">€2.4M</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Start</p>
                      <p className="font-semibold">14 Jan 2026</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Delivery</p>
                      <p className="font-semibold">19 Jun 2026</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Progress</p>
                      <p className="font-semibold">
                        Structural &amp; Hull Works
                        <span className="block text-muted-foreground text-xs font-normal">
                          Day 47 of 157
                        </span>
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Phase stepper */}
              <div className="relative">
                {/* Vertical connector line */}
                <div className="absolute left-7 top-8 bottom-8 w-px bg-border hidden sm:block" />

                <div className="space-y-6">
                  {lifecyclePhases.map((phase) => (
                    <div key={phase.number} className="flex gap-4 sm:gap-6">
                      {/* Phase number circle */}
                      <div
                        className={`relative z-10 flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold border-2 ${
                          phase.status === "COMPLETE"
                            ? "bg-green-100 border-green-400 text-green-800 dark:bg-green-900/40 dark:border-green-600 dark:text-green-300"
                            : phase.status === "ACTIVE"
                            ? "bg-blue-100 border-blue-400 text-blue-800 dark:bg-blue-900/40 dark:border-blue-500 dark:text-blue-300"
                            : "bg-muted border-border text-muted-foreground"
                        }`}
                      >
                        {phase.number}
                      </div>

                      {/* Phase content */}
                      <Card
                        className={`flex-1 ${
                          phase.status === "ACTIVE"
                            ? "border-blue-300 dark:border-blue-700 shadow-sm"
                            : ""
                        }`}
                      >
                        <CardContent className="pt-4 pb-4">
                          <div className="flex flex-wrap items-center gap-3 mb-2">
                            <h3 className="text-base font-semibold m-0 p-0">
                              {phase.name}
                            </h3>
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                              {phase.duration}
                            </span>
                            <PhaseStatusBadge status={phase.status} />
                          </div>

                          <ul className="space-y-1 mb-3">
                            {phase.activities.map((a) => (
                              <li key={a} className="text-sm text-muted-foreground flex gap-2">
                                <ArrowRight className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-accent" />
                                {a}
                              </li>
                            ))}
                          </ul>

                          <div className="flex flex-wrap gap-1 pt-2 border-t border-border">
                            {phase.activeEntities.map((e) => (
                              <EntityBadge key={e} name={e} />
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Tab 3: Change Order Cascade ───────────────────────────────── */}
          <TabsContent value="cascade">
            <div className="max-w-3xl mx-auto">
              <div className="mb-8">
                <h2 className="text-2xl font-bold mb-3">Change Order Cascade</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Standard PM tools track tasks. This ontology tracks object state.
                  When a single defect is discovered on Day 14, it triggers state
                  changes across 8 connected objects — automatically, traceably,
                  and in real time.
                </p>
              </div>

              {/* Trigger event */}
              <div className="border-2 border-red-400 dark:border-red-600 rounded-xl p-5 mb-4 bg-red-50 dark:bg-red-950/20">
                <div className="flex gap-3 items-start">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 mb-1">
                      Day 14 — Haul-Out Survey
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      Class surveyor discovers active corrosion at frames 47–49,
                      portside bilge. Thickness measurement: 6.2mm (limit: 8mm).
                      Exceeds acceptable diminution.
                    </p>
                  </div>
                </div>
              </div>

              {/* Arrow connector */}
              <div className="flex justify-center mb-1">
                <div className="flex flex-col items-center gap-0.5">
                  <div className="w-px h-4 bg-border" />
                  <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" />
                </div>
              </div>

              {/* Cascade steps */}
              <div className="space-y-2">
                {cascadeSteps.map((step, i) => (
                  <div key={step.step}>
                    <Card className="border-border hover:border-primary/30 transition-colors">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex flex-wrap items-start gap-3">
                          {/* Step number */}
                          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                            {step.step}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span
                                className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded ${badgeColorClasses[step.badgeColor]}`}
                              >
                                {step.entityType}
                              </span>
                              <span className="text-sm font-semibold text-foreground font-mono">
                                {step.objectId}
                              </span>
                            </div>

                            {/* State transition */}
                            <div className="flex items-center gap-2 mb-2">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                {step.stateBefore}
                              </code>
                              <ArrowRight className="h-3 w-3 text-accent flex-shrink-0" />
                              <code className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded font-semibold">
                                {step.stateAfter}
                              </code>
                            </div>

                            <p className="text-sm text-muted-foreground">
                              {step.explanation}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Connector between steps */}
                    {i < cascadeSteps.length - 1 && (
                      <div className="flex justify-center py-0.5">
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="w-px h-3 bg-border" />
                          <ArrowRight className="h-3 w-3 text-muted-foreground rotate-90" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Callout */}
              <div className="mt-8 p-6 rounded-xl bg-primary/5 border border-primary/20">
                <h4 className="text-base font-bold mb-2 text-primary">
                  Why this matters for digital systems
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Most MES and digital twin platforms capture task completion. They
                  do not model the{" "}
                  <em>relationships</em> between objects that cause state
                  propagation. An ontology-first approach means that when
                  NCR-2026-047 is raised, the system knows — without manual entry —
                  that coating work is blocked, that an owner approval is required,
                  and that the delivery date has moved. This is the difference
                  between a database and a knowledge graph.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </section>

      <Footer />
    </div>
  );
};

export default Ontology;
