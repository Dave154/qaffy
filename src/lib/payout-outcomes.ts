import { randomUUID } from 'node:crypto'

export type TransferProviderStatus = 'success' | 'processing' | 'failed' | 'reversed'

export type TransferProviderInput = {
  amount: number
  recipientCode: string
  reference: string
  reason: string
}

export type TransferProviderResult = {
  status: TransferProviderStatus
  transferCode: string | null
  reference: string
  response: Record<string, unknown>
  failureReason: string | null
}

export type PayoutProvider = {
  initiateTransfer(input: TransferProviderInput): Promise<TransferProviderResult>
  checkTransfer(input: { transferCode: string | null; reference: string | null }): Promise<TransferProviderResult>
}

export function createPaystackTransferReference(uuid = randomUUID()) {
  return `qsettle-${uuid}`
}

export function getTransferVerificationPath(input: { transferCode: string | null; reference: string | null }) {
  if (input.transferCode) return `/transfer/${encodeURIComponent(input.transferCode)}`
  if (input.reference) return `/transfer/verify/${encodeURIComponent(input.reference)}`
  throw new Error('A transfer code or reference is required for reconciliation.')
}

export class TransferProviderError extends Error {
  readonly certainty: 'rejected' | 'unknown'
  readonly response: Record<string, unknown>

  constructor(message: string, certainty: 'rejected' | 'unknown', response: Record<string, unknown> = {}) {
    super(message)
    this.certainty = certainty
    this.response = response
  }
}

export async function initiateTransferWithRecovery(
  provider: PayoutProvider,
  input: TransferProviderInput,
): Promise<TransferProviderResult> {
  try {
    return await provider.initiateTransfer(input)
  } catch (error) {
    const providerError = error instanceof TransferProviderError ? error : null
    return {
      status: providerError?.certainty === 'rejected' ? 'failed' : 'processing',
      transferCode: null,
      reference: input.reference,
      response: providerError?.response ?? {},
      failureReason: error instanceof Error ? error.message : 'Transfer status is unknown.',
    }
  }
}
