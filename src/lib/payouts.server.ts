import { sql } from './db.server'
import {
  createPaystackTransferReference,
  getTransferVerificationPath,
  initiateTransferWithRecovery,
  TransferProviderError,
} from './payout-outcomes'
import type { PayoutProvider, TransferProviderResult, TransferProviderStatus } from './payout-outcomes'

export type PayoutResult = {
  ok: boolean
  status: 'success' | 'processing' | 'failed' | 'reversed' | 'rejected'
  message: string
  transferCode?: string | null
  reference?: string
}

class PayoutError extends Error {
  constructor(
    public readonly code: 'rejected' | 'in-progress' | 'already-paid',
    message: string,
  ) {
    super(message)
  }
}

async function paystackRequest(path: string, init: RequestInit) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY
  if (!secretKey) throw new Error('Payout service is not configured.')

  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const payload = (await response.json()) as { status?: boolean; message?: string; data?: Record<string, unknown> }
  if (!response.ok || payload.status === false) {
    throw new TransferProviderError(
      payload.message ?? `Paystack transfer failed (${response.status}).`,
      response.status >= 500 ? 'unknown' : 'rejected',
      payload as Record<string, unknown>,
    )
  }
  return payload
}

export const paystackTransferProvider: PayoutProvider = {
  async initiateTransfer({ amount, recipientCode, reference, reason }) {
    const payload = await paystackRequest('/transfer', {
      method: 'POST',
      body: JSON.stringify({
        source: 'balance',
        amount: Math.round(amount * 100),
        recipient: recipientCode,
        reason,
        reference,
        currency: 'NGN',
      }),
    })
    const transfer = payload.data ?? {}
    const providerStatus = String(transfer.status ?? '').toLowerCase()
    const status: TransferProviderStatus =
      providerStatus === 'success'
        ? 'success'
        : providerStatus === 'failed'
          ? 'failed'
          : providerStatus === 'reversed'
            ? 'reversed'
            : 'processing'

    return {
      status,
      transferCode: typeof transfer.transfer_code === 'string' ? transfer.transfer_code : null,
      reference: typeof transfer.reference === 'string' ? transfer.reference : reference,
      response: payload,
      failureReason:
        status === 'failed' || status === 'reversed'
          ? String(transfer.reason ?? payload.message ?? 'Paystack rejected the transfer.')
          : null,
    }
  },
  async checkTransfer({ transferCode, reference }) {
    const path = getTransferVerificationPath({ transferCode, reference })
    const payload = await paystackRequest(path, { method: 'GET' })
    const transfer = payload.data ?? {}
    const providerStatus = String(transfer.status ?? '').toLowerCase()
    const status: TransferProviderStatus =
      providerStatus === 'success'
        ? 'success'
        : providerStatus === 'failed'
          ? 'failed'
          : providerStatus === 'reversed'
            ? 'reversed'
            : 'processing'
    return {
      status,
      transferCode: typeof transfer.transfer_code === 'string' ? transfer.transfer_code : transferCode,
      reference: typeof transfer.reference === 'string' ? transfer.reference : (reference ?? transferCode!),
      response: payload,
      failureReason:
        status === 'failed' || status === 'reversed'
          ? String(transfer.reason ?? payload.message ?? 'Paystack rejected the transfer.')
          : null,
    }
  },
}

function userMessageForProviderFailure(error: unknown) {
  if (error instanceof Error && error.message === 'Payout service is not configured.')
    return 'Payout service is temporarily unavailable. No settlement was marked as paid.'
  return 'Paystack rejected this payout. Review the payout account and provider details before retrying.'
}

export async function reconcileSettlement(
  settlementId: string,
  adminProfileId: string,
  provider: PayoutProvider = paystackTransferProvider,
): Promise<PayoutResult> {
  let transfer: { id: string; transferCode: string | null; reference: string; amount: number }
  try {
    transfer = await sql.begin(async (tx) => {
      const [row] = await tx`
        select t.id, t.status, t.paystack_transfer_code, t.paystack_reference, t.amount, s.status as settlement_status
        from vendor_settlement_transfers t
        join vendor_settlements s on s.id = t.settlement_id
        where t.settlement_id = ${settlementId}
        for update
      `
      if (!row) throw new PayoutError('rejected', 'No payout transfer exists for this settlement.')
      if (row.settlement_status === 'paid' || row.status === 'success')
        throw new PayoutError('already-paid', 'This settlement has already been paid.')
      if (row.status !== 'queued' && row.status !== 'processing')
        throw new PayoutError('rejected', 'This payout does not need reconciliation.')
      const transferCode = row.paystack_transfer_code ?? null
      const reference = row.paystack_reference ?? transferCode
      if (!transferCode && !reference)
        throw new PayoutError('in-progress', 'No transfer code or reference is available yet. Do not retry this settlement.')
      return {
        id: row.id,
        transferCode,
        reference: reference!,
        amount: Number(row.amount),
      }
    })
  } catch (error) {
    if (error instanceof PayoutError)
      return { ok: false, status: error.code === 'in-progress' ? 'processing' : 'rejected', message: error.message }
    return { ok: false, status: 'processing', message: 'The payout status could not be loaded safely. Reconcile it again before retrying.' }
  }

  let providerResult: TransferProviderResult
  try {
    providerResult = await provider.checkTransfer({ transferCode: transfer.transferCode, reference: transfer.reference })
  } catch {
    return {
      ok: false,
      status: 'processing',
      message: 'Paystack did not confirm the payout. Keep the settlement pending and try reconciliation again.',
      transferCode: transfer.transferCode,
      reference: transfer.reference,
    }
  }

  try {
    if (providerResult.status === 'success') {
      await sql.begin(async (tx) => {
        await tx`
          update vendor_settlement_transfers
          set status = 'success', paystack_transfer_code = ${providerResult.transferCode}, paystack_reference = ${providerResult.reference},
            provider_response = ${JSON.stringify(providerResult.response)}::jsonb, failure_reason = null, updated_at = now(), completed_at = now()
          where id = ${transfer.id}
        `
        await tx`
          update vendor_settlements set status = 'paid'
          where id = ${settlementId} and status = 'pending'
        `
        await tx`
          insert into admin_audit_events (admin_profile_id, action, entity_type, entity_id, metadata)
          values (${adminProfileId}, 'vendor_settlement_reconciled', 'vendor_settlement', ${settlementId}, ${tx.json({ reference: providerResult.reference, transferCode: providerResult.transferCode, amount: transfer.amount })})
        `
      })
      return {
        ok: true,
        status: 'success',
        message: 'Payout confirmed successfully.',
        transferCode: providerResult.transferCode,
        reference: providerResult.reference,
      }
    }

    const status = providerResult.status
    await sql`
      update vendor_settlement_transfers
      set status = ${status}, paystack_transfer_code = ${providerResult.transferCode}, paystack_reference = ${providerResult.reference},
        provider_response = ${JSON.stringify(providerResult.response)}::jsonb, failure_reason = ${providerResult.failureReason}, updated_at = now(),
        completed_at = case when ${status === 'processing'} then null else now() end
      where id = ${transfer.id}
    `
    return {
      ok: false,
      status,
      message:
        status === 'processing'
          ? 'Paystack has not confirmed the payout yet. Reconcile again before retrying.'
          : status === 'reversed'
            ? 'Paystack reversed this payout. Keep the settlement pending and investigate before taking further action.'
            : 'Paystack reports that this payout failed. Correct the cause before retrying.',
      transferCode: providerResult.transferCode,
      reference: providerResult.reference,
    }
  } catch {
    return {
      ok: false,
      status: 'processing',
      message: 'The payout result could not be recorded safely. Reconcile the transfer before retrying.',
      reference: transfer.reference,
    }
  }
}

export async function releaseSettlement(
  settlementId: string,
  adminProfileId: string,
  provider: PayoutProvider = paystackTransferProvider,
): Promise<PayoutResult> {
  let transfer: {
    id: string
    amount: number
    recipientCode: string
    reference: string
    vendorName: string
  }

  try {
    transfer = await sql.begin(async (tx) => {
      const [settlement] = await tx`
        select s.id, s.amount_due, s.status, v.business_name, v.status as vendor_status,
          v.payout_account_status, v.payout_recipient_code
        from vendor_settlements s
        join vendors v on v.id = s.vendor_id
        where s.id = ${settlementId}
        for update
      `
      if (!settlement) throw new PayoutError('rejected', 'Settlement could not be found.')
      if (settlement.status === 'paid') throw new PayoutError('already-paid', 'This settlement has already been paid.')
      const [orderEligibility] = await tx`
        select count(*)::int as total_orders,
          count(*) filter (where i.status = 'paid')::int as paid_orders
        from vendor_settlement_orders so
        left join invoices i on i.order_id = so.order_id
        where so.settlement_id = ${settlementId}
      `
      if (Number(orderEligibility.total_orders) === 0 || Number(orderEligibility.total_orders) !== Number(orderEligibility.paid_orders)) {
        throw new PayoutError('rejected', 'Every order in this settlement must have a paid customer invoice before payout can be released.')
      }
      if (settlement.vendor_status !== 'approved' || settlement.payout_account_status !== 'verified') {
        throw new PayoutError('rejected', 'Verify the vendor payout account before releasing this settlement.')
      }
      if (!settlement.payout_recipient_code)
        throw new PayoutError('rejected', 'The vendor account is verified, but its Paystack payout recipient is not ready.')

      const amount = Number(settlement.amount_due)
      if (!Number.isFinite(amount) || amount <= 0) throw new PayoutError('rejected', 'This settlement has no valid payable amount.')

      const [existing] = await tx`
        select id, status, amount, paystack_recipient_code, paystack_reference
        from vendor_settlement_transfers
        where settlement_id = ${settlementId}
        for update
      `
      if (existing?.status === 'success') throw new PayoutError('already-paid', 'This settlement has already been paid.')
      if (existing?.status === 'queued' || existing?.status === 'processing')
        throw new PayoutError('in-progress', 'This settlement already has a payout in progress. Reconcile it before retrying.')

      const reference = existing?.paystack_reference ?? createPaystackTransferReference()
      const transferId = existing?.id
        ? (
            await tx`
            update vendor_settlement_transfers
            set amount = ${amount}, status = 'queued', paystack_recipient_code = ${settlement.payout_recipient_code},
              failure_reason = null, provider_response = '{}'::jsonb, admin_profile_id = ${adminProfileId}, updated_at = now(), completed_at = null
            where id = ${existing.id}
            returning id
          `
          )[0].id
        : (
            await tx`
            insert into vendor_settlement_transfers (
              settlement_id, vendor_id, amount, status, paystack_reference,
              paystack_recipient_code, recipient_account_name, admin_profile_id
            )
            select s.id, s.vendor_id, ${amount}, 'queued', ${reference},
              v.payout_recipient_code, v.payout_account_name, ${adminProfileId}
            from vendor_settlements s
            join vendors v on v.id = s.vendor_id
            where s.id = ${settlementId}
            returning id
          `
          )[0].id

      return {
        id: transferId,
        amount,
        recipientCode: settlement.payout_recipient_code,
        reference,
        vendorName: settlement.business_name,
      }
    })
  } catch (error) {
    if (error instanceof PayoutError) {
      return {
        ok: false,
        status: error.code === 'in-progress' ? 'processing' : 'rejected',
        message: error.message,
      }
    }
    return { ok: false, status: 'failed', message: 'Payout service is temporarily unavailable. No settlement was marked as paid.' }
  }

  let providerResult: TransferProviderResult
  try {
    await sql`update vendor_settlement_transfers set status = 'processing', updated_at = now() where id = ${transfer.id}`
    providerResult = await initiateTransferWithRecovery(provider, {
      amount: transfer.amount,
      recipientCode: transfer.recipientCode,
      reference: transfer.reference,
      reason: `Qaffy settlement for ${transfer.vendorName}`,
    })
  } catch (error) {
    const message = userMessageForProviderFailure(error)
    await sql`
      update vendor_settlement_transfers
      set status = 'failed', failure_reason = ${error instanceof Error ? error.message : message}, updated_at = now(), completed_at = now()
      where id = ${transfer.id}
    `
    return { ok: false, status: 'failed', message, reference: transfer.reference }
  }

  try {
    if (providerResult.status === 'success') {
      await sql.begin(async (tx) => {
        await tx`
          update vendor_settlement_transfers
          set status = 'success', paystack_transfer_code = ${providerResult.transferCode}, paystack_reference = ${providerResult.reference},
            provider_response = ${JSON.stringify(providerResult.response)}::jsonb, failure_reason = null, updated_at = now(), completed_at = now()
          where id = ${transfer.id}
        `
        await tx`
          update vendor_settlements set status = 'paid'
          where id = ${settlementId} and status = 'pending'
        `
        await tx`
          insert into admin_audit_events (admin_profile_id, action, entity_type, entity_id, metadata)
          values (${adminProfileId}, 'vendor_settlement_paid', 'vendor_settlement', ${settlementId}, ${tx.json({ reference: providerResult.reference, transferCode: providerResult.transferCode, amount: transfer.amount })})
        `
      })
      return {
        ok: true,
        status: 'success',
        message: 'Payout released successfully.',
        transferCode: providerResult.transferCode,
        reference: providerResult.reference,
      }
    }

    const status = providerResult.status
    await sql`
      update vendor_settlement_transfers
      set status = ${status}, paystack_transfer_code = ${providerResult.transferCode}, paystack_reference = ${providerResult.reference},
        provider_response = ${JSON.stringify(providerResult.response)}::jsonb, failure_reason = ${providerResult.failureReason}, updated_at = now(),
        completed_at = case when ${status === 'processing'} then null else now() end
      where id = ${transfer.id}
    `
    return {
      ok: false,
      status,
      message:
        status === 'processing'
          ? 'Paystack accepted the payout, but has not confirmed it yet. Reconcile the transfer before retrying.'
          : status === 'reversed'
            ? 'Paystack reversed this payout. Investigate before taking further action.'
            : 'Paystack rejected this payout. Review the payout account and provider details before retrying.',
      transferCode: providerResult.transferCode,
      reference: providerResult.reference,
    }
  } catch {
    return {
      ok: false,
      status: 'processing',
      message: 'The payout result could not be recorded safely. Reconcile the transfer before retrying.',
      reference: providerResult.reference,
    }
  }
}
