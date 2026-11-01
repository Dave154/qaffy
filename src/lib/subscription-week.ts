const subscriptionTimeZone = 'Africa/Lagos'
const subscriptionWeekMilliseconds = 7 * 24 * 60 * 60 * 1000
const millisecondsPerDay = 24 * 60 * 60 * 1000

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

type SubscriptionAllowance = {
  accruedUnits: number
  balance: number
  borrowableUnits: number
  unitsAvailableForConfirmation: number
  nextCreditAt: string | null
  nextBalanceAfterCredit: number | null
}

function parseCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) throw new Error(`Invalid subscription date: ${value}`)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

function formatCalendarDate(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
}

function addSubscriptionMonth(startDate: string, monthOffset: number) {
  const { year, month, day } = parseCalendarDate(startDate)
  const monthIndex = month - 1 + monthOffset
  const targetYear = year + Math.floor(monthIndex / 12)
  const targetMonth = monthIndex % 12
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  return formatCalendarDate(new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))))
}

function getSundayMidnightLagos(calendarDate: string) {
  const { year, month, day } = parseCalendarDate(calendarDate)
  return new Date(Date.UTC(year, month - 1, day) - 60 * 60 * 1000)
}

function getAllowanceCredits(startDate: string, startAt: string | null, endDate: string | null, reference: Date, weeklyLimit: number) {
  const start = parseCalendarDate(startDate)
  const activationTime = startAt ? new Date(startAt) : getSundayMidnightLagos(startDate)
  const activationParts = getZonedDateTimeParts(activationTime)
  const activationDate = formatCalendarDate(new Date(Date.UTC(activationParts.year, activationParts.month - 1, activationParts.day)))
  const scheduleStartDate = activationDate > startDate ? activationDate : startDate
  const scheduleStart = parseCalendarDate(scheduleStartDate)
  const scheduleStartAsUtc = Date.UTC(scheduleStart.year, scheduleStart.month - 1, scheduleStart.day)
  const firstSundayOffset = (7 - new Date(scheduleStartAsUtc).getUTCDay()) % 7
  let sunday = new Date(scheduleStartAsUtc + firstSundayOffset * millisecondsPerDay)
  const endCalendarDate = endDate
    ? formatCalendarDate(
        new Date(Date.UTC(parseCalendarDate(endDate).year, parseCalendarDate(endDate).month - 1, parseCalendarDate(endDate).day)),
      )
    : null
  const endTime = endCalendarDate ? new Date(`${endCalendarDate}T23:59:59.999+01:00`) : null
  const generationLimit = endTime ?? new Date(reference.getTime() + subscriptionWeekMilliseconds)
  let totalCreditLimit = Number.POSITIVE_INFINITY
  if (endCalendarDate) {
    let planMonths = 0
    while (addSubscriptionMonth(startDate, planMonths) < endCalendarDate) planMonths += 1
    totalCreditLimit = planMonths * 4
  }
  const creditsByPlanMonth = new Map<number, number>()
  const scheduledCredits: Date[] = []
  const scheduleMonthParts = parseCalendarDate(scheduleStartDate)
  let planMonthIndex = Math.max(0, (scheduleMonthParts.year - start.year) * 12 + scheduleMonthParts.month - start.month)
  while (planMonthIndex > 0 && addSubscriptionMonth(startDate, planMonthIndex) > scheduleStartDate) {
    planMonthIndex -= 1
  }
  const activationIsWithinTerm =
    (!endTime || activationTime.getTime() <= endTime.getTime()) &&
    (!endCalendarDate || startDate <= endCalendarDate)
  if (activationIsWithinTerm) {
    scheduledCredits.push(activationTime)
    creditsByPlanMonth.set(planMonthIndex, 1)
  }
  if (activationTime.getTime() >= getSundayMidnightLagos(formatCalendarDate(sunday)).getTime()) {
    sunday = new Date(sunday.getTime() + subscriptionWeekMilliseconds)
  }

  while (sunday.getTime() <= generationLimit.getTime()) {
    const sundayDate = formatCalendarDate(sunday)
    if (sundayDate < startDate || (endCalendarDate && sundayDate > endCalendarDate)) {
      sunday = new Date(sunday.getTime() + subscriptionWeekMilliseconds)
      continue
    }

    while (sundayDate >= addSubscriptionMonth(startDate, planMonthIndex + 1)) planMonthIndex += 1
    const creditsInMonth = creditsByPlanMonth.get(planMonthIndex) ?? 0
    if (creditsInMonth < 4 && scheduledCredits.length < totalCreditLimit) {
      scheduledCredits.push(getSundayMidnightLagos(sundayDate))
      creditsByPlanMonth.set(planMonthIndex, creditsInMonth + 1)
    }
    sunday = new Date(sunday.getTime() + subscriptionWeekMilliseconds)
  }

  const accruedCredits = scheduledCredits.filter((creditAt) => creditAt.getTime() <= reference.getTime()).length
  const nextCredit = scheduledCredits.find((creditAt) => creditAt.getTime() > reference.getTime()) ?? null
  const accruedUnits = accruedCredits * weeklyLimit
  return { accruedUnits, nextCredit }
}

export function calculateSubscriptionAllowance(
  input: { weeklyLimit: number; startDate: string; startAt?: string | null; endDate: string | null; usedUnits: number },
  reference = new Date(),
): SubscriptionAllowance {
  const weeklyLimit = Math.max(0, Math.floor(input.weeklyLimit))
  const usedUnits = Math.max(0, Math.floor(input.usedUnits))
  const { accruedUnits, nextCredit } = getAllowanceCredits(input.startDate, input.startAt ?? null, input.endDate, reference, weeklyLimit)
  const balance = accruedUnits - usedUnits
  const nextWeekStart = new Date(getSubscriptionWeekStart(reference).getTime() + subscriptionWeekMilliseconds)
  const canBorrow = nextCredit !== null && nextCredit.getTime() <= nextWeekStart.getTime()

  return {
    accruedUnits,
    balance,
    borrowableUnits: canBorrow ? weeklyLimit : 0,
    unitsAvailableForConfirmation: Math.max(0, balance + (canBorrow ? weeklyLimit : 0)),
    nextCreditAt: nextCredit?.toISOString() ?? null,
    nextBalanceAfterCredit: canBorrow ? balance + weeklyLimit : null,
  }
}

export function calculateSubscriptionAllowanceThroughCurrentMonth(
  input: { weeklyLimit: number; startDate: string; startAt?: string | null; endDate: string | null; usedUnits: number },
  reference = new Date(),
) {
  const localParts = getZonedDateTimeParts(reference)
  const localDate = formatCalendarDate(new Date(Date.UTC(localParts.year, localParts.month - 1, localParts.day)))
  const start = parseCalendarDate(input.startDate)
  let planMonthIndex = Math.max(0, (localParts.year - start.year) * 12 + localParts.month - start.month)

  while (planMonthIndex > 0 && addSubscriptionMonth(input.startDate, planMonthIndex) > localDate) {
    planMonthIndex -= 1
  }

  const nextMonthStart = addSubscriptionMonth(input.startDate, planMonthIndex + 1)
  const nextMonth = parseCalendarDate(nextMonthStart)
  const monthEnd = formatCalendarDate(new Date(Date.UTC(nextMonth.year, nextMonth.month - 1, nextMonth.day - 1)))
  const cappedEndDate = input.endDate && input.endDate < monthEnd ? input.endDate : monthEnd
  const referenceAtEndOfAllowance = new Date(`${cappedEndDate}T23:59:59.999+01:00`)
  const weeklyLimit = Math.max(0, Math.floor(input.weeklyLimit))
  const usedUnits = Math.max(0, Math.floor(input.usedUnits))
  const { accruedUnits } = getAllowanceCredits(
    input.startDate,
    input.startAt ?? null,
    cappedEndDate,
    referenceAtEndOfAllowance,
    weeklyLimit,
  )

  return {
    accruedUnits,
    usedUnits,
    balance: accruedUnits - usedUnits,
    unitsAvailableForConfirmation: Math.max(0, accruedUnits - usedUnits),
  }
}

export function getAuthorizedSubscriptionBorrowUnits(allowance: SubscriptionAllowance, consentedUnits: number) {
  const currentBalanceUnits = Math.max(0, allowance.balance)
  const remainingUpcomingAllowance = Math.max(0, allowance.unitsAvailableForConfirmation - currentBalanceUnits)
  return Math.min(Math.max(0, Math.floor(consentedUnits)), allowance.borrowableUnits, remainingUpcomingAllowance)
}

export type SubscriptionUsageOrder = {
  subscription_id?: string | null
  subscription_allowance_subscription_id?: string | null
  is_subscription_order: boolean
  status: string
  clothes_count_vendor: number | null
  subscription_units_applied: number | null
  subscription_units_applied_at: string | null
  created_at: string
}

export function calculateSubscriptionUnitsApplied(
  orders: readonly SubscriptionUsageOrder[],
  subscription: { id: string; startDate: string; endDate: string | null },
  reference = new Date(),
) {
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: subscriptionTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const currentWeekStart = getSubscriptionWeekStart(reference).getTime()

  return orders
    .filter((order) => {
      if (
        !order.is_subscription_order ||
        order.status === 'cancelled' ||
        order.clothes_count_vendor === null ||
        order.subscription_units_applied === null
      ) {
        return false
      }
      if (order.subscription_allowance_subscription_id) {
        return order.subscription_allowance_subscription_id === subscription.id
      }
      if (order.subscription_id === subscription.id) return true
      if (order.subscription_id && order.subscription_units_applied_at) {
        return new Date(order.subscription_units_applied_at).getTime() >= currentWeekStart
      }
      if (order.subscription_id) return false

      const parts = dateFormatter.formatToParts(new Date(order.created_at))
      const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value ?? ''
      const orderDate = `${part('year')}-${part('month')}-${part('day')}`
      return orderDate >= subscription.startDate && (subscription.endDate === null || orderDate <= subscription.endDate)
    })
    .reduce((total, order) => total + (order.subscription_units_applied ?? 0), 0)
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
