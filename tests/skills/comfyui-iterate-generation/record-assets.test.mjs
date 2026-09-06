import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const assets = resolve(import.meta.dirname, '../../../.agents/skills/comfyui-iterate-generation/assets')
const contract = JSON.parse(readFileSync(resolve(assets, 'record-contract.json'), 'utf8'))
const defaults = JSON.parse(readFileSync(resolve(assets, 'defaults.json'), 'utf8'))

function visit(value, callback) {
  if (value === null || typeof value !== 'object') return
  callback(value)
  Object.values(value).forEach(child => visit(child, callback))
}

describe('iteration record assets', () => {
  it('resolves every local definition reference and every required property', () => {
    visit(contract, value => {
      if (value.$ref !== undefined) {
        expect(value.$ref.startsWith('#/$defs/')).toBe(true)
        expect(contract.$defs).toHaveProperty(value.$ref.slice('#/$defs/'.length))
      }
      if (value.required !== undefined) {
        expect(new Set(value.required).size).toBe(value.required.length)
        for (const property of value.required) expect(value.properties).toHaveProperty(property)
      }
      if (value.enum !== undefined) expect(new Set(value.enum).size).toBe(value.enum.length)
    })
  })

  it('keeps adjustable defaults in the settings definition with valid scalar values', () => {
    const settings = contract.$defs.settings
    expect(Object.keys(defaults).sort()).toEqual(Object.keys(settings.properties).sort())
    for (const [key, value] of Object.entries(defaults)) {
      const property = settings.properties[key]
      if (property.anyOf !== undefined) {
        expect(value).toBeNull()
        expect(property.anyOf.some(option => option.type === 'null')).toBe(true)
      } else {
        expect(typeof value).toBe('number')
        expect(Number.isInteger(value)).toBe(true)
        expect(value).toBeGreaterThanOrEqual(property.minimum)
      }
    }
    expect(defaults.revalidation_min_passed).toBeLessThanOrEqual(defaults.revalidation_images_per_batch)
  })
})
