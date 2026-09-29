import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runCatalogCliProcess } from '../../src/host/catalog/catalog-cli.ts'
import { runSourceCliProcess } from '../../src/host/generation/source-cli.ts'

const original = Object.getOwnPropertyDescriptor(process.versions, 'electron')
let directory: string | undefined
afterEach(async () => {
  if (original) Object.defineProperty(process.versions, 'electron', original)
  else Reflect.deleteProperty(process.versions, 'electron')
  if (directory) await rm(directory, { recursive: true, force: true })
})
describe.each([['catalog', runCatalogCliProcess], ['source', runSourceCliProcess]] as const)('%s CLI runtime', (_name, execute) => {
  it('preserves native executable environment under Electron', async () => {
    Object.defineProperty(process.versions, 'electron', { value: '44.0.0', configurable: true })
    const inheritedMode = process.env.ELECTRON_RUN_AS_NODE
    const result = await execute(process.execPath, ['-e', 'console.log(process.env.ELECTRON_RUN_AS_NODE ?? "unset")'], new AbortController().signal)
    expect(process.env.ELECTRON_RUN_AS_NODE).toBe(inheritedMode)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(inheritedMode ?? 'unset')
  })
  it.each([false, true])('executes the script with Electron runtime = %s', async electron => {
    if (electron) Object.defineProperty(process.versions, 'electron', { value: '44.0.0', configurable: true })
    else Reflect.deleteProperty(process.versions, 'electron')
    directory = await mkdtemp(join(tmpdir(), 'harness-cli-runtime-'))
    const script = join(directory, 'probe.mjs')
    await writeFile(script, 'console.log(JSON.stringify({mode:process.env.ELECTRON_RUN_AS_NODE??null,args:process.argv.slice(2)}))')
    const inheritedMode = process.env.ELECTRON_RUN_AS_NODE
    const result = await execute(script, ['one value'], new AbortController().signal)
    expect(process.env.ELECTRON_RUN_AS_NODE).toBe(inheritedMode)
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ mode: electron ? '1' : inheritedMode ?? null, args: ['one value'] })
  })
})
