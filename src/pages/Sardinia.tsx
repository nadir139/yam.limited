import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SardiniaConcierge from "@/components/SardiniaConcierge";
import "@/components/landing/landing.css";

// The Sardinia concierge, on its own page since the Nov 2026 rework: it is a
// separate service from owner's representation and should not dilute it.

const Sardinia = () => (
  <div className="landing min-h-screen">
    <Navbar />
    <main className="pt-20 sm:pt-24">
      <SardiniaConcierge />
    </main>
    <Footer />
  </div>
);

export default Sardinia;
