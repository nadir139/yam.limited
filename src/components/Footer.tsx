import { Link } from "react-router-dom";
import Logo from "@/assets/logo.svg";
import "@/components/landing/landing.css";

// The footer of the public pages (/, /ontology, /sardinia). Links that point at
// sections of the home page are full paths, so they work from every page.

const LINKS = [
  { label: "Method", to: "/#method" },
  { label: "The record", to: "/#graph" },
  { label: "References", to: "/#references" },
  { label: "Contact", to: "/#contact" },
];
const MORE = [
  { label: "Ontology", to: "/ontology" },
  { label: "Sardinia concierge", to: "/sardinia" },
  { label: "Client sign in", to: "/login" },
];

const Footer = () => (
  <footer className="landing-vars">
    <div className="bg-ink">
    <div className="container mx-auto px-4 py-14 sm:px-6 lg:px-8">
      <div className="grid gap-10 md:grid-cols-12">
        <div className="md:col-span-6">
          <div className="mb-4 flex items-center gap-3">
            <img src={Logo} alt="" className="h-10 w-10 rounded-full bg-[hsl(var(--paper))] p-1" />
            <span className="serif text-2xl font-semibold">YAM</span>
          </div>
          <p className="max-w-sm text-[15px] leading-relaxed opacity-75">
            Yacht Architectural Management. Owner's representation and a live record for refits and
            new builds of sailing yachts.
          </p>
        </div>
        <nav className="grid grid-cols-2 gap-8 md:col-span-6" aria-label="Footer">
          {[LINKS, MORE].map((group, i) => (
            <ul key={i} className="space-y-2.5">
              {group.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-[15px] opacity-80 hover:opacity-100 hover:underline underline-offset-4">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          ))}
        </nav>
      </div>
      <div className="mono mt-12 flex flex-wrap justify-between gap-3 border-t border-[hsl(var(--paper)/0.15)] pt-6 text-[11px] opacity-60">
        <span>© {new Date().getFullYear()} YAM · Yacht Architectural Management</span>
        <span>Sardinia based · operating worldwide</span>
      </div>
    </div>
    </div>
  </footer>
);

export default Footer;
