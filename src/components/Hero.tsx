import { ArrowRight } from "lucide-react";

// The first screen: one sentence that says what YAM is, who it works for and
// what is different about it. Type on drafting paper; no picture.

const scrollTo = (id: string) => document.querySelector(id)?.scrollIntoView({ behavior: "smooth" });

const Hero = () => (
  <section className="drafting relative overflow-hidden border-b rule pt-28 sm:pt-36">
    <div className="container mx-auto px-4 pb-16 sm:px-6 lg:px-8 lg:pb-24">
      <p className="label mb-8">Owner's representation · Refit &amp; new build · Sailing yachts</p>
      <h1 className="serif mb-8 max-w-5xl text-[2.9rem] font-semibold leading-[1.02] sm:text-7xl lg:text-[6.2rem]">
        Your refit, <span className="italic font-normal">on the record.</span>
      </h1>
      <div className="grid gap-10 lg:grid-cols-12">
        <p className="soft max-w-2xl text-lg leading-relaxed lg:col-span-7 lg:text-xl">
          Independent representation on the owner's side of the table, led by a naval architect who
          came to refits from grand-prix sailing. Every finding, variation and euro is recorded against
          the part it concerns, so you decide on facts rather than on the yard's word.
        </p>
        <div className="flex flex-col items-start gap-4 lg:col-span-5 lg:items-end lg:justify-end">
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => scrollTo("#contact")} className="btn-ink">
              Talk about your boat <ArrowRight className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => scrollTo("#graph")} className="btn-line">
              See the record
            </button>
          </div>
          <p className="label">Sardinia based · operating worldwide</p>
        </div>
      </div>
    </div>
  </section>
);

export default Hero;
