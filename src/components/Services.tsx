import { useEffect, useRef, useState } from "react";
import {
  Building2,
  BarChart3,
  Target,
  Wrench,
  FileText,
  Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const services = [
  {
    icon: Building2,
    title: "Owner Representation",
    description:
      "Professional advocacy and oversight throughout your yacht construction or refit project, ensuring your interests are always prioritized.",
  },
  {
    icon: BarChart3,
    title: "Project Management",
    description:
      "Comprehensive project coordination from concept to delivery, managing timelines, budgets, and quality standards.",
  },
  {
    icon: Target,
    title: "Racing Program Management",
    description:
      "Expert management of competitive sailing programs, from crew coordination to logistics and performance optimization.",
  },
  {
    icon: Wrench,
    title: "Refit Coordination",
    description:
      "Strategic planning and execution of yacht refits, upgrades, and maintenance programs with minimal downtime.",
  },
  {
    icon: FileText,
    title: "Technical Documentation",
    description:
      "Detailed technical specifications, progress reports, and comprehensive project documentation.",
  },
  {
    icon: Globe,
    title: "International Coordination",
    description:
      "Seamless management across international shipyards, suppliers, and regulatory bodies worldwide.",
  },
];

const Services = () => {
  const [visibleCards, setVisibleCards] = useState<number[]>([]);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number(entry.target.getAttribute("data-index"));
            setVisibleCards((prev) =>
              prev.includes(index) ? prev : [...prev, index]
            );
          }
        });
      },
      { threshold: 0.2 }
    );

    const cards = sectionRef.current?.querySelectorAll("[data-index]");
    cards?.forEach((card) => observer.observe(card));

    return () => observer.disconnect();
  }, []);

  return (
    <section id="services" className="py-24 section-muted" ref={sectionRef}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-sm font-semibold text-accent uppercase tracking-wider mb-3">
            Our Services
          </h2>
          <h3 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Comprehensive Yacht Management
          </h3>
          <p className="text-lg text-muted-foreground">
            From concept to completion, we provide end-to-end support for your
            maritime projects with decades of industry expertise.
          </p>
        </div>

        {/* Services Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <Card
              key={service.title}
              data-index={index}
              className={`group feature-card border-border bg-card ${
                visibleCards.includes(index)
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
              style={{
                transitionDelay: `${index * 100}ms`,
              }}
            >
              <CardHeader className="pb-4">
                <div className="icon-container-lg mb-4 group-hover:bg-accent/20 group-hover:text-accent transition-colors">
                  <service.icon className="h-7 w-7" />
                </div>
                <CardTitle className="text-xl font-semibold group-hover:text-accent transition-colors">
                  {service.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">
                  {service.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Contact CTA */}
        <div className="text-center mt-12">
          <Button
            size="lg"
            onClick={() => document.querySelector("#contact")?.scrollIntoView({ behavior: "smooth" })}
            className="bg-accent hover:bg-accent/90 text-accent-foreground text-lg px-8 py-6"
          >
            Contact Us!
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Services;
