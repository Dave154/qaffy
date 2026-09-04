import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'
import type { Database } from '@/types/database.types'

/**
 * Creates a request-scoped Supabase client whose session lives in cookies.
 * Call once per loader/action; merge the returned headers into the Response
 * so any refreshed session cookies reach the browser.
 */
export function getSupabaseServerClient(request: Request) {
  const headers = new Headers()

  const supabase = createServerClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get('Cookie') ?? '')
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            headers.append('Set-Cookie', serializeCookieHeader(name, value, options))
          }
        },
      },
    },
  )

  return { supabase, headers }
}
