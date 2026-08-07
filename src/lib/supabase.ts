import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * True only when both build-time env vars were present. `createClient` throws
 * synchronously on a missing URL, and this module is reachable from `main.tsx`
 * via AuthContext — so without this guard a missing env var takes down every
 * route, including the public marketing pages, with a blank screen.
 *
 * When unconfigured we still hand back a client object (pointed at an
 * unreachable placeholder) so imports resolve; callers that need real data
 * should check this flag and surface a configuration error instead.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured && import.meta.env.PROD) {
  console.error(
    'Supabase is not configured: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY were ' +
      'missing at build time. Public pages will render; /app routes will not load data.',
  )
}

/**
 * The raw connection details, for the one caller that must not go through the
 * client: the public contact form.
 *
 * `supabase.functions.invoke()` awaits an access token from `auth.getSession()`
 * before it issues its fetch. On a page where somebody happens to have an app
 * session, that await can sit behind supabase-js's auth lock — and if the lock
 * is held by an in-flight token refresh it never resolves, so the request is
 * never sent at all. No network entry, no error, no timeout: the promise simply
 * never settles. A public form has no session and needs no token, so it uses
 * these directly and skips the entire auth path.
 */
export const supabaseConfig = {
  url: supabaseUrl ?? '',
  anonKey: supabaseAnonKey ?? '',
} as const

export const supabase = createClient(
  supabaseUrl || 'https://unconfigured.invalid',
  supabaseAnonKey || 'unconfigured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: isSupabaseConfigured,
    },
  },
)
