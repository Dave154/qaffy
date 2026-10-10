import { sql } from '@/lib/db.server'
import type { WalletBalanceType } from '@/types/database.types'
import type { TransactionSql } from 'postgres'
import {
  sendAdminWalletTopUpNotification,
  sendCustomerNotification,
  sendWalletInvoicePaidNotifications,
} from './notifications.server'
import { getSubscriptionWeekStart } from './subscription-week'
import { insertSubscriptionWithSnapshot, lockCustomerSubscription } from './subscriptions.server'
import { calculateSubscriptionBilling } from './subscription-billing'
import { isValidVendorReceivedItems } from './vendor-received-counts'

class InsufficientBalanceError extends Error {
  constructor() {
    super('INSUFFICIENT_BALANCE')
  }
}

function generateFourDigitOtp() {
  return String(1000 + Math.floor(Math.random() * 9000))
}

async function getCashbackPercentForTransaction(tx: TransactionSql) {
  const [settings] = await tx`
    select cashback_percent
    from app_settings
    where key = 'cashback'
    limit 1
  `
  const percent = Number(settings?.cashback_percent ?? 0)
  return Number.isFinite(percent) ? Math.min(Math.max(percent, 0), 100) : 0
}

type SubscriptionAllocationItem = { id: string; quantity: number; units: number; unitPrice: number }

function allocateSubscriptionCoverage(items: SubscriptionAllocationItem[], allowance: number) {
  const capacity = Math.max(0, Math.floor(allowance))
  const emptyState = { avoidedAmount: 0, quantities: items.map(() => 0) }
  let states: Array<{ avoidedAmount: number; quantities: number[] } | null> = Array.from({ length: capacity + 1 }, () => null)
  states[0] = emptyState

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]
    const nextStates = states.map((state) => state && { avoidedAmount: state.avoidedAmount, quantities: [...state.quantities] })
    const maxQuantity = Math.min(item.quantity, Math.floor(capacity / item.units))

    for (let usedUnits = 0; usedUnits <= capacity; usedUnits += 1) {
      const state = states[usedUnits]
      if (!state) continue
      for (let quantity = 1; quantity <= maxQuantity && usedUnits + quantity * item.units <= capacity; quantity += 1) {
        const nextUsedUnits = usedUnits + quantity * item.units
        const candidate = {
          avoidedAmount: state.avoidedAmount + quantity * item.unitPrice,
          quantities: state.quantities.map((value, index) => (index === itemIndex ? value + quantity : value)),
        }
        const current = nextStates[nextUsedUnits]
        if (!current || candidate.avoidedAmount > current.avoidedAmount) nextStates[nextUsedUnits] = candidate
      }
    }

    states = nextStates
  }

  const selected = states.reduce<{ avoidedAmount: number; quantities: number[] } | null>((best, state) => {
    if (!state) return best
    const bestUnits = best ? best.quantities.reduce((total, quantity, index) => total + quantity * items[index].units, 0) : -1
    const stateUnits = state.quantities.reduce((total, quantity, index) => total + quantity * items[index].units, 0)
    if (!best || stateUnits > bestUnits || (stateUnits === bestUnits && state.avoidedAmount > best.avoidedAmount)) return state
    return best
  }, null)

  return new Map(items.map((item, index) => [item.id, selected?.quantities[index] ?? 0]))
}

async function debitWalletForInvoice(
  tx: TransactionSql,
  customerId: string,
  invoiceId: string,
  amount: number,
  balanceType: WalletBalanceType,
) {
  const [wallet] = await tx`
    select one_off_balance, subscription_balance, promotional_balance
    from wallets
    where customer_id = ${customerId}
    for update
  `

  if (balanceType === 'subscription') {
    const currentBalance = Number(wallet?.subscription_balance ?? 0)
    if (currentBalance < amount) throw new InsufficientBalanceError()
    const newBalance = currentBalance - amount
    await tx`update wallets set subscription_balance = ${newBalance}, updated_at = now() where customer_id = ${customerId}`
    await tx`
      insert into wallet_transactions (customer_id, balance_type, txn_type, amount, balance_after, related_invoice_id)
      values (${customerId}, 'subscription', 'debit', ${amount}, ${newBalance}, ${invoiceId})
    `
    return { newBalance, promotionalBalance: Number(wallet?.promotional_balance ?? 0) }
  }

  if (balanceType !== 'one_off') throw new Error('Referral rewards cannot be spent directly as a wallet balance')
  let currentPromotionalBalance = Number(wallet?.promotional_balance ?? 0)
  const currentOneOffBalance = Number(wallet?.one_off_balance ?? 0)

  const expiredRewards = await tx`
    select id, remaining_value
    from referral_rewards
    where recipient_id = ${customerId}
      and status = 'issued'
      and expires_at <= now()
      and remaining_value > 0
    order by expires_at asc
    for update
  `
  for (const reward of expiredRewards) {
    const expiredValue = Number(reward.remaining_value)
    currentPromotionalBalance = Math.max(0, currentPromotionalBalance - expiredValue)
    await tx`update referral_rewards set remaining_value = 0, status = 'expired', updated_at = now() where id = ${reward.id}`
    await tx`
      insert into wallet_transactions (customer_id, balance_type, txn_type, amount, balance_after, related_referral_reward_id)
      values (${customerId}, 'promotional', 'referral_reward_expiry', ${-expiredValue}, ${currentPromotionalBalance}, ${reward.id})
    `
  }
  if (expiredRewards.length > 0) {
    await tx`update wallets set promotional_balance = ${currentPromotionalBalance}, updated_at = now() where customer_id = ${customerId}`
  }

  if (currentPromotionalBalance + currentOneOffBalance < amount) throw new InsufficientBalanceError()

  const promotionalDebit = Math.min(currentPromotionalBalance, amount)
  const oneOffDebit = amount - promotionalDebit
  const promotionalBalance = currentPromotionalBalance - promotionalDebit
  const newBalance = currentOneOffBalance - oneOffDebit
  if (promotionalDebit > 0) {
    const availableRewards = await tx`
      select id, remaining_value
      from referral_rewards
      where recipient_id = ${customerId}
        and status = 'issued'
        and expires_at > now()
        and remaining_value > 0
      order by expires_at asc, created_at asc
      for update
    `
    let remainingDebit = promotionalDebit
    let ledgerBalance = currentPromotionalBalance
    for (const reward of availableRewards) {
      if (remainingDebit <= 0) break
      const applied = Math.min(Number(reward.remaining_value), remainingDebit)
      remainingDebit -= applied
      ledgerBalance -= applied
      await tx`update referral_rewards set remaining_value = remaining_value - ${applied}, updated_at = now() where id = ${reward.id}`
      await tx`
        insert into wallet_transactions (customer_id, balance_type, txn_type, amount, balance_after, related_invoice_id, related_referral_reward_id)
        values (${customerId}, 'promotional', 'debit', ${applied}, ${ledgerBalance}, ${invoiceId}, ${reward.id})
      `
    }
    if (remainingDebit > 0) throw new Error('Promotional reward ledger is inconsistent')
  }

  await tx`
    update wallets
    set promotional_balance = ${promotionalBalance}, one_off_balance = ${newBalance}, updated_at = now()
    where customer_id = ${customerId}
  `
  if (oneOffDebit > 0) {
    await tx`
      insert into wallet_transactions (customer_id, balance_type, txn_type, amount, balance_after, related_invoice_id)
      values (${customerId}, 'one_off', 'debit', ${oneOffDebit}, ${newBalance}, ${invoiceId})
    `
  }
  return { newBalance, promotionalBalance }
}

type ReferralRewardRecipient = { profileId: string; rewardId: string; amount: number }

async function issueReferralRewards(
  tx: TransactionSql,
  customerId: string,
  orderId: string,
  invoiceAmount: number,
): Promise<ReferralRewardRecipient[]> {
  const [referral] = await tx`
    select
      r.id,
      r.referrer_id,
      r.campaign_id,
      r.referrer_reward_value_snapshot,
      r.referred_reward_value_snapshot,
      r.minimum_order_amount_snapshot,
      r.reward_expiry_days_snapshot,
      r.max_rewards_per_referrer_snapshot
    from referrals r
    where r.referred_id = ${customerId}
      and r.status = 'pending'
      and r.campaign_id is not null
      and r.referrer_reward_value_snapshot is not null
      and r.referred_reward_value_snapshot is not null
      and r.minimum_order_amount_snapshot is not null
      and r.reward_expiry_days_snapshot is not null
    order by r.created_at asc
    limit 1
    for update
  `
  if (!referral) return []

  if (invoiceAmount < Number(referral.minimum_order_amount_snapshot)) return []

  await tx`
    select id
    from profiles
    where id = ${referral.referrer_id}
    for update
  `

  if (referral.max_rewards_per_referrer_snapshot !== null) {
    const [rewardCount] = await tx`
      select count(*)::int as count
      from referral_rewards rr
      join referrals campaign_referral on campaign_referral.id = rr.referral_id
      where campaign_referral.referrer_id = ${referral.referrer_id}
        and campaign_referral.campaign_id = ${referral.campaign_id}
        and rr.recipient_id = ${referral.referrer_id}
        and rr.status in ('pending', 'issued')
    `
    if (Number(rewardCount?.count ?? 0) >= Number(referral.max_rewards_per_referrer_snapshot)) {
      await tx`
        update referrals
        set status = 'rejected', rejection_reason = 'Referrer reward limit reached', updated_at = now()
        where id = ${referral.id}
      `
      return []
    }
  }

  await tx`
    update referrals
    set status = 'qualified', qualified_at = now(), qualifying_order_id = ${orderId}, updated_at = now()
    where id = ${referral.id}
  `

  const recipients = [
    { profileId: referral.referrer_id, amount: Number(referral.referrer_reward_value_snapshot) },
    { profileId: customerId, amount: Number(referral.referred_reward_value_snapshot) },
  ].sort((left, right) => left.profileId.localeCompare(right.profileId))
  const expiresAt = new Date(Date.now() + Number(referral.reward_expiry_days_snapshot) * 24 * 60 * 60 * 1000).toISOString()

  const rewardedRecipients: ReferralRewardRecipient[] = []
  for (const recipient of recipients) {
    await tx`insert into wallets (customer_id) values (${recipient.profileId}) on conflict (customer_id) do nothing`
    const [wallet] = await tx`select promotional_balance from wallets where customer_id = ${recipient.profileId} for update`
    const promotionalBalance = Number(wallet?.promotional_balance ?? 0) + recipient.amount
    const [reward] = await tx`
      insert into referral_rewards (referral_id, recipient_id, campaign_id, qualifying_order_id, reward_type, reward_value, remaining_value, expires_at)
      values (${referral.id}, ${recipient.profileId}, ${referral.campaign_id}, ${orderId}, 'wallet_credit', ${recipient.amount}, ${recipient.amount}, ${expiresAt})
      on conflict (referral_id, recipient_id, reward_type) do nothing
      returning id
    `
    if (!reward) continue

    await tx`update wallets set promotional_balance = ${promotionalBalance}, updated_at = now() where customer_id = ${recipient.profileId}`
    const [transaction] = await tx`
      insert into wallet_transactions (customer_id, balance_type, txn_type, amount, balance_after, related_referral_reward_id)
      values (${recipient.profileId}, 'promotional', 'referral_reward', ${recipient.amount}, ${promotionalBalance}, ${reward.id})
      returning id
    `
    await tx`
      update referral_rewards
      set status = 'issued', wallet_transaction_id = ${transaction.id}, issued_at = now(), updated_at = now()
      where id = ${reward.id}
    `
    rewardedRecipients.push({ profileId: recipient.profileId, rewardId: reward.id, amount: recipient.amount })
  }

  await tx`update referrals set status = 'rewarded', updated_at = now() where id = ${referral.id}`
  return rewardedRecipients
}

async function sendReferralRewardNotifications(recipients: ReferralRewardRecipient[]) {
  await Promise.all(
    recipients.map((recipient) =>
      sendCustomerNotification({
        eventKey: `referral-reward:${recipient.rewardId}:issued`,
        customerId: recipient.profileId,
        notificationType: 'referral_reward_issued',
        payload: {
          title: 'Referral reward added',
          body: `You earned ₦${recipient.amount.toLocaleString()} in referral credit.`,
          details: [`Referral credit: ₦${recipient.amount.toLocaleString()}`, 'Your promotional balance is now available.'],
          url: '/settings#referrals',
          tag: `referral-reward:${recipient.rewardId}`,
        },
      }),
    ),
  )
}

/** Debits the customer's wallet, marks the invoice paid, and issues the delivery OTP — all in one transaction. */
export async function payFromWallet(customerId: string, invoiceId: string, balanceType: WalletBalanceType) {
  const result = await sql.begin(async (tx) => {
    const [invoice] = await tx`
      select i.*, o.customer_id, o.id as order_id, o.public_order_number, o.status as order_status
      from invoices i
      join orders o on o.id = i.order_id
      where i.id = ${invoiceId}
      for update of i, o
    `

    if (!invoice) throw new Error('Invoice not found')
    if (invoice.customer_id !== customerId) throw new Error('Not authorized for this invoice')
    if (invoice.status === 'paid') throw new Error('Invoice already paid')
    if (invoice.status !== 'unpaid' || !['invoiced', 'out_for_delivery'].includes(invoice.order_status))
      throw new Error('Invoice is not payable in its current order state')

    const { newBalance } = await debitWalletForInvoice(tx, customerId, invoiceId, Number(invoice.amount), balanceType)
    const deliveryOtp = generateFourDigitOtp()

    await tx`update invoices set status = 'paid', paid_at = now() where id = ${invoiceId}`
    await tx`
      update orders
      set status = case when status = 'out_for_delivery' then status else 'paid' end,
          delivery_otp = ${deliveryOtp}
      where id = ${invoice.order_id}
    `
    const referralRewardRecipients = await issueReferralRewards(tx, customerId, invoice.order_id, Number(invoice.amount))

    return {
      invoiceId,
      orderId: invoice.order_id,
      publicOrderNumber: invoice.public_order_number,
      amount: Number(invoice.amount),
      deliveryOtp,
      newBalance,
      referralRewardRecipients,
    }
  })
  await sendReferralRewardNotifications(result.referralRewardRecipients ?? [])
  return result
}

export async function finalizeVendorOrder(
  orderId: string,
  vendorProfileId: string,
  receivedItems: Array<{ itemId: string; quantity: number }>,
  addedItems: Array<{ categoryName: string; service: 'wash' | 'iron' | 'wash_iron'; quantity: number }>,
  mismatchDetail: string,
) {
  const result = await sql.begin(async (tx) => {
    const [order] = await tx`
      select o.*, v.id as vendor_id
      from orders o
      join vendors v on v.id = o.vendor_id and v.profile_id = ${vendorProfileId} and v.status = 'approved'
      where o.id = ${orderId}
      for update of o
    `
    if (!order) throw new Error('Order is not assigned to this vendor')
    if (order.status !== 'at_vendor') throw new Error('This order is not ready for vendor review')

    if (!Array.isArray(receivedItems) || !Array.isArray(addedItems)) throw new Error('Order review details are invalid')
    if (!isValidVendorReceivedItems(receivedItems))
      throw new Error('Received quantities are invalid')
    if (
      addedItems.some(
        (item) =>
          !item.categoryName ||
          !['wash', 'iron', 'wash_iron'].includes(item.service) ||
          !Number.isSafeInteger(item.quantity) ||
          item.quantity < 1,
      )
    )
      throw new Error('Added category details are invalid')

    const addedItemIds: string[] = []
    for (const item of addedItems) {
      const [category] = await tx`select id from cloth_categories where name = ${item.categoryName}`
      if (!category) throw new Error(`Category not found: ${item.categoryName}`)
      const [rate] = await tx`
        select wash_price, iron_price, wash_iron_price
        from cloth_category_rates
        where category_id = ${category.id}
      `
      if (!rate) throw new Error(`Rate not configured: ${item.categoryName}`)
      const unitPrice = item.service === 'wash_iron' ? rate.wash_iron_price : item.service === 'iron' ? rate.iron_price : rate.wash_price
      const [insertedItem] = await tx`
        insert into order_items (order_id, category_id, quantity, service, unit_price, confirmed_quantity)
        values (${orderId}, ${category.id}, ${item.quantity}, ${item.service}, ${unitPrice}, ${item.quantity})
        returning id
      `
      addedItemIds.push(insertedItem.id)
    }

    const items = await tx`
      select
        oi.id, oi.quantity, oi.service, oi.unit_price, oi.subscription_units_snapshot,
        oi.regular_wash_price_snapshot, oi.regular_iron_price_snapshot, oi.regular_wash_iron_price_snapshot,
        oi.subscriber_wash_price_snapshot, oi.subscriber_iron_price_snapshot, oi.subscriber_wash_iron_price_snapshot,
        c.name as category_name, r.wash_price, r.iron_price, r.wash_iron_price, r.subscription_units
      from order_items oi
      join cloth_categories c on c.id = oi.category_id
      left join cloth_category_rates r on r.category_id = oi.category_id
      where oi.order_id = ${orderId}
    `
    if (
      items.some(
        (item) =>
          item.wash_price == null ||
          item.iron_price == null ||
          item.wash_iron_price == null ||
          item.subscription_units == null ||
          !Number.isSafeInteger(Number(item.subscription_units)) ||
          Number(item.subscription_units) <= 0 ||
          Number(item.unit_price) <= 0,
      )
    ) {
      throw new Error('A valid rate is required for every order item before finalization')
    }
    const orderItemIds = new Set(items.map((item) => item.id))
    const originalItemIds = new Set(items.filter((item) => !addedItemIds.includes(item.id)).map((item) => item.id))
    if (receivedItems.length !== originalItemIds.size || new Set(receivedItems.map((item) => item.itemId)).size !== receivedItems.length)
      throw new Error('Every original order item must have exactly one received quantity')
    if (receivedItems.some((item) => !orderItemIds.has(item.itemId) || !originalItemIds.has(item.itemId)))
      throw new Error('Received item does not belong to the original order')
    const receivedById = new Map(receivedItems.map((item) => [item.itemId, item.quantity]))
    const originalQuantityById = new Map(items.map((item) => [item.id, addedItemIds.includes(item.id) ? 0 : Number(item.quantity)]))
    const confirmedQuantityById = new Map(
      items.map((item) => [item.id, receivedById.get(item.id) ?? (addedItemIds.includes(item.id) ? Number(item.quantity) : 0)]),
    )
    const finalCount = items.reduce(
      (total, item) => total + (receivedById.get(item.id) ?? (addedItemIds.includes(item.id) ? Number(item.quantity) : 0)),
      0,
    )
    const finalWeightedUnits = items.reduce((total, item) => {
      const quantity = receivedById.get(item.id) ?? (addedItemIds.includes(item.id) ? Number(item.quantity) : 0)
      return total + quantity * Number(item.subscription_units_snapshot ?? item.subscription_units)
    }, 0)
    const finalAmount = items.reduce((total, item) => {
      const quantity = receivedById.get(item.id) ?? (addedItemIds.includes(item.id) ? Number(item.quantity) : 0)
      const unitPrice = Number(item.unit_price)
      return total + quantity * unitPrice
    }, 0)
    const originalAmount = items
      .filter((item) => !addedItemIds.includes(item.id))
      .reduce((total, item) => {
        const unitPrice = Number(item.unit_price)
        return total + Number(item.quantity) * unitPrice
      }, 0)
    let extraAmount = Math.max(0, finalAmount - originalAmount)
    const billingCount = order.is_subscription_order ? finalWeightedUnits : finalCount
    const mismatchDirection =
      finalCount > Number(order.clothes_count_customer) ? 'over' : finalCount < Number(order.clothes_count_customer) ? 'under' : null
    if (mismatchDirection && !mismatchDetail.trim()) throw new Error('Mismatch details are required when the final count changes')

    let mismatchItems = items
      .map((item) => {
        const originalQuantity = originalQuantityById.get(item.id) ?? 0
        const confirmedQuantity = confirmedQuantityById.get(item.id) ?? 0
        const difference = confirmedQuantity - originalQuantity
        return {
          itemId: item.id,
          category: item.category_name,
          service: item.service,
          originalQuantity,
          confirmedQuantity,
          difference,
          unitPrice: Number(item.unit_price),
          extraAmount: Math.max(0, difference * Number(item.unit_price)),
        }
      })
      .filter((item) => item.difference !== 0)

    const referralRewardRecipients: ReferralRewardRecipient[] = []

    let invoiceAmount = Math.round(finalAmount * 100) / 100
    let subscriptionUnitsApplied = 0
    let billingBreakdown: { coveredUnits: number; subscriberAmount: number; regularAmount: number } | null = null
    if (order.is_subscription_order) {
      const weekStart = getSubscriptionWeekStart()
      let weeklyLimit = 0
      let coverage = { wash: true, iron: true }
      if (order.subscription_id) {
        const [snapshot] = await tx`
          select weekly_limit_snapshot, covers_wash_snapshot, covers_iron_snapshot
          from subscriptions
          where id = ${order.subscription_id} and customer_id = ${order.customer_id}
          for update
        `
        if (!snapshot) throw new Error('The subscription terms for this order could not be found')
        weeklyLimit = Number(snapshot.weekly_limit_snapshot)
        coverage = { wash: Boolean(snapshot.covers_wash_snapshot), iron: Boolean(snapshot.covers_iron_snapshot) }
      } else {
        const [legacyPlan] = await tx`
          select s.weekly_limit_snapshot as weekly_limit
          from subscriptions s
          where s.customer_id = ${order.customer_id}
            and s.status = 'active'
            and (s.end_date is null or s.end_date >= current_date)
          order by s.created_at desc
          limit 1
          for update of s
        `
        weeklyLimit = Number(legacyPlan?.weekly_limit ?? 0)
      }
      const [usage] = await tx`
        select coalesce(sum(subscription_units_applied), 0) as used_units
        from orders
        where customer_id = ${order.customer_id}
          and is_subscription_order = true
          and subscription_units_applied is not null
          and status <> 'cancelled'
          and subscription_units_applied_at >= ${weekStart}
          and id <> ${orderId}
      `
      const remainingUnits = Math.max(0, weeklyLimit - Number(usage?.used_units ?? 0))
      invoiceAmount = 0
      if (order.subscription_id) {
        if (
          items.some(
            (item) =>
              item.subscription_units_snapshot == null ||
              item.regular_wash_price_snapshot == null ||
              item.regular_iron_price_snapshot == null ||
              item.regular_wash_iron_price_snapshot == null ||
              item.subscriber_wash_price_snapshot == null ||
              item.subscriber_iron_price_snapshot == null ||
              item.subscriber_wash_iron_price_snapshot == null,
          )
        ) {
          throw new Error('Order-time subscription rates are missing. This order cannot be finalized safely.')
        }
        const billingItems = items.map((item) => ({
          id: item.id,
          service: item.service as 'wash' | 'iron' | 'wash_iron',
          quantity: Number(confirmedQuantityById.get(item.id) ?? 0),
          unitsPerItem: Number(item.subscription_units_snapshot),
          regularPrice: Number(item.unit_price),
          regularWashPrice: Number(item.regular_wash_price_snapshot),
          regularIronPrice: Number(item.regular_iron_price_snapshot),
          subscriberWashPrice: Number(item.subscriber_wash_price_snapshot),
          subscriberIronPrice: Number(item.subscriber_iron_price_snapshot),
          subscriberWashIronPrice: Number(item.subscriber_wash_iron_price_snapshot),
        }))
        const billing = calculateSubscriptionBilling(billingItems, coverage, remainingUnits)
        const originalBilling = calculateSubscriptionBilling(
          billingItems.map((item) => ({ ...item, quantity: Number(originalQuantityById.get(item.id) ?? 0) })),
          coverage,
          remainingUnits,
        )
        invoiceAmount = Math.round(billing.totalAmount * 100) / 100
        subscriptionUnitsApplied = billing.coveredUnits
        extraAmount = Math.max(0, Math.round((billing.totalAmount - originalBilling.totalAmount) * 100) / 100)
        billingBreakdown = {
          coveredUnits: billing.coveredUnits,
          subscriberAmount: Math.round(billing.subscriberAmount * 100) / 100,
          regularAmount: Math.round(billing.regularAmount * 100) / 100,
        }
        const originalLineAmounts = new Map(originalBilling.lines.map((line) => [line.id, line.totalAmount]))
        mismatchItems = items
          .map((item, index) => {
            const originalQuantity = originalQuantityById.get(item.id) ?? 0
            const confirmedQuantity = confirmedQuantityById.get(item.id) ?? 0
            return {
              itemId: item.id,
              category: item.category_name,
              service: item.service,
              originalQuantity,
              confirmedQuantity,
              difference: confirmedQuantity - originalQuantity,
              unitPrice: Number(item.unit_price),
              extraAmount: Math.max(0, billing.lines[index].totalAmount - (originalLineAmounts.get(item.id) ?? 0)),
            }
          })
          .filter((item) => item.difference !== 0)
      } else {
        const subscriptionCoverage = allocateSubscriptionCoverage(
          items.map((item) => ({
            id: item.id,
            quantity: Number(confirmedQuantityById.get(item.id) ?? 0),
            units: Number(item.subscription_units),
            unitPrice: Number(item.unit_price),
          })),
          remainingUnits,
        )
        for (const item of items) {
          const coveredQuantity = subscriptionCoverage.get(item.id) ?? 0
          subscriptionUnitsApplied += coveredQuantity * Number(item.subscription_units)
          invoiceAmount += (Number(confirmedQuantityById.get(item.id) ?? 0) - coveredQuantity) * Number(item.unit_price)
        }
      }
      invoiceAmount = Math.round(invoiceAmount * 100) / 100
      await tx`
        update orders
        set subscription_units_applied = ${subscriptionUnitsApplied}, subscription_units_applied_at = now()
        where id = ${orderId}
      `
    }

    await tx`
      update orders
      set clothes_count_vendor = ${finalCount}, clothes_count_vendor_units = ${billingCount}, subscription_units_applied = ${order.is_subscription_order ? sql`coalesce(subscription_units_applied, 0)` : sql`null`}, billed_extra_amount = ${extraAmount}, status = 'invoiced'
      where id = ${orderId}
    `
    for (const item of items) {
      await tx`
        update order_items
        set confirmed_quantity = ${receivedById.get(item.id) ?? (addedItemIds.includes(item.id) ? Number(item.quantity) : 0)}
        where id = ${item.id}
      `
    }
    if (mismatchDirection) {
      await tx`delete from mismatches where order_id = ${orderId}`
      await tx`
        insert into mismatches (order_id, direction, detail, details)
        values (${orderId}, ${mismatchDirection}, ${mismatchDetail}, ${JSON.stringify(mismatchItems)}::jsonb)
      `
    }
    const [invoice] = await tx`
      insert into invoices (order_id, amount, status, billing_breakdown)
      values (${orderId}, ${invoiceAmount}, 'unpaid', ${billingBreakdown ? JSON.stringify(billingBreakdown) : null}::jsonb)
      on conflict (order_id) do update set
        amount = excluded.amount,
        status = 'unpaid',
        paid_at = null,
        billing_breakdown = excluded.billing_breakdown
      returning id, amount, status
    `

    await tx`insert into wallets (customer_id) values (${order.customer_id}) on conflict (customer_id) do nothing`
    const [wallet] = await tx`select one_off_balance, promotional_balance from wallets where customer_id = ${order.customer_id} for update`
    const availableBalance = Number(wallet?.one_off_balance ?? 0) + Number(wallet?.promotional_balance ?? 0)
    if (invoiceAmount <= availableBalance) {
      await debitWalletForInvoice(tx, order.customer_id, invoice.id, invoiceAmount, 'one_off')
      const deliveryOtp = generateFourDigitOtp()
      await tx`update invoices set status = 'paid', paid_at = now() where id = ${invoice.id}`
      await tx`update orders set status = 'paid', delivery_otp = ${deliveryOtp} where id = ${orderId}`
      referralRewardRecipients.push(...(await issueReferralRewards(tx, order.customer_id, orderId, invoiceAmount)))
    }

    const [finalInvoice] = await tx`select status from invoices where id = ${invoice.id}`
    await tx`
      insert into order_confirmation_events (
        order_id,
        vendor_profile_id,
        original_count,
        confirmed_count,
        mismatch_direction,
        mismatch_detail,
        invoice_amount,
        invoice_status
      )
      values (
        ${orderId},
        ${vendorProfileId},
        ${order.clothes_count_customer},
        ${finalCount},
        ${mismatchDirection},
        ${mismatchDirection ? mismatchDetail : null},
        ${invoiceAmount},
        ${finalInvoice.status}
      )
    `

    return {
      invoiceId: invoice.id,
      amount: Number(invoice.amount),
      finalCount: billingCount,
      mismatchDirection,
      mismatchDetail: mismatchDirection ? mismatchDetail : null,
      invoiceStatus: finalInvoice.status as 'paid' | 'unpaid',
      customerId: order.customer_id,
      publicOrderNumber: order.public_order_number,
      referralRewardRecipients,
    }
  })
  await sendReferralRewardNotifications(result.referralRewardRecipients ?? [])
  return result
}

async function applyWalletCredit(
  customerId: string,
  balanceType: WalletBalanceType,
  amount: number,
  paymentReference: string | null,
  applyCashback: boolean,
) {
  if (amount <= 0) throw new Error('Amount must be positive')
  if (balanceType === 'promotional') throw new Error('Promotional balances are issued only by the referral reward service')

  const result = await sql.begin(async (tx) => {
    await tx`insert into wallets (customer_id) values (${customerId}) on conflict (customer_id) do nothing`
    if (paymentReference) {
      await tx`
        insert into payments (customer_id, reference, amount, balance_type, status)
        values (${customerId}, ${paymentReference}, ${amount}, ${balanceType}, 'pending')
        on conflict (reference) do nothing
      `
    }

    const [existingPayment] = paymentReference
      ? await tx`select id, status from payments where reference = ${paymentReference} and customer_id = ${customerId}`
      : []
    if (existingPayment?.status === 'success') {
      const [wallet] = await tx`select one_off_balance, subscription_balance from wallets where customer_id = ${customerId}`
      return {
        newBalance: balanceType === 'subscription' ? Number(wallet.subscription_balance) : Number(wallet.one_off_balance),
        cashbackAmount: 0,
        alreadyCredited: true,
        creditTransactionId: null,
        settledInvoices: [],
      }
    }

    const [wallet] = await tx`select * from wallets where customer_id = ${customerId} for update`
    const subscriptionDebt = Math.max(0, -Number(wallet.subscription_balance))
    const subscriptionCredit = balanceType === 'subscription' ? amount : Math.min(amount, subscriptionDebt)
    const oneOffCredit = balanceType === 'one_off' ? amount - subscriptionCredit : 0
    const cashbackPercent = applyCashback && balanceType === 'one_off' ? await getCashbackPercentForTransaction(tx) : 0
    const cashbackAmount = cashbackPercent > 0 ? Math.round(((oneOffCredit * cashbackPercent) / 100) * 100) / 100 : 0
    const subscriptionBalance = Number(wallet.subscription_balance) + subscriptionCredit
    const oneOffBalance = Number(wallet.one_off_balance) + oneOffCredit + cashbackAmount

    await tx`
      update wallets
      set one_off_balance = ${oneOffBalance}, subscription_balance = ${subscriptionBalance}, updated_at = ${new Date()}
      where customer_id = ${customerId}
    `
    const [payment] = paymentReference
      ? await tx`
          update payments
          set status = 'success', succeeded_at = coalesce(succeeded_at, now())
          where reference = ${paymentReference}
          returning id
        `
      : []
    let creditTransactionId: string | null = null
    if (subscriptionCredit > 0) {
      const [transaction] = await tx`
        insert into wallet_transactions (customer_id, balance_type, txn_type, amount, balance_after, related_payment_id)
        values (${customerId}, 'subscription', 'topup', ${subscriptionCredit}, ${subscriptionBalance}, ${payment?.id ?? null})
        returning id
      `
      creditTransactionId = transaction.id
    }
    if (oneOffCredit > 0) {
      const [transaction] = await tx`
        insert into wallet_transactions (customer_id, balance_type, txn_type, amount, balance_after, related_payment_id)
        values (${customerId}, 'one_off', 'topup', ${oneOffCredit}, ${oneOffBalance}, ${payment?.id ?? null})
        returning id
      `
      creditTransactionId ??= transaction.id
    }
    if (cashbackAmount > 0) {
      await tx`
        insert into wallet_transactions (customer_id, balance_type, txn_type, amount, balance_after, related_payment_id)
        values (${customerId}, 'one_off', 'cashback', ${cashbackAmount}, ${oneOffBalance}, ${payment?.id ?? null})
      `
    }

    let settledBalance = oneOffBalance
    const referralRewardRecipients: ReferralRewardRecipient[] = []
    const settledInvoices: Array<{ invoiceId: string; orderId: string; publicOrderNumber: string; amount: number }> = []
    if (oneOffCredit > 0) {
      const pendingInvoices = await tx`
        select i.id, i.amount, o.id as order_id, o.public_order_number
        from invoices i
        join orders o on o.id = i.order_id
        where o.customer_id = ${customerId}
          and o.status in ('invoiced', 'out_for_delivery')
          and i.status = 'unpaid'
        order by o.created_at desc
        for update of i, o
      `

      for (const invoice of pendingInvoices) {
        const invoiceAmount = Number(invoice.amount)
        if (invoiceAmount > settledBalance) break

        settledBalance -= invoiceAmount
        const deliveryOtp = generateFourDigitOtp()
        await tx`update wallets set one_off_balance = ${settledBalance}, updated_at = now() where customer_id = ${customerId}`
        await tx`update invoices set status = 'paid', paid_at = now() where id = ${invoice.id}`
        await tx`
          update orders
          set status = case when status = 'out_for_delivery' then status else 'paid' end,
              delivery_otp = ${deliveryOtp}
          where id = ${invoice.order_id}
        `
        if (invoiceAmount > 0) {
          await tx`
            insert into wallet_transactions (customer_id, balance_type, txn_type, amount, balance_after, related_invoice_id)
            values (${customerId}, 'one_off', 'debit', ${invoiceAmount}, ${settledBalance}, ${invoice.id})
          `
        }
        referralRewardRecipients.push(...(await issueReferralRewards(tx, customerId, invoice.order_id, invoiceAmount)))
        settledInvoices.push({
          invoiceId: invoice.id,
          orderId: invoice.order_id,
          publicOrderNumber: invoice.public_order_number,
          amount: invoiceAmount,
        })
      }
    }

    return {
      newBalance: balanceType === 'subscription' ? subscriptionBalance : settledBalance,
      cashbackAmount,
      settledInvoices,
      creditTransactionId,
      alreadyCredited: false,
      referralRewardRecipients,
    }
  })
  await sendReferralRewardNotifications(result.referralRewardRecipients ?? [])
  return result
}

/** Credits the customer's wallet after a Paystack top-up payment is verified server-side. */
export async function creditWallet(customerId: string, balanceType: WalletBalanceType, amount: number, paymentReference: string) {
  return applyWalletCredit(customerId, balanceType, amount, paymentReference, true)
}

/** Credits a customer's one-off wallet from an admin action without creating a Paystack payment. */
export async function creditAdminWallet(customerId: string, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Top-up amount must be positive')
  const result = await applyWalletCredit(customerId, 'one_off', amount, null, false)
  if (!result.creditTransactionId) throw new Error('Admin wallet top-up transaction was not recorded')
  await sendAdminWalletTopUpNotification(customerId, amount, result.creditTransactionId)
  await sendWalletInvoicePaidNotifications(customerId, result.settledInvoices)
  return result
}

/** Completes a paid subscription transaction without changing either wallet balance. */
export async function activateSubscriptionFromPayment(customerId: string, paymentReference: string) {
  return sql.begin(async (tx) => {
    await lockCustomerSubscription(tx, customerId)
    const [payment] = await tx`
      select p.id, p.plan_id, p.status, p.customer_id, pl.name, pl.type, pl.semester_end_date
      from payments p
      join plans pl on pl.id = p.plan_id
      where p.reference = ${paymentReference}
        and p.customer_id = ${customerId}
        and p.plan_id is not null
      for update of p
    `
    if (!payment) throw new Error('Subscription payment was not found')
    if (payment.status !== 'success') throw new Error('Subscription payment is not successful')

    const [existingSubscription] = await tx`
      select id from subscriptions
      where customer_id = ${customerId}
        and status = 'active'
        and (end_date is null or end_date >= current_date)
      limit 1
    `
    if (existingSubscription) return { alreadyActivated: true }

    const [settings] = await tx`
      select semester_end_date from app_settings where key = 'semester' limit 1
    `
    const startDate = new Date()
    const endDate =
      payment.type === 'semester'
        ? (settings?.semester_end_date ??
          payment.semester_end_date ??
          new Date(startDate.getFullYear(), startDate.getMonth() + 6, startDate.getDate()).toISOString().slice(0, 10))
        : new Date(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate()).toISOString().slice(0, 10)

    const subscription = await insertSubscriptionWithSnapshot(tx, {
      customerId,
      planId: payment.plan_id,
      startDate: startDate.toISOString().slice(0, 10),
      endDate,
    })
    return { alreadyActivated: false, subscriptionId: subscription.id, planName: payment.name, endDate }
  })
}

/** Records a normal one-time invoice as wallet debt when the order is created. */
export async function debitOneOffInvoice(customerId: string, invoiceId: string) {
  return sql.begin(async (tx) => {
    await tx`insert into wallets (customer_id) values (${customerId}) on conflict (customer_id) do nothing`

    const [invoice] = await tx`
      select i.id, i.amount, i.status, o.customer_id, o.is_subscription_order, o.id as order_id, o.public_order_number
      from invoices i
      join orders o on o.id = i.order_id
      where i.id = ${invoiceId}
      for update of i
    `

    if (!invoice || invoice.customer_id !== customerId || invoice.is_subscription_order) throw new Error('Invoice not found')
    if (invoice.status === 'paid')
      return { invoiceId, alreadyPaid: true, orderId: invoice.order_id, publicOrderNumber: invoice.public_order_number }

    const [wallet] = await tx`select one_off_balance from wallets where customer_id = ${customerId} for update`
    const newBalance = Number(wallet.one_off_balance) - Number(invoice.amount)
    await tx`update wallets set one_off_balance = ${newBalance}, updated_at = now() where customer_id = ${customerId}`
    await tx`
      insert into wallet_transactions (customer_id, balance_type, txn_type, amount, balance_after, related_invoice_id)
      values (${customerId}, 'one_off', 'debit', ${invoice.amount}, ${newBalance}, ${invoiceId})
    `

    return { invoiceId, newBalance, alreadyPaid: false, orderId: invoice.order_id, publicOrderNumber: invoice.public_order_number }
  })
}

/** Applies an admin-approved wallet adjustment without allowing direct client balance writes. */
export async function adjustWallet(customerId: string, balanceType: WalletBalanceType, amount: number) {
  if (!Number.isFinite(amount) || amount === 0) throw new Error('Adjustment amount must be non-zero')
  if (balanceType === 'promotional') throw new Error('Promotional balances cannot be adjusted directly')
  return sql.begin(async (tx) => {
    await tx`insert into wallets (customer_id) values (${customerId}) on conflict (customer_id) do nothing`
    const balanceColumn = balanceType === 'one_off' ? 'one_off_balance' : 'subscription_balance'
    const [wallet] = await tx`select * from wallets where customer_id = ${customerId} for update`
    const currentBalance = Number(wallet?.[balanceColumn] ?? 0)
    const newBalance = currentBalance + amount
    if (balanceType === 'subscription' && newBalance < 0) throw new Error('Subscription balance cannot be below zero')
    await tx`update wallets set ${tx({ [balanceColumn]: newBalance, updated_at: new Date() })} where customer_id = ${customerId}`
    await tx`
      insert into wallet_transactions (customer_id, balance_type, txn_type, amount, balance_after)
      values (${customerId}, ${balanceType}, 'adjustment', ${amount}, ${newBalance})
    `
    return { balanceType, amount, newBalance }
  })
}

/** Charges an unpaid subscription-order excess from the customer's general wallet. */
export async function chargeSubscriptionInvoice(customerId: string, invoiceId: string) {
  const result = await sql.begin(async (tx) => {
    await tx`insert into wallets (customer_id) values (${customerId}) on conflict (customer_id) do nothing`

    const [invoice] = await tx`
      select i.*, o.customer_id, o.is_subscription_order, o.id as order_id, o.public_order_number, o.status as order_status
      from invoices i
      join orders o on o.id = i.order_id
      where i.id = ${invoiceId}
      for update of i, o
    `

    if (!invoice || invoice.customer_id !== customerId || !invoice.is_subscription_order) throw new Error('Invoice not found')
    if (invoice.status === 'paid')
      return {
        amount: Number(invoice.amount),
        alreadyPaid: true,
        orderId: invoice.order_id,
        publicOrderNumber: invoice.public_order_number,
      }

    if (invoice.status !== 'unpaid' || !['invoiced', 'out_for_delivery'].includes(invoice.order_status))
      throw new Error('Invoice is not payable in its current order state')

    const amount = Number(invoice.amount)
    const { newBalance } = await debitWalletForInvoice(tx, customerId, invoiceId, amount, 'one_off')
    const deliveryOtp = generateFourDigitOtp()
    await tx`update invoices set status = 'paid', paid_at = now() where id = ${invoiceId}`
    await tx`
      update orders
      set status = case when status = 'out_for_delivery' then status else 'paid' end,
          delivery_otp = ${deliveryOtp}
      where id = ${invoice.order_id}
    `
    const referralRewardRecipients = await issueReferralRewards(tx, customerId, invoice.order_id, amount)

    return {
      amount,
      newBalance,
      deliveryOtp,
      alreadyPaid: false,
      orderId: invoice.order_id,
      publicOrderNumber: invoice.public_order_number,
      referralRewardRecipients,
    }
  })
  await sendReferralRewardNotifications(result.referralRewardRecipients ?? [])
  return result
}

export { InsufficientBalanceError }
