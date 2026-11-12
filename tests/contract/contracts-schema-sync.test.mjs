import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import ts from 'typescript'

const execute = promisify(execFile)

async function withSchemaVariant(run) {
  const directory = await mkdtemp(join(tmpdir(), 'contract-schema-sync-'))
  try {
    await Promise.all(['src', 'config'].map(path => cp(resolve(path), join(directory, path), { recursive: true })))
    await cp(resolve('package.json'), join(directory, 'package.json'))
    await symlink(resolve('node_modules'), join(directory, 'node_modules'), 'dir')
    const schemaPath = join(directory, 'src/contracts/internal/schema.ts')
    const source = await readFile(schemaPath, 'utf8')
    await run({ directory, schemaPath, source })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

it('derives types, help and both parsing directions from a single declaration change', async () => {
  await withSchemaVariant(async ({ directory, schemaPath, source }) => {
    const declaration = /question:\s*nonempty\(\)(?=,\s*options:)/gu
    expect([...source.matchAll(declaration)]).toHaveLength(1)
    await writeFile(schemaPath, source.replace(declaration, "question: Schema.const('contract-sync-proof').required()"))
    await writeFile(join(directory, 'probe.mjs'), `
      import assert from 'node:assert/strict'
      import { contracts } from '#contracts'
      for (const direction of ['input', 'output']) {
        assert.equal(contracts.parse('taskArtifact', direction, { type: 'question', question: 'contract-sync-proof' }).question, 'contract-sync-proof')
        assert.throws(() => contracts.parse('taskArtifact', direction, { type: 'question', question: 'different' }))
      }
      assert.ok(contracts.describe('workbench task publish').some(line => line.includes('question: "contract-sync-proof"')))
    `)
    await execute(process.execPath, ['--experimental-strip-types', 'probe.mjs'], { cwd: directory, timeout: 30_000 })
    await writeFile(join(directory, 'types.ts'), `
      import type { ContractValue } from '#contracts'
      type Question = Extract<ContractValue<'taskArtifact'>, { type: 'question' }>['question']
      const accepted: Question = 'contract-sync-proof'
      // @ts-expect-error The changed declaration excludes other strings.
      const rejected: Question = 'different'
    `)
    const configuration = JSON.parse(await readFile(resolve('tsconfig.json'), 'utf8'))
    await writeFile(join(directory, 'tsconfig.json'), JSON.stringify({ compilerOptions: configuration.compilerOptions, files: ['types.ts'] }))
    await execute(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '--project', join(directory, 'tsconfig.json')], { cwd: directory, timeout: 60_000 })
  })
}, 120_000)


it.each([
  { name: 'duplicate branches', schema: "Schema.union([Schema.string().required(), Schema.string().required()]).required()", values: ['literal', 'other'], invalid: 1, type: 'string' },
  { name: 'strings with different constraints', schema: "Schema.union([Schema.string().min(1).required(), Schema.string().min(2).required()]).required()", values: ['a', 'abc'], invalid: '', type: 'string' },
  { name: 'numbers with different constraints', schema: "Schema.union([Schema.number().min(1).required(), Schema.number().min(2).required()]).required()", values: [1, 3], invalid: 0, type: 'number' },
  { name: 'number containing integer', schema: "Schema.union([Schema.number().required(), Schema.number().step(1).required()]).required()", values: [-1, 0, 1.5], invalid: '1', type: 'number' },
  { name: 'integer containing an integer literal', schema: "Schema.union([Schema.number().step(1).required(), Schema.const(1).required()]).required()", values: [1, 2], invalid: 1.5, type: 'integer' },
  { name: 'integer disjoint from a fractional literal', schema: "Schema.union([Schema.number().step(1).required(), Schema.const(1.5).required()]).required()", values: [1, 1.5, 2], invalid: true, branches: ['integer', 'number'] },
  { name: 'string containing a literal', schema: "Schema.union([Schema.string().required(), Schema.const('literal').required()]).required()", values: ['literal', 'other'], invalid: false, type: 'string' },
  { name: 'arrays with different length constraints', schema: "Schema.union([Schema.array(Schema.string().required()).min(1).required(), Schema.array(Schema.string().required()).min(2).required()]).required()", values: [['a'], ['a','b']], invalid: [], type: 'array' },
  { name: 'equal objects with different annotations', schema: "Schema.union([contractObject({description: Schema.string().required()}, {exact:true}).description('first'), contractObject({description: Schema.string().required()}, {exact:true}).description('second')]).required()", values: [{description:'text'}], invalid: {description:1}, type: 'object' },
  { name: 'help for nested host-unsupported unions', schema: "Schema.union([Schema.array(Schema.union([contractObject({left: Schema.string().required()}), contractObject({right: Schema.string().required()})]).required()).required(), Schema.string().required()]).required()", unsupported: true },
  { name: 'overlapping open objects', schema: "Schema.union([contractObject({left: Schema.string().required()}), contractObject({right: Schema.string().required()})]).required()", unsupported: true },
])('projects $name through public registration after changing only the declaration', async variant => {
  await withSchemaVariant(async ({ directory, schemaPath, source }) => {
    const tree = ts.createSourceFile(schemaPath, source, ts.ScriptTarget.Latest, true)
    const declarations = []
    const visit = node => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'fileWriteResultSchema') declarations.push(node)
      ts.forEachChild(node, visit)
    }
    visit(tree)
    expect(declarations).toHaveLength(1)
    const initializer = declarations[0].initializer
    const replacement = `contractObject({file_path: ${variant.schema}}, {exact: true})`
    await writeFile(schemaPath, source.slice(0, initializer.getStart(tree)) + replacement + source.slice(initializer.end))
    await writeFile(join(directory, 'probe.mjs'), `
      import assert from 'node:assert/strict'
      import { assertSupportedJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
      import { contracts } from '#contracts'
      const variant = ${JSON.stringify(variant)}
      const bind = value => contracts.bind('workbench_file_write', 'native', { assertSchema: assertSupportedJsonSchema, execute: async () => ({file_path: value}) })
      if (variant.unsupported) {
        assert.ok(contracts.describe('workbench_file_write').some(line => line.includes('file_path')))
        assert.throws(() => bind({left:'a', right:'b'}), error => /file_path.*overlapping union/.test(error.message))
      } else {
        for (const value of variant.values) {
          const tool = bind(value)
          if (variant.branches) assert.deepEqual(tool.output.schema.properties.file_path.oneOf.map(branch => branch.type), variant.branches)
          else assert.equal(tool.output.schema.properties.file_path.type, variant.type)
          const output = await tool.execute({file_path:'/tmp/probe.txt',content:'text'}, {signal:new AbortController().signal})
          assert.deepEqual(output, {file_path:value})
          assert.deepEqual(validateJsonSchemaValue(tool.output.schema, output), [])
        }
        await assert.rejects(() => bind(variant.invalid).execute({file_path:'/tmp/probe.txt',content:'text'}, {signal:new AbortController().signal}))
      }
    `)
    await execute(process.execPath, ['--experimental-strip-types', 'probe.mjs'], { cwd: directory, timeout: 30_000 })
  })
}, 60_000)

it('rejects executable settings metadata before JSON can discard it', async () => {
  await withSchemaVariant(async ({ directory, schemaPath, source }) => {
    const tree = ts.createSourceFile(schemaPath, source, ts.ScriptTarget.Latest, true)
    const declarations = []
    const visit = node => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'imageReaderPromptSchema') declarations.push(node)
      ts.forEachChild(node, visit)
    }
    visit(tree)
    expect(declarations).toHaveLength(1)
    const initializer = declarations[0].initializer
    const replacement = source.slice(initializer.getStart(tree), initializer.end) + ".default(() => 'saved prompt')"
    await writeFile(schemaPath, source.slice(0, initializer.getStart(tree)) + replacement + source.slice(initializer.end))
    await writeFile(join(directory, 'probe.mjs'), String.raw`
      import assert from 'node:assert/strict'
      import { contracts } from '#contracts'
      assert.throws(
        () => contracts.bind('imageReaderDefaultPrompt', 'settings'),
        /imageReaderDefaultPrompt settings \$\.meta\.default: function/
      )
    `)
    await execute(process.execPath, ['--experimental-strip-types', 'probe.mjs'], { cwd: directory, timeout: 30_000 })
  })
}, 60_000)
