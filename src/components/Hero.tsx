import { ArrowRight } from "lucide-react";
import HullLines from "@/components/landing/HullLines";

// The first screen. One sentence that says what YAM is, who it works for, and
// what is different about it, then a drawing instead of a stock photograph.
// No counters, no gradient, no bouncing arrow.

const scrollTo = (id: string) => document.querySelector(id)?.scrollIntoView({ behavior: "smooth" });

const Hero = () => (
  <section className="drafting relative overflow-hidden border-b rule pt-24 sm:pt-28">
    <div className="container mx-auto grid items-center gap-10 px-4 pb-14 sm:px-6 lg:grid-cols-12 lg:gap-6 lg:px-8 lg:pb-20">
      <div className="lg:col-span-6 xl:col-span-5">
        <p className="label mb-6">Owner's representation · Refit &amp; new build · Sailing yachts</p>
        <h1 className="serif mb-6 text-[2.6rem] font-semibold leading-[1.05] sm:text-6xl lg:text-[4.2rem]">
          Your refit, <span className="italic font-normal">on the record.</span>
        </h1>
        <p className="soft mb-8 max-w-xl text-lg leading-relaxed">
          Independent representation on the owner's side of the table, led by a naval architect who
          came to refits from grand-prix sailing. Every finding, variation and euro is recorded against the part it
          concerns, so you decide on facts rather than on the yard's word.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => scrollTo("#contact")} className="btn-ink">
            Talk about your boat <ArrowRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => scrollTo("#record")} className="btn-line">
            See how the record works
          </button>
        </div>
      </div>

      {/* The sheet: a lines plan with a title block, drawn on arrival */}
      <figure className="relative lg:col-span-6 lg:col-start-7 xl:col-span-7 xl:col-start-6">
        <div className="bg-paper border rule p-3 sm:p-5 shadow-[0_1px_0_hsl(var(--rule)),0_20px_40px_-24px_hsl(var(--ink)/0.25)]">
          <HullLines loa={34} beam={7.6} draft={4.4} rig="sloop" view="sheet" mastScale={0.62} animate className="ink h-auto w-full" title="Lines plan of a 34-metre sloop, illustrative" />
          <figcaption className="mt-3 grid grid-cols-2 border-t rule text-[10px] sm:grid-cols-4">
            {[
              ["Drawing", "Lines plan"],
              ["Vessel", "Illustrative, 34 m sloop"],
              ["Scale", "NTS"],
              ["Sheet", "YAM / 001"],
            ].map(([k, v]) => (
              <div key={k} className="border-r rule px-2 py-1.5 last:border-r-0">
                <span className="label block text-[9px]">{k}</span>
                <span className="mono ink">{v}</span>
              </div>
            ))}
          </figcaption>
        </div>
      </figure>
    </div>
  </section>
);

export default Hero;
