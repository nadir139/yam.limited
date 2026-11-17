import AsciiVideo from "@/components/AsciiVideo";

// Who is behind YAM, told as a background rather than a CV: the kind of
// sailing and engineering it comes from, the kinds of boats, where it works.
// Names of programmes are references; the projects themselves are listed,
// by boat, under References.

const About = () => (
  <section id="about" className="border-b rule">
    <div className="container mx-auto grid gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-28">
      <div className="lg:col-span-6">
        <p className="label mb-6">Behind YAM</p>
        <h2 className="serif mb-8 text-3xl font-semibold leading-tight sm:text-5xl">
          From grand-prix sailing to the owner's side of the table.
        </h2>
        <div className="space-y-5 text-[17px] leading-relaxed">
          <p>
            YAM is led by a naval architect whose background is in racing and engineering: systems and
            hydraulics on America's Cup and SailGP programmes, Volvo Ocean Race campaigns, and the
            build, refit and racing of sailing superyachts.
          </p>
          <p className="soft">
            That background is the point. A boat that has to be sailed hard has to be specified well,
            and the person reading a yard's variation order for you should know whether the work was
            necessary, from having done it rather than from asking the yard.
          </p>
          <p className="soft">
            Based in Sardinia, working across Mediterranean and Caribbean yards, in Italian, English
            and Spanish.
          </p>
        </div>
      </div>

      {/* Fig. 2: under way, in characters */}
      <figure className="lg:col-span-6">
        <div className="relative aspect-[4/3] overflow-hidden border rule bg-[hsl(216_45%_9%)]">
          <div className="absolute inset-0 flex items-center justify-center">
            <AsciiVideo className="text-[hsl(196_60%_70%/0.85)]" fps={24} />
          </div>
        </div>
        <figcaption className="label mt-3 flex justify-between text-[10px]">
          <span>Fig. 2 · Under way</span>
          <span>Rendered in characters</span>
        </figcaption>
      </figure>
    </div>
  </section>
);

export default About;
