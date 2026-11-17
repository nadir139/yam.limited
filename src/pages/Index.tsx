import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import References from "@/components/landing/References";
import Method from "@/components/landing/Method";
import RecordStory from "@/components/landing/RecordStory";
import Projects from "@/components/landing/Projects";
import WhyYam from "@/components/landing/WhyYam";
import About from "@/components/About";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";
import "@/components/landing/landing.css";

// The public home page (Nov 2026 rework): what YAM is, how it works, the
// record behind it, the boats, how it differs, who is behind it, contact.
// The Sardinia concierge has its own page (/sardinia).

const Index = () => {
  const { hash } = useLocation();

  // Links from other pages arrive as /#section: scroll there once it exists.
  useEffect(() => {
    if (!hash) return;
    const t = setTimeout(() => document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" }), 60);
    return () => clearTimeout(t);
  }, [hash]);

  return (
    <div className="landing min-h-screen">
      <Navbar />
      <main>
        <Hero />
        <References />
        <Method />
        <RecordStory />
        <Projects />
        <WhyYam />
        <About />
        <Contact />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
