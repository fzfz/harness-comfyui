import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { inspectContractConsumer, inspectContractConsumers } from '../../scripts/security/check-contract-boundary.mjs'

it('removes retired schema and conversion entry points', () => {
  for (const file of ['src/host/workbench/tool-schema.ts','src/shared/field-contract.ts','src/workbench/schema.ts','src/workbench/agent-model-schema.ts','src/cli/input-schema.ts','src/cli/result-schema.ts','src/cli/submission-fields.ts','src/generation/json-contract.ts','src/generation/lora-contract.ts','src/generation/run-wait-contract.ts','scripts/cli/contract-help.mjs','scripts/cli/generation-manifest.mjs','scripts/cli/workbench-request.mjs']) expect(existsSync(resolve(file)), file).toBe(false)
})
describe('contract module dependency ownership', () => {
  it.each([
    "import { schema } from './contracts/internal/schema.ts'",
    "export { schema } from '#contracts/internal/schema'",
    "import type { Shape } from './contracts/internal/schema.ts'",
    "const source = await import('./contracts/index.ts')",
    "const source = require('./contracts/internal/schema.ts')",
    "readFileSync('src/contracts/internal/schema.ts', 'utf8')",
    "const file = 'src/contracts/' + 'internal/schema.ts'; readFile(file)",
    "function convert(schema) { return { oneOf: schema.list.map(convert) } }",
    "type Shape = import('./contracts/internal/schema.ts').Shape",
    "import { readFile as read } from 'node:fs/promises'; const source = './contracts/internal/schema.ts'; read(source)",
    "import { join as at } from 'node:path'; readFile(at('src', 'contracts', 'internal', 'schema.ts'))",
    "const target = new URL('./contracts/internal/schema.ts', import.meta.url); const openSource = readFileSync; openSource(target)",
    "const root = './contracts/'; const file = `${root}internal/schema.ts`; import(file)",
    "function convert(schema) { return schema.meta.required && schema.dict }",
    "function convert(schema) { return schema['inner'] }",
    "const schema = {}; schema.oneOf = variants",
    "const { dict } = schema; return dict",
    "const { 'dict': fields } = schema; return fields",
    "const key = 'in' + 'ner'; const { [key]: fields } = schema; return fields",
    "const shape = { ['one' + 'Of']: variants }",
    "const { readFileSync: load } = require('node:fs'); load('src/contracts/internal/schema.ts')",
    "import Schema from '@deepseek-ai/schemastery'; export const input = Schema.object({title:Schema.string()})",
  ])('rejects a private rule access or independent projection: %s', source => {
    expect(inspectContractConsumer('src/probe.ts', source)).not.toEqual([])
  })
  it.each([
    "export { contracts } from '#contracts'",
    "export type { JsonValue } from '#contracts'",
    "export * from '#contracts'",
    "import { contracts as api } from '#contracts'; export { api }",
    "import { contracts } from '#contracts'; export const api = contracts",
    "import { contracts } from '#contracts'; const { parse } = contracts; export { parse }",
    "import * as api from '#contracts'; export default api",
    "import type { JsonValue as Value } from '#contracts'; export type Copy = Value",
    "const api = await import('#contracts'); export { api }",
    "import { contracts } from '#contracts'; export const api = { parse: contracts.parse }",
    "const { contracts: api } = require('#contracts'); export { api }",
  ])('rejects a public API or raw type forwarding: %s', source => {
    expect(inspectContractConsumer('src/forward.ts', source)).not.toEqual([])
  })
  it('rejects consumers behind relative and multi-hop forwarding modules', () => {
    const sources = new Map([
      ['src/forward.ts', "import { contracts as api } from '#contracts'; const shared = api; export { shared as contracts }"],
      ['src/bridge.ts', "export { contracts } from './forward.ts'"],
      ['src/consumer.ts', "import { contracts } from './bridge.ts'; contracts.parse('taskDraft', 'input', value)"],
      ['src/types.ts', "export type { JsonValue as Value } from '#contracts'"],
      ['src/type-consumer.ts', "import type { Value } from './types.ts'"],
      ['src/dynamic.ts', "const api = await import('./bridge.ts')"],
      ['src/required.ts', "const api = require('./bridge.ts')"],
      ['src/type-query.ts', "type Value = import('./types.ts').Value"],
    ])
    for (const file of ['src/consumer.ts', 'src/type-consumer.ts', 'src/dynamic.ts', 'src/required.ts', 'src/type-query.ts']) expect(inspectContractConsumer(file, sources.get(file), sources)).not.toEqual([])
  })
  it('accepts public derived domain types', () => {
    expect(inspectContractConsumer('src/contract.ts', "import type { ContractValue } from '#contracts'; export type Task = ContractValue<'task'>")).toEqual([])
  })
  it('accepts calls through the single named module', () => {
    expect(inspectContractConsumer('src/probe.ts', "import { contracts } from '#contracts'; contracts.parse('taskDraft', 'input', value)")).toEqual([])
  })
  it.each([
    "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts'; const field = Schema.transform(Schema.any(), value => contracts.parse('imageReaderPrompt', 'input', value))",
    "import z from '@deepseek-ai/schemastery'; import { contracts as api } from '#contracts'; const decode = api.parse; const adapt = z.transform; const validate = value => decode('imageReaderPrompt', 'input', value); adapt(z.any(), validate)",
    "import z from '@deepseek-ai/schemastery'; import { contracts } from '#contracts'; function validate(value) { return contracts.parse('imageReaderPrompt', 'input', value) }; z.transform(z.any(), validate)",
    "import z from '@deepseek-ai/schemastery'; import * as module from '#contracts'; z.extend('prompt', value => module.contracts.parse('imageReaderPrompt', 'input', value))",
    "import z from '@deepseek-ai/schemastery'; import { contracts } from '#contracts'; const { parse: decode } = contracts; const { transform: adapt } = z; adapt(z.any(), value => decode('imageReaderPrompt', 'input', value))",
    "import z from '@deepseek-ai/schemastery'; import { contracts } from '#contracts'; function validate(value) { return contracts.parse('imageReaderPrompt', 'input', value) }; z.transform(z.any(), value => validate(value))",
  ])('rejects contract parsing inside a consumer Schema callback: %s', source => {
    expect(inspectContractConsumer('src/image-reader/settings.ts', source)).toEqual([expect.stringContaining("Mount contracts.bind(contractId, 'settings')")])
  })
  it.each([
    "import Schema from '@deepseek-ai/schemastery'; const field = Schema.transform(Schema.string(), value => value.trim())",
    "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts'; const field = Schema.object({ defaultPrompt: contracts.bind('imageReaderDefaultPrompt', 'settings') })",
    "import { contracts } from '#contracts'; const draft = contracts.parse('taskDraft', 'input', input)",
    "const api = { parse: value => value }; const other = { transform: (_schema, callback) => callback('prompt') }; other.transform(null, value => api.parse(value))",
    "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts'; Schema.transform(Schema.any(), contracts => contracts.parse('unrelated value'))",
    "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts'; Schema.transform(Schema.any(), value => [value].map(contracts => contracts.parse('unrelated value')))",
  ])('allows independent configuration callbacks and direct module consumption: %s', source => {
    expect(inspectContractConsumer('src/image-reader/settings.ts', source)).toEqual([])
  })
  it.each([
    "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts'; function unrelated() { const contracts = { parse: x => x } }; Schema.transform(Schema.any(), value => contracts.parse('imageReaderPrompt', 'input', value), true)",
    "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts'; { const contracts = { parse: x => x } }; Schema.transform(Schema.any(), value => contracts.parse('imageReaderPrompt', 'input', value))",
    "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts'; const decode = contracts.parse; function unrelated() { const decode = value => value }; Schema.transform(Schema.any(), value => decode('imageReaderPrompt', 'input', value))",
    "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts'; function validate(value) { return contracts.parse('imageReaderPrompt', 'input', value) }; function unrelated() { function validate(value) { return value } }; Schema.transform(Schema.any(), validate)",
    "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts'; function unrelated() { const Schema = { transform: (_schema, callback) => callback(null) } }; Schema.transform(Schema.any(), value => contracts.parse('imageReaderPrompt', 'input', value))",
    "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts'; function validate(value) { return contracts.parse('imageReaderPrompt', 'input', value) }; Schema.transform(Schema.any(), contracts => validate(contracts))",
  ])('preserves imported contract provenance across unrelated lexical bindings: %s', source => {
    expect(inspectContractConsumer('src/image-reader/settings.ts', source)).toEqual([expect.stringContaining("Mount contracts.bind(contractId, 'settings')")])
  })
  it.each([
    "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts'; function make(contracts) { const decode = contracts.parse; return Schema.transform(Schema.any(), value => decode(value), true) }",
    "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts'; { const contracts = { parse: x => x }; const decode = contracts.parse; Schema.transform(Schema.any(), value => decode(value)) }",
    "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts'; for (const contracts of values) { const decode = contracts.parse; Schema.transform(Schema.any(), value => decode(value)) }",
    "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts'; function make({ contracts }) { const { parse: decode } = contracts; return Schema.transform(Schema.any(), value => decode(value)) }",
    "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts'; function make(Schema) { return Schema.transform(Schema.any(), value => contracts.parse('imageReaderPrompt', 'input', value)) }",
  ])('respects function, block and loop bindings before following contract aliases: %s', source => {
    expect(inspectContractConsumer('src/image-reader/settings.ts', source)).toEqual([])
  })
  it.each([
    "const file = 'src/contracts/internal/schema.ts'; function unrelated() { const file = 'public.json' }; readFileSync(file)",
    "import { join as at } from 'node:path'; function unrelated() { const at = () => 'public.json' }; readFileSync(at('src', 'contracts', 'internal', 'schema.ts'))",
    "const load = readFileSync; function unrelated() { const load = value => value }; load('src/contracts/internal/schema.ts')",
  ])('preserves lexical binding identity in file paths and reader aliases: %s', source => {
    expect(inspectContractConsumer('src/probe.ts', source)).not.toEqual([])
  })
  it.each([
    "const file = 'src/contracts/internal/schema.ts'; function readPublic(file) { readFileSync(file) }",
    "import { readFileSync as load } from 'node:fs'; function readPublic(load) { load('src/contracts/internal/schema.ts') }",
  ])('respects lexical shadowing in file paths and reader aliases: %s', source => {
    expect(inspectContractConsumer('src/probe.ts', source)).toEqual([])
  })
  const transparentExpressions = [
    ['parentheses', expression => `(${expression})`],
    ['as assertion', expression => `(${expression} as unknown)`],
    ['type assertion', expression => `(<unknown>(${expression}))`],
    ['satisfies', expression => `(${expression} satisfies unknown)`],
    ['non-null assertion', expression => `(${expression})!`],
    ['nested wrappers', expression => `((<unknown>((${expression}) satisfies unknown)) as unknown)!`],
  ]
  it.each(transparentExpressions)('follows transparent %s in callbacks, aliases and forwarding', (_name, wrap) => {
    const imports = "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts';"
    const callback = "value => contracts.parse('imageReaderPrompt', 'input', value)"
    for (const statement of [
      `Schema.transform(Schema.any(), ${wrap(callback)})`,
      `const validate = ${wrap(callback)}; Schema.transform(Schema.any(), validate)`,
      `function validate(value) { return contracts.parse('imageReaderPrompt', 'input', value) }; Schema.transform(Schema.any(), ${wrap('validate')})`,
      `const decode = ${wrap('contracts.parse')}; const adapt = ${wrap('Schema.transform')}; adapt(Schema.any(), value => decode('imageReaderPrompt', 'input', value))`,
      `const validate = ${callback}; Schema.transform(Schema.any(), value => ${wrap('validate')}(value))`,
    ]) {
      expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} ${statement}`), statement).toEqual([expect.stringContaining("Mount contracts.bind(contractId, 'settings')")])
    }
    expect(inspectContractConsumer('src/forward.ts', `import { contracts } from '#contracts'; export const api = ${wrap('contracts')}`)).not.toEqual([])
  })
  it.each(transparentExpressions)('preserves lexical shadows through transparent %s', (_name, wrap) => {
    const imports = "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts';"
    expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} function make(contracts) { const decode = ${wrap('contracts.parse')}; const validate = ${wrap('value => decode(value)')}; return Schema.transform(Schema.any(), ${wrap('validate')}) }`)).toEqual([])
    expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} function make(Schema) { const adapt = ${wrap('Schema.transform')}; return adapt(Schema.any(), value => contracts.parse('imageReaderPrompt', 'input', value)) }`)).toEqual([])
  })
  it.each([
    ["'parse'", "'transform'"],
    ['"parse"', '"transform"'],
    ["['parse']", "['transform']"],
    ["['pa' + 'rse']", "['trans' + 'form']"],
    ['[parseKey]', '[transformKey]'],
    ['[`pa${suffix}`]', '[`trans${ending}`]'],
  ])('reads static destructuring properties %s and %s as AST values', (parse, transform) => {
    const imports = "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts';"
    const constants = "const parseKey = 'parse'; const transformKey = 'transform'; const suffix = 'rse'; const ending = 'form';"
    const statement = `const { ${parse}: decode } = contracts; const { ${transform}: adapt } = Schema; adapt(Schema.any(), value => decode('imageReaderPrompt', 'input', value))`
    expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} ${constants} ${statement}`)).toEqual([expect.stringContaining("Mount contracts.bind(contractId, 'settings')")])
    expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} ${constants} function make(contracts) { ${statement} }`)).toEqual([])
  })
  it.each([
    "contracts.parse.bind(contracts, 'imageReaderPrompt', 'input')",
    "value => contracts.parse.call(contracts, 'imageReaderPrompt', 'input', value)",
    "value => contracts.parse.apply(contracts, ['imageReaderPrompt', 'input', value])",
    "value => invoke(contracts.parse, 'imageReaderPrompt', 'input', value)",
    "value => { const parser = contracts.parse; return invoke(parser, 'imageReaderPrompt', 'input', value) }",
    "(value = contracts.parse('imageReaderPrompt', 'input', initial)) => value",
  ])('follows direct parser references in callback binding and invocation: %s', callback => {
    const imports = "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts';"
    const expression = `(${callback})`
    expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} Schema.transform(Schema.any(), ${expression})`)).toEqual([expect.stringContaining("Mount contracts.bind(contractId, 'settings')")])
    expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} function make(contracts) { return Schema.transform(Schema.any(), ${expression}) }`)).toEqual([])
  })
  it('follows generic function instantiation without losing lexical binding identity', () => {
    const imports = "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts';"
    expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} const validate = <T>(value: T) => contracts.parse('imageReaderPrompt', 'input', value); Schema.transform(Schema.any(), validate<unknown>)`)).toEqual([expect.stringContaining("Mount contracts.bind(contractId, 'settings')")])
    expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} function make(contracts) { const validate = <T>(value: T) => contracts.parse(value); return Schema.transform(Schema.any(), validate<unknown>) }`)).toEqual([])
  })
  it.each(["'readFileSync'", "['read' + 'FileSync']"])('uses the same static property values for reader aliases: %s', key => {
    expect(inspectContractConsumer('src/probe.ts', `const { ${key}: load } = require('node:fs'); load('src/contracts/internal/schema.ts')`)).not.toEqual([])
  })
  it.each([
    "const Schema = require('@deepseek-ai/schemastery'); const { contracts } = require('#contracts');",
    "const Schema = require('@deepseek-ai/schemastery').default; const contracts = require('#contracts').contracts;",
    "const load = require; const id = '#' + 'contracts'; const Schema = load('@deepseek-ai/schemastery'); const { contracts } = load(id);",
    "const Schema = (await import('@deepseek-ai/schemastery')).default; const { contracts } = await import('#contracts');",
    "const { default: Schema } = await import('@deepseek-ai/schemastery'); const api = await import('#contracts'); const { contracts } = api;",
    "import { createRequire as from } from 'node:module'; const load = from(import.meta.url); const Schema = load('@deepseek-ai/schemastery'); const { contracts } = load('#contracts');",
    "import * as module from 'node:module'; const require = module.createRequire(import.meta.url); const Schema = require('@deepseek-ai/schemastery'); const { contracts } = require('#contracts');",
  ])('follows static module loaders and preserves lexical shadows: %s', imports => {
    const call = "Schema.transform(Schema.any(), value => contracts.parse('imageReaderPrompt', 'input', value))"
    expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} ${call}`)).toEqual([expect.stringContaining("Mount contracts.bind(contractId, 'settings')")])
    expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} function make(contracts) { return ${call} }`)).toEqual([])
    expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} function make(Schema) { return ${call} }`)).toEqual([])
  })
  it.each([
    "function make(require) { const Schema = require('@deepseek-ai/schemastery'); const { contracts } = require('#contracts'); return Schema.transform(Schema.any(), value => contracts.parse(value)) }",
    "const require = name => service(name); const Schema = require('@deepseek-ai/schemastery'); const { contracts } = require('#contracts'); Schema.transform(Schema.any(), value => contracts.parse(value))",
    "function require(name) { return service(name) }; const Schema = require('@deepseek-ai/schemastery'); const { contracts } = require('#contracts'); Schema.transform(Schema.any(), value => contracts.parse(value))",
    "const Schema = require('@deepseek-ai/schemastery'); function make(require) { const { contracts } = require('#contracts'); return Schema.transform(Schema.any(), value => contracts.parse(value)) }",
  ])('respects a locally bound require before assigning a module source: %s', source => {
    expect(inspectContractConsumer('src/image-reader/settings.ts', source)).toEqual([])
  })
  it.each([
    "const { contracts: { parse: decode } } = api;",
    "const { 'contracts': { 'parse': decode } } = api;",
    "const parseKey = 'parse'; const { ['con' + 'tracts']: { [parseKey]: decode } } = api;",
    "const { contracts: { ...copy } } = api; const decode = copy.parse;",
    "const { ...copy } = api; const { contracts: { parse: decode } } = copy;",
    "const { describe: ignored, ...copy } = api.contracts; const decode = copy.parse;",
    "const { contracts: { describe: ignored, ...copy } } = api; const decode = copy.parse;",
  ])('follows recursive destructuring paths and object rest copies: %s', bindings => {
    const imports = "import Schema from '@deepseek-ai/schemastery'; import * as api from '#contracts';"
    const call = "Schema.transform(Schema.any(), value => decode('imageReaderPrompt', 'input', value))"
    expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} ${bindings} ${call}`)).toEqual([expect.stringContaining("Mount contracts.bind(contractId, 'settings')")])
    expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} function make(api) { ${bindings} return ${call} }`)).toEqual([])
  })
  it.each([
    "const { contracts: { parse: removed, ...copy } } = api; const decode = copy.parse;",
    "const { contracts: removed, ...copy } = api; const decode = copy.contracts.parse;",
  ])('excludes removed properties from an object rest source: %s', bindings => {
    const imports = "import Schema from '@deepseek-ai/schemastery'; import * as api from '#contracts';"
    expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} ${bindings} Schema.transform(Schema.any(), value => decode(value))`)).toEqual([])
  })
  it.each([
    ["function validate(value: string): string; function validate(value: unknown) { return contracts.parse('imageReaderPrompt', 'input', value) }", 'validate'],
    ["const validate = function named(value) { return contracts.parse('imageReaderPrompt', 'input', value) }", 'validate'],
    ["const handlers = { validate(value) { return contracts.parse('imageReaderPrompt', 'input', value) } }", 'handlers.validate'],
    ["const handlers = { validate: value => contracts.parse('imageReaderPrompt', 'input', value) }", 'handlers.validate'],
    ["function validate(value) { return contracts.parse('imageReaderPrompt', 'input', value) }; const handlers = { validate }", 'handlers.validate'],
    ["class Handlers { static validate(value) { return contracts.parse('imageReaderPrompt', 'input', value) } }", 'Handlers.validate'],
    ["class Handlers { validate(value: string): string; validate(value: unknown) { return contracts.parse('imageReaderPrompt', 'input', value) } }; const handlers = new Handlers()", 'handlers.validate'],
    ["class Handlers { validate = value => contracts.parse('imageReaderPrompt', 'input', value) }; const handlers = new Handlers()", 'handlers.validate'],
    ["const handlers = { 'validate'(value) { return contracts.parse('imageReaderPrompt', 'input', value) } }", "handlers['validate']"],
    ["const key = 'validate'; const handlers = { [key](value) { return contracts.parse('imageReaderPrompt', 'input', value) } }", 'handlers[key]'],
    ["const handlers = { get validate() { return value => contracts.parse('imageReaderPrompt', 'input', value) } }", 'handlers.validate'],
    ["const handlers = { validate(value) { return contracts.parse('imageReaderPrompt', 'input', value) } }; const { validate } = handlers", 'validate'],
    ["const handlers = { nested: { validate(value) { return contracts.parse('imageReaderPrompt', 'input', value) } } }; const { nested: { ...copy } } = handlers; const { validate } = copy", 'validate'],
    ["class Handlers { validate(value) { return contracts.parse('imageReaderPrompt', 'input', value) } }; const { validate } = new Handlers()", 'validate'],
  ])('uses the actual implementation declaration for static callbacks: %s', (implementation, callback) => {
    const imports = "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts';"
    const call = `Schema.transform(Schema.any(), ${callback})`
    expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} ${implementation}; ${call}`)).toEqual([expect.stringContaining("Mount contracts.bind(contractId, 'settings')")])
    expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} function make(contracts) { ${implementation}; return ${call} }`)).toEqual([])
  })
  it('follows concrete callback values without assigning an implementation from a type annotation', () => {
    const imports = "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts';"
    const declaration = "const canonical = { validate(value) { return contracts.parse('imageReaderPrompt', 'input', value) } };"
    for (const statement of [
      "function make(handlers: typeof canonical) { return Schema.transform(Schema.any(), handlers.validate) }",
      "function make(handlers: typeof canonical) { const { validate } = handlers; return Schema.transform(Schema.any(), validate) }",
      "const independent = { validate(value) { return value } }; const handlers: typeof canonical = independent; Schema.transform(Schema.any(), handlers.validate)",
    ]) expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} ${declaration} ${statement}`), statement).toEqual([])
  })
  it.each([
    ['safe', false],
    ['unsafe', true],
  ])('tracks the selected %s member without following sibling implementations', (member, rejects) => {
    const imports = "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts';"
    const handlers = "const handlers = { safe: value => value, unsafe: value => contracts.parse('imageReaderPrompt', 'input', value) };"
    for (const statement of [
      `Schema.transform(Schema.any(), handlers.${member})`,
      `Schema.transform(Schema.any(), value => handlers.${member}(value))`,
      `const { ${member}: validate } = handlers; Schema.transform(Schema.any(), validate)`,
      `Schema.transform(Schema.any(), value => { const { ${member}: validate } = handlers; return validate(value) })`,
    ]) {
      const problems = inspectContractConsumer('src/image-reader/settings.ts', `${imports} ${handlers} ${statement}`)
      expect(problems, statement).toEqual(rejects ? [expect.stringContaining("Mount contracts.bind(contractId, 'settings')")] : [])
    }
  })
  it('keeps member owner and invocation argument references in the callback scan', () => {
    const imports = "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts';"
    const handlers = "class Handlers { safe(value) { return value }; unsafe(value) { return contracts.parse('imageReaderPrompt', 'input', value) } };"
    for (const statement of [
      "Schema.transform(Schema.any(), (new Handlers(contracts.parse('imageReaderPrompt', 'input', initial))).safe)",
      "Schema.transform(Schema.any(), value => (new Handlers(contracts.parse('imageReaderPrompt', 'input', value))).safe(value))",
      "const handlers = new Handlers(); Schema.transform(Schema.any(), value => handlers.safe(contracts.parse('imageReaderPrompt', 'input', value)))",
      "const handlers = { safe: value => value }; Schema.transform(Schema.any(), value => ({ selected: contracts.parse('imageReaderPrompt', 'input', value), handlers }).handlers.safe(value))",
    ]) expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} ${handlers} ${statement}`), statement).toEqual([expect.stringContaining("Mount contracts.bind(contractId, 'settings')")])
    expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} ${handlers} Schema.transform(Schema.any(), value => (new Handlers(value)).safe(value))`)).toEqual([])
  })
  it.each([
    ['safe', false],
    ['unsafe', true],
  ])('selects referenced %s implementations consistently for inline and local definitions', (member, rejects) => {
    const imports = "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts';"
    const object = "{ safe: value => value, unsafe: value => contracts.parse('imageReaderPrompt', 'input', value) }"
    for (const statement of [
      `Schema.transform(Schema.any(), (${object}).${member})`,
      `Schema.transform(Schema.any(), value => { const h = ${object}; return h.${member}(value) })`,
      `Schema.transform(Schema.any(), value => { const h = ${object}; const { ${member}: validate } = h; return validate(value) })`,
      `Schema.transform(Schema.any(), value => { function safe(input) { return input }; function unsafe(input) { return contracts.parse('imageReaderPrompt', 'input', input) }; return ${member}(value) })`,
      `Schema.transform(Schema.any(), value => { const safe = input => input; const unsafe = input => contracts.parse('imageReaderPrompt', 'input', input); return ${member}(value) })`,
    ]) {
      const problems = inspectContractConsumer('src/image-reader/settings.ts', `${imports} ${statement}`)
      expect(problems, statement).toEqual(rejects ? [expect.stringContaining("Mount contracts.bind(contractId, 'settings')")] : [])
    }
  })
  it.each([
    ["value => ((input) => contracts.parse('imageReaderPrompt', 'input', input))(value)", true],
    ["value => ((input) => { const unused = item => contracts.parse('imageReaderPrompt', 'input', item); return input })(value)", false],
    ["value => invoke(value, input => contracts.parse('imageReaderPrompt', 'input', input))", true],
    ["value => invoke(value, input => { const unused = item => contracts.parse('imageReaderPrompt', 'input', item); return input })", false],
    ["(value = contracts.parse('imageReaderPrompt', 'input', initial)) => value", true],
    ["(value = () => contracts.parse('imageReaderPrompt', 'input', initial)) => value", false],
  ])('distinguishes invoked or passed functions from unused definitions: %s', (callback, rejects) => {
    const imports = "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts';"
    const problems = inspectContractConsumer('src/image-reader/settings.ts', `${imports} Schema.transform(Schema.any(), ${callback})`)
    expect(problems).toEqual(rejects ? [expect.stringContaining("Mount contracts.bind(contractId, 'settings')")] : [])
  })
  it.each([
    "Schema.transform(Schema.any(), ({ safe: value => value, unsafe: contracts.parse('imageReaderPrompt', 'input', initial) }).safe)",
    "Schema.transform(Schema.any(), value => { const h = { safe: input => input, unsafe: contracts.parse('imageReaderPrompt', 'input', value) }; return h.safe(value) })",
  ])('preserves immediate property evaluation while skipping unused function bodies: %s', statement => {
    const imports = "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts';"
    expect(inspectContractConsumer('src/image-reader/settings.ts', `${imports} ${statement}`)).toEqual([expect.stringContaining("Mount contracts.bind(contractId, 'settings')")])
  })
  it('allows a method callback parameter to shadow the imported module', () => {
    const source = "import Schema from '@deepseek-ai/schemastery'; import { contracts } from '#contracts'; const handlers = { validate(contracts) { return contracts.parse('prompt') } }; Schema.transform(Schema.any(), handlers.validate)"
    expect(inspectContractConsumer('src/image-reader/settings.ts', source)).toEqual([])
  })
  it('allows independent configuration declarations and external protocol handling', () => {
    expect(inspectContractConsumer('src/config/load-profile.ts', 'const fields = schema.dict; return fields')).toEqual([])
    expect(inspectContractConsumer('src/host/source-client/client.ts', 'const schema = { oneOf: variants }; return schema')).toEqual([])
    expect(inspectContractConsumer('src/host/workbench/tools.ts', "import Schema from '@deepseek-ai/schemastery'; export const Config = Schema.object({tools:Schema.array(Schema.string())})")).toEqual([])
    expect(inspectContractConsumer('src/host/generation/generation-service.ts', 'Remote(GenerationRemoteService.prototype.list, descriptor)')).toEqual([])
  })
  it('keeps all application consumers outside module internals', () => {
    const problems = inspectContractConsumers()
    expect(problems).toEqual([])
  })
})
