import { data, useFetcher, useLoaderData } from 'react-router'
import { useEffect, useState } from 'react'
import type { Route } from './+types/Settings'
import { requireRole } from '../../../lib/auth.server'
import { sql } from '../../../lib/db.server'
import { toast } from '../../../lib/toast'

 type VendorPayoutAccount = {
  bankName: string | null
  accountNumber: string | null
  accountName: string | null
  status: 'unverified' | 'verified'
  verifiedAt: string | null
  error: string | null
}

type VendorSettingsData = {
  businessName: string
  payoutAccount: VendorPayoutAccount
  banks: Array<{ name: string; code: string }>
}

function maskAccountNumber(value: string | null) {
  if (!value) return 'Not added'
  return `••••••${value.slice(-4)}`
}

async function paystackRequest(path: string, init?: RequestInit) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY
  if (!secretKey) throw new Error('Paystack is not configured on the server.')

  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const payload = await response.json() as { status?: boolean; message?: string; data?: unknown }
  if (!response.ok || payload.status === false) throw new Error(payload.message ?? 'Paystack account verification failed.')
  return payload
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'vendor')
  if (!auth) return data<VendorSettingsData>({ businessName: 'Vendor', payoutAccount: { bankName: null, accountNumber: null, accountName: null, status: 'unverified', verifiedAt: null, error: 'Please sign in again.' }, banks: [] }, { status: 401 })

  const [vendor] = await sql`
    select business_name, payout_bank_name, payout_account_number, payout_account_name,
      payout_account_status, payout_account_verified_at, payout_account_error
    from vendors
    where profile_id = ${auth.profile.id} and status = 'approved'
  `
  if (!vendor) return data<VendorSettingsData>({ businessName: 'Vendor', payoutAccount: { bankName: null, accountNumber: null, accountName: null, status: 'unverified', verifiedAt: null, error: 'Approved vendor access is required.' }, banks: [] }, { status: 403, headers: auth.headers })

  let banks: Array<{ name: string; code: string }> = []
  try {
    const banksResponse = await paystackRequest('/bank?country=nigeria&perPage=100')
    banks = ((banksResponse.data as Array<{ name?: string; code?: string }> | undefined) ?? [])
      .filter((bank): bank is { name: string; code: string } => Boolean(bank.name && bank.code))
      .sort((left, right) => left.name.localeCompare(right.name))
  } catch {
    // Keep the account screen usable so a previously saved account remains visible.
  }

  return data<VendorSettingsData>({
    businessName: vendor.business_name,
    payoutAccount: {
      bankName: vendor.payout_bank_name,
      accountNumber: vendor.payout_account_number,
      accountName: vendor.payout_account_name,
      status: vendor.payout_account_status === 'verified' ? 'verified' : 'unverified',
      verifiedAt: vendor.payout_account_verified_at,
      error: vendor.payout_account_error,
    },
    banks,
  }, { headers: auth.headers })
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireRole(request, 'vendor')
  if (!auth) return data({ ok: false, message: 'Please sign in again.' }, { status: 401 })

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? 'save')
  const bankCode = String(formData.get('bankCode') ?? '').trim()
  const bankName = String(formData.get('bankName') ?? '').trim()
  const accountNumber = String(formData.get('accountNumber') ?? '').replace(/\D/g, '')
  if (!bankCode || !bankName || !/^\d{10}$/.test(accountNumber)) return data({ ok: false, message: 'Select a bank and enter a valid 10-digit account number.' }, { status: 400, headers: auth.headers })

  try {
    const resolvedResponse = await paystackRequest(`/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`)
    const resolved = resolvedResponse.data as { account_name?: string; account_number?: string } | undefined
    if (!resolved?.account_name) throw new Error('Paystack could not resolve this account.')

    if (intent === 'resolve') return data({ ok: true, intent: 'resolve' as const, accountName: resolved.account_name, accountNumber: resolved.account_number ?? accountNumber }, { headers: auth.headers })

    await sql`
      update vendors
      set payout_bank_name = ${bankName},
        payout_bank_code = ${bankCode},
        payout_account_number = ${resolved.account_number ?? accountNumber},
        payout_account_name = ${resolved.account_name},
        payout_account_status = 'verified',
        payout_account_verified_at = now(),
        payout_account_error = null
      where profile_id = ${auth.profile.id} and status = 'approved'
    `

    return data({ ok: true, accountName: resolved.account_name, accountNumber: resolved.account_number ?? accountNumber }, { headers: auth.headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payout account verification failed.'
    await sql`
      update vendors
      set payout_account_status = 'unverified', payout_account_error = ${message}
      where profile_id = ${auth.profile.id} and status = 'approved'
    `
    return data({ ok: false, message }, { status: 400, headers: auth.headers })
  }
}

export default function VendorSettings() {
  const { businessName, payoutAccount, banks } = useLoaderData<typeof loader>()
  const resolveFetcher = useFetcher<typeof action>()
  const saveFetcher = useFetcher<typeof action>()
  const [bankCode, setBankCode] = useState(banks.find((bank) => bank.name === payoutAccount.bankName)?.code ?? '')
  const [bankName, setBankName] = useState(payoutAccount.bankName ?? '')
  const [accountNumber, setAccountNumber] = useState('')
  const [resolvedAccount, setResolvedAccount] = useState<string | null>(payoutAccount.status === 'verified' ? payoutAccount.accountName : null)

  useEffect(() => {
    if (resolveFetcher.data?.ok && 'accountName' in resolveFetcher.data) setResolvedAccount(resolveFetcher.data.accountName)
    if (resolveFetcher.data && !resolveFetcher.data.ok && 'message' in resolveFetcher.data) toast.error(String(resolveFetcher.data.message))
  }, [resolveFetcher.data])

  useEffect(() => {
    if (saveFetcher.data && !saveFetcher.data.ok && 'message' in saveFetcher.data) toast.error(String(saveFetcher.data.message))
    if (saveFetcher.data?.ok && 'accountName' in saveFetcher.data) toast.success(`Saved and verified as ${saveFetcher.data.accountName}.`)
  }, [saveFetcher.data])

  const resolveAccount = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10)
    setAccountNumber(digits)
    setResolvedAccount(null)
    if (digits.length !== 10 || !bankCode || resolveFetcher.state !== 'idle') return
    resolveFetcher.submit({ intent: 'resolve', bankCode, bankName, accountNumber: digits }, { method: 'post' })
  }

  return <div className="space-y-6">
    <header>
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h2>
      <p className="mt-2 text-sm text-slate-500">Manage {businessName} payout details.</p>
    </header>

    <section className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Payout account</h3>
        </div>
      </div>

      {payoutAccount.status === 'verified' && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><p className="font-semibold">{payoutAccount.accountName}</p><p className="mt-1">{payoutAccount.bankName} · {maskAccountNumber(payoutAccount.accountNumber)}</p></div>}

      <div className="mt-5 space-y-4">
        <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-600">Bank name</span><select value={bankCode} onChange={(event) => { const bank = banks.find((candidate) => candidate.code === event.target.value); setBankCode(event.target.value); setBankName(bank?.name ?? ''); setAccountNumber(''); setResolvedAccount(null) }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"><option value="">Select bank</option>{banks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}</select></label>
        <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-600">Account number</span><input value={accountNumber} onChange={(event) => resolveAccount(event.target.value)} inputMode="numeric" maxLength={10} placeholder="10-digit account number" className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" /></label>
        {resolveFetcher.state !== 'idle' && <p className="text-sm text-slate-500">Resolving account...</p>}
        {resolvedAccount && <p aria-live="polite" className="mt-2 text-sm font-semibold text-brand-primary">{resolvedAccount}</p>}
        <button type="button" onClick={() => saveFetcher.submit({ intent: 'save', bankCode, bankName, accountNumber }, { method: 'post' })} disabled={!resolvedAccount || saveFetcher.state !== 'idle'} className="rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-60">{saveFetcher.state === 'idle' ? 'Save details' : 'Saving...'}</button>
      </div>
    </section>
  </div>
}
