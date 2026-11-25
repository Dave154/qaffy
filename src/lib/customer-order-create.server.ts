import { sql } from './db.server'
import { getMixedServiceGroups, hasMinimumMixedServiceInstructions, MIN_MIXED_SERVICE_INSTRUCTION_LENGTH } from './mixed-service-orders'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type CustomerOrderService = 'wash' | 'iron' | 'wash_iron'

type CustomerOrderCreateItem = {
  categoryId: string
  service: CustomerOrderService
  quantity: number
}

function isOrderService(value: unknown): value is CustomerOrderService {
  return value === 'wash' || value === 'iron' || value === 'wash_iron'
}

export class CustomerOrderCreateError extends Error {
  readonly status = 400
}

export async function createCustomerOrder(input: {
  customerId: string
  pickupLocationId: string
  notes: string
  subscriptionBorrowConsentUnits: number
  items: unknown
}) {
  if (!uuidPattern.test(input.pickupLocationId)) {
    throw new CustomerOrderCreateError('Choose a valid pickup location.')
  }
  if (input.notes.length > 2000) {
    throw new CustomerOrderCreateError('Pickup instructions must be no more than 2,000 characters.')
  }
  if (!Number.isSafeInteger(input.subscriptionBorrowConsentUnits) || input.subscriptionBorrowConsentUnits < 0) {
    throw new CustomerOrderCreateError('Subscription borrowing consent is invalid.')
  }
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 100) {
    throw new CustomerOrderCreateError('Add at least one item to the order.')
  }

  const items = input.items.map((value: unknown): CustomerOrderCreateItem => {
    if (!value || typeof value !== 'object') {
      throw new CustomerOrderCreateError('One or more order items are invalid.')
    }

    const item = value as Record<string, unknown>
    if (
      typeof item.categoryId !== 'string' ||
      !uuidPattern.test(item.categoryId) ||
      !isOrderService(item.service) ||
      !Number.isSafeInteger(item.quantity) ||
      Number(item.quantity) < 1 ||
      Number(item.quantity) > 2147483647
    ) {
      throw new CustomerOrderCreateError('One or more order items are invalid.')
    }

    return {
      categoryId: item.categoryId,
      service: item.service,
      quantity: Number(item.quantity),
    }
  })

  const lineKeys = items.map((item) => `${item.categoryId}:${item.service}`)
  if (new Set(lineKeys).size !== lineKeys.length) {
    throw new CustomerOrderCreateError('Each category and service combination can only be added once.')
  }

  const mixedServiceLines = items.map((item) => ({
    category: item.categoryId,
    service: item.service === 'wash_iron' ? 'Wash + Iron' : item.service,
    quantity: item.quantity,
  }))
  if (
    getMixedServiceGroups(mixedServiceLines).length > 0 &&
    !hasMinimumMixedServiceInstructions(input.notes)
  ) {
    throw new CustomerOrderCreateError(
      `Mixed-service instructions must contain at least ${MIN_MIXED_SERVICE_INSTRUCTION_LENGTH} characters.`,
    )
  }

  return sql.begin(async (tx) => {
    await tx`set local statement_timeout = '15s'`

    const [location] = await tx`
      select id
      from pickup_locations
      where id = ${input.pickupLocationId}
        and active = true
      for share
    `
    if (!location) throw new CustomerOrderCreateError('Choose an active pickup location.')

    const categoryIds = [...new Set(items.map((item) => item.categoryId))]
    const categories = await tx`
      select category.id,
             category.active,
             rates.subscription_units,
             rates.wash_price,
             rates.iron_price,
             rates.wash_iron_price
      from cloth_categories category
      left join cloth_category_rates rates on rates.category_id = category.id
      where category.id in ${tx(categoryIds)}
      for share of category
    `
    const categoryById = new Map(categories.map((category) => [category.id, category]))

    for (const item of items) {
      const category = categoryById.get(item.categoryId)
      const price =
        item.service === 'wash'
          ? Number(category?.wash_price)
          : item.service === 'iron'
            ? Number(category?.iron_price)
            : Number(category?.wash_iron_price)
      if (!category || !category.active || Number(category.subscription_units) <= 0 || !Number.isFinite(price) || price <= 0) {
        throw new CustomerOrderCreateError('One or more selected laundry categories are no longer available.')
      }
    }

    await tx`
      update profiles
      set pickup_location_id = ${input.pickupLocationId}
      where id = ${input.customerId}
        and pickup_location_id is null
    `

    const distinctServices = [...new Set(items.map((item) => item.service))]
    const orderType = distinctServices.length > 1 ? 'mixed' : distinctServices[0] === 'wash_iron' ? 'wash_iron' : 'wash'
    const [order] = await tx`
      insert into orders (
        customer_id,
        order_type,
        clothes_count_customer,
        clothes_count_customer_units,
        status,
        notes,
        pickup_location_id,
        is_subscription_order,
        subscription_borrow_consent_units,
        billed_extra_amount
      )
      values (
        ${input.customerId},
        ${orderType},
        0,
        0,
        'pending_pickup',
        ${input.notes.trim() || null},
        ${input.pickupLocationId},
        false,
        ${input.subscriptionBorrowConsentUnits},
        null
      )
      returning id
    `

    for (const item of items) {
      await tx`
        insert into order_items (order_id, category_id, quantity, service)
        values (${order.id}, ${item.categoryId}, ${item.quantity}, ${item.service})
      `
    }

    const [savedOrder] = await tx`
      select id, public_order_number
      from orders
      where id = ${order.id}
    `

    return { orderId: savedOrder.id, publicOrderNumber: savedOrder.public_order_number }
  })
}
