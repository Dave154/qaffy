import type { CookieOptions } from '@supabase/ssr'

export function getSessionCookieOptions(options: CookieOptions, rememberSession: boolean): CookieOptions {
  if (rememberSession || options.maxAge === undefined || options.maxAge <= 0) return options

  const sessionOptions = { ...options }
  delete sessionOptions.maxAge
  return sessionOptions
}
