export type MixedServiceLine = {
  category: string
  service: string
  quantity: number
}

export type MixedServiceGroup = {
  category: string
  services: Array<{ service: string; quantity: number }>
}

export const MIN_MIXED_SERVICE_INSTRUCTION_LENGTH = 20

const serviceLabels: Record<string, string> = {
  wash: 'Wash',
  iron: 'Iron',
  wash_iron: 'Wash + Iron',
  'wash + iron': 'Wash + Iron',
}

export function getMixedServiceGroups(lines: readonly MixedServiceLine[]): MixedServiceGroup[] {
  const categoryGroups = new Map<string, MixedServiceGroup>()

  for (const line of lines) {
    const categoryKey = line.category.trim().toLocaleLowerCase()
    const serviceKey = line.service.trim().toLocaleLowerCase()
    if (!categoryKey || !serviceKey || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) continue

    const categoryGroup = categoryGroups.get(categoryKey) ?? { category: line.category.trim(), services: [] }
    const serviceLabel = serviceLabels[serviceKey] ?? line.service.trim()
    const existingService = categoryGroup.services.find(
      (service) => service.service.toLocaleLowerCase() === serviceLabel.toLocaleLowerCase(),
    )
    if (existingService) existingService.quantity += line.quantity
    else categoryGroup.services.push({ service: serviceLabel, quantity: line.quantity })
    categoryGroups.set(categoryKey, categoryGroup)
  }

  return [...categoryGroups.values()].filter((group) => group.services.length > 1)
}

export function hasMinimumMixedServiceInstructions(instructions: string): boolean {
  return instructions.trim().length >= MIN_MIXED_SERVICE_INSTRUCTION_LENGTH
}
