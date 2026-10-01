const subscriptionTimeZone = 'Africa/Lagos'

const subscriptionDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: subscriptionTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function getZonedDateTimeParts(value: Date) {
  const parts = subscriptionDateTimeFormatter.formatToParts(value)
  const partValue = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  return {
    year: partValue('year'),
    month: partValue('month'),
    day: partValue('day'),
    hour: partValue('hour'),
    minute: partValue('minute'),
    second: partValue('second'),
  }
}

export function getSubscriptionWeekStart(reference = new Date()) {
  const localParts = getZonedDateTimeParts(reference)
  const localCalendarDate = new Date(Date.UTC(localParts.year, localParts.month - 1, localParts.day))
  localCalendarDate.setUTCDate(localCalendarDate.getUTCDate() - localCalendarDate.getUTCDay())

  const targetAsUtc = Date.UTC(localCalendarDate.getUTCFullYear(), localCalendarDate.getUTCMonth(), localCalendarDate.getUTCDate())
  let candidateUtc = targetAsUtc

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const candidateParts = getZonedDateTimeParts(new Date(candidateUtc))
    const candidateAsLocalUtc = Date.UTC(
      candidateParts.year,
      candidateParts.month - 1,
      candidateParts.day,
      candidateParts.hour,
      candidateParts.minute,
      candidateParts.second,
    )
    const offset = candidateAsLocalUtc - candidateUtc
    const adjustedUtc = targetAsUtc - offset
    if (adjustedUtc === candidateUtc) break
    candidateUtc = adjustedUtc
  }

  return new Date(candidateUtc)
}

export type SubscriptionUsageOrder = {
  is_subscription_order: boolean
  status: string
  clothes_count_vendor: number | null
  subscription_units_applied: number | null
  subscription_units_applied_at: string | null
  created_at: string
}

export function calculateSubscriptionUnitsUsed(orders: readonly SubscriptionUsageOrder[], reference = new Date()) {
  const weekStart = getSubscriptionWeekStart(reference).getTime()
  return orders
    .filter((order) => {
      const appliedAt = order.subscription_units_applied_at ?? order.created_at
      return (
        order.is_subscription_order &&
        order.status !== 'cancelled' &&
        order.clothes_count_vendor !== null &&
        order.subscription_units_applied !== null &&
        new Date(appliedAt).getTime() >= weekStart
      )
    })
    .reduce((total, order) => total + (order.subscription_units_applied ?? 0), 0)
}