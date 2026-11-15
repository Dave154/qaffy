import { sql } from './db.server'
import { getRefundAllocations, getRestoredRewardExpiry, RefundAccountingError } from './order-cancellation'

type SettlementChoice = 'include' | 'exclude' | null

type CancelAdminOrderInput = {
  orderId: string
  adminProfileId: string
  reason: string
  refundRequested: boolean
  settlementChoice: SettlementChoice
}

export class OrderCancellationError extends Error {
  readonly status: 400 | 404 | 409

  constructor(status: 400 | 404 | 409, message: string) {
    super(message)
    this.status = status
  }
}

export type AdminOrderCancellationResult = {
  orderId: string
  customerId: string
  publicOrderNumber: string
  reason: string
  refundRequested: boolean
  refundAmount: number
  includeInVendorSettlement: boolean
  alreadyCancelled: boolean
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

export async function cancelAdminOrder(input: CancelAdminOrderInput): Promise<AdminOrderCancellationResult> {
  const reason = input.reason.trim()
  if (!reason || reason.length > 1000) {
    throw new OrderCancellationError(400, 'Enter a cancellation reason of no more than 1,000 characters.')
  }

  return sql.begin(async (tx) => {
    const [lockedInvoice] = await tx`
      select id
      from invoices
      where order_id = ${input.orderId}
      for update
    `
    const [order] = await tx`
      select
        id,
        customer_id,
        public_order_number,
        status,
        vendor_id,
        clothes_count_vendor,
        exists (
          select 1
          from order_logistics_events delivered_event
          where delivered_event.order_id = orders.id
            and delivered_event.event_type = 'delivered'
        ) as has_delivered_event
      from orders
      where id = ${input.orderId}
      for update
    `
    if (!order) throw new OrderCancellationError(404, 'This order could not be found.')

    const [existingCancellation] = await tx`
      select reason, refund_requested, refund_amount, include_in_vendor_settlement
      from order_cancellations
      where order_id = ${input.orderId}
    `
    if (existingCancellation) {
      return {
        orderId: order.id,
        customerId: order.customer_id,
        publicOrderNumber: order.public_order_number,
        reason: existingCancellation.reason,
        refundRequested: existingCancellation.refund_requested,
        refundAmount: Number(existingCancellation.refund_amount),
        includeInVendorSettlement: existingCancellation.include_in_vendor_settlement,
        alreadyCancelled: true,
      }
    }

    if (order.status === 'delivered' || order.has_delivered_event) {
      throw new OrderCancellationError(409, 'Delivered orders cannot be cancelled.')
    }
    if (order.status === 'cancelled') {
      throw new OrderCancellationError(409, 'This order was cancelled before cancellation records were enabled.')
    }

    const [invoice] = lockedInvoice
      ? await tx`
          select id, amount, status, payment_method
          from invoices
          where id = ${lockedInvoice.id}
        `
      : []
    const invoiceStatus = invoice?.status ?? null
    const invoiceAmount = invoice ? Number(invoice.amount) : 0
    if (input.refundRequested && invoiceStatus !== 'paid') {
      throw new OrderCancellationError(409, 'Only a paid invoice can be refunded. The unpaid invoice will be voided when the order is cancelled.')
    }

    const settlementEligible = invoiceStatus === 'paid' && order.clothes_count_vendor !== null && Boolean(order.vendor_id)
    if (settlementEligible && input.settlementChoice === null) {
      throw new OrderCancellationError(400, 'Choose whether this paid order should be included in vendor settlement.')
    }
    if (!settlementEligible && input.settlementChoice === 'include') {
      throw new OrderCancellationError(400, 'Only paid, vendor-confirmed orders can be included in vendor settlement.')
    }

    const requestedSettlementInclusion = settlementEligible && input.settlementChoice === 'include'
    const settlementRows = await tx`
      select settlement.id, settlement.amount_due, settlement.status, transfer.status as transfer_status
      from vendor_settlement_orders membership
      join vendor_settlements settlement on settlement.id = membership.settlement_id
      left join vendor_settlement_transfers transfer on transfer.settlement_id = settlement.id
      where membership.order_id = ${input.orderId}
      order by settlement.id
      for update of settlement
    `
    const hasIrreversibleSettlement = settlementRows.some(
      (settlement) =>
        settlement.status === 'paid' ||
        settlement.transfer_status === 'success' ||
        settlement.transfer_status === 'queued' ||
        settlement.transfer_status === 'processing',
    )
    if (hasIrreversibleSettlement && settlementEligible && input.settlementChoice === 'exclude') {
      throw new OrderCancellationError(
        409,
        'A vendor payout is already paid or in progress. Keep this order included in settlement and try again.',
      )
    }
    const includeInVendorSettlement = hasIrreversibleSettlement || requestedSettlementInclusion

    if (!includeInVendorSettlement) {
      for (const settlement of settlementRows) {
        if (settlement.status !== 'pending') {
          throw new OrderCancellationError(409, 'This order is already settled and cannot be excluded from vendor settlement.')
        }

        const [snapshot] = await tx`
          select
            count(snapshot.order_item_id)::int as snapshot_count,
            coalesce(sum(snapshot.amount), 0) as snapshot_amount,
            (select count(*)::int from order_items where order_id = ${input.orderId}) as order_item_count
          from vendor_settlement_items snapshot
          join order_items item on item.id = snapshot.order_item_id
          where snapshot.settlement_id = ${settlement.id}
            and item.order_id = ${input.orderId}
        `
        if (Number(snapshot.snapshot_count) !== Number(snapshot.order_item_count)) {
          throw new OrderCancellationError(
            409,
            'The existing vendor settlement snapshot is incomplete. Keep the order included and ask an admin to review the batch.',
          )
        }

        const nextAmount = roundCurrency(Number(settlement.amount_due) - Number(snapshot.snapshot_amount))
        if (nextAmount < 0) {
          throw new OrderCancellationError(
            409,
            'The vendor settlement amount does not match its saved order snapshot. Keep the order included and ask an admin to review the batch.',
          )
        }
        await tx`
          delete from vendor_settlement_items snapshot
          using order_items item
          where snapshot.settlement_id = ${settlement.id}
            and snapshot.order_item_id = item.id
            and item.order_id = ${input.orderId}
        `
        await tx`
          delete from vendor_settlement_orders
          where settlement_id = ${settlement.id} and order_id = ${input.orderId}
        `
        const [remainingMemberships] = await tx`
          select count(*)::int as count
          from vendor_settlement_orders
          where settlement_id = ${settlement.id}
        `
        await tx`
          update vendor_settlements
          set amount_due = ${nextAmount},
              status = case when ${Number(remainingMemberships.count)} = 0 then 'cancelled'::settlement_status else status end
          where id = ${settlement.id}
        `
      }
    }

    const refundAmount = input.refundRequested ? invoiceAmount : 0
    await tx`
      insert into order_cancellations (
        order_id,
        cancelled_by,
        original_status,
        reason,
        refund_requested,
        refund_amount,
        include_in_vendor_settlement
      )
      values (
        ${order.id},
        ${input.adminProfileId},
        ${order.status},
        ${reason},
        ${input.refundRequested},
        ${refundAmount},
        ${includeInVendorSettlement}
      )
    `

    if (input.refundRequested && invoice) {
      const sourceRows =
        invoice.payment_method === 'offline'
          ? []
          : await tx`
              select balance_type, amount, related_referral_reward_id
              from invoice_payment_allocations
              where invoice_id = ${invoice.id}
              order by balance_type, related_referral_reward_id
            `
      const allocations = getRefundAllocations(
        invoiceAmount,
        invoice.payment_method,
        sourceRows.map((row) => ({
          balanceType: row.balance_type as 'one_off' | 'subscription' | 'promotional',
          amount: Number(row.amount),
          referralRewardId: row.related_referral_reward_id,
        })),
      )

      if (allocations.length > 0) {
        await tx`insert into wallets (customer_id) values (${order.customer_id}) on conflict (customer_id) do nothing`
        const [wallet] = await tx`
          select one_off_balance, subscription_balance, promotional_balance
          from wallets
          where customer_id = ${order.customer_id}
          for update
        `
        let oneOffBalance = Number(wallet.one_off_balance)
        let subscriptionBalance = Number(wallet.subscription_balance)
        let promotionalBalance = Number(wallet.promotional_balance)
        const rewardIds = allocations
          .filter((allocation) => allocation.balanceType === 'promotional')
          .map((allocation) => allocation.referralRewardId!)
        const rewards =
          rewardIds.length > 0
            ? await tx`
                select reward.id, reward.reward_value, reward.remaining_value, reward.status, reward.expires_at,
                  referral.reward_expiry_days_snapshot
                from referral_rewards reward
                join referrals referral on referral.id = reward.referral_id
                where reward.id in ${tx(rewardIds)}
                order by reward.id
                for update of reward
              `
            : []
        const rewardsById = new Map(rewards.map((reward) => [reward.id, reward]))

        for (const allocation of allocations) {
          let balanceAfter: number
          if (allocation.balanceType === 'one_off') {
            oneOffBalance = roundCurrency(oneOffBalance + allocation.amount)
            balanceAfter = oneOffBalance
          } else if (allocation.balanceType === 'subscription') {
            subscriptionBalance = roundCurrency(subscriptionBalance + allocation.amount)
            balanceAfter = subscriptionBalance
          } else {
            const reward = rewardsById.get(allocation.referralRewardId!)
            if (!reward || !['issued', 'expired'].includes(reward.status)) {
              throw new RefundAccountingError('The promotional reward used for this invoice can no longer be restored safely.')
            }
            const restoredValue = roundCurrency(Number(reward.remaining_value) + allocation.amount)
            if (restoredValue > Number(reward.reward_value) + 0.001) {
              throw new RefundAccountingError('The promotional reward balance would exceed its original value. Review the invoice ledger before refunding.')
            }
            const expiresAt = getRestoredRewardExpiry(
              reward.expires_at,
              reward.reward_expiry_days_snapshot === null ? null : Number(reward.reward_expiry_days_snapshot),
              new Date(),
            )
            promotionalBalance = roundCurrency(promotionalBalance + allocation.amount)
            balanceAfter = promotionalBalance
            await tx`
              update referral_rewards
              set remaining_value = ${restoredValue},
                  status = 'issued',
                  expires_at = ${expiresAt.toISOString()},
                  updated_at = now()
              where id = ${reward.id}
            `
          }

          await tx`
            insert into wallet_transactions (
              customer_id,
              balance_type,
              txn_type,
              amount,
              balance_after,
              related_invoice_id,
              related_referral_reward_id,
              related_order_cancellation_id
            )
            values (
              ${order.customer_id},
              ${allocation.balanceType},
              'refund',
              ${allocation.amount},
              ${balanceAfter},
              ${invoice.id},
              ${allocation.referralRewardId},
              ${order.id}
            )
          `
        }
        await tx`
          update wallets
          set one_off_balance = ${oneOffBalance},
              subscription_balance = ${subscriptionBalance},
              promotional_balance = ${promotionalBalance},
              updated_at = now()
          where customer_id = ${order.customer_id}
        `
      }

      await tx`
        update invoices
        set status = 'refunded', refunded_at = now()
        where id = ${invoice.id} and status = 'paid'
      `
    } else if (invoice?.status === 'unpaid') {
      await tx`
        update invoices
        set status = 'void', voided_at = now()
        where id = ${invoice.id} and status = 'unpaid'
      `
    }

    const [cancelledOrder] = await tx`
      update orders
      set status = 'cancelled', pickup_otp = null, delivery_otp = null
      where id = ${order.id}
        and status <> 'delivered'
      returning id
    `
    if (!cancelledOrder) throw new OrderCancellationError(409, 'This order was delivered before cancellation could be completed.')

    await tx`
      insert into admin_audit_events (admin_profile_id, action, entity_type, entity_id, metadata)
      values (
        ${input.adminProfileId},
        'admin_order_cancelled',
        'order',
        ${order.id},
        ${tx.json({
          fromStatus: order.status,
          toStatus: 'cancelled',
          reason,
          refundRequested: input.refundRequested,
          refundAmount,
          includeInVendorSettlement,
        })}
      )
    `

    return {
      orderId: order.id,
      customerId: order.customer_id,
      publicOrderNumber: order.public_order_number,
      reason,
      refundRequested: input.refundRequested,
      refundAmount,
      includeInVendorSettlement,
      alreadyCancelled: false,
    }
  })
}
