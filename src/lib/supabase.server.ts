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
