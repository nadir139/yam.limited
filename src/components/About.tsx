import { useEffect, useRef, useState } from "react";
import { Award, Users, Ship, Clock } from "lucide-react";
import Logo from "@/assets/logo.svg";
const credentials = [{
  icon: Clock,
  value: "25+",
  label: "Years Experience"
}, {
  icon: Ship,
  value: "100+",
  label: "Projects Completed"
}, {
  icon: Users,
  value: "50+",
  label: "Satisfied Clients"
}, {
  icon: Award,
  value: "15+",
  label: "Industry Awards"
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
              Navigating Excellence in Yacht Management
            </h3>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                YAM - Yacht Architectural Management brings over two decades of
                experience in yacht construction oversight, project management,
                and owner representation. Our team has successfully managed
                projects ranging from custom superyachts to competitive racing
                programs.
              </p>
              <p>
                We understand that each yacht project is unique, requiring
                personalized attention and expertise. Our approach combines
                technical knowledge with strategic project management to deliver
                exceptional results while protecting your investment.
              </p>
              <p>
                With a global network of shipyards, designers, and suppliers, we
                ensure seamless coordination across all aspects of your maritime
                project, from initial concept through delivery and beyond.
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
                  <div className="text-2xl font-bold text-foreground">
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