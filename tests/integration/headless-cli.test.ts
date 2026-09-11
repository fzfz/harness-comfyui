import { Context } from '@deepseek-ai/cordis'
import { createRequire } from 'node:module'
import { mkdtemp, rm, readdir, readFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { materializeSourceCliModule } from '../../scripts/production/cli-module.mjs'
import { materializeSourceHostModule } from '../../scripts/production/host-module.mjs'

afterEach(() => vi.unstubAllEnvs())

describe('pure DSH managed CLI', () => {
  it('builds server entries and executes real DSH Bash without Web or Desktop', async () => {
    const root = await mkdtemp(join(tmpdir(), 'harness-pure-dsh-'))
    const sourceRequire = createRequire(resolve('package.json'))
    const dshRequire = createRequire(sourceRequire.resolve('@deepseek-ai/dsh/package.json'))
    const baseRequire = createRequire(dshRequire.resolve('@deepseek-ai/dsh-base/package.json'))
    const fromDsh = async (name: string) => import(pathToFileURL(baseRequire.resolve(name)).href)
    const ctx = new Context()
    const fibers = []
    for (const [name, path] of Object.entries({
      DATA_DIR: 'data', API_WORKFLOW_CACHE_DIRECTORY: 'data/cache', RUN_REPOSITORY_FILE: 'runs.sqlite',
      RUN_DIRECTORY: 'runs', SAVED_MEDIA_DIRECTORY: 'media', LOG_DIRECTORY: 'logs',
    })) vi.stubEnv(`HARNESS_COMFYUI_${name}`, resolve(root, path))
    ctx.provide('workspaceRegistry', {
      create: async () => ({ id: 'workspace', sessionIds: ['session'] }),
      resolveByPath: async () => ({ id: 'workspace', sessionIds: ['session'] }),
    } as never)
    ctx.provide('settings', { register: (_name: string, _schema: unknown, options: { base: unknown }) => ({ get: () => options.base }), describe: () => [] } as never)
    ctx.provide('attachments', {} as never)
    ctx.provide('llm', { listProviders: () => [], listModels: async () => [] } as never)
    try {
      // A separate output tree allows Desktop and headless build verification to run concurrently.
      const outputRoot = await mkdtemp(join(process.cwd(), '.headless-build-'))
      try {
        await symlink(resolve('scripts'), join(outputRoot, 'scripts'), 'dir')
        await materializeSourceCliModule(outputRoot)
        const host = await materializeSourceHostModule(process.cwd(), { web: false, outputRoot })
        const output = dirname(host)
        const entries = await readdir(output)
        expect(entries).not.toContain('web.js')
        for (const entry of entries.filter(entry => entry.endsWith('.js'))) {
          const code = await readFile(join(output, entry), 'utf8')
          expect(code).not.toMatch(/(?:from|import\()\s*['"](?:electron|dsh-plugin-desktop|@deepseek-ai\/dsh-(?:api-remotes|client-[^'"]+|web-[^'"]+))/)
        }
        for (const [name, config] of [
          ['@deepseek-ai/dsh-system-prompt', {}], ['@deepseek-ai/dsh-tools', { mode: 'native' }],
          ['@deepseek-ai/dsh-shell-env', { dshHome: join(root, 'home') }], ['@deepseek-ai/dsh-subprocess-local', {}],
          ['@deepseek-ai/dsh-bash-local', {}], ['@deepseek-ai/dsh-tool-bash', { enableRunInBackground: true }],
        ] as const) {
          const module = await fromDsh(name)
          fibers.push(await ctx.plugin(module.default ?? module, config))
        }
        const core = await import(pathToFileURL(join(output, 'core.js')).href)
        fibers.push(await ctx.plugin(core, { configurationProfile: 'production' }))
        expect(ctx.harnessComfyuiCore.services.runtime).toBeDefined()
        expect(ctx.get('imageReader')).toBeUndefined()
        for (const name of ['image-reader', 'cli']) fibers.push(await ctx.plugin(await import(pathToFileURL(join(output, `${name}.js`)).href), {}))
        expect(ctx.get('webServer')).toBeUndefined()
        expect(ctx.get('desktopBrowserAccess')).toBeUndefined()
        const execute = async (command: string, input: object, callId: string) => {
          const result = await ctx.tools.execute({
            callId, name: 'bash', arguments: { command: `printf '%s' '${JSON.stringify(input)}' | node "$DSH_HARNESS_COMFYUI_CLI" ${command} --stdin`, description: 'Verify pure DSH CLI' },
            signal: new AbortController().signal,
            agent: { session: { id: 'session', header: { cwd: process.cwd() }, snapshotEvents: () => [{ type: 'tool/call', data: { callId, name: 'bash', turn: 1 } }] } },
          } as never) as any
          expect(result.isError, JSON.stringify(result)).toBe(false)
          expect(result.value.stdout.text, JSON.stringify(result)).not.toBe('')
          return JSON.parse(result.value.stdout.text)
        }
        const seeds = await execute('generation random-seeds', { count: 2 }, 'seeds')
        expect(seeds.seeds).toHaveLength(2)
        const history = await execute('generation run-inputs', { run_ids: ['missing'] }, 'history')
        expect(history.runs[0]).toMatchObject({ run_id: 'missing', lookup_status: 'error', error: { code: 'GENERATION_RUN_NOT_FOUND' } })
        const media = await execute('generation resolve-media', { run_ids: ['missing'] }, 'media')
        expect(media.runs[0]).toMatchObject({ run_id: 'missing', lookup_status: 'error' })
        const origin = ctx.harnessComfyuiCli.origin
        for (const fiber of fibers.splice(0).reverse()) await fiber.dispose()
        await expect(fetch(origin)).rejects.toThrow()
      } finally { await rm(outputRoot, { recursive: true, force: true }) }
    } finally {
      for (const fiber of fibers.reverse()) await fiber.dispose()
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})
