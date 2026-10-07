import type { TransactionSql } from 'postgres'
import { sql } from './db.server'

type SubscriptionSnapshotInput = {
  customerId: string
  planId: string
  startDate: string
  endDate: string | null
}

export async function lockCustomerSubscription(tx: TransactionSql, customerId: string) {
  await tx`select pg_advisory_xact_lock(hashtextextended(${customerId}, 0))`
}

export async function insertSubscriptionWithSnapshot(tx: TransactionSql, input: SubscriptionSnapshotInput) {
  const [plan] = await tx`
    select id, weekly_limit, covers_wash, covers_iron
    from plans
    where id = ${input.planId}
    for share
  `
  if (!plan) throw new Error('Plan not found')

  const [subscription] = await tx`
    insert into subscriptions (
      customer_id, plan_id, status, start_date, end_date,
      weekly_limit_snapshot, covers_wash_snapshot, covers_iron_snapshot
    )
    values (
      ${input.customerId}, ${input.planId}, 'active', ${input.startDate}, ${input.endDate},
      ${plan.weekly_limit}, ${plan.covers_wash}, ${plan.covers_iron}
    )
    returning id, customer_id, plan_id, status, start_date, end_date,
      weekly_limit_snapshot, covers_wash_snapshot, covers_iron_snapshot, created_at
  `

  return subscription
}

export async function createManualSubscriptionWithSnapshot(input: SubscriptionSnapshotInput) {
  return sql.begin(async (tx) => {
    await lockCustomerSubscription(tx, input.customerId)
    const [existing] = await tx`
      select id
      from subscriptions
      where customer_id = ${input.customerId}
        and status = 'active'
        and (end_date is null or end_date >= current_date)
      limit 1
      for update
    `
    if (existing) throw new Error('Customer already has an active subscription.')

    const [plan] = await tx`
      select type
      from plans
      where id = ${input.planId}
      for share
    `
    if (!plan) throw new Error('Plan not found')

    let endDate = input.endDate
    if (plan.type === 'semester') {
      const [semesterSettings] = await tx<{ semester_end_date: Date | string | null }[]>`
        select semester_end_date
        from app_settings
        where key = 'semester'
        limit 1
      `
      if (!semesterSettings?.semester_end_date) throw new Error('Set the semester end date in Admin Plans before creating this subscription.')
      endDate =
        semesterSettings.semester_end_date instanceof Date
          ? semesterSettings.semester_end_date.toISOString().slice(0, 10)
          : semesterSettings.semester_end_date.slice(0, 10)
    }

    return insertSubscriptionWithSnapshot(tx, { ...input, endDate })
  })
}