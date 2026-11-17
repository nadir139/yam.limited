// Where the experience comes from, as names a reader recognises, not as a CV.
// Plain type, no logos: the programmes and yards are referenced, not endorsing.

const NAMES = ["America's Cup", "SailGP", "Volvo Ocean Race", "J-Class", "Perini Navi", "Superyacht regattas"];

const References = () => (
  <section aria-label="Experience" className="border-b rule">
    <div className="container mx-auto flex flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center md:gap-10 lg:px-8">
      <p className="label shrink-0">Experience from</p>
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:gap-x-0">
        {NAMES.map((n, i) => (
          <li key={n} className="serif flex items-center text-xl sm:text-2xl">
            {/* The separator belongs to the item after it, so a wrapped line never starts with one on a phone. */}
            {i > 0 && <span aria-hidden className="mark mx-4 hidden text-base sm:inline">/</span>}
            {n}
          </li>
        ))}
      </ul>
    </div>
  </section>
);

export default References;
