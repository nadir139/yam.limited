import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  GitBranch,
  CheckCircle2,
  FileText,
  Database,
  Layers,
  ArrowRight,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const capabilities = [
  {
    icon: Database,
    label: "World Model",
    description: "Every object — vessel, survey item, NCR, change order, approval — linked and live.",
  },
  {
    icon: AlertTriangle,
    label: "Defect Records",
    description: "Raise NCRs on the hull, link to class items, trigger cost impact automatically.",
  },
  {
    icon: GitBranch,
    label: "Change Order Cascade",
    description: "One defect discovered. Eight connected objects update state — automatically.",
  },
  {
    icon: CheckCircle2,
    label: "Owner Approvals",
    description: "Tier-gated approvals routed to the right person the moment a threshold is crossed.",
  },
  {
    icon: FileText,
    label: "Document Library",
    description: "Every document linked to the object it belongs to. No orphaned PDFs.",
  },
  {
    icon: Layers,
    label: "Multi-Class Society",
    description: "RINA, Lloyd's, BV, DNV — the world model is the truth. Class is just a view.",
  },
];

const cascadeSteps = [
  { type: "DefectRecord", label: "NCR-2026-001", state: "OPEN", color: "#ef4444" },
  { type: "ChangeOrder", label: "CO-2026-001", state: "PENDING", color: "#f97316" },
  { type: "OwnerApproval", label: "APPR-2026-001", state: "PENDING", color: "#eab308" },
];

const RefitIntelligence = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.15 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="refit-intelligence"
      className="py-24 bg-background"
      ref={sectionRef}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div
          className={`text-center max-w-3xl mx-auto mb-16 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <span className="text-sm font-semibold text-accent uppercase tracking-wider mb-3 block">
            Refit & Survey Intelligence
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            The World Model for Your Vessel
          </h2>
          <p className="text-lg text-muted-foreground">
            Every survey finding, change order, approval, and document in a single structured
            system. Not a task list — a live, connected representation of your project's reality.
            Built for new builds, refits, and class surveys.
          </p>
        </div>

        {/* Main grid: capabilities left, cascade demo right */}
        <div className="grid lg:grid-cols-2 gap-12 items-start mb-16">

          {/* Capabilities */}
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 gap-4 transition-all duration-700 delay-100 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {capabilities.map((cap) => (
              <Card
                key={cap.label}
                className="border-border bg-card hover:border-primary/20 hover:-translate-y-0.5 transition-all duration-200"
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <cap.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-1">{cap.label}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{cap.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Cascade demo */}
          <div
            className={`transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <div className="rounded-xl border border-border bg-card p-6">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                Live example — Project ZERO · 55m Ketch · 5-Year Survey
              </p>

              {/* Trigger */}
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 mb-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Survey Finding · Day 1</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Starboard main engine raw water pump — active corrosion. Requires immediate replacement.
                    </p>
                  </div>
                </div>
              </div>

              {/* Cascade chain */}
              <div className="space-y-2">
                {cascadeSteps.map((step, i) => (
                  <div key={step.label} className="flex items-center gap-3">
                    {i > 0 && (
                      <div className="flex items-center gap-3 w-full">
                        <div className="w-5 flex justify-center">
                          <div className="w-px h-3 bg-border" />
                        </div>
                      </div>
                    )}
                    {i > 0 && (
                      <div className="flex items-center gap-2 -mt-1 w-full">
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded"
                              style={{ background: step.color + "20", color: step.color }}
                            >
                              {step.type}
                            </span>
                            <span className="text-xs text-foreground">{step.label}</span>
                          </div>
                          <span className="text-xs text-muted-foreground font-mono">{step.state}</span>
                        </div>
                      </div>
                    )}
                    {i === 0 && (
                      <div className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded"
                            style={{ background: step.color + "20", color: step.color }}
                          >
                            {step.type}
                          </span>
                          <span className="text-xs text-foreground">{step.label}</span>
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">{step.state}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
                One finding. Three object states updated. Owner notified automatically.
                No emails. No chasing.
              </p>
            </div>

            {/* Project stats */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              {[
                { label: "Budget", value: "€1.85M" },
                { label: "Work Packages", value: "10" },
                { label: "Survey", value: "RINA 5YR" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-border bg-card p-3 text-center"
                >
                  <p className="text-lg font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div
          className={`text-center transition-all duration-700 delay-300 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="inline-flex flex-col items-center gap-4">
            <Button
              size="lg"
              onClick={() => navigate("/login")}
              className="bg-primary hover:bg-primary/90 text-primary-foreground text-base px-8 py-6 gap-2"
            >
              <Lock className="w-4 h-4" />
              Access Project Dashboard
            </Button>
            <p className="text-sm text-muted-foreground">
              Invite-only · Role-based access · Owner, Yard, Class Surveyor views
            </p>
          </div>
        </div>

      </div>
    </section>
  );
};

export default RefitIntelligence;
