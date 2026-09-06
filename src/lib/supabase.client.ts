import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database.types'

/** Browser-only client; session is shared with the server via cookies (see supabase.server.ts). */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
  : null
