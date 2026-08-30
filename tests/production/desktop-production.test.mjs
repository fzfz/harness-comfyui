import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadDesktopProductionContext, startDesktopWorktree } from '../../scripts/desktop/worktree.mjs'

const roots = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function freePort() {
  const server = createServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '0.0.0.0', resolveListen)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('cannot allocate fixture port')
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
  return address.port
}

describe('DSH Desktop production lifecycle', () => {
  it('loads production paths and preview mode from the production checkout configuration', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..')
    const context = await loadDesktopProductionContext({ repositoryRoot })

    expect(context.desktopSource).toBe(resolve(repositoryRoot, '.local/upstreams/dsh-desktop'))
    expect(context.runtimeRoot).toBe(resolve(repositoryRoot, '.local/desktop-production'))
    expect(context.environmentFilePath).toBe(resolve(repositoryRoot, '.env'))
    expect(context.startupWorkspacePath).toBe('/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness')
    expect(context.dshHome).toBe(resolve(
      repositoryRoot,
      '.local/desktop-production/home/Library/Application Support/dsh-desktop/harness',
    ))
    expect(context.harnessLog).toBe(resolve(
      repositoryRoot,
      '.local/desktop-production/home/Library/Logs/DSH Desktop/harness.log',
    ))
    expect(context.launchCommand).toBe('preview')
    expect(context.mobileBridgePort).toBeGreaterThan(0)
  })

  it('loads the production mobile bridge port from the production checkout environment file', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'desktop-production-context-'))
    roots.push(root)
    const configRoot = resolve(root, 'config')
    const workspace = resolve(root, 'workspace')
    await Promise.all([mkdir(configRoot), mkdir(workspace)])
    await writeFile(resolve(root, '.env'), 'COMFYUI_WORKBENCH_DESKTOP_MOBILE_BRIDGE_PORT=45127\n')
    await writeFile(resolve(configRoot, 'desktop-production.json'), `${JSON.stringify({
      desktopSourceRelativePath: '.local/upstreams/dsh-desktop',
      runtimeRelativeRoot: '.local/desktop-production',
      environmentFileRelativePath: '.env',
      startupWorkspacePath: workspace,
    })}\n`)
    await writeFile(resolve(configRoot, 'source-production.json'), `${JSON.stringify({
      source: {
        catalogPort: 18093,
        catalogCliRelativePath: 'catalog.mjs',
        sourceCliRelativePath: 'source.mjs',
      },
    })}\n`)

    await expect(loadDesktopProductionContext({ repositoryRoot: root })).resolves.toMatchObject({
      mobileBridgePort: 45127,
      environmentFilePath: resolve(root, '.env'),
    })
  })

  it('starts the production Desktop in preview mode', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'desktop-production-'))
    roots.push(root)
    const desktopSource = resolve(root, 'dsh-desktop')
    const runtimeRoot = resolve(root, 'runtime')
    const runtimeHome = resolve(runtimeRoot, 'home')
    const environmentFilePath = resolve(root, '.env')
    const startupWorkspacePath = resolve(root, 'workspace')
    const skillSource = resolve(root, 'skills')
    await mkdir(resolve(root, 'node_modules/.pnpm'), { recursive: true })
    await Promise.all([
      mkdir(resolve(desktopSource, 'node_modules/.bin'), { recursive: true }),
      mkdir(startupWorkspacePath),
      mkdir(skillSource),
      writeFile(environmentFilePath, 'KEY=value\n'),
      writeFile(resolve(root, 'node_modules/.modules.yaml'), JSON.stringify({
        storeDir: resolve(root, '.pnpm-store/v11'),
        virtualStoreDir: '.pnpm',
      })),
    ])
    const context = {
      repositoryRoot: root,
      desktopSource,
      runtimeRoot,
      runtimeHome,
      dshHome: resolve(runtimeHome, 'Library/Application Support/dsh-desktop/harness'),
      pidFile: resolve(runtimeRoot, 'desktop.pid'),
      harnessLog: resolve(runtimeHome, 'Library/Logs/DSH Desktop/harness.log'),
      environmentFilePath,
      startupWorkspacePath,
      mobileBridgePort: await freePort(),
      launchCommand: 'preview',
      catalogPort: 18093,
      catalogCliPath: resolve(root, 'catalog.mjs'),
      sourceCliPath: resolve(root, 'source.mjs'),
      skillSource,
    }
    const child = new EventEmitter()
    child.pid = 54001
    const spawnDesktop = vi.fn(() => {
      setTimeout(() => child.emit('close', 0, null), 10)
      return child
    })

    await expect(startDesktopWorktree(context, {
      materializeClient: async () => undefined,
      materializeHost: async () => undefined,
      materializePreset: async () => undefined,
      packagePlugin: async () => resolve(root, 'harness-comfyui.tgz'),
      installPlugin: () => undefined,
      spawnDesktop,
    })).resolves.toMatchObject({ status: 'stopped', pid: 54001 })
    expect(spawnDesktop).toHaveBeenCalledWith(
      resolve(desktopSource, 'node_modules/node/bin/node'),
      [resolve(desktopSource, 'node_modules/pnpm/bin/pnpm.cjs'), 'preview'],
      expect.objectContaining({
        cwd: desktopSource,
        detached: true,
        env: expect.objectContaining({
          KEY: 'value',
          DSH_DESKTOP_MOBILE_BRIDGE_PORT: String(context.mobileBridgePort),
        }),
      }),
    )
  })

  it('exposes one Desktop production group, one Desktop development group, and one Web Host group', async () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..')
    const manifest = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'))
    expect(manifest.scripts).toMatchObject({
      'prod:start': 'node scripts/desktop/production-cli.mjs start',
      'prod:stop': 'node scripts/desktop/production-cli.mjs stop',
      'prod:restart': 'node scripts/desktop/production-cli.mjs restart',
      'prod:status': 'node scripts/desktop/production-cli.mjs status',
      'prod:logs': 'node scripts/desktop/production-cli.mjs logs',
      'dev:start': 'node scripts/desktop/cli.mjs start',
      'dev:stop': 'node scripts/desktop/cli.mjs stop',
      'dev:restart': 'node scripts/desktop/cli.mjs restart',
      'dev:status': 'node scripts/desktop/cli.mjs status',
      'dev:logs': 'node scripts/desktop/cli.mjs logs',
      'web:start': 'node scripts/worktree/cli.mjs start',
      'web:stop': 'node scripts/worktree/cli.mjs stop',
      'web:restart': 'node scripts/worktree/cli.mjs restart',
      'web:status': 'node scripts/worktree/cli.mjs status',
      'web:health': 'node scripts/worktree/cli.mjs health',
      'web:logs': 'node scripts/worktree/cli.mjs logs',
    })
    for (const prefix of ['worktree:', 'desktop:worktree:', 'desktop:prod:']) {
      expect(Object.keys(manifest.scripts).some(name => name.startsWith(prefix))).toBe(false)
    }
    const developmentDefinition = JSON.parse(await readFile(
      resolve(repositoryRoot, 'config/desktop-worktree.json'),
      'utf8',
    ))
    const webDefinition = JSON.parse(await readFile(
      resolve(repositoryRoot, 'config/web-development.json'),
      'utf8',
    ))
    expect(developmentDefinition.runtimeRelativeRoot).toBe('.local/desktop-development')
    expect(webDefinition.runtimeRelativeRoot).toBe('.local/web-development')
    const productionCli = await import('../../scripts/desktop/production-cli.mjs')
    expect(productionCli.parseArguments(['restart'])).toEqual({ command: 'restart' })
    expect(() => productionCli.parseArguments(['health'])).toThrow('start, stop, restart, status, logs')
  })
})
