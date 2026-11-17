// References, named: the boat or programme and a sentence on the scope.
// No pictures and no client figures.

interface Project {
  name: string;
  kind: string;
  scope: string;
}

const PROJECTS: Project[] = [
  {
    name: "J-Class",
    kind: "Refit · mast and rigging",
    scope: "A complete mast and rigging refit, run end to end, owning the worklist and the deadline.",
  },
  {
    name: "Offshore sailing",
    kind: "Ocean passages",
    scope: "Five Atlantic crossings and one Pacific crossing, through Point Nemo.",
  },
  {
    name: "Aragon 72",
    kind: "Refit programme",
    scope: "Project management of the refit programme, on the owner's side.",
  },
  {
    name: "SY Sonny",
    kind: "Project management · racing",
    scope: "Project management through the yard period, then racing the boat that came out of it.",
  },
  {
    name: "115-foot sailing yacht",
    kind: "Refit · structure to steering",
    scope: "Back from keel structure to rudder bearings: the work nobody sees and everybody depends on.",
  },
  {
    name: "Schooner Adix",
    kind: "Regattas · tactics and navigation",
    scope: "Racing in the superyacht circuit, where a boat specified well is a boat that can be sailed hard.",
  },
];

const Projects = () => (
  <section id="references" className="border-b rule">
    <div className="container mx-auto px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mb-14 grid gap-6 lg:grid-cols-12">
        <p className="label lg:col-span-3">References</p>
        <div className="lg:col-span-9">
          <h2 className="serif mb-5 text-3xl font-semibold leading-tight sm:text-5xl">
            Boats we have worked on, from the yard and from the rail.
          </h2>
          <p className="soft max-w-2xl text-lg leading-relaxed">
            Refits, regattas and ocean passages on sailing yachts, and engineering on America's
            Cup, SailGP and Volvo Ocean Race campaigns.
          </p>
        </div>
      </div>

      <ul className="grid border-l border-t rule sm:grid-cols-2 lg:grid-cols-3">
        {PROJECTS.map((p, i) => (
          <li key={p.name} className="flex flex-col border-b border-r rule p-6">
            <div className="mb-10 flex items-baseline justify-between">
              <span className="mono text-xs mark">{String(i + 1).padStart(2, "0")}</span>
              <span className="label text-[10px]">{p.kind}</span>
            </div>
            <h3 className="serif mb-2 text-2xl font-semibold">{p.name}</h3>
            <p className="soft text-[15px] leading-relaxed">{p.scope}</p>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

export default Projects;
