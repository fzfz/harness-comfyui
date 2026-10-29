import { describe, expect, it } from 'vitest'
import definition from '../../config/managed-cli-help.json' with { type: 'json' }
import { parseHelpDefinition, parseManagedHelpDefinition } from '../../scripts/cli/help-schema.mjs'
import { renderHelp, helpHint } from '../../scripts/cli/help.mjs'
import { renderCommandContract } from '../../scripts/cli/contract-help.mjs'

describe('managed CLI help contract', () => {
  it('renders required nullable fields and nested template choices for CLI consumers', () => {
    const lines = renderCommandContract('generation inspect-template-parameters')
    expect(lines).toContain('parameters[].current_value: JSON value；必填。')
    expect(lines).toContain('parameters[].allowed_values: JSON value[]；可选。')
    expect(lines).toContain('size_candidates[].mapped_options[].value: JSON value；必填。')
    expect(lines).toContain('size_candidates[].mapped_options[].width: integer；必填，数值至少 1。')
    expect(renderCommandContract('generation submit')).toContain('items[].request.model: object | null；必填。')
  })


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
  it('keeps the result-file protocol at root and links command help to the root', () => {
    expect(renderHelp(definition, ['--help'])).toContain('stdout 只返回该文件的绝对路径和换行')
    for (const command of [['image', 'inspect'], ['generation', 'submit'], ['generation', 'inspect-template-parameters'], ['generation', 'random-seeds'], ['generation', 'run-inputs'], ['generation', 'resolve-media']]) {
      const output = renderHelp(definition, [...command, '--help'])
      expect(output).toContain('公共文件协议')
      expect(output).not.toContain('stdout 只返回该文件的绝对路径和换行')
    }
  })
  it('accepts the configured command tree', () => {
    expect(parseManagedHelpDefinition(definition)).toBe(definition)
  })
  it.each(['splitCommand', 'invalidProperties', 'providerFailure', 'protocolFailure', 'resultFilePrepareFailed', 'resultFileWriteFailed', 'resultPathWriteFailed', 'requestTooLarge', 'responseTooLarge', 'invalidApiUrl', 'nonLoopbackApi', 'environmentRecovery', 'generationWaitUnavailable'])('requires message %s', key => {
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
