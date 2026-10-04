export type SubscriptionService = 'wash' | 'iron' | 'wash_iron'

export type SubscriptionBillingItem = {
  id: string
  service: SubscriptionService
  quantity: number
  unitsPerItem: number
  regularPrice: number
  regularWashPrice: number
  regularIronPrice: number
  subscriberWashPrice: number
  subscriberIronPrice: number
  subscriberWashIronPrice: number
}

export type SubscriptionCoverage = { wash: boolean; iron: boolean }

type AllocationCandidate = { id: string; quantity: number; units: number; avoidedAmount: number }

function allocateCoveredQuantities(candidates: AllocationCandidate[], remainingUnits: number) {
  const capacity = Math.max(0, Math.floor(remainingUnits))
  let states: Array<{ avoidedAmount: number; quantities: number[] } | null> = Array.from({ length: capacity + 1 }, () => null)
  states[0] = { avoidedAmount: 0, quantities: candidates.map(() => 0) }

  for (let itemIndex = 0; itemIndex < candidates.length; itemIndex += 1) {
    const item = candidates[itemIndex]
    const nextStates = states.map((state) => state && { avoidedAmount: state.avoidedAmount, quantities: [...state.quantities] })
    const maxQuantity = Math.min(item.quantity, Math.floor(capacity / item.units))

    for (let usedUnits = 0; usedUnits <= capacity; usedUnits += 1) {
      const state = states[usedUnits]
      if (!state) continue
      for (let quantity = 1; quantity <= maxQuantity && usedUnits + quantity * item.units <= capacity; quantity += 1) {
        const nextUsedUnits = usedUnits + quantity * item.units
        const candidate = {
          avoidedAmount: state.avoidedAmount + quantity * item.avoidedAmount,
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
    const bestUnits = best ? best.quantities.reduce((total, quantity, index) => total + quantity * candidates[index].units, 0) : -1
    const stateUnits = state.quantities.reduce((total, quantity, index) => total + quantity * candidates[index].units, 0)
    if (!best || stateUnits > bestUnits || (stateUnits === bestUnits && state.avoidedAmount > best.avoidedAmount)) return state
    return best
  }, null)

  return new Map(candidates.map((candidate, index) => [candidate.id, selected?.quantities[index] ?? 0]))
}

export function calculateSubscriptionBilling(
  items: readonly SubscriptionBillingItem[],
  coverage: SubscriptionCoverage,
  remainingUnits: number,
) {
  const candidates: AllocationCandidate[] = []
  for (const item of items) {
    if (item.service === 'wash' && coverage.wash)
      candidates.push({ id: item.id, quantity: item.quantity, units: item.unitsPerItem, avoidedAmount: item.regularPrice })
    else if (item.service === 'iron' && coverage.iron)
      candidates.push({ id: item.id, quantity: item.quantity, units: item.unitsPerItem, avoidedAmount: item.regularPrice })
    else if (item.service === 'wash_iron' && coverage.wash && coverage.iron)
      candidates.push({ id: item.id, quantity: item.quantity, units: item.unitsPerItem, avoidedAmount: item.regularPrice })
    else if (item.service === 'wash_iron' && coverage.wash)
      candidates.push({ id: `${item.id}:wash`, quantity: item.quantity, units: item.unitsPerItem, avoidedAmount: item.regularWashPrice })
    else if (item.service === 'wash_iron' && coverage.iron)
      candidates.push({ id: `${item.id}:iron`, quantity: item.quantity, units: item.unitsPerItem, avoidedAmount: item.regularIronPrice })
  }

  const covered = allocateCoveredQuantities(candidates, remainingUnits)
  const lines = items.map((item) => {
    const coveredQuantity = covered.get(item.id) ?? covered.get(`${item.id}:wash`) ?? covered.get(`${item.id}:iron`) ?? 0
    let subscriberAmount = 0
    let regularAmount = 0

    if (item.service === 'wash') {
      if (coverage.wash) subscriberAmount = (item.quantity - coveredQuantity) * item.subscriberWashPrice
      else regularAmount = item.quantity * item.regularPrice
    } else if (item.service === 'iron') {
      if (coverage.iron) subscriberAmount = (item.quantity - coveredQuantity) * item.subscriberIronPrice
      else regularAmount = item.quantity * item.regularPrice
    } else if (coverage.wash && coverage.iron) {
      subscriberAmount = (item.quantity - coveredQuantity) * item.subscriberWashIronPrice
    } else if (coverage.wash) {
      subscriberAmount = (item.quantity - coveredQuantity) * item.subscriberWashPrice
      regularAmount = item.quantity * item.regularIronPrice
    } else if (coverage.iron) {
      subscriberAmount = (item.quantity - coveredQuantity) * item.subscriberIronPrice
      regularAmount = item.quantity * item.regularWashPrice
    } else {
      regularAmount = item.quantity * item.regularPrice
    }

    return {
      id: item.id,
      service: item.service,
      quantity: item.quantity,
      coveredQuantity,
      coveredUnits: coveredQuantity * item.unitsPerItem,
      subscriberAmount,
      regularAmount,
      totalAmount: subscriberAmount + regularAmount,
    }
  })

  return {
    lines,
    coveredUnits: lines.reduce((total, line) => total + line.coveredUnits, 0),
    subscriberAmount: lines.reduce((total, line) => total + line.subscriberAmount, 0),
    regularAmount: lines.reduce((total, line) => total + line.regularAmount, 0),
    totalAmount: lines.reduce((total, line) => total + line.totalAmount, 0),
  }
}