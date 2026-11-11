import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'
import type { Database } from '@/types/database.types'
import { getSessionCookieOptions } from './session-cookie-options'

export function getSupabaseServerClient(request: Request) {
  const headers = new Headers()
  const cookies = parseCookieHeader(request.headers.get('Cookie') ?? '')
  const rememberSession = cookies.find(({ name }) => name === 'qaffy-remember-session')?.value !== 'false'

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase server environment variables are not configured.')
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookies
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          headers.append('Set-Cookie', serializeCookieHeader(name, value, getSessionCookieOptions(options, rememberSession)))
        }
      },
    },
  })

  return { supabase, headers }
}

export const isSupabaseServerConfigured = Boolean(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL) && (process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY),
)

/**
 * Resolves the signed-in user for read-only loaders from the verified session JWT.
 *
 * `auth.getClaims()` verifies the access token locally against the project's cached JWKS when
 * asymmetric signing keys are enabled, so it avoids a round trip to the Auth server (and the
 * associated Auth/edge log entries) on every loader run and Realtime-driven revalidation. With
 * legacy symmetric keys it transparently falls back to `getUser()`. Mutating actions that move
 * money should keep calling `auth.getUser()` for a server-side session check.
 */
export async function getClaimsUser(supabase: ReturnType<typeof getSupabaseServerClient>['supabase']) {
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  const id = claims?.sub
  if (error || !claims || typeof id !== 'string') return null
  const email = claims.email
  return { id, email: typeof email === 'string' ? email : undefined }
}
