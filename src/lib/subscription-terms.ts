import type { PlanType } from '../types/database.types'

export type SavedSubscriptionTerms = {
  startDate: string
  endDate: string
  weeklyLimit: number
  coversWash: boolean
  coversIron: boolean
}

export type SubscriptionPurchaseQuote = {
  planId: string
  planName: string
  planType: PlanType
  amount: number
  startDate: string
  endDate: string
  scheduled: boolean
  weeklyLimit: number
  coversWash: boolean
  coversIron: boolean
}

type SavedSubscriptionTermsInput = {
  startDate: Date | string | null
  endDate: Date | string | null
  weeklyLimit: number | null
  coversWash: boolean | null
  coversIron: boolean | null
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function isSubscriptionPurchaseQuote(value: unknown): value is SubscriptionPurchaseQuote {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const quote = value as Record<string, unknown>
  return (
    typeof quote.planId === 'string' &&
    quote.planId.length > 0 &&
    typeof quote.planName === 'string' &&
    quote.planName.length > 0 &&
    (quote.planType === 'monthly' || quote.planType === 'semester') &&
    typeof quote.amount === 'number' &&
    Number.isFinite(quote.amount) &&
    quote.amount >= 0 &&
    typeof quote.startDate === 'string' &&
    isCalendarDate(quote.startDate) &&
    typeof quote.endDate === 'string' &&
    isCalendarDate(quote.endDate) &&
    quote.endDate >= quote.startDate &&
    typeof quote.scheduled === 'boolean' &&
    Number.isSafeInteger(quote.weeklyLimit) &&
    Number(quote.weeklyLimit) >= 0 &&
    typeof quote.coversWash === 'boolean' &&
    typeof quote.coversIron === 'boolean'
  )
}

export function subscriptionPurchaseQuotesMatch(
  left: SubscriptionPurchaseQuote,
  right: SubscriptionPurchaseQuote,
) {
  return (
    left.planId === right.planId &&
    left.planName === right.planName &&
    left.planType === right.planType &&
    left.amount === right.amount &&
    left.startDate === right.startDate &&
    left.endDate === right.endDate &&
    left.scheduled === right.scheduled &&
    left.weeklyLimit === right.weeklyLimit &&
    left.coversWash === right.coversWash &&
    left.coversIron === right.coversIron
  )
}

export function getSavedSubscriptionTerms(input: SavedSubscriptionTermsInput): SavedSubscriptionTerms | null {
  const values = [input.startDate, input.endDate, input.weeklyLimit, input.coversWash, input.coversIron]
  if (values.every((value) => value === null)) return null
  if (values.some((value) => value === null)) throw new Error('The saved subscription payment terms are incomplete.')

  const startDate = input.startDate instanceof Date ? input.startDate.toISOString().slice(0, 10) : String(input.startDate).slice(0, 10)
  const endDate = input.endDate instanceof Date ? input.endDate.toISOString().slice(0, 10) : String(input.endDate).slice(0, 10)
  const weeklyLimit = Number(input.weeklyLimit)
  if (!isCalendarDate(startDate) || !isCalendarDate(endDate) || endDate < startDate || !Number.isSafeInteger(weeklyLimit) || weeklyLimit < 0) {
    throw new Error('The saved subscription payment terms are invalid.')
  }

  return {
    startDate,
    endDate,
    weeklyLimit,
    coversWash: Boolean(input.coversWash),
    coversIron: Boolean(input.coversIron),
  }
}

export function getSubscriptionStartState(startDate: string, today: string) {
  const isQueuedRenewal = startDate > today
  return {
    status: isQueuedRenewal ? ('scheduled' as const) : ('active' as const),
    isQueuedRenewal,
  }
}

export function addCalendarDaysToDate(date: string, days: number) {
  if (!isCalendarDate(date) || !Number.isInteger(days)) throw new Error('A valid calendar date is required.')
  const result = new Date(`${date}T00:00:00.000Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

export function addCalendarMonthsToDate(date: string, months: number) {
  if (!isCalendarDate(date) || !Number.isInteger(months) || months < 0) {
    throw new Error('A valid calendar date and subscription duration are required.')
  }
  const [year, month, day] = date.split('-').map(Number)
  const targetMonth = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate()
  targetMonth.setUTCDate(Math.min(day, lastDay))
  return `${targetMonth.getUTCFullYear()}-${String(targetMonth.getUTCMonth() + 1).padStart(2, '0')}-${String(targetMonth.getUTCDate()).padStart(2, '0')}`
}

export function getSubscriptionEndDate(planType: PlanType, startDate: string, semesterEndDate: string | null) {
  if (!isCalendarDate(startDate)) throw new Error('A valid subscription start date is required.')
  if (planType === 'monthly') return addCalendarMonthsToDate(startDate, 1)
  if (!semesterEndDate || !isCalendarDate(semesterEndDate)) {
    throw new Error('Set a valid semester end date in Admin Plans before purchasing or creating a semester subscription.')
  }
  if (semesterEndDate < startDate) {
    throw new Error('The configured semester end date is before this subscription can start. Update the semester end date before continuing.')
  }
  return semesterEndDate
}
