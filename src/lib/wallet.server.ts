import { sql } from '@/lib/db.server'
import type { WalletBalanceType } from '@/types/database.types'

class InsufficientBalanceError extends Error {
  constructor() {
    super('INSUFFICIENT_BALANCE')
  }
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
    const deliveryOtp = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')

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

    const balanceColumn = balanceType === 'one_off' ? 'one_off_balance' : 'subscription_balance'
    const [wallet] = await tx`select * from wallets where customer_id = ${customerId} for update`
    const newBalance = Number(wallet[balanceColumn]) + amount

    await tx`update wallets set ${tx({ [balanceColumn]: newBalance, updated_at: new Date() })} where customer_id = ${customerId}`
    const [payment] = await tx`update payments set status = 'success' where reference = ${paymentReference} returning id`
    await tx`
      insert into wallet_transactions (customer_id, balance_type, txn_type, amount, balance_after, related_payment_id)
      values (${customerId}, ${balanceType}, 'topup', ${amount}, ${newBalance}, ${payment?.id ?? null})
    `

    return { newBalance }
  })
}

export { InsufficientBalanceError }
