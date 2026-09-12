import { describe, expect, it } from 'vitest'
import definition from '../../config/managed-cli-help.json' with { type: 'json' }
import { parseHelpDefinition, parseManagedHelpDefinition } from '../../scripts/cli/help-schema.mjs'

describe('managed CLI help contract', () => {
  it('accepts the configured command tree', () => {
    expect(parseManagedHelpDefinition(definition)).toBe(definition)
  })
  it.each(['splitCommand', 'invalidProperties', 'invalidOption', 'emptyResults', 'availableResults', 'providerFailure'])('requires message %s', key => {
    const data = structuredClone(definition)
    delete data.messages[key]
    expect(() => parseManagedHelpDefinition(data)).toThrow(key)
    data.messages[key] = 42
    expect(() => parseManagedHelpDefinition(data)).toThrow()
  })
  it('allows lifecycle help without managed messages', () => {
    const data = structuredClone(definition)
    delete data.messages
    expect(parseHelpDefinition(data)).toBe(data)
    expect(() => parseManagedHelpDefinition(data)).toThrow('splitCommand')
  })
  it('rejects a leaf without a parent and invalid shared details', () => {
    const data = structuredClone(definition)
    delete data.nodes.catalog
    expect(() => parseHelpDefinition(data)).toThrow('parent')
    const invalid = { ...definition, commonDetails: [false] }
    expect(() => parseHelpDefinition(invalid)).toThrow('commonDetails')
  })
})
