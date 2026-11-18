import { getMixedServiceGroups, hasMinimumMixedServiceInstructions, MIN_MIXED_SERVICE_INSTRUCTION_LENGTH } from './mixed-service-orders'
import { sql } from './db.server'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const services = ['wash', 'iron', 'wash_iron'] as const

export type CustomerOrderEditItem = {
  itemId?: string
  categoryId: string
  service: (typeof services)[number]
  quantity: number
}

export class CustomerOrderEditError extends Error {
  readonly status: 400 | 404 | 409

  constructor(status: 400 | 404 | 409, message: string) {
    super(message)
    this.status = status
  }
}

export async function updateCustomerOrder(input: {
  customerId: string
  orderId: string
  pickupLocationId: string
  notes: string
  items: unknown
}) {
  if (!uuidPattern.test(input.orderId)) throw new CustomerOrderEditError(400, 'Invalid order.')
  if (!uuidPattern.test(input.pickupLocationId)) throw new CustomerOrderEditError(400, 'Choose a valid pickup location.')
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 100) {
    throw new CustomerOrderEditError(400, 'Add at least one item to the order.')
  }
  if (input.notes.length > 2000) throw new CustomerOrderEditError(400, 'Pickup instructions must be no more than 2,000 characters.')
  const items = input.items.map((value: unknown): CustomerOrderEditItem => {
    if (!value || typeof value !== 'object') throw new CustomerOrderEditError(400, 'One or more order items are invalid.')
    const item = value as Record<string, unknown>
    if (
      typeof item.categoryId !== 'string' ||
      !uuidPattern.test(item.categoryId) ||
      (item.itemId !== undefined && (typeof item.itemId !== 'string' || !uuidPattern.test(item.itemId))) ||
      typeof item.service !== 'string' ||
      !services.includes(item.service as (typeof services)[number]) ||
      !Number.isSafeInteger(item.quantity) ||
      Number(item.quantity) < 1 ||
      Number(item.quantity) > 2147483647
    ) {
      throw new CustomerOrderEditError(400, 'One or more order items are invalid.')
    }
    return {
      itemId: typeof item.itemId === 'string' ? item.itemId : undefined,
      categoryId: item.categoryId,
      service: item.service as CustomerOrderEditItem['service'],
      quantity: Number(item.quantity),
    }
  })

  const lineKeys = items.map((item) => `${item.categoryId}:${item.service}`)
  if (new Set(lineKeys).size !== lineKeys.length) {
    throw new CustomerOrderEditError(400, 'Each category and service combination can only be added once.')
  }
  const customerLines = items.map((item) => ({
    category: item.categoryId,
    service: item.service === 'wash_iron' ? 'Wash + Iron' : item.service === 'iron' ? 'Iron' : 'Wash',
    quantity: item.quantity,
  }))
  if (
    getMixedServiceGroups(customerLines).length > 0 &&
    !hasMinimumMixedServiceInstructions(input.notes)
  ) {
    throw new CustomerOrderEditError(
      400,
      `Mixed-service instructions must contain at least ${MIN_MIXED_SERVICE_INSTRUCTION_LENGTH} characters.`,
    )
  }

  return sql.begin(async (tx) => {
    const [order] = await tx`
      select id, status, picked, pickup_location_id
      from orders
      where id = ${input.orderId}
        and customer_id = ${input.customerId}
      for update
    `
    if (!order) throw new CustomerOrderEditError(404, 'This order could not be found.')
    if (order.status !== 'pending_pickup' || order.picked) {
      throw new CustomerOrderEditError(409, 'This order is no longer awaiting pickup and cannot be edited.')
    }

    const [invoice] = await tx`
      select id from invoices where order_id = ${input.orderId} limit 1
    `
    if (invoice) throw new CustomerOrderEditError(409, 'This order can no longer be edited.')

    const [location] = await tx`
      select id
      from pickup_locations
      where id = ${input.pickupLocationId}
        and (active = true or id = ${order.pickup_location_id})
    `
    if (!location) throw new CustomerOrderEditError(400, 'Choose an active pickup location.')

    const existingItems = await tx`
      select id, category_id, service, quantity
      from order_items
      where order_id = ${input.orderId}
      for update
    `
    const existingById = new Map(existingItems.map((item) => [item.id, item]))
    const providedIds = items.flatMap((item) => (item.itemId ? [item.itemId] : []))
    if (new Set(providedIds).size !== providedIds.length || providedIds.some((id) => !existingById.has(id))) {
      throw new CustomerOrderEditError(400, 'The order items have changed. Refresh and try again.')
    }

    const categories = await tx`
      select category.id, category.active, rates.category_id
      from cloth_categories category
      left join cloth_category_rates rates on rates.category_id = category.id
      where category.id in ${tx(items.map((item) => item.categoryId))}
    `
    const categoryById = new Map(categories.map((category) => [category.id, category]))
    for (const item of items) {
      const category = categoryById.get(item.categoryId)
      const previous = item.itemId ? existingById.get(item.itemId) : undefined
      const unchanged = previous?.category_id === item.categoryId && previous.service === item.service
      if (!category || !category.category_id || (!category.active && !unchanged)) {
        throw new CustomerOrderEditError(400, 'One or more selected laundry categories are no longer available.')
      }
    }

    for (const item of items) {
      if (item.itemId) {
        const previous = existingById.get(item.itemId)!
        const categoryOrServiceChanged = previous.category_id !== item.categoryId || previous.service !== item.service
        if (categoryOrServiceChanged) {
          await tx`
            update order_items
            set category_id = ${item.categoryId},
                service = ${item.service},
                quantity = ${item.quantity}
            where id = ${item.itemId} and order_id = ${input.orderId}
          `
        } else if (Number(previous.quantity) !== item.quantity) {
          await tx`
            update order_items
            set quantity = ${item.quantity}
            where id = ${item.itemId} and order_id = ${input.orderId}
          `
        }
      } else {
        await tx`
          insert into order_items (order_id, category_id, service, quantity)
          values (${input.orderId}, ${item.categoryId}, ${item.service}, ${item.quantity})
        `
      }
    }

    const removedItemIds = existingItems
      .filter((item) => !providedIds.includes(item.id))
      .map((item) => item.id)
    if (removedItemIds.length > 0) {
      await tx`
        delete from order_items
        where order_id = ${input.orderId}
          and id in ${tx(removedItemIds)}
      `
    }

    const distinctServices = [...new Set(items.map((item) => item.service))]
    const orderType = distinctServices.length > 1 ? 'mixed' : distinctServices[0] === 'wash_iron' ? 'wash_iron' : 'wash'
    await tx`
      update orders
      set order_type = ${orderType},
          notes = ${input.notes.trim() || null},
          pickup_location_id = ${input.pickupLocationId}
      where id = ${input.orderId}
    `
  })
}
