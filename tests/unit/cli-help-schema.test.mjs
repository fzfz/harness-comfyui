import { describe, expect, it } from 'vitest'
import definition from '../../config/managed-cli-help.json' with { type: 'json' }
import { parseHelpDefinition, parseManagedHelpDefinition } from '../../scripts/cli/help-schema.mjs'
import { renderHelp, helpHint } from '../../scripts/cli/help.mjs'

describe('managed CLI help contract', () => {
  it('exposes only supported business commands through root, category and command help', () => {
    for (const command of [
      [], ['image'], ['image', 'inspect'], ['generation'], ['generation', 'submit'],
      ['generation', 'inspect-template-parameters'], ['generation', 'random-seeds'],
      ['generation', 'run-inputs'], ['generation', 'resolve-media'],
    ]) {
      const output = renderHelp(definition, [...command, '--help'])
      expect(output).not.toMatch(/catalog|imagegen-semantic-query|DSH_HARNESS_COMFYUI_SOURCE_/u)
      expect(helpHint(definition, command)).not.toContain('catalog')
    }
  })
  it('guides every command through the Host executable without requiring system Node', () => {
    const invocation = 'ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI"'
    expect(renderHelp(definition, ['generation', 'run-inputs', '--help'])).toContain(`${invocation} generation run-inputs`)
    expect(helpHint(definition, ['generation', 'run-inputs'])).toBe(`Next: ${invocation} generation run-inputs --help`)
  })
  it('defines the result-file protocol once and exposes it from every business command help', () => {
    for (const command of [['image', 'inspect'], ['generation', 'submit'], ['generation', 'inspect-template-parameters'], ['generation', 'random-seeds'], ['generation', 'run-inputs'], ['generation', 'resolve-media']]) {
      const output = renderHelp(definition, [...command, '--help'])
      expect(output).toContain('stdout 只返回该文件的绝对路径和换行')
      expect(output).toContain('业务命令退出码为 0')
      expect(output).toContain('CLI_RESULT_FILE_PREPARE_FAILED')
      expect(output).toContain('CLI_RESULT_FILE_WRITE_FAILED')
      expect(output).toContain('CLI_RESULT_PATH_WRITE_FAILED')
      expect(output).not.toContain('stdout JSON')
    }
  })
  it('accepts the configured command tree', () => {
    expect(parseManagedHelpDefinition(definition)).toBe(definition)
  })
  it.each(['splitCommand', 'invalidProperties', 'providerFailure', 'resultFilePrepareFailed', 'resultFileWriteFailed', 'resultPathWriteFailed', 'requestTooLarge', 'responseTooLarge', 'invalidApiUrl', 'nonLoopbackApi', 'environmentRecovery'])('requires message %s', key => {
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
    delete data.nodes.generation
    expect(() => parseHelpDefinition(data)).toThrow('parent')
    const invalid = { ...definition, commonDetails: [false] }
    expect(() => parseHelpDefinition(invalid)).toThrow('commonDetails')
  })
})
