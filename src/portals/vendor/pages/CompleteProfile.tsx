import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import QaffyLogo from '../../../components/QaffyLogo'
import RouteLoadingScreen from '../../../components/RouteLoadingScreen'
import { toast } from '../../../lib/toast'
import { isSupabaseConfigured, supabase } from '../../../lib/supabase.client'

export default function CompleteProfile() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    if (!name.trim() || !phone.trim()) {
      setError('Enter your name and phone number to continue.')
      return
    }

    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured. Add the required environment variables to continue.')
      return
    }

    setIsSubmitting(true)
    const { data: userData, error: userError } = await supabase.auth.getUser()

    if (userError || !userData.user) {
      setError(userError?.message ?? 'Your session has expired. Please sign in again.')
      setIsSubmitting(false)
      return
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ name: name.trim(), phone: phone.trim(), email: userData.user.email ?? null })
      .eq('id', userData.user.id)

    if (profileError) {
      setError(profileError.message)
      setIsSubmitting(false)
      return
    }

    toast.success('Profile completed')
    navigate(searchParams.get('next') || '/vendor', { replace: true })
  }

  return (
    <>
      <RouteLoadingScreen isLoading={isSubmitting} watchNavigation={false} />
      <div className="flex min-h-screen items-center justify-center bg-[#0d1016] px-4 py-6" style={{ backgroundImage: 'linear-gradient(90deg, rgba(12,15,22,0.82), rgba(12,15,22,0.1)), url("https://images.unsplash.com/photo-1567113463300-102a7eb3cb26?q=80&w=1470&auto=format&fit=crop")', backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="w-full max-w-[430px] rounded-[36px] bg-white/95 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.28)] sm:p-7" style={{ fontFamily: 'Inter, sans-serif' }}>
          <div className="mb-7 text-center">
            <QaffyLogo className="mx-auto mb-5 inline-flex" />
            <h1 className="text-2xl font-semibold text-slate-900">Complete your vendor profile</h1>
            <p className="mt-2 text-sm text-slate-500">Add your name and phone number before continuing.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input aria-label="Full name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your full name" className="h-14 w-full rounded-lg border border-field-border bg-white px-4 text-[14px] font-semibold text-black outline-none transition placeholder:text-field-placeholder focus:border-field-focus focus:ring-2 focus:ring-field-focus-soft" />
            <input aria-label="Phone number" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0803 123 4567" className="h-14 w-full rounded-lg border border-field-border bg-white px-4 text-[14px] font-semibold text-black outline-none transition placeholder:text-field-placeholder focus:border-field-focus focus:ring-2 focus:ring-field-focus-soft" />
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={isSubmitting} className="w-full rounded-2xl bg-brand-primary px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-60">
              {isSubmitting ? 'Saving...' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
