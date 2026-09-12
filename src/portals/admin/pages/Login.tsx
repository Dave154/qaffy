import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { isSupabaseConfigured, supabase } from '../../../lib/supabase.client'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedEmail = email.trim()
    if (!trimmedEmail) return setError('Enter your admin email.')
    if (!isSupabaseConfigured || !supabase) return setError('Supabase is not configured.')
    setError('')
    setIsSubmitting(true)
    const { error: authError } = await supabase.auth.signInWithOtp({ email: trimmedEmail, options: { shouldCreateUser: false } })
    setIsSubmitting(false)
    if (authError) return setError(authError.message)
    navigate(`/verify-otp?email=${encodeURIComponent(trimmedEmail)}&mode=login&portal=admin&next=/admin`)
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-2xl font-bold text-slate-900">Admin sign in</h1><p className="mt-2 text-sm text-slate-500">We will send a one-time code to your admin email.</p><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="mt-6 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />{error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<button type="submit" disabled={isSubmitting} className="mt-4 w-full rounded-lg bg-brand-primary px-4 py-3 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:opacity-50">{isSubmitting ? 'Sending code...' : 'Send code'}</button></form></main>
}
