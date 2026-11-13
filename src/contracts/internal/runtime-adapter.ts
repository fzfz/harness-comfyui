type Direction = 'camel' | 'snake'
export interface GenerationFieldMapping {
  readonly name: string
  readonly omitNull?: Direction
  readonly fields?: Readonly<Record<string, string | GenerationFieldMapping>>
  readonly array?: boolean
}
export type GenerationMapping = Readonly<Record<string, string | GenerationFieldMapping>>

export function remapGeneration(value: Record<string, unknown>, direction: Direction, mapping: GenerationMapping): Record<string, unknown> {
  return Object.fromEntries(Object.entries(mapping).flatMap(([snake, declaration]) => {
    const field = typeof declaration === 'string' ? { name: declaration } : declaration
    const source = direction === 'camel' ? snake : field.name
    const target = direction === 'camel' ? field.name : snake
    if (!Object.hasOwn(value, source)) return []
    const item = value[source]
    if (item === null && field.omitNull === direction) return []
    if (item === null || !field.fields) return [[target, item]]
    const nested = field.fields
    const converted = field.array
      ? (item as Record<string, unknown>[]).map(entry => remapGeneration(entry, direction, nested))
      : remapGeneration(item as Record<string, unknown>, direction, nested)
    return [[target, converted]]
  }))
}
