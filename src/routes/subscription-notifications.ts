import { data } from 'react-router'
import { sql } from '../lib/db.server'
import { sendCustomerNotification } from '../lib/notifications.server'

export async function loader({ request }: { request: Request }) {
  const cronSecret = process.env.CRON_SECRET
  const authorization = request.headers.get('authorization')
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) return data({ ok: false, message: 'Unauthorized.' }, { status: 401 })

  const transitions = await sql.begin(async (tx) => {
    const [clock] = await tx<{ today: string }[]>`select (now() at time zone 'Africa/Lagos')::date::text as today`
    const expired = await tx<Array<{ id: string; customer_id: string; plan_name: string }>>`
      with updated as (
        update subscriptions
        set status = 'ended'
        where status = 'active'
          and end_date < ${clock.today}::date
        returning id, customer_id, plan_id
      )
      select updated.id, updated.customer_id, plan.name as plan_name
      from updated
      join plans plan on plan.id = updated.plan_id
    `
    const activated = await tx<Array<{ id: string; customer_id: string; plan_name: string }>>`
      with updated as (
        update subscriptions
        set status = 'active', is_queued_renewal = false
        where status = 'scheduled'
          and start_date <= ${clock.today}::date
          and end_date >= ${clock.today}::date
        returning id, customer_id, plan_id
      )
      select updated.id, updated.customer_id, plan.name as plan_name
      from updated
      join plans plan on plan.id = updated.plan_id
    `
    const missed = await tx`
      update subscriptions
      set status = 'ended', is_queued_renewal = false
      where status = 'scheduled'
        and end_date < ${clock.today}::date
      returning id
    `
    return { expired, activated, missed: missed.length }
  })

  for (const subscription of transitions.expired) {
    await sendCustomerNotification({
      eventKey: `subscription:${subscription.id}:expired`,
      customerId: subscription.customer_id,
      notificationType: 'subscription_expired',
      subscriptionId: subscription.id,
      payload: {
        title: 'Plan expired',
        body: `Your ${subscription.plan_name} plan has expired.`,
        details: [`Plan: ${subscription.plan_name}`, 'Renew your plan to continue using subscription benefits.'],
        url: '/plans',
        tag: `subscription:${subscription.id}:lifecycle`,
      },
    })
  }

  for (const subscription of transitions.activated) {
    await sendCustomerNotification({
      eventKey: `subscription:${subscription.id}:started`,
      customerId: subscription.customer_id,
      notificationType: 'subscription_renewal_started',
      subscriptionId: subscription.id,
      payload: {
        title: 'Renewal plan started',
        body: `Your ${subscription.plan_name} renewal is now active.`,
        details: [`Plan: ${subscription.plan_name}`, 'Your subscription benefits are now available.'],
        url: '/plans',
        tag: `subscription:${subscription.id}:lifecycle`,
      },
    })
  }

  const subscriptions = await sql<Array<{ id: string; customer_id: string; plan_name: string; days_remaining: number }>>`
    with calendar as (
      select (now() at time zone 'Africa/Lagos')::date as today
    )
    select s.id, s.customer_id, p.name as plan_name, s.end_date - calendar.today as days_remaining
    from subscriptions s
    join plans p on p.id = s.plan_id
    cross join calendar
    where s.status = 'active'
      and s.end_date is not null
      and s.end_date <= calendar.today + 7
  `

  let remindersSent = 0
  const reminderDays = new Set([7, 3, 1])

  for (const subscription of subscriptions) {
    const daysRemaining = subscription.days_remaining
    if (!reminderDays.has(daysRemaining)) continue
    await sendCustomerNotification({
      eventKey: `subscription:${subscription.id}:renewal:${daysRemaining}`,
      customerId: subscription.customer_id,
      notificationType: 'subscription_renewal_reminder',
      subscriptionId: subscription.id,
      payload: {
        title: 'Plan ending soon',
        body: `Your ${subscription.plan_name} plan ends in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`,
        details: [`Plan: ${subscription.plan_name}`, `Days remaining: ${daysRemaining}`],
        url: '/plans',
        tag: `subscription:${subscription.id}:lifecycle`,
      },
    })
    remindersSent += 1
  }

  return data({
    ok: true,
    remindersSent,
    expired: transitions.expired.length,
    renewalsActivated: transitions.activated.length,
    missedRenewalsEnded: transitions.missed,
  })
}
