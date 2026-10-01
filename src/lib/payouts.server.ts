import { sql } from './db.server'
import { getTransferVerificationPath, TransferProviderError } from './payout-outcomes'
import type { PayoutProvider, TransferProviderStatus } from './payout-outcomes'
import { reconcileSettlementWithStore, releaseSettlementWithStore } from './payout-workflow'
import type { PayoutResult, PayoutWorkflowStore, PayoutWorkflowTransaction, StoredTransferStatus } from './payout-workflow'
import { processPaystackTransferEvent } from './payout-webhooks'
import type { PaystackTransferEvent, PayoutWebhookStore, PayoutWebhookTransaction, PayoutWebhookTransfer } from './payout-webhooks'

export type { PayoutResult } from './payout-workflow'

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

const sqlPayoutStore: PayoutWorkflowStore = {
  async transaction<T>(work: (tx: PayoutWorkflowTransaction) => Promise<T>): Promise<T> {
    return sql.begin(async (tx) =>
      work({
        async getSettlement(settlementId) {
          const [row] = await tx`
            select s.id, s.amount_due, s.status, v.business_name, v.status as vendor_status,
              v.payout_account_status, v.payout_recipient_code
            from vendor_settlements s
            join vendors v on v.id = s.vendor_id
            where s.id = ${settlementId}
            for update
          `
          return row
            ? {
                id: row.id,
                amount: Number(row.amount_due),
                status: row.status as 'pending' | 'paid',
                vendorName: row.business_name || 'Vendor',
                vendorStatus: row.vendor_status,
                payoutAccountStatus: row.payout_account_status,
                recipientCode: row.payout_recipient_code,
              }
            : null
        },
        async getOrderEligibility(settlementId) {
          const [row] = await tx`
            select count(*)::int as total_orders,
              count(*) filter (where i.status = 'paid')::int as paid_orders
            from vendor_settlement_orders so
            left join invoices i on i.order_id = so.order_id
            where so.settlement_id = ${settlementId}
          `
          return { totalOrders: Number(row.total_orders), paidOrders: Number(row.paid_orders) }
        },
        async getTransfer(settlementId) {
          const [row] = await tx`
            select id, status, amount, paystack_recipient_code, paystack_reference, paystack_transfer_code
            from vendor_settlement_transfers
            where settlement_id = ${settlementId}
            for update
          `
          return row
            ? {
                id: row.id,
                status: row.status as StoredTransferStatus,
                amount: Number(row.amount),
                recipientCode: row.paystack_recipient_code,
                reference: row.paystack_reference,
                transferCode: row.paystack_transfer_code,
              }
            : null
        },
        async reserveTransfer({ settlement, existing, adminProfileId, amount, reference }) {
          const [row] = existing
            ? await tx`
                update vendor_settlement_transfers
                set amount = ${amount}, status = 'queued', paystack_recipient_code = ${settlement.recipientCode},
                  failure_reason = null, provider_response = '{}'::jsonb, admin_profile_id = ${adminProfileId},
                  updated_at = now(), completed_at = null
                where id = ${existing.id}
                returning id
              `
            : await tx`
                insert into vendor_settlement_transfers (
                  settlement_id, vendor_id, amount, status, paystack_reference,
                  paystack_recipient_code, recipient_account_name, admin_profile_id
                )
                select s.id, s.vendor_id, ${amount}, 'queued', ${reference},
                  v.payout_recipient_code, v.payout_account_name, ${adminProfileId}
                from vendor_settlements s
                join vendors v on v.id = s.vendor_id
                where s.id = ${settlement.id}
                returning id
              `
          if (!row) throw new Error('Payout transfer could not be reserved.')
          return {
            id: row.id,
            status: 'queued',
            amount,
            recipientCode: settlement.recipientCode!,
            reference,
            transferCode: null,
            vendorName: settlement.vendorName,
          }
        },
        async getReconciliationTarget(settlementId) {
          const [row] = await tx`
            select t.id, t.status, t.paystack_transfer_code, t.paystack_reference, t.amount,
              t.paystack_recipient_code, s.status as settlement_status
            from vendor_settlement_transfers t
            join vendor_settlements s on s.id = t.settlement_id
            where t.settlement_id = ${settlementId}
            for update
          `
          return row
            ? {
                transfer: {
                  id: row.id,
                  status: row.status as StoredTransferStatus,
                  amount: Number(row.amount),
                  recipientCode: row.paystack_recipient_code,
                  reference: row.paystack_reference,
                  transferCode: row.paystack_transfer_code,
                },
                settlementStatus: row.settlement_status as 'pending' | 'paid',
              }
            : null
        },
        async updateTransfer(transferId, update) {
          await tx`
            update vendor_settlement_transfers
            set status = ${update.status}, paystack_transfer_code = ${update.transferCode},
              paystack_reference = ${update.reference}, provider_response = ${JSON.stringify(update.response)}::jsonb,
              failure_reason = ${update.failureReason}, updated_at = now(),
              completed_at = case when ${update.status === 'processing' || update.status === 'queued'} then null else now() end
            where id = ${transferId}
          `
        },
        async confirmTransfer({ transferId, settlementId, adminProfileId, amount, result, auditAction }) {
          await tx`
            update vendor_settlement_transfers
            set status = 'success', paystack_transfer_code = ${result.transferCode}, paystack_reference = ${result.reference},
              provider_response = ${JSON.stringify(result.response)}::jsonb, failure_reason = null, updated_at = now(), completed_at = now()
            where id = ${transferId}
          `
          await tx`
            update vendor_settlements set status = 'paid'
            where id = ${settlementId} and status = 'pending'
          `
          await tx`
            insert into admin_audit_events (admin_profile_id, action, entity_type, entity_id, metadata)
            values (
              ${adminProfileId}, ${auditAction}, 'vendor_settlement', ${settlementId},
              ${tx.json({ reference: result.reference, transferCode: result.transferCode, amount })}
            )
          `
        },
      }),
    ) as unknown as Promise<T>
  },
}

const sqlPayoutWebhookStore: PayoutWebhookStore = {
  async transaction<T>(work: (tx: PayoutWebhookTransaction) => Promise<T>): Promise<T> {
    return (sql.begin(async (tx) =>
      work({
        async findTransferByReference(reference) {
          const [row] = await tx`
            select t.id, t.settlement_id, t.status as transfer_status, t.amount, t.paystack_reference,
              t.paystack_transfer_code, t.paystack_recipient_code, t.admin_profile_id, s.status as settlement_status
            from vendor_settlement_transfers t
            join vendor_settlements s on s.id = t.settlement_id
            where t.paystack_reference = ${reference}
            for update of t, s
          `
          return row
            ? {
                id: row.id,
                settlementId: row.settlement_id,
                initiatedByAdminId: row.admin_profile_id,
                status: row.transfer_status as PayoutWebhookTransfer['status'],
                settlementStatus: row.settlement_status as PayoutWebhookTransfer['settlementStatus'],
                amount: Number(row.amount),
                reference: row.paystack_reference,
                transferCode: row.paystack_transfer_code,
                recipientCode: row.paystack_recipient_code,
              }
            : null
        },
        async updateTransfer(transferId, update) {
          await tx`
            update vendor_settlement_transfers
            set status = ${update.status}, paystack_reference = ${update.reference},
              paystack_transfer_code = coalesce(${update.transferCode}, paystack_transfer_code),
              provider_response = ${JSON.stringify(update.providerResponse)}::jsonb,
              failure_reason = ${update.failureReason}, updated_at = now(),
              completed_at = case
                when ${update.status === 'success' || update.status === 'failed' || update.status === 'reversed'} then now()
                else null
              end
            where id = ${transferId}
          `
        },
        async markSettlementPaid(settlementId) {
          await tx`
            update vendor_settlements set status = 'paid'
            where id = ${settlementId} and status = 'pending'
          `
        },
        async writeAudit({ adminProfileId, settlementId, action, reference, transferCode, amount, providerResponse }) {
          await tx`
            insert into admin_audit_events (admin_profile_id, action, entity_type, entity_id, metadata)
            values (
              ${adminProfileId}, ${action}, 'vendor_settlement', ${settlementId},
              ${JSON.stringify({ source: 'paystack_webhook', reference, transferCode, amount, providerResponse })}::jsonb
            )
          `
        },
      }),
    )) as unknown as Promise<T>
  },
}

export function processPaystackTransferWebhook(event: PaystackTransferEvent) {
  return processPaystackTransferEvent(event, sqlPayoutWebhookStore)
}

export function reconcileSettlement(
  settlementId: string,
  adminProfileId: string,
  provider: PayoutProvider = paystackTransferProvider,
): Promise<PayoutResult> {
  return reconcileSettlementWithStore(sqlPayoutStore, settlementId, adminProfileId, provider)
}

export function releaseSettlement(
  settlementId: string,
  adminProfileId: string,
  provider: PayoutProvider = paystackTransferProvider,
): Promise<PayoutResult> {
  return releaseSettlementWithStore(sqlPayoutStore, settlementId, adminProfileId, provider)
}
