// Runs before every build, on every host.
//
// Vite inlines VITE_* at build time, so a missing variable is not a runtime
// misconfiguration you can fix later in a dashboard — it is baked into the
// bundle that gets served. The failure is quiet by design: the public pages
// render perfectly and only /app/* comes up empty, which is exactly the kind of
// half-broken deploy nobody notices for a week.
//
// This used to be a step in the GitHub Actions workflow. It lives here now
// because the site is served by Vercel, and a guard that only exists in one
// provider's CI is a guard you lose the day you change provider.
//
// It warns rather than fails. A build without Supabase credentials is still a
// legitimate thing to want — the marketing site and /ontology need no backend.

const REQUIRED = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

const missing = REQUIRED.filter((key) => !process.env[key]?.trim())

if (missing.length > 0) {
  console.warn('')
  console.warn('  ⚠  Building without: ' + missing.join(', '))
  console.warn('')
  console.warn('     The public pages will deploy normally. Every /app/* route')
  console.warn('     will load without data, and sign-in will report that this')
  console.warn('     build has no credentials.')
  console.warn('')
  console.warn('     Vercel:  Project → Settings → Environment Variables')
  console.warn('     Local:   cp .env.example .env')
  console.warn('')
} else {
  console.log('  ✓ Supabase credentials present for this build.')
}
