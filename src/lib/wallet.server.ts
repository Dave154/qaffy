import { sql } from '@/lib/db.server'
import type { WalletBalanceType } from '@/types/database.types'

class InsufficientBalanceError extends Error {
  constructor() {
    super('INSUFFICIENT_BALANCE')
  }
}

function generateFourDigitOtp() {
  return String(1000 + Math.floor(Math.random() * 9000))
}

/** Debits the customer's wallet, marks the invoice paid, and issues the delivery OTP — all in one transaction. */
export async function payFromWallet(customerId: string, invoiceId: string, balanceType: WalletBalanceType) {
  return sql.begin(async (tx) => {
    const [invoice] = await tx`
      select i.*, o.customer_id, o.id as order_id
      from invoices i
      join orders o on o.id = i.order_id
      where i.id = ${invoiceId}
      for update of i
    `

    if (!invoice) throw new Error('Invoice not found')
    if (invoice.customer_id !== customerId) throw new Error('Not authorized for this invoice')
    if (invoice.status === 'paid') throw new Error('Invoice already paid')

    const balanceColumn = balanceType === 'one_off' ? 'one_off_balance' : 'subscription_balance'

    const [wallet] = await tx`
      select * from wallets where customer_id = ${customerId} for update
    `
    const currentBalance = Number(wallet?.[balanceColumn] ?? 0)
    if (currentBalance < Number(invoice.amount)) throw new InsufficientBalanceError()

    const newBalance = currentBalance - Number(invoice.amount)
    const deliveryOtp = generateFourDigitOtp()

    await tx`update wallets set ${tx({ [balanceColumn]: newBalance, updated_at: new Date() })} where customer_id = ${customerId}`
    await tx`update invoices set status = 'paid', paid_at = now() where id = ${invoiceId}`
    await tx`update orders set status = 'paid', delivery_otp = ${deliveryOtp} where id = ${invoice.order_id}`
    await tx`
      insert into wallet_transactions (customer_id, balance_type, txn_type, amount, balance_after, related_invoice_id)
      values (${customerId}, ${balanceType}, 'debit', ${invoice.amount}, ${newBalance}, ${invoiceId})
    `

    return { invoiceId, deliveryOtp, newBalance }
  })
}

export async function finalizeVendorOrder(
  orderId: string,
  vendorProfileId: string,
  receivedItems: Array<{ itemId: string; quantity: number }>,
  addedItems: Array<{ categoryName: string; service: 'wash' | 'iron' | 'wash_iron'; quantity: number }>,
  mismatchDetail: string,
) {
  return sql.begin(async (tx) => {
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
    if (receivedItems.some((item) => !item.itemId || !Number.isInteger(item.quantity) || item.quantity < 0)) throw new Error('Received quantities are invalid')
    if (addedItems.some((item) => !item.categoryName || !['wash', 'iron', 'wash_iron'].includes(item.service) || !Number.isInteger(item.quantity) || item.quantity < 1)) throw new Error('Added category details are invalid')

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
      select oi.id, oi.quantity, oi.service, r.wash_price, r.iron_price, r.wash_iron_price
      from order_items oi
      join cloth_category_rates r on r.category_id = oi.category_id
      where oi.order_id = ${orderId}
    `
    const orderItemIds = new Set(items.map((item) => item.id))
    if (receivedItems.some((item) => !orderItemIds.has(item.itemId))) throw new Error('Received item does not belong to this order')
    const receivedById = new Map(receivedItems.map((item) => [item.itemId, item.quantity]))
    const finalCount = items.reduce((total, item) => total + (receivedById.get(item.id) ?? (addedItemIds.includes(item.id) ? Number(item.quantity) : 0)), 0)
    const finalAmount = items.reduce((total, item) => {
      const quantity = receivedById.get(item.id) ?? (addedItemIds.includes(item.id) ? Number(item.quantity) : 0)
      const unitPrice = item.service === 'wash_iron'
        ? Number(item.wash_iron_price)
        : item.service === 'iron'
          ? Number(item.iron_price)
          : Number(item.wash_price)
      return total + quantity * unitPrice
    }, 0)
    const originalAmount = items.reduce((total, item) => {
      const unitPrice = item.service === 'wash_iron'
        ? Number(item.wash_iron_price)
        : item.service === 'iron'
          ? Number(item.iron_price)
          : Number(item.wash_price)
      return total + Number(item.quantity) * unitPrice
    }, 0)
    const extraAmount = Math.max(0, finalAmount - originalAmount)
    const mismatchDirection = finalCount > Number(order.clothes_count_customer) ? 'over' : finalCount < Number(order.clothes_count_customer) ? 'under' : null
    if (mismatchDirection && !mismatchDetail.trim()) throw new Error('Mismatch details are required when the final count changes')

    await tx`
      update orders
      set clothes_count_vendor = ${finalCount}, billed_extra_amount = ${extraAmount}, status = 'invoiced'
      where id = ${orderId}
    `
    for (const item of items) {
      await tx`
        update order_items
        set confirmed_quantity = ${receivedById.get(item.id) ?? 0}
        where id = ${item.id}
      `
    }
    if (mismatchDirection) {
      await tx`delete from mismatches where order_id = ${orderId}`
      await tx`
        insert into mismatches (order_id, direction, detail)
        values (${orderId}, ${mismatchDirection}, ${mismatchDetail})
      `
    }
    const [invoice] = await tx`
      insert into invoices (order_id, amount, status)
      values (${orderId}, ${Math.round(finalAmount * 100) / 100}, 'unpaid')
      on conflict (order_id) do update set amount = excluded.amount, status = 'unpaid', paid_at = null
      returning id, amount, status
    `

    return { invoiceId: invoice.id, amount: Number(invoice.amount), finalCount, mismatchDirection }
  })
}

/** Credits the customer's wallet after a Paystack top-up payment is verified server-side. */
export async function creditWallet(customerId: string, balanceType: WalletBalanceType, amount: number, paymentReference: string) {
  if (amount <= 0) throw new Error('Amount must be positive')

  return sql.begin(async (tx) => {
    await tx`insert into wallets (customer_id) values (${customerId}) on conflict (customer_id) do nothing`
    await tx`
      insert into payments (customer_id, reference, amount, balance_type, status)
      values (${customerId}, ${paymentReference}, ${amount}, ${balanceType}, 'pending')
      on conflict (reference) do nothing
    `

    const [wallet] = await tx`select * from wallets where customer_id = ${customerId} for update`
    const subscriptionDebt = Math.max(0, -Number(wallet.subscription_balance))
    const subscriptionCredit = balanceType === 'subscription' ? amount : Math.min(amount, subscriptionDebt)
    const oneOffCredit = balanceType === 'one_off' ? amount - subscriptionCredit : 0
    const subscriptionBalance = Number(wallet.subscription_balance) + subscriptionCredit
    const oneOffBalance = Number(wallet.one_off_balance) + oneOffCredit

    await tx`
      update wallets
      set one_off_balance = ${oneOffBalance}, subscription_balance = ${subscriptionBalance}, updated_at = ${new Date()}
      where customer_id = ${customerId}
    `
    const [payment] = await tx`update payments set status = 'success' where reference = ${paymentReference} returning id`
    if (subscriptionCredit > 0) {
      await tx`
        insert into wallet_transactions (customer_id, balance_type, txn_type, amount, balance_after, related_payment_id)
        values (${customerId}, 'subscription', 'topup', ${subscriptionCredit}, ${subscriptionBalance}, ${payment?.id ?? null})
      `
    }
    if (oneOffCredit > 0) {
      await tx`
        insert into wallet_transactions (customer_id, balance_type, txn_type, amount, balance_after, related_payment_id)
        values (${customerId}, 'one_off', 'topup', ${oneOffCredit}, ${oneOffBalance}, ${payment?.id ?? null})
      `
    }

    return { newBalance: balanceType === 'subscription' ? subscriptionBalance : oneOffBalance }
  })
}

/** Records a normal one-time invoice as wallet debt when the order is created. */
export async function debitOneOffInvoice(customerId: string, invoiceId: string) {
  return sql.begin(async (tx) => {
    await tx`insert into wallets (customer_id) values (${customerId}) on conflict (customer_id) do nothing`

    const [invoice] = await tx`
      select i.id, i.amount, i.status, o.customer_id, o.is_subscription_order
      from invoices i
      join orders o on o.id = i.order_id
      where i.id = ${invoiceId}
      for update of i
    `

    if (!invoice || invoice.customer_id !== customerId || invoice.is_subscription_order) throw new Error('Invoice not found')
    if (invoice.status === 'paid') return { invoiceId, alreadyPaid: true }

    const [wallet] = await tx`select one_off_balance from wallets where customer_id = ${customerId} for update`
    const newBalance = Number(wallet.one_off_balance) - Number(invoice.amount)
    await tx`update wallets set one_off_balance = ${newBalance}, updated_at = now() where customer_id = ${customerId}`
    await tx`
      insert into wallet_transactions (customer_id, balance_type, txn_type, amount, balance_after, related_invoice_id)
      values (${customerId}, 'one_off', 'debit', ${invoice.amount}, ${newBalance}, ${invoiceId})
    `

    return { invoiceId, newBalance, alreadyPaid: false }
  })
}

/** Applies an admin-approved wallet adjustment without allowing direct client balance writes. */
export async function adjustWallet(customerId: string, balanceType: WalletBalanceType, amount: number) {
  if (!Number.isFinite(amount) || amount === 0) throw new Error('Adjustment amount must be non-zero')
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

/** Charges subscription excess from the customer's subscription balance. */
export async function chargeSubscriptionInvoice(customerId: string, invoiceId: string) {
  return sql.begin(async (tx) => {
    await tx`insert into wallets (customer_id) values (${customerId}) on conflict (customer_id) do nothing`

    const [invoice] = await tx`
      select i.*, o.customer_id, o.is_subscription_order
      from invoices i
      join orders o on o.id = i.order_id
      where i.id = ${invoiceId}
      for update of i
    `

    if (!invoice || invoice.customer_id !== customerId || !invoice.is_subscription_order) throw new Error('Invoice not found')
    if (invoice.status === 'paid') return { amount: Number(invoice.amount), alreadyPaid: true }

    const [wallet] = await tx`
      select subscription_balance from wallets where customer_id = ${customerId} for update
    `
    const currentBalance = Number(wallet?.subscription_balance ?? 0)
    const amount = Number(invoice.amount)
    const newBalance = currentBalance - amount
    const deliveryOtp = newBalance >= 0
      ? generateFourDigitOtp()
      : null
    await tx`update wallets set subscription_balance = ${newBalance}, updated_at = now() where customer_id = ${customerId}`
    await tx`update invoices set status = 'paid', paid_at = now() where id = ${invoiceId}`
    if (deliveryOtp) await tx`update orders set delivery_otp = ${deliveryOtp} where id = ${invoice.order_id}`
    await tx`
      insert into wallet_transactions (customer_id, balance_type, txn_type, amount, balance_after, related_invoice_id)
      values (${customerId}, 'subscription', 'debit', ${amount}, ${newBalance}, ${invoiceId})
    `

    return { amount, newBalance, deliveryOtp, alreadyPaid: false }
  })
}

export { InsufficientBalanceError }
