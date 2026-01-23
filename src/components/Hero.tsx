import { ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import Logo from "@/assets/logo.svg";
import AsciiVideo from "@/components/AsciiVideo";
const Hero = () => {
  const scrollToServices = () => {
    const element = document.querySelector("#services");
    if (element) {
      element.scrollIntoView({
        behavior: "smooth"
      });
    }
  };
  const scrollToContact = () => {
    const element = document.querySelector("#contact");
    if (element) {
      element.scrollIntoView({
        behavior: "smooth"
      });
    }
  };
  return <section className="relative min-h-screen flex flex-col hero-gradient overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent/30 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary-foreground/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/10 rounded-full blur-3xl" />
      </div>

      {/* Wave decoration at bottom */}
      <div className="wave-decoration" />

      {/* ASCII Video - Full width below navbar */}
      <div className="relative z-10 w-full mt-16 px-2 sm:px-4">
        <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] max-h-[70vh] mx-auto overflow-hidden rounded-lg bg-slate-900/95">
          {/* ASCII Video Background */}
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <AsciiVideo className="text-cyan-400/90" fps={24} />
          </div>
          {/* Logo Overlay - centered */}
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src={Logo}
              alt="YAM Logo"
              className="w-20 h-20 sm:w-28 sm:h-28 md:w-36 md:h-36 lg:w-44 lg:h-44 object-contain [&_*]:stroke-white [&_.cls-1]:stroke-white [&_.cls-2]:stroke-white [&_path]:fill-white"
              style={{ filter: 'drop-shadow(0 0 15px rgba(255,255,255,0.5))' }}
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 flex-1 flex items-center">
        <div className="max-w-4xl mx-auto text-center w-full py-8">

          {/* Main Headline */}
          

          {/* Subtitle */}
          <p className="animate-fade-up-delay-2 text-xl sm:text-2xl text-primary-foreground/80 mb-8 max-w-2xl mx-auto leading-relaxed">
            Premium yacht project management and owner representation for discerning clients worldwide.
          </p>

          {/* CTA Buttons */}
          <div className="animate-fade-up-delay-3 flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={scrollToContact} className="bg-accent hover:bg-accent/90 text-accent-foreground px-8 py-6 text-lg shadow-lg">
              Start Your Project
            </Button>
            <Button size="lg" variant="outline" onClick={scrollToServices} className="bg-transparent border-2 border-primary-foreground/30 hover:bg-primary-foreground/10 text-primary-foreground px-8 py-6 text-lg">
              Our Services
            </Button>
          </div>

          {/* Digital Logbook Promotion */}
          <div className="animate-fade-up-delay-3 mt-8">
            <a href="https://digital-logbook.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary-foreground/10 border border-primary-foreground/20 text-primary-foreground/90 hover:bg-primary-foreground/20 transition-all duration-300 text-sm">
              <span>Discover Digital Logbook</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          {/* Stats */}
          <div className="animate-fade-up-delay-3 mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto">
            <div className="text-center">
              <div className="text-3xl sm:text-4xl font-bold text-slate-50">10+</div>
              <div className="text-sm text-primary-foreground/60 mt-1">Years Experience</div>
            </div>
            <div className="text-center">
              <div className="text-3xl sm:text-4xl font-bold text-slate-50">10+</div>
              <div className="text-sm text-primary-foreground/60 mt-1">Projects</div>
            </div>
            <div className="text-center">
              <div className="text-3xl sm:text-4xl font-bold text-slate-50">+50</div>
              <div className="text-sm text-primary-foreground/60 mt-1">Clients</div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <button onClick={scrollToServices} className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-primary-foreground/60 hover:text-primary-foreground transition-colors" aria-label="Scroll to services">
        <ChevronDown className="h-8 w-8" />
      </button>
    </section>;
};
export default Hero;