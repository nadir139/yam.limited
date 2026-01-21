import { ExternalLink } from "lucide-react";
import Logo from "@/assets/logo.svg";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <footer className="cta-gradient text-primary-foreground py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-card p-2 shadow-lg">
                <img src={Logo} alt="YAM Logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <span className="text-2xl font-bold tracking-tight">YAM</span>
                <p className="text-sm text-primary-foreground/70">
                  Yacht Architectural Management
                </p>
              </div>
            </div>
            <p className="text-primary-foreground/70 text-sm leading-relaxed">
              Expert owner representation and project management for yacht
              construction, refit, and racing programs worldwide.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-3">
              {[
                { label: "Services", href: "#services" },
                { label: "About Us", href: "#about" },
                { label: "Contact", href: "#contact" },
              ].map((link) => (
                <li key={link.href}>
                  <button
                    onClick={() => scrollToSection(link.href)}
                    className="text-primary-foreground/70 hover:text-accent transition-colors text-sm"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Services */}
          <div>
            <h4 className="font-semibold mb-4">Our Services</h4>
            <ul className="space-y-3 text-sm text-primary-foreground/70">
              <li>Owner Representation</li>
              <li>Project Management</li>
              <li>Racing Program Management</li>
              <li>Refit Coordination</li>
            </ul>
          </div>

          {/* Digital Logbook */}
          <div>
            <h4 className="font-semibold mb-4">Our Products</h4>
            <a
              href="https://digital-logbook.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-3 rounded-lg bg-primary-foreground/10 border border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20 transition-all duration-300 text-sm"
            >
              <span>Digital Logbook</span>
              <ExternalLink className="h-4 w-4" />
            </a>
            <p className="mt-3 text-sm text-primary-foreground/60">
              The modern solution for yacht documentation and operations.
            </p>
          </div>
        </div>

        {/* Bottom */}
        <div className="pt-8 border-t border-primary-foreground/10 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-primary-foreground/60">
            © {currentYear} YAM - Yacht Architectural Management. All rights
            reserved.
          </p>
          <div className="flex items-center gap-2 text-sm text-primary-foreground/60">
            <img src={Logo} alt="YAM" className="h-5 w-5" />
            <span>Navigating Excellence</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
