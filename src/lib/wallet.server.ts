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
    await tx`update orders set delivery_otp = ${deliveryOtp} where id = ${invoice.order_id}`
    await tx`
      insert into wallet_transactions (customer_id, balance_type, txn_type, amount, balance_after, related_invoice_id)
      values (${customerId}, ${balanceType}, 'debit', ${invoice.amount}, ${newBalance}, ${invoiceId})
    `

    return { invoiceId, deliveryOtp, newBalance }
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
      let settlementBudget = oneOffCredit
      const unpaidInvoices = await tx`
        select i.id, i.amount, o.id as order_id
        from invoices i
        join orders o on o.id = i.order_id
        where o.customer_id = ${customerId}
          and o.is_subscription_order = false
          and i.status = 'unpaid'
        order by i.created_at asc, i.id asc
        for update of i
      `

      for (const invoice of unpaidInvoices) {
        const invoiceAmount = Number(invoice.amount)
        if (settlementBudget < invoiceAmount) break

        const deliveryOtp = generateFourDigitOtp()
        await tx`update invoices set status = 'paid', paid_at = now() where id = ${invoice.id}`
        await tx`update orders set delivery_otp = ${deliveryOtp} where id = ${invoice.order_id}`
        settlementBudget -= invoiceAmount
      }

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
