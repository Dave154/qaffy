import { data } from 'react-router'
import { sql } from '../lib/db.server'
import { sendCustomerNotification } from '../lib/notifications.server'

export async function loader({ request }: { request: Request }) {
  const cronSecret = process.env.CRON_SECRET
  const authorization = request.headers.get('authorization')
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) return data({ ok: false, message: 'Unauthorized.' }, { status: 401 })

  const subscriptions = await sql<Array<{ id: string; customer_id: string; plan_name: string; end_date: string }>>`
    select s.id, s.customer_id, p.name as plan_name, s.end_date
    from subscriptions s
    join plans p on p.id = s.plan_id
    where s.status = 'active'
      and s.end_date is not null
      and s.end_date <= current_date + 7
  `

  let remindersSent = 0
  let expired = 0
  const reminderDays = new Set([7, 3, 1])

  for (const subscription of subscriptions) {
    const daysRemaining = Math.round((new Date(`${subscription.end_date}T00:00:00Z`).getTime() - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime()) / 86_400_000)

    if (daysRemaining < 0) {
      const [ended] = await sql`
        update subscriptions
        set status = 'ended'
        where id = ${subscription.id} and status = 'active' and end_date < current_date
        returning id
      `
      if (ended) {
        await sendCustomerNotification({
          eventKey: `subscription:${subscription.id}:expired`,
          customerId: subscription.customer_id,
          notificationType: 'subscription_expired',
          subscriptionId: subscription.id,
          payload: { title: 'Plan expired', body: `Your ${subscription.plan_name} plan has expired.`, url: '/plans', tag: `subscription:${subscription.id}:lifecycle` },
        })
        expired += 1
      }
      continue
    }

    if (!reminderDays.has(daysRemaining)) continue
    await sendCustomerNotification({
      eventKey: `subscription:${subscription.id}:renewal:${daysRemaining}`,
      customerId: subscription.customer_id,
      notificationType: 'subscription_renewal_reminder',
      subscriptionId: subscription.id,
      payload: { title: 'Plan ending soon', body: `Your ${subscription.plan_name} plan ends in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`, url: '/plans', tag: `subscription:${subscription.id}:lifecycle` },
    })
    remindersSent += 1
  }

  return data({ ok: true, remindersSent, expired })
}
