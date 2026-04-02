import { useState, useEffect } from "react";
import { Menu } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import Logo from "@/assets/logo.svg";
import { ThemeToggle } from "./ThemeToggle";

const navLinks = [
  { href: "#services", label: "Services" },
  { href: "#about", label: "About" },
  { href: "#contact", label: "Contact" },
];

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isOntologyPage = location.pathname === "/ontology";

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (href: string) => {
    if (isOntologyPage) {
      // Navigate home first, then scroll
      navigate("/");
      setTimeout(() => {
        const element = document.querySelector(href);
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
        }
      }, 100);
      return;
    }
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "glass shadow-lg"
          : "bg-transparent"
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <a
            href={isOntologyPage ? "/" : "#"}
            onClick={(e) => {
              e.preventDefault();
              if (isOntologyPage) {
                navigate("/");
              } else {
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
            className="flex items-center gap-3"
          >
            <img src={Logo} alt="YAM Logo" className="h-12 sm:h-14 w-auto drop-shadow-md" />
            <div>
              <span className={`text-lg sm:text-2xl font-bold tracking-tight ${isScrolled ? 'text-primary' : 'text-primary-foreground'}`}>YAM</span>
              <p className={`text-[10px] sm:text-xs tracking-wide ${isScrolled ? 'text-muted-foreground' : 'text-primary-foreground/70'}`}>
                Yacht Architectural Management
              </p>
            </div>
          </a>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => scrollToSection(link.href)}
                className={`nav-link font-medium ${isScrolled ? 'text-foreground/80 hover:text-primary' : 'text-primary-foreground/80 hover:text-primary-foreground'}`}
              >
                {link.label}
              </button>
            ))}
            <button
              onClick={() => navigate("/ontology")}
              className={`nav-link font-medium ${isScrolled ? 'text-foreground/80 hover:text-primary' : 'text-primary-foreground/80 hover:text-primary-foreground'}`}
            >
              Ontology
            </button>
            <Button
              onClick={() => scrollToSection("#contact")}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              Get in Touch
            </Button>
            <ThemeToggle variant="navbar" isScrolled={isScrolled} />
          </div>

          {/* Mobile Navigation */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle variant="navbar" isScrolled={isScrolled} />
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className={isScrolled ? '' : 'text-primary-foreground hover:bg-primary-foreground/10'}>
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </SheetTrigger>
            <SheetContent side="right" className="w-[280px] bg-background">
              <div className="flex flex-col gap-8 mt-8">
                <div className="flex items-center gap-3">
                  <img src={Logo} alt="YAM Logo" className="h-12 w-auto" />
                  <span className="text-xl font-bold text-primary">YAM</span>
                </div>
                <nav className="flex flex-col gap-4">
                  {navLinks.map((link) => (
                    <SheetClose asChild key={link.href}>
                      <button
                        onClick={() => scrollToSection(link.href)}
                        className="text-lg font-medium text-foreground/80 hover:text-primary transition-colors text-left py-2"
                      >
                        {link.label}
                      </button>
                    </SheetClose>
                  ))}
                  <SheetClose asChild>
                    <button
                      onClick={() => navigate("/ontology")}
                      className="text-lg font-medium text-foreground/80 hover:text-primary transition-colors text-left py-2"
                    >
                      Ontology
                    </button>
                  </SheetClose>
                  <SheetClose asChild>
                    <Button
                      onClick={() => scrollToSection("#contact")}
                      className="mt-4 bg-accent hover:bg-accent/90 text-accent-foreground"
                    >
                      Get in Touch
                    </Button>
                  </SheetClose>
                </nav>
              </div>
            </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
