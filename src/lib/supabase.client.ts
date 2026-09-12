import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database.types'

/** Browser-only client; session is shared with the server via cookies (see supabase.server.ts). */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

const rememberSessionKey = 'qaffy-remember-session'

export function setRememberSession(remember: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(rememberSessionKey, String(remember))
}

const authStorage = {
  getItem(key: string) {
    if (typeof window === 'undefined') return null
    const remember = window.localStorage.getItem(rememberSessionKey) !== 'false'
    const primary = remember ? window.localStorage : window.sessionStorage
    return primary.getItem(key)
  },
  setItem(key: string, value: string) {
    if (typeof window === 'undefined') return
    const remember = window.localStorage.getItem(rememberSessionKey) !== 'false'
    const primary = remember ? window.localStorage : window.sessionStorage
    const secondary = remember ? window.sessionStorage : window.localStorage
    primary.setItem(key, value)
    secondary.removeItem(key)
  },
  removeItem(key: string) {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(key)
    window.sessionStorage.removeItem(key)
  },
}

export const supabase = isSupabaseConfigured
  ? createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, { auth: { storage: authStorage } })
  : null
