export type PaystackTransferEventName = 'transfer.success' | 'transfer.failed' | 'transfer.reversed'
export type PaystackTransferState = 'queued' | 'processing' | 'success' | 'failed' | 'reversed' | 'rejected'
export type SettlementPaymentState = 'pending' | 'paid'

export type PaystackTransferEvent = {
  event: string
  data?: {
    reference?: unknown
    amount?: unknown
    currency?: unknown
    status?: unknown
    transfer_code?: unknown
    recipient_code?: unknown
    recipient?: { recipient_code?: unknown } | null
    reason?: unknown
  }
}

export type PayoutWebhookTransfer = {
  id: string
  settlementId: string
  initiatedByAdminId: string
  status: PaystackTransferState
  settlementStatus: SettlementPaymentState
  amount: number
  reference: string
  transferCode: string | null
  recipientCode: string | null
}

export type PayoutWebhookUpdate = {
  status: Exclude<PaystackTransferState, 'queued' | 'rejected'>
  reference: string
  transferCode: string | null
  providerResponse: Record<string, unknown>
  failureReason: string | null
}

export type PayoutWebhookTransaction = {
  findTransferByReference(reference: string): Promise<PayoutWebhookTransfer | null>
  updateTransfer(transferId: string, update: PayoutWebhookUpdate): Promise<void>
  markSettlementPaid(settlementId: string): Promise<void>
  writeAudit(input: {
    adminProfileId: string
    settlementId: string
    action: 'vendor_settlement_webhook_paid' | 'vendor_settlement_webhook_failed' | 'vendor_settlement_webhook_reversed'
    reference: string
    transferCode: string | null
    amount: number
    providerResponse: Record<string, unknown>
  }): Promise<void>
}

export type PayoutWebhookStore = {
  transaction<T>(work: (tx: PayoutWebhookTransaction) => Promise<T>): Promise<T>
}

export type TransferWebhookResult =
  | { handled: false; reason: 'unsupported-event' | 'unknown-reference' | 'stale-event' }
  | { handled: true; duplicate: boolean; status: Exclude<PaystackTransferState, 'queued' | 'rejected'> }

export class TransferWebhookValidationError extends Error {}

const eventStates: Record<PaystackTransferEventName, PayoutWebhookUpdate['status']> = {
  'transfer.success': 'success',
  'transfer.failed': 'failed',
  'transfer.reversed': 'reversed',
}

export async function processPaystackTransferEvent(
  event: PaystackTransferEvent,
  store: PayoutWebhookStore,
): Promise<TransferWebhookResult> {
  if (!(event.event in eventStates)) return { handled: false, reason: 'unsupported-event' }

  const expectedStatus = eventStates[event.event as PaystackTransferEventName]
  const data = event.data
  const reference = typeof data?.reference === 'string' ? data.reference.trim() : ''
  const amountInSubunits = Number(data?.amount)
  const currency = typeof data?.currency === 'string' ? data.currency.toUpperCase() : ''
  const payloadStatus = typeof data?.status === 'string' ? data.status.toLowerCase() : ''
  const transferCode = typeof data?.transfer_code === 'string' ? data.transfer_code : null
  const recipientCode =
    typeof data?.recipient?.recipient_code === 'string'
      ? data.recipient.recipient_code
      : typeof data?.recipient_code === 'string'
        ? data.recipient_code
        : null

  if (!reference || !Number.isSafeInteger(amountInSubunits) || amountInSubunits <= 0 || currency !== 'NGN') {
    throw new TransferWebhookValidationError('Transfer webhook is missing a valid reference, NGN amount, or currency.')
  }
  if (payloadStatus && payloadStatus !== expectedStatus) {
    throw new TransferWebhookValidationError('Transfer webhook event and status do not match.')
  }

  const providerResponse = event as unknown as Record<string, unknown>
  const failureReason = typeof data?.reason === 'string' ? data.reason : null

  return store.transaction(async (tx) => {
    const transfer = await tx.findTransferByReference(reference)
    if (!transfer) return { handled: false, reason: 'unknown-reference' }
    if (Math.round(transfer.amount * 100) !== amountInSubunits) {
      throw new TransferWebhookValidationError('Transfer webhook amount does not match the recorded payout.')
    }
    if (transferCode && transfer.transferCode && transfer.transferCode !== transferCode) {
      throw new TransferWebhookValidationError('Transfer webhook code does not match the recorded payout.')
    }
    if (recipientCode && transfer.recipientCode && transfer.recipientCode !== recipientCode) {
      throw new TransferWebhookValidationError('Transfer webhook recipient does not match the recorded payout.')
    }

    if (transfer.status === 'reversed' && expectedStatus !== 'reversed') {
      return { handled: false, reason: 'stale-event' }
    }
    if ((transfer.status === 'success' || transfer.status === 'reversed') && expectedStatus === 'failed') {
      return { handled: false, reason: 'stale-event' }
    }
    if (transfer.status === expectedStatus) {
      if (expectedStatus === 'success' && transfer.settlementStatus === 'pending') {
        await tx.markSettlementPaid(transfer.settlementId)
        await tx.writeAudit({
          adminProfileId: transfer.initiatedByAdminId,
          settlementId: transfer.settlementId,
          action: 'vendor_settlement_webhook_paid',
          reference,
          transferCode: transferCode ?? transfer.transferCode,
          amount: transfer.amount,
          providerResponse,
        })
      }
      return { handled: true, duplicate: true, status: expectedStatus }
    }

    await tx.updateTransfer(transfer.id, {
      status: expectedStatus,
      reference,
      transferCode: transferCode ?? transfer.transferCode,
      providerResponse,
      failureReason: expectedStatus === 'failed' || expectedStatus === 'reversed' ? failureReason : null,
    })

    if (expectedStatus === 'success') await tx.markSettlementPaid(transfer.settlementId)
    await tx.writeAudit({
      adminProfileId: transfer.initiatedByAdminId,
      settlementId: transfer.settlementId,
      action:
        expectedStatus === 'success'
          ? 'vendor_settlement_webhook_paid'
          : expectedStatus === 'failed'
            ? 'vendor_settlement_webhook_failed'
            : 'vendor_settlement_webhook_reversed',
      reference,
      transferCode: transferCode ?? transfer.transferCode,
      amount: transfer.amount,
      providerResponse,
    })

    return { handled: true, duplicate: false, status: expectedStatus }
  })
}