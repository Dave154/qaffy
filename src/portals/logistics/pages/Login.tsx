import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import QaffyLogo from '../../../components/QaffyLogo'
import RouteLoadingScreen from '../../../components/RouteLoadingScreen'
import { isSupabaseConfigured, supabase } from '../../../lib/supabase.client'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [showEmailAuth, setShowEmailAuth] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const redirectExistingLogistics = async () => {
      if (!supabase) return
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) return
      const { data: role } = await supabase.from('profile_roles').select('role').eq('profile_id', userData.user.id).eq('role', 'logistics').eq('status', 'approved').maybeSingle()
      if (!role) return
      const { data: profile } = await supabase.from('profiles').select('name, phone').eq('id', userData.user.id).maybeSingle()
      const nextPath = profile?.name && profile?.phone ? '/logistics' : '/logistics/complete-profile?next=%2Flogistics'
      navigate(nextPath, { replace: true })
    }

    void redirectExistingLogistics()
  }, [navigate])

  const handleContinue = async (event?: FormEvent) => {
    event?.preventDefault()
    setError('')

    const trimmed = email.trim()
    if (!trimmed) {
      setError('Enter your approved work email to continue.')
      return
    }

    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured. Add the required environment variables to continue.')
      return
    }

    setIsSubmitting(true)
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: false },
    })

    if (authError) {
      setIsSubmitting(false)
      setError(authError.message)
      return
    }

    navigate(`/logistics/verify-otp?email=${encodeURIComponent(trimmed)}`)
  }

  const handleGoogleSignIn = async () => {
    setError('')

    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured. Add the required environment variables to continue.')
      return
    }

    setIsSubmitting(true)
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/logistics/auth/callback` },
    })

    if (authError) {
      setError(authError.message)
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <RouteLoadingScreen isLoading={isSubmitting} watchNavigation={false} />
      <div
        className="flex min-h-screen items-center justify-center overflow-hidden bg-[#0d1016] px-4 py-6 sm:px-6 lg:px-10"
        style={{
          backgroundImage:
            'linear-gradient(90deg, rgba(12,15,22,0.82) 0%, rgba(12,15,22,0.62) 32%, rgba(12,15,22,0.18) 100%), url("https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?q=80&w=1415&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="flex w-full max-w-6xl items-center justify-center gap-12 lg:justify-between">
          <div className="hidden max-w-xl flex-1 pb-10 pt-10 text-white lg:block">
            <QaffyLogo light className="inline-flex" />

            <h1 className="mt-8 text-5xl font-semibold leading-[1.06] tracking-[-0.04em] text-white">
              Logistics,
              <span className="block text-white/85">On the Move.</span>
            </h1>

            <p className="mt-6 max-w-md text-base leading-7 text-slate-200">
              Pickup and delivery operations, simplified.
            </p>

            <p className="mt-2 max-w-md text-base leading-7 text-slate-300">
              Track pickup OTPs, confirm collection, and keep service moving without friction.
            </p>
          </div>

          <div className="w-full max-w-[430px] rounded-[36px] bg-white/95 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:p-7" style={{ fontFamily: 'Inter, sans-serif' }}>
            <div className="mb-7 text-center">
              <h2 className="text-[2.7rem] font-semibold text-slate-900">Login</h2>
              <p className="mt-2 text-sm text-slate-500">Use your approved logistics email to continue</p>
            </div>

            <form onSubmit={handleContinue}>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-brand-primary px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-brand-soft transition hover:bg-brand-primary-hover"
              >
                <svg viewBox="0 0 48 48" aria-hidden="true" className="h-5 w-5" role="img">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.72 1.22 9.23 3.61l6.86-6.86C35.47 2.39 30.27 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.2C12.13 13.52 17.6 9.5 24 9.5Z" />
                  <path fill="#4285F4" d="M46.5 24.6c0-1.64-.15-3.22-.42-4.74H24v9h12.7c-.55 2.96-2.2 5.47-4.69 7.17l7.6 5.9c4.43-4.09 7.89-10.15 7.89-17.33Z" />
                  <path fill="#FBBC05" d="M32.01 36.11c-1.99 1.35-4.54 2.14-8.01 2.14-6.4 0-11.87-4.02-13.81-9.42l-8.02 6.21C3.99 41.38 13.14 48 24 48c7.1 0 13.08-2.34 17.42-6.36l-9.41-5.53Z" />
                  <path fill="#34A853" d="M10.2 28.83A14.42 14.42 0 0 1 9.5 24c0-1.63.28-3.22.78-4.74L2.56 13.22A23.92 23.92 0 0 0 0 24c0 3.78.89 7.35 2.56 10.49l7.64-5.66Z" />
                </svg>
                Continue with Google
              </button>

              <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                <span>or</span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              {!showEmailAuth && (
                <button
                  type="button"
                  onClick={() => setShowEmailAuth(true)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-brand-primary hover:bg-brand-soft"
                >
                  Continue with email
                </button>
              )}

              {showEmailAuth && (
                <div className="space-y-4">
                  <label className="block">
                    <input
                      type="email"
                      aria-label="Email address"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="Enter your work email"
                      className="h-14 w-full rounded-lg border border-field-border bg-white px-4 text-[14px] font-semibold text-black shadow-sm outline-none transition placeholder:text-field-placeholder focus:border-field-focus focus:ring-2 focus:ring-field-focus-soft"
                    />
                  </label>
                </div>
              )}

              {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

              {showEmailAuth && (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-6 w-full rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  {isSubmitting ? 'Sending code...' : 'Sign in'}
                </button>
              )}
            </form>
          </div>
        </div>
      </div>
    </>
  )
}
