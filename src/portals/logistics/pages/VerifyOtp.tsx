import { useLocation, useNavigate } from 'react-router'
import { useState } from 'react'
import QaffyLogo from '../../../components/QaffyLogo'
import { isSupabaseConfigured, supabase } from '../../../lib/supabase.client'

export default function VerifyOtp() {
  const navigate = useNavigate()
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const email = params.get('email') ?? ''
  const codeLength = 8
  const [code, setCode] = useState(() => Array.from({ length: codeLength }, () => ''))
  const [secondsRemaining, setSecondsRemaining] = useState(30)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const updateCode = (index: number, value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 1)
    const next = [...code]
    next[index] = sanitized
    setCode(next)

    if (sanitized && index < code.length - 1) {
      const nextInput = document.getElementById(`logistics-otp-${index + 1}`) as HTMLInputElement | null
      nextInput?.focus()
    }
  }

  const pasteCode = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, codeLength)
    if (!pasted) return
    setCode(Array.from({ length: codeLength }, (_, index) => pasted[index] ?? ''))
    document.getElementById(`logistics-otp-${Math.min(pasted.length, codeLength) - 1}`)?.focus()
  }

  const handleVerify = async () => {
    setError('')
    if (!email) {
      setError('The login link is missing the email address.')
      return
    }
    if (code.join('').length !== codeLength) return

    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured.')
      return
    }

    const enteredCode = code.join('')
    setIsSubmitting(true)
    const { error: authError } = await supabase.auth.verifyOtp({
      email,
      token: enteredCode,
      type: 'email',
    })

    if (authError) {
      setError(authError.message)
      setIsSubmitting(false)
      return
    }

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      setError(userError?.message ?? 'Your session could not be restored.')
      setIsSubmitting(false)
      return
    }

    const { data: agent, error: agentError } = await supabase
      .from('profile_roles')
      .select('role')
      .eq('profile_id', userData.user.id)
      .eq('role', 'logistics')
      .eq('status', 'approved')
      .maybeSingle()

    if (agentError) {
      setError(agentError.message)
      setIsSubmitting(false)
      return
    }

    if (!agent) {
      await supabase.auth.signOut()
      setError('This email is not provisioned for logistics access.')
      setIsSubmitting(false)
      return
    }

    navigate('/logistics')
  }

  const handleResend = async () => {
    if (!email || !isSupabaseConfigured || !supabase || secondsRemaining > 0) return
    setError('')
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    })

    if (authError) {
      setError(authError.message)
      return
    }

    setSecondsRemaining(30)
    setCode(Array.from({ length: codeLength }, () => ''))
  }

  const isComplete = code.join('').length === codeLength
  const canResend = secondsRemaining === 0

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f9f9] px-4 py-6">
      <div className="w-full max-w-130 rounded-[28px] border border-[#e7e7e7] bg-white p-4 shadow-[0_24px_80px_rgba(17,24,39,0.08)] sm:p-7">
        <div className="mb-6 flex items-center justify-between gap-3">
          <QaffyLogo />
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-primary">Logistics</span>
        </div>

        <button
          type="button"
          onClick={() => navigate('/logistics/login')}
          className="mb-6 inline-flex items-center gap-3 text-base font-semibold text-[#3d3d3d] transition hover:text-slate-700"
        >
          <span className="text-lg">←</span>
          <span>Back to login</span>
        </button>

        <div className="space-y-5">
          <div>
            <h2 className="text-[2.2rem] font-semibold tracking-[-0.04em] text-slate-900">Enter OTP</h2>
            <p className="mt-2 text-base text-[#8e9a9a]">
              Please provide the OTP sent to <span className="font-semibold text-slate-700">{email}</span>
            </p>
          </div>

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="grid grid-cols-8 gap-2 pt-3 sm:gap-3">
            {code.map((digit, index) => (
              <input
                key={index}
                id={`logistics-otp-${index}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(event) => updateCode(index, event.target.value)}
                onPaste={pasteCode}
                className="aspect-square min-w-0 w-full rounded-lg border border-brand-border bg-white p-0 text-center text-lg font-semibold leading-none text-slate-900 shadow-sm outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus sm:text-xl"
              />
            ))}
          </div>

          <p className="text-center text-sm text-[#3d3d3d]">
            Didn&apos;t get the code?{' '}
            <button
              type="button"
              onClick={handleResend}
              disabled={!canResend}
              className={`font-semibold transition ${canResend ? 'cursor-pointer text-brand-primary hover:text-brand-primary-hover' : 'cursor-default text-slate-500'}`}
            >
              {canResend ? 'Resend code' : `Resend in ${secondsRemaining} secs`}
            </button>
          </p>

          <button
            type="button"
            onClick={handleVerify}
            className={`mt-2 flex w-full items-center justify-center rounded-full px-4 py-3 text-[1.05rem] font-semibold transition ${isComplete ? 'bg-brand-primary text-white hover:bg-brand-primary-hover' : 'cursor-not-allowed bg-slate-200 text-slate-500'}`}
            disabled={!isComplete || isSubmitting}
          >
            {isSubmitting ? 'Verifying...' : 'Proceed'}
          </button>
        </div>
      </div>
    </div>
  )
}
