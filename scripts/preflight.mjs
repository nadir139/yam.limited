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

// The project these credentials are supposed to reach. Not a secret — it is in
// the README, in the type-generation command, and in the bundle we ship.
const EXPECTED_REF = 'xgpdfefxarllgykjbppn'

const REQUIRED = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

const url = process.env.VITE_SUPABASE_URL?.trim()
const key = process.env.VITE_SUPABASE_ANON_KEY?.trim()

const missing = REQUIRED.filter((name) => !process.env[name]?.trim())

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
  process.exit(0)
}

// Present is not the same as correct.
//
// The Vercel project carried a URL and key for `ihippazqdkwssxnfzlwx` — a
// Supabase project that does not exist in this account — added four months
// before the real one was created. A presence check passes that with a tick,
// and the failure it produces is the worst shape there is: the marketing site
// renders perfectly and every /app/* route quietly reaches nothing.

/** The `ref` claim inside the anon key, which says which project it opens. */
const refFromKey = (jwt) => {
  const payload = jwt.split('.')[1]
  if (!payload) return null
  try {
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=')
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')).ref ?? null
  } catch {
    return null
  }
}

const refFromUrl = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)?.[1] ?? null
const keyRef = refFromKey(key)

const die = (lines) => {
  console.error('')
  for (const line of ['✗ ' + lines[0], ...lines.slice(1)]) console.error('  ' + line)
  console.error('')
  process.exit(1)
}

if (!refFromUrl) {
  die([
    `VITE_SUPABASE_URL is not a Supabase project URL: ${url}`,
    'Expected https://<ref>.supabase.co',
  ])
}

if (keyRef && keyRef !== refFromUrl) {
  die([
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are for different projects.',
    `URL points at:  ${refFromUrl}`,
    `Key opens:      ${keyRef}`,
    'One of the two was updated without the other.',
  ])
}

if (refFromUrl !== EXPECTED_REF) {
  // A warning, not a failure: pointing a preview at a staging project is a
  // legitimate thing to want. Pointing production at one by accident is not,
  // so it has to be loud.
  console.warn('')
  console.warn(`  ⚠  Building against Supabase project "${refFromUrl}", not "${EXPECTED_REF}".`)
  console.warn('     Deliberate? Fine. Otherwise the app will reach the wrong')
  console.warn('     database — or none at all, if that project no longer exists.')
  console.warn('')
} else {
  console.log(`  ✓ Supabase credentials present and matched to ${EXPECTED_REF}.`)
}
