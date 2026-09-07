import { useLocation, useNavigate } from 'react-router'
import { useEffect, useState } from 'react'
import QaffyLogo from '../../../components/QaffyLogo'
import { isSupabaseConfigured, supabase } from '../../../lib/supabase.client'

export default function VerifyOtp() {
  const navigate = useNavigate()
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const email = params.get('email') ?? ''
  const mode = params.get('mode') ?? 'login'
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [secondsRemaining, setSecondsRemaining] = useState(30)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleVerify = async () => {
    setError('')

    if (!email) {
      setError('This verification link is missing the email address. Start again from login.')
      return
    }

    if (code.join('').length !== 6) return

    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured. Add the required environment variables to continue.')
      return
    }

    setIsSubmitting(true)
    const { error: authError } = await supabase.auth.verifyOtp({
      email,
      token: code.join(''),
      type: 'email',
    })

    if (authError) {
      setError(authError.message)
      setIsSubmitting(false)
      return
    }

    const { data: userData, error: userError } = await supabase.auth.getUser()
    const metadata = userData.user?.user_metadata

    if (userError || !userData.user) {
      setError(userError?.message ?? 'Your account was verified, but the profile could not be loaded.')
      setIsSubmitting(false)
      return
    }

    if (mode === 'create-account' && (metadata?.full_name || metadata?.phone)) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          name: typeof metadata.full_name === 'string' ? metadata.full_name : null,
          phone: typeof metadata.phone === 'string' ? metadata.phone : null,
          email: userData.user.email ?? email,
        })
        .eq('id', userData.user.id)

      if (profileError) {
        setError(profileError.message)
        setIsSubmitting(false)
        return
      }
    }

    navigate('/')
  }

  useEffect(() => {
    if (secondsRemaining === 0) return

    const timer = window.setInterval(() => {
      setSecondsRemaining((seconds) => Math.max(seconds - 1, 0))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [secondsRemaining])

  const updateCode = (index: number, value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 1)
    const next = [...code]
    next[index] = sanitized
    setCode(next)

    if (sanitized && index < code.length - 1) {
      const nextInput = document.getElementById(`otp-${index + 1}`) as HTMLInputElement | null
      nextInput?.focus()
    }
  }

  const isComplete = code.join('').length === 6
  const canResend = secondsRemaining === 0

  const handleResend = async () => {
    if (!canResend || !email || !isSupabaseConfigured || !supabase) return

    setError('')
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: mode === 'create-account' },
    })

    if (authError) {
      setError(authError.message)
      return
    }

    setSecondsRemaining(30)
    setCode(['', '', '', '', '', ''])
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center overflow-hidden bg-[#0d1016] px-4 py-6 sm:px-6 lg:px-10"
      style={{
        backgroundImage:
          'linear-gradient(90deg, rgba(12,15,22,0.82) 0%, rgba(12,15,22,0.62) 32%, rgba(12,15,22,0.1) 100%), url("https://images.unsplash.com/photo-1567113463300-102a7eb3cb26?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="w-full max-w-6xl items-center gap-12 lg:flex lg:justify-between">
        <div className="hidden max-w-xl flex-1 pb-10 pt-10 text-white lg:block">
          <QaffyLogo light className="inline-flex" />

          <h1 className="mt-8 text-5xl font-bold leading-[1.06] tracking-[-0.04em] text-white">
            Premium Care,
            <span className="block text-white/85">Every Fabric.</span>
          </h1>

          <p className="mt-6 max-w-md text-base leading-7 text-slate-200">
            Fresh Laundry, Zero Hassle
          </p>

          <p className="mt-2 max-w-md text-base leading-7 text-slate-300">
            Qaffy picks up, washes, and delivers — so you never have to worry about laundry again.
          </p>
        </div>

        <div className="w-full max-w-[520px] rounded-[20px] bg-white p-5 shadow-[0_30px_80px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:p-7">
          <button
            type="button"
            onClick={() => navigate(mode === 'create-account' ? '/create-account' : '/login')}
            className="mb-6 inline-flex items-center gap-3 text-base font-semibold text-[#3d3d3d] transition hover:text-slate-700"
          >
            <span className="text-lg">←</span>
            <span>Back to login</span>
          </button>

          <div className="space-y-5">
            <div>
              <h2 className="text-[2.2rem] font-bold tracking-[-0.04em] text-slate-900">Enter OTP</h2>
              <p className="mt-2 text-base text-[#8e9a9a]">
                Please provide the OTP sent to <span className="font-semibold text-slate-700">{email}</span>
              </p>
            </div>

            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <div className="flex items-center justify-center gap-3 pt-3">
              {code.map((digit, index) => (
                <input
                  key={index}
                  id={`otp-${index}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(event) => updateCode(index, event.target.value)}
                  className="h-[80px] w-[72px] rounded-lg border border-field-border bg-white text-center text-[1.5rem] font-semibold text-black shadow-sm outline-none transition focus:border-field-focus focus:ring-2 focus:ring-field-focus-soft"
                />
              ))}
            </div>

            <p className="text-center text-sm text-[#3d3d3d]">
              Didn&apos;t get the code?{' '}
              <button
                type="button"
                onClick={handleResend}
                disabled={!canResend}
                className={`font-semibold transition ${canResend ? 'cursor-pointer text-field-focus hover:text-field-focus-hover' : 'cursor-default text-slate-500'}`}
              >
                {canResend ? 'Resend code' : `Resend in ${secondsRemaining} secs`}
              </button>
            </p>

            <button
              type="button"
              onClick={handleVerify}
              className={`mt-2 flex w-full items-center justify-center rounded-full px-4 py-3 text-[1.05rem] font-semibold transition ${isComplete ? 'bg-field-focus text-white hover:bg-field-focus-hover' : 'cursor-not-allowed bg-field-disabled text-field-disabled-text'}`}
              disabled={!isComplete || isSubmitting}
            >
              {isSubmitting ? 'Verifying...' : 'Proceed'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
