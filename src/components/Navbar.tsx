import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import Logo from "@/assets/logo.svg";
import { ThemeToggle } from "./ThemeToggle";
import "@/components/landing/landing.css";

// The public pages' navigation. On the home page and /sardinia it sits on
// paper and is ink; on /ontology, whose hero is dark, it is light until the
// page scrolls. Section links work from any page: elsewhere they go home first.

const SECTIONS = [
  { id: "#method", label: "Method" },
  { id: "#graph", label: "The record" },
  { id: "#references", label: "References" },
  { id: "#about", label: "About" },
];

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onHome = pathname === "/";
  const lightText = pathname === "/ontology" && !scrolled;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (id: string) => {
    if (onHome) document.querySelector(id)?.scrollIntoView({ behavior: "smooth" });
    else navigate(`/${id}`);
  };

  const text = lightText ? "text-white/85 hover:text-white" : "ink opacity-80 hover:opacity-100";

  return (
    <nav
      className={`landing-vars fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? "border-b rule bg-[hsl(var(--paper)/0.92)] backdrop-blur" : "bg-transparent"
      }`}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:h-20 sm:px-6 lg:px-8">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            if (onHome) window.scrollTo({ top: 0, behavior: "smooth" });
            else navigate("/");
          }}
          className="flex items-center gap-3"
        >
          <img src={Logo} alt="" className={`h-10 w-auto sm:h-11 ${lightText ? "brightness-0 invert" : "dark:invert"}`} />
          <span className={`serif text-xl font-semibold sm:text-2xl ${lightText ? "text-white" : "ink"}`}>YAM</span>
          <span className={`label hidden text-[10px] lg:inline ${lightText ? "!text-white/60" : ""}`}>Yacht Architectural Management</span>
        </a>

        <div className="hidden items-center gap-7 md:flex">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" onClick={() => go(s.id)} className={`text-[15px] transition-opacity ${text}`}>
              {s.label}
            </button>
          ))}
          <button type="button" onClick={() => navigate("/ontology")} className={`text-[15px] transition-opacity ${text}`}>
            Ontology
          </button>
          <span className={`h-5 w-px ${lightText ? "bg-white/30" : "bg-[hsl(var(--rule))]"}`} />
          <button type="button" onClick={() => navigate("/login")} className={`text-[15px] transition-opacity ${text}`}>
            Sign in
          </button>
          <button type="button" onClick={() => go("#contact")} className={`btn-ink !py-2 text-sm ${lightText ? "!bg-white !text-[hsl(216_45%_13%)]" : ""}`}>
            Talk to us
          </button>
          <ThemeToggle variant="navbar" isScrolled={!lightText} />
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle variant="navbar" isScrolled={!lightText} />
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className={lightText ? "text-white hover:bg-white/10" : ""}>
                <Menu className="h-6 w-6" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="landing-vars w-[280px] bg-[hsl(var(--paper))]">
              <SheetTitle className="serif ink text-2xl">YAM</SheetTitle>
              <nav className="mt-8 flex flex-col">
                {[...SECTIONS, { id: "#contact", label: "Contact" }].map((s) => (
                  <SheetClose asChild key={s.id}>
                    <button type="button" onClick={() => go(s.id)} className="serif ink border-b rule py-3 text-left text-xl">
                      {s.label}
                    </button>
                  </SheetClose>
                ))}
                {[
                  { to: "/ontology", label: "Ontology" },
                  { to: "/sardinia", label: "Sardinia concierge" },
                  { to: "/login", label: "Client sign in" },
                ].map((l) => (
                  <SheetClose asChild key={l.to}>
                    <button type="button" onClick={() => navigate(l.to)} className="soft border-b rule py-3 text-left text-[15px]">
                      {l.label}
                    </button>
                  </SheetClose>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
