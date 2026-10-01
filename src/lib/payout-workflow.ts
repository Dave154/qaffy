import { createPaystackTransferReference, initiateTransferWithRecovery } from './payout-outcomes.ts'
import type { PayoutProvider, TransferProviderResult, TransferProviderStatus } from './payout-outcomes.ts'

export type PayoutResult = {
  ok: boolean
  status: 'success' | 'processing' | 'failed' | 'reversed' | 'rejected'
  message: string
  transferCode?: string | null
  reference?: string
}

export type StoredTransferStatus = 'queued' | TransferProviderStatus | 'rejected'

export type PayoutSettlement = {
  id: string
  amount: number
  status: 'pending' | 'paid'
  vendorName: string
  vendorStatus: string
  payoutAccountStatus: string
  recipientCode: string | null
}

export type StoredTransfer = {
  id: string
  status: StoredTransferStatus
  amount: number
  recipientCode: string | null
  reference: string | null
  transferCode: string | null
}

export type ReservedTransfer = Omit<StoredTransfer, 'recipientCode' | 'reference'> & {
  recipientCode: string
  reference: string
  vendorName: string
}

export type TransferUpdate = {
  status: StoredTransferStatus
  transferCode: string | null
  reference: string
  response: Record<string, unknown>
  failureReason: string | null
}

export type PayoutWorkflowTransaction = {
  getSettlement(settlementId: string): Promise<PayoutSettlement | null>
  getOrderEligibility(settlementId: string): Promise<{ totalOrders: number; paidOrders: number }>
  getTransfer(settlementId: string): Promise<StoredTransfer | null>
  reserveTransfer(input: {
    settlement: PayoutSettlement
    existing: StoredTransfer | null
    adminProfileId: string
    amount: number
    reference: string
  }): Promise<ReservedTransfer>
  getReconciliationTarget(settlementId: string): Promise<{
    transfer: StoredTransfer
    settlementStatus: 'pending' | 'paid'
  } | null>
  updateTransfer(transferId: string, update: TransferUpdate): Promise<void>
  confirmTransfer(input: {
    transferId: string
    settlementId: string
    adminProfileId: string
    amount: number
    result: TransferProviderResult
    auditAction: 'vendor_settlement_paid' | 'vendor_settlement_reconciled'
  }): Promise<void>
}

export type PayoutWorkflowStore = {
  transaction<T>(work: (tx: PayoutWorkflowTransaction) => Promise<T>): Promise<T>
}

class PayoutError extends Error {
  readonly code: 'rejected' | 'in-progress' | 'already-paid'

  constructor(code: 'rejected' | 'in-progress' | 'already-paid', message: string) {
    super(message)
    this.code = code
  }
}

const unknownStatusMessage = 'Paystack did not confirm the payout. Keep the settlement pending and try reconciliation again.'

function isActiveTransferStatus(status: StoredTransferStatus) {
  return status === 'queued' || status === 'processing'
}

export async function releaseSettlementWithStore(
  store: PayoutWorkflowStore,
  settlementId: string,
  adminProfileId: string,
  provider: PayoutProvider,
): Promise<PayoutResult> {
  let transfer: ReservedTransfer

  try {
    transfer = await store.transaction(async (tx) => {
      const settlement = await tx.getSettlement(settlementId)
      if (!settlement) throw new PayoutError('rejected', 'Settlement could not be found.')
      if (settlement.status === 'paid') throw new PayoutError('already-paid', 'This settlement has already been paid.')

      const orderEligibility = await tx.getOrderEligibility(settlementId)
      if (orderEligibility.totalOrders === 0 || orderEligibility.totalOrders !== orderEligibility.paidOrders) {
        throw new PayoutError('rejected', 'Every order in this settlement must have a paid customer invoice before payout can be released.')
      }
      if (settlement.vendorStatus !== 'approved' || settlement.payoutAccountStatus !== 'verified') {
        throw new PayoutError('rejected', 'Verify the vendor payout account before releasing this settlement.')
      }
      if (!settlement.recipientCode)
        throw new PayoutError('rejected', 'The vendor account is verified, but its Paystack payout recipient is not ready.')

      const amount = Number(settlement.amount)
      if (!Number.isFinite(amount) || amount <= 0) throw new PayoutError('rejected', 'This settlement has no valid payable amount.')

      const existing = await tx.getTransfer(settlementId)
      if (existing?.status === 'success') throw new PayoutError('already-paid', 'This settlement has already been paid.')
      if (existing && isActiveTransferStatus(existing.status)) {
        throw new PayoutError('in-progress', 'This settlement already has a payout in progress. Reconcile it before retrying.')
      }
      if (existing?.status === 'reversed') {
        throw new PayoutError('rejected', 'Paystack reversed this payout. Investigate before taking further action.')
      }

      const reserved = await tx.reserveTransfer({
        settlement,
        existing,
        adminProfileId,
        amount,
        reference: existing?.reference ?? createPaystackTransferReference(),
      })
      return { ...reserved, vendorName: settlement.vendorName }
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
    await store.transaction((tx) =>
      tx.updateTransfer(transfer.id, {
        status: 'processing',
        transferCode: transfer.transferCode,
        reference: transfer.reference!,
        response: {},
        failureReason: null,
      }),
    )
    providerResult = await initiateTransferWithRecovery(provider, {
      amount: transfer.amount,
      recipientCode: transfer.recipientCode!,
      reference: transfer.reference!,
      reason: `Qaffy settlement for ${transfer.vendorName}`,
    })
  } catch (error) {
    const message =
      error instanceof Error && error.message === 'Payout service is not configured.'
        ? 'Payout service is temporarily unavailable. No settlement was marked as paid.'
        : 'Paystack rejected this payout. Review the payout account and provider details before retrying.'
    try {
      await store.transaction((tx) =>
        tx.updateTransfer(transfer.id, {
          status: 'failed',
          transferCode: transfer.transferCode,
          reference: transfer.reference!,
          response: {},
          failureReason: error instanceof Error ? error.message : message,
        }),
      )
    } catch {
      return {
        ok: false,
        status: 'processing',
        message: 'The payout result could not be recorded safely. Reconcile the transfer before retrying.',
        reference: transfer.reference ?? undefined,
      }
    }
    return { ok: false, status: 'failed', message, reference: transfer.reference ?? undefined }
  }

  try {
    if (providerResult.status === 'success') {
      await store.transaction((tx) =>
        tx.confirmTransfer({
          transferId: transfer.id,
          settlementId,
          adminProfileId,
          amount: transfer.amount,
          result: providerResult,
          auditAction: 'vendor_settlement_paid',
        }),
      )
      return {
        ok: true,
        status: 'success',
        message: 'Payout released successfully.',
        transferCode: providerResult.transferCode,
        reference: providerResult.reference,
      }
    }

    await store.transaction((tx) =>
      tx.updateTransfer(transfer.id, {
        status: providerResult.status,
        transferCode: providerResult.transferCode,
        reference: providerResult.reference,
        response: providerResult.response,
        failureReason: providerResult.failureReason,
      }),
    )
  } catch {
    return {
      ok: false,
      status: 'processing',
      message: 'The payout result could not be recorded safely. Reconcile the transfer before retrying.',
      reference: providerResult.reference,
    }
  }

  return {
    ok: false,
    status: providerResult.status,
    message:
      providerResult.status === 'processing'
        ? 'Paystack accepted the payout, but has not confirmed it yet. Reconcile the transfer before retrying.'
        : providerResult.status === 'reversed'
          ? 'Paystack reversed this payout. Investigate before taking further action.'
          : 'Paystack rejected this payout. Review the payout account and provider details before retrying.',
    transferCode: providerResult.transferCode,
    reference: providerResult.reference,
  }
}

export async function reconcileSettlementWithStore(
  store: PayoutWorkflowStore,
  settlementId: string,
  adminProfileId: string,
  provider: PayoutProvider,
): Promise<PayoutResult> {
  let target: { transfer: StoredTransfer; settlementStatus: 'pending' | 'paid' }
  try {
    target = await store.transaction(async (tx) => {
      const current = await tx.getReconciliationTarget(settlementId)
      if (!current) throw new PayoutError('rejected', 'No payout transfer exists for this settlement.')
      if (current.settlementStatus === 'paid' || current.transfer.status === 'success') {
        throw new PayoutError('already-paid', 'This settlement has already been paid.')
      }
      if (!isActiveTransferStatus(current.transfer.status)) {
        throw new PayoutError('rejected', 'This payout does not need reconciliation.')
      }
      if (!current.transfer.reference && !current.transfer.transferCode) {
        throw new PayoutError('in-progress', 'No transfer code or reference is available yet. Do not retry this settlement.')
      }
      return current
    })
  } catch (error) {
    if (error instanceof PayoutError) {
      return { ok: false, status: error.code === 'in-progress' ? 'processing' : 'rejected', message: error.message }
    }
    return { ok: false, status: 'processing', message: 'The payout status could not be loaded safely. Reconcile it again before retrying.' }
  }

  let result: TransferProviderResult
  try {
    result = await provider.checkTransfer({ transferCode: target.transfer.transferCode, reference: target.transfer.reference })
  } catch {
    return {
      ok: false,
      status: 'processing',
      message: unknownStatusMessage,
      transferCode: target.transfer.transferCode,
      reference: target.transfer.reference ?? undefined,
    }
  }

  try {
    if (result.status === 'success') {
      await store.transaction((tx) =>
        tx.confirmTransfer({
          transferId: target.transfer.id,
          settlementId,
          adminProfileId,
          amount: target.transfer.amount,
          result,
          auditAction: 'vendor_settlement_reconciled',
        }),
      )
      return {
        ok: true,
        status: 'success',
        message: 'Payout confirmed successfully.',
        transferCode: result.transferCode,
        reference: result.reference,
      }
    }

    await store.transaction((tx) =>
      tx.updateTransfer(target.transfer.id, {
        status: result.status,
        transferCode: result.transferCode,
        reference: result.reference,
        response: result.response,
        failureReason: result.failureReason,
      }),
    )
  } catch {
    return {
      ok: false,
      status: 'processing',
      message: 'The payout result could not be recorded safely. Reconcile the transfer before retrying.',
      reference: target.transfer.reference ?? undefined,
    }
  }

  return {
    ok: false,
    status: result.status,
    message:
      result.status === 'processing'
        ? 'Paystack has not confirmed the payout yet. Reconcile again before retrying.'
        : result.status === 'reversed'
          ? 'Paystack reversed this payout. Keep the settlement pending and investigate before taking further action.'
          : 'Paystack reports that this payout failed. Correct the cause before retrying.',
    transferCode: result.transferCode,
    reference: result.reference,
  }
}
