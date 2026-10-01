export type CreatedSettlement = {
  settlementId: string
  vendorId: string
  vendorName: string
  orderCount: number
  amount: number
}

export type SettlementPayoutStatus = 'success' | 'processing' | 'failed' | 'reversed' | 'rejected'

export type SettlementPayoutOutcome = {
  ok: boolean
  status: SettlementPayoutStatus
  message: string
  reference?: string
}

export type CreatedSettlementPayout = CreatedSettlement & SettlementPayoutOutcome

export async function releaseCreatedSettlements(
  settlements: readonly CreatedSettlement[],
  adminProfileId: string,
  release: (settlementId: string, adminProfileId: string) => Promise<SettlementPayoutOutcome>,
): Promise<CreatedSettlementPayout[]> {
  const outcomes: CreatedSettlementPayout[] = []

  for (const settlement of settlements) {
    try {
      const payout = await release(settlement.settlementId, adminProfileId)
      outcomes.push({ ...settlement, ...payout })
    } catch {
      outcomes.push({
        ...settlement,
        ok: false,
        status: 'processing',
        message: 'The payout result is unknown. Reconcile it before retrying.',
      })
    }
  }

  return outcomes
}

export function summarizeSettlementPayouts(outcomes: readonly CreatedSettlementPayout[]) {
  const paid = outcomes.filter((outcome) => outcome.status === 'success').length
  const processing = outcomes.filter((outcome) => outcome.status === 'processing').length
  const failed = outcomes.filter((outcome) => outcome.status === 'failed' || outcome.status === 'rejected').length
  const reversed = outcomes.filter((outcome) => outcome.status === 'reversed').length
  const details = [`${paid} payout${paid === 1 ? '' : 's'} confirmed`]

  if (processing > 0) details.push(`${processing} processing`)
  if (failed > 0) details.push(`${failed} need attention`)
  if (reversed > 0) details.push(`${reversed} reversed for review`)

  return `Created ${outcomes.length} settlement${outcomes.length === 1 ? '' : 's'}; ${details.join(', ')}.`
}