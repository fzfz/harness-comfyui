import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('built public declaration artifacts', () => {
  it('resolves Host and Client exports from a TypeScript consumer', async () => {
    const hostTypes = join(root, 'lib/types/index.d.ts')
    const clientTypes = join(root, 'lib/types/client.d.ts')
    await expect(access(hostTypes)).resolves.toBeUndefined()
    await expect(access(clientTypes)).resolves.toBeUndefined()
    await expect(readFile(hostTypes, 'utf8')).resolves.toContain('export {')
    await expect(readFile(clientTypes, 'utf8')).resolves.toContain('export {')

    const directory = await mkdtemp(join(tmpdir(), 'harness-comfyui-artifact-consumer-'))
    temporaryDirectories.push(directory)
    await mkdir(join(directory, 'node_modules'), { recursive: true })
    await symlink(root, join(directory, 'node_modules', 'harness-comfyui'), 'dir')
    const consumer = join(directory, 'consumer.ts')
    await writeFile(consumer, [
      "import { apply as applyHost, type Config, type PluginStatus } from 'harness-comfyui'",
      "import { apply as applyClient } from 'harness-comfyui/client'",
      "const host: typeof applyHost = applyHost",
      "const client: typeof applyClient = applyClient",
      "const config: Config = { configurationProfile: 'test' }",
      "const status: PluginStatus = { packageName: 'harness-comfyui', packageVersion: '0.1.0-rc.7', configurationProfile: 'test', hostLoaded: true }",
      'void host; void client; void config; void status',
      '',
    ].join('\n'), 'utf8')

    const program = ts.createProgram([consumer], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      types: ['node'],
    })
    const diagnostics = ts.getPreEmitDiagnostics(program)
    expect(diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual([])
  })
})
