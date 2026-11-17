import HullLines, { type Rig } from "@/components/landing/HullLines";

// References, named, with no photographs: each project is shown as the lines
// of a boat of that type and size, drawn here, and a sentence on the scope.
// Scope only; no client figures are published.

interface Project {
  name: string;
  kind: string;
  scope: string;
  hull: { loa: number; beam: number; draft: number; rig: Rig };
}

const PROJECTS: Project[] = [
  {
    name: "J-Class",
    kind: "Refit · mast and rigging",
    scope: "A complete mast and rigging refit, run end to end, owning the worklist and the deadline.",
    hull: { loa: 42, beam: 6.5, draft: 4.8, rig: "sloop" },
  },
  {
    name: "Perini Navi",
    kind: "New build · 56 m ketch",
    scope: "Coordinating the technical team on a 56-metre ketch new build.",
    hull: { loa: 56, beam: 10.2, draft: 4.8, rig: "ketch" },
  },
  {
    name: "Aragon 72",
    kind: "Refit programme",
    scope: "Project management of the refit programme, on the owner's side.",
    hull: { loa: 22, beam: 5.6, draft: 3.2, rig: "sloop" },
  },
  {
    name: "SY Sonny",
    kind: "Project management · racing",
    scope: "Project management through the yard period, then racing the boat that came out of it.",
    hull: { loa: 30, beam: 6.8, draft: 4.2, rig: "sloop" },
  },
  {
    name: "115-foot sailing yacht",
    kind: "Refit · structure to steering",
    scope: "Back from keel structure to rudder bearings: the work nobody sees and everybody depends on.",
    hull: { loa: 35, beam: 7.6, draft: 4.5, rig: "sloop" },
  },
  {
    name: "Schooner Adix",
    kind: "Regattas · tactics and navigation",
    scope: "Racing in the superyacht circuit, where a boat specified well is a boat that can be sailed hard.",
    hull: { loa: 56, beam: 8.6, draft: 4.6, rig: "schooner" },
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
            New builds, refits and racing programmes on sailing yachts, and engineering on
            America's Cup, SailGP and Volvo Ocean Race campaigns. Drawings are illustrative.
          </p>
        </div>
      </div>

      <ul className="grid border-l border-t rule sm:grid-cols-2 lg:grid-cols-3">
        {PROJECTS.map((p, i) => (
          <li key={p.name} className="flex flex-col border-b border-r rule p-6">
            <div className="mb-6 flex items-baseline justify-between">
              <span className="mono text-xs mark">{String(i + 1).padStart(2, "0")}</span>
              <span className="label text-[10px]">{p.kind}</span>
            </div>
            <HullLines {...p.hull} view="profile" mastScale={0.55} className="ink mb-6 h-32 w-full" title={`Profile of a ${p.hull.loa}-metre ${p.hull.rig}, illustrative`} />
            <h3 className="serif mb-2 text-2xl font-semibold">{p.name}</h3>
            <p className="soft text-[15px] leading-relaxed">{p.scope}</p>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

export default Projects;
