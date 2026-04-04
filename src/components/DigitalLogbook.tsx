import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Users,
  Clock,
  FileText,
  Ship,
  Download,
  Search,
  Globe,
} from "lucide-react";

const features = [
  { icon: BookOpen, label: "Daily Voyage Logs" },
  { icon: Users, label: "Crew Management" },
  { icon: Clock, label: "Hours of Rest (STCW/MLC)" },
  { icon: FileText, label: "Quick Notes" },
  { icon: Ship, label: "Multi-Vessel Fleet" },
  { icon: Download, label: "Export & Reports" },
  { icon: Search, label: "Instant Record Access" },
  { icon: Globe, label: "Log From Anywhere" },
];

const DigitalLogbook = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );
    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="logbook"
      className="py-16 bg-muted/30 border-y border-border/50"
      ref={sectionRef}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={`max-w-4xl mx-auto transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-accent" />
              <h3 className="text-lg font-semibold text-foreground">
                Digital Logbook
              </h3>
            </div>
            <Link
              to="/app/dashboard"
              className="inline-flex items-center gap-2 text-sm text-accent hover:text-accent/80 transition-colors"
            >
              Open Dashboard →
            </Link>
          </div>

          {/* Description */}
          <p className="text-muted-foreground mb-4 max-w-2xl">
            Purpose-built tools for maritime operations. Simple enough for daily use,
            comprehensive enough for audits. Document every passage, track crew hours,
            and maintain compliance with international regulations.
          </p>

          {/* Live project indicator */}
          <p className="text-sm text-muted-foreground mb-8 flex items-center gap-2">
            <span style={{ color: '#22c55e', fontSize: '16px', lineHeight: 1 }}>●</span>
            Currently tracking: Project ZERO — 55m Ketch, 5-Year Survey 2026
          </p>

          {/* Features Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {features.map((feature, index) => (
              <div
                key={feature.label}
                className={`flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50 transition-all duration-500 hover:border-accent/30 ${
                  isVisible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-4"
                }`}
                style={{ transitionDelay: `${index * 50}ms` }}
              >
                <feature.icon className="w-4 h-4 text-accent/70 flex-shrink-0" />
                <span className="text-sm text-muted-foreground">
                  {feature.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default DigitalLogbook;
