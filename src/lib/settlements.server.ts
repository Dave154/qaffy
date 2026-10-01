import { sql } from './db.server'
import { createBulkSettlementBatches } from './settlement-batches'
import type { BulkSettlementInput, BulkSettlementRepository } from './settlement-batches'

export async function createBulkSettlements(input: BulkSettlementInput) {
  return createBulkSettlementBatches(input, (work) =>
    sql.begin(async (tx) => {
      const repository: BulkSettlementRepository = {
        async getApprovedVendor(vendorId) {
          const [vendor] = await tx`
          select id, business_name, payout_account_status, payout_recipient_code
          from vendors
          where id = ${vendorId} and status = 'approved'
          for share
        `
          return vendor
            ? {
                id: vendor.id,
                businessName: vendor.business_name || 'Vendor',
                payoutAccountReady: vendor.payout_account_status === 'verified' && Boolean(vendor.payout_recipient_code),
              }
            : null
        },
        async getPaidUnsettledOrders(vendorId, periodStart, periodEnd) {
          const startAt = new Date(`${periodStart}T00:00:00.000Z`)
          const endAt = new Date(`${periodEnd}T23:59:59.999Z`)
          return tx`
          select o.id, o.vendor_id, o.status, o.clothes_count_vendor, i.status as invoice_status
          from orders o
          join invoices i on i.order_id = o.id and i.status = 'paid'
          where o.vendor_id = ${vendorId}
            and o.created_at >= ${startAt.toISOString()}
            and o.created_at <= ${endAt.toISOString()}
            and o.status <> 'cancelled'
            and o.clothes_count_vendor is not null
            and not exists (
              select 1 from vendor_settlement_orders so where so.order_id = o.id
            )
          order by o.created_at, o.id
          for update of o
        `
        },
        async getOrderItems(orderIds) {
          if (orderIds.length === 0) return []
          return tx`
          select oi.id, oi.order_id, oi.category_id, oi.confirmed_quantity, oi.service, oi.unit_price
          from order_items oi
          where oi.order_id in ${tx(orderIds)}
          order by oi.order_id, oi.id
        `
        },
        async getRates() {
          return tx`
          select category_id, vendor_wash_price, vendor_iron_price, vendor_wash_iron_price
          from cloth_category_rates
        `
        },
        async createSettlement({ vendorId, periodStart, periodEnd, amount }) {
          const [settlement] = await tx`
          insert into vendor_settlements (vendor_id, period_start, period_end, amount_due, status)
          values (${vendorId}, ${periodStart}, ${periodEnd}, ${amount}, 'pending')
          returning id
        `
          return settlement.id
        },
        async linkOrder(settlementId, orderId) {
          await tx`
          insert into vendor_settlement_orders (settlement_id, order_id)
          values (${settlementId}, ${orderId})
        `
        },
        async saveItemSnapshot(settlementId, item) {
          await tx`
          insert into vendor_settlement_items (settlement_id, order_item_id, confirmed_quantity, vendor_unit_price, amount)
          values (${settlementId}, ${item.orderItemId}, ${item.confirmedQuantity}, ${item.vendorUnitPrice}, ${item.amount})
        `
        },
        async writeAudit({ adminProfileId, settlementId, vendorId, orderCount, amount, periodStart, periodEnd }) {
          await tx`
          insert into admin_audit_events (admin_profile_id, action, entity_type, entity_id, metadata)
          values (
            ${adminProfileId},
            'vendor_settlement_created',
            'vendor_settlement',
            ${settlementId},
            ${tx.json({ vendorId, orderCount, amount, periodStart, periodEnd })}
          )
        `
        },
      }

      return work(repository)
    }),
  )
}
