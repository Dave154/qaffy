import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'
import type { Database } from '@/types/database.types'
import { getSessionCookieOptions } from './session-cookie-options'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

const rememberSessionKey = 'qaffy-remember-session'
const persistentCookieMaxAge = 400 * 24 * 60 * 60

export function setRememberSession(remember: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(rememberSessionKey, String(remember))
  const maxAge = remember ? `; Max-Age=${persistentCookieMaxAge}` : ''
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${rememberSessionKey}=${remember}; Path=/; SameSite=Lax${maxAge}${secure}`
}

export const supabase = isSupabaseConfigured
  ? createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          if (typeof document === 'undefined') return []
          return parseCookieHeader(document.cookie)
        },
        setAll(cookiesToSet) {
          if (typeof window === 'undefined') return
          const rememberSession = window.localStorage.getItem(rememberSessionKey) !== 'false'
          for (const { name, value, options } of cookiesToSet) {
            document.cookie = serializeCookieHeader(name, value, getSessionCookieOptions(options, rememberSession))
          }
        },
      },
    })
  : null
