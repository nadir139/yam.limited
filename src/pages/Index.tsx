import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Services from "@/components/Services";
import About from "@/components/About";
import RefitIntelligence from "@/components/RefitIntelligence";
import SardiniaConcierge from "@/components/SardiniaConcierge";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navbar />
      <Hero />
      <Services />
      <About />
      <RefitIntelligence />
      <SardiniaConcierge />
      <Contact />
      <Footer />
    </div>
  );
};

export default Index;
