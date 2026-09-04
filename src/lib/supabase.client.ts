import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database.types'

/** Browser-only client; session is shared with the server via cookies (see supabase.server.ts). */
export const supabase = createBrowserClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
