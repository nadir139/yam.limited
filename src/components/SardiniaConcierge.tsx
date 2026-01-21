import { useEffect, useRef, useState } from "react";
import {
  Anchor,
  Sailboat,
  Home,
  Waves,
  Calendar,
  Shield,
  MapPin,
  Hotel,
  Compass,
} from "lucide-react";

const services = [
  { icon: Anchor, label: "Moorings & Dockages" },
  { icon: Sailboat, label: "Charter Services" },
  { icon: Home, label: "Villa Brokerage" },
  { icon: Waves, label: "Watersports" },
  { icon: Hotel, label: "Hotels & Stays" },
  { icon: Calendar, label: "Regatta Planning" },
  { icon: Compass, label: "Boat Repair & Surveyors" },
  { icon: Shield, label: "Emergency Assistance" },
];

const SardiniaConcierge = () => {
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
      id="sardinia"
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
          <div className="flex items-center gap-3 mb-6">
            <MapPin className="w-5 h-5 text-accent" />
            <h3 className="text-lg font-semibold text-foreground">
              Sardinia Concierge
            </h3>
          </div>

          {/* Description */}
          <p className="text-muted-foreground mb-8 max-w-2xl">
            Fully tailored holiday services in Sardinia. From pre-arrival planning 
            to on-stay assistance, we take care of every detail for an exceptional 
            Mediterranean experience.
          </p>

          {/* Services Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {services.map((service, index) => (
              <div
                key={service.label}
                className={`flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50 transition-all duration-500 hover:border-accent/30 ${
                  isVisible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-4"
                }`}
                style={{ transitionDelay: `${index * 50}ms` }}
              >
                <service.icon className="w-4 h-4 text-accent/70 flex-shrink-0" />
                <span className="text-sm text-muted-foreground">
                  {service.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SardiniaConcierge;
