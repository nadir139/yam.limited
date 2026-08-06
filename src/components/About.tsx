import { useEffect, useRef, useState } from "react";
import { Award, Compass, Ship, Waves } from "lucide-react";
import Logo from "@/assets/logo.svg";

// Four facts, each of which survives being checked.
//
// This block previously read 25+ years, 100+ projects, 50+ clients and 15+
// industry awards. None of it was true, it was inherited template copy, and it
// contradicted the hero section's "10+ years" three screens above. In a market
// of a few thousand qualified buyers who all know each other, one prospect
// noticing that is the whole reputation.
const credentials = [{
  icon: Award,
  value: "First Class Hons",
  label: "BEng Yacht & Powercraft Design, Southampton Solent"
}, {
  icon: Ship,
  value: "56 m",
  label: "Ketch new build, technical team — Perini Navi"
}, {
  icon: Waves,
  value: "100,000+",
  label: "Nautical miles logged"
}, {
  icon: Compass,
  value: "6",
  label: "Ocean crossings — five Atlantic, one Pacific"
}];
const About = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
      }
    }, {
      threshold: 0.2
    });
    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }
    return () => observer.disconnect();
  }, []);
  return <section id="about" className="py-24 bg-background" ref={sectionRef}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Content */}
          <div className={`transition-all duration-700 ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"}`}>
            <h2 className="text-sm font-semibold text-accent uppercase tracking-wider mb-3">
              About YAM
            </h2>
            <h3 className="text-3xl sm:text-4xl font-bold text-foreground mb-6">
              A naval architect on your side of the table
            </h3>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                YAM is led by Nadir Balena — First Class Honours in Yacht &amp;
                Powercraft Design from Southampton Solent, then a decade spent
                alternating between the yard and the rail. Project engineer at
                Perini Navi coordinating the technical team on a 56-metre ketch
                new build. Project manager for the Aragon 72 refit programme and
                for SY Sonny. Sailing certification and optimisation on a
                63-metre sailing yacht.
              </p>
              <p>
                That combination is the point. Refits are lost in the details of
                a variation order, and the person reading it for you should be
                able to tell whether the work was necessary. Having personally
                run a complete mast and rigging refit on a J-Class — owning the
                worklist and the deadline — and brought a 115-footer back from
                keel structure to rudder bearings, the answer comes from
                experience rather than from asking the yard.
              </p>
              <p>
                The same person still races. Tactics and navigation for first in
                class at the 2026 St Barth Bucket and the Antigua Superyacht
                Challenge aboard the 68-metre schooner Adix, and first at the
                Richard Mille Cup in Scotland aboard SY Sonny; hydraulics for an
                America's Cup and a SailGP team. A boat that has been optimised
                properly is a boat that was specified properly, and both
                conversations happen with the same yards.
              </p>
              <p>
                Working languages: Italian, English and Spanish. Based in
                Sardinia, working across Mediterranean and Caribbean yards.
              </p>
            </div>

            {/* Credentials Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-10">
              {credentials.map((credential, index) => <div key={credential.label} className={`stat-card transition-all duration-500 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`} style={{
              transitionDelay: `${(index + 2) * 150}ms`
            }}>
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-accent/10 mb-3">
                    <credential.icon className="h-6 w-6 text-accent" />
                  </div>
                  {/* A degree classification is not a number and does not want
                      a number's type size — at 2xl "First Class Hons" wraps to
                      three lines and unbalances the row. */}
                  <div
                    className={`font-bold text-foreground ${
                      credential.value.length > 8 ? "text-lg leading-tight" : "text-2xl"
                    }`}
                  >
                    {credential.value}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {credential.label}
                  </div>
                </div>)}
            </div>
          </div>

          {/* Image */}
          <div className={`relative transition-all duration-700 delay-300 ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}>
            <div className="relative aspect-square max-w-md mx-auto">
              {/* Decorative elements */}
              <div className="absolute -top-4 -right-4 w-full h-full border-2 border-accent/20 rounded-2xl" />
              <div className="absolute -bottom-4 -left-4 w-full h-full bg-gradient-to-br from-primary/10 to-accent/10 rounded-2xl" />
              
              {/* Main image container */}
              <div className="relative cta-gradient rounded-2xl p-12 flex flex-col items-center justify-center h-full glow-primary gap-6">
                <img src={Logo} alt="YAM - Yacht Architectural Management" className="w-32 h-auto object-contain animate-boat-wave" />
                <a href="https://digital-logbook.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 bg-background/10 backdrop-blur-sm border border-primary-foreground/20 rounded-full text-primary-foreground text-sm font-medium hover:bg-background/20 transition-all duration-300 hover:scale-105">
                  <Ship className="w-4 h-4" />
                  Explore Digital Logbook
                </a>
                
                {/* Floating promo badge */}
                
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>;
};
export default About;