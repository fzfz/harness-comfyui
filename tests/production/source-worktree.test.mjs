import { randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { materializeSourceProfile } from '../../scripts/profile/source.mjs'
import { spawnForeground } from '../../scripts/production/spawn.mjs'
import { loadSourceProductionContext } from '../../scripts/production/runtime.mjs'
import {
  helpText,
  parseArguments,
  runWebHostCommand,
} from '../../scripts/worktree/cli.mjs'
import {
  loadSourceWorktreeContext,
  parseSourceWorktreeDefinition,
  releaseSourceWorktreeContext,
  sourceWorktreeStartOptions,
} from '../../scripts/worktree/runtime.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const temporaryPaths = []

function developmentPortReservation(port) {
  return { port, release: vi.fn(async () => undefined) }
}

async function temporaryDirectory(prefix) {
  const path = await mkdtemp(join(tmpdir(), prefix))
  temporaryPaths.push(path)
  return path
}

async function linkedWorktreeRepository(prefix) {
  const root = await temporaryDirectory(prefix)
  await writeFile(resolve(root, '.git'), 'gitdir: /test-only/linked-worktree\n', 'utf8')
  await mkdir(resolve(root, 'startup-workspace'))
  await symlink(resolve(repositoryRoot, 'config'), resolve(root, 'config'), 'dir')
  await symlink(resolve(repositoryRoot, 'package.json'), resolve(root, 'package.json'), 'file')
  return root
}

async function pathExists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function definition(userEnvironmentFilePath, overrides = {}) {
  return {
    schemaVersion: 1,
    runtimeId: 'harness-comfyui-web-development',
    runtimeRelativeRoot: '.local/web-development',
    sourceProductionDefinitionRelativePath: 'config/source-production.json',
    dshProfile: 'comfyui-workbench-development',
    userEnvironmentFilePath,
    startupWorkspacePath: '/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness',
    ...overrides,
  }
}

afterEach(async () => {
  for (const path of temporaryPaths.splice(0).reverse()) {
    await rm(path, { recursive: true, force: true })
  }
})

describe('source worktree development definition', () => {
  it('prepares the environment link and candidate dependency view before loading Web Host start modules', async () => {
    const mainCheckout = await temporaryDirectory('harness-web-main-')
    const worktree = await temporaryDirectory('harness-web-worktree-')
    await Promise.all([
      mkdir(resolve(mainCheckout, 'node_modules')),
      writeFile(resolve(mainCheckout, '.env'), 'TEST_ONLY_KEY=value\n'),
      writeFile(resolve(worktree, '.git'), 'gitdir: /test-only/linked-worktree\n'),
    ])
    const definitionPath = resolve(worktree, 'desktop-worktree.json')
    await writeFile(definitionPath, `${JSON.stringify({ mainCheckoutPath: mainCheckout })}\n`)
    const runSourceProductionCommand = vi.fn(async () => ({
      evidence: { status: 'stopped' },
      failed: false,
    }))
    const runtime = {
      loadSourceWorktreeContext: vi.fn(),
      loadSavedSourceWorktreeContext: vi.fn(),
      prepareSourceWorktreeRuntime: vi.fn(),
      releaseSourceWorktreeContext: vi.fn(),
      sourceWorktreeStartOptions: vi.fn(),
    }

    const desktopWorkspace = resolve(mainCheckout, 'candidate/desktop')
    const prepareDesktopDependencies = vi.fn(async () => {
      await mkdir(resolve(worktree, 'node_modules'))
      return { nodeModulesDir: resolve(worktree, 'node_modules') }
    })
    await expect(runWebHostCommand('start', {
      checkoutOptions: {
        repositoryRoot: worktree,
        definitionPath,
        loadDesktopBaseline: async () => ({ desktopWorkspace }),
        prepareDesktopDependencies,
      },
      runSourceProductionCommand,
      runtime,
    })).resolves.toEqual({ evidence: { status: 'stopped' }, failed: false })

    expect(resolve(worktree, await readlink(resolve(worktree, '.env')))).toBe(resolve(mainCheckout, '.env'))
    expect((await lstat(resolve(worktree, 'node_modules'))).isDirectory()).toBe(true)
    expect(prepareDesktopDependencies).toHaveBeenCalledWith({
      repositoryRoot: worktree, mainCheckoutRoot: mainCheckout, desktopWorkspace,
    })
    expect(prepareDesktopDependencies.mock.invocationCallOrder[0])
      .toBeLessThan(runSourceProductionCommand.mock.invocationCallOrder[0])
    expect(runSourceProductionCommand).toHaveBeenCalledWith('start', expect.objectContaining({
      commandPrefix: 'web',
      loadContext: runtime.loadSourceWorktreeContext,
      loadSavedContext: runtime.loadSavedSourceWorktreeContext,
      prepareRuntime: runtime.prepareSourceWorktreeRuntime,
      releaseContext: runtime.releaseSourceWorktreeContext,
      startOptions: runtime.sourceWorktreeStartOptions,
    }))
  })

  it('releases the claimed Web Host port when runtime preparation fails', async () => {
    const root = await temporaryDirectory('harness-web-prepare-failure-')
    const context = {
      activeVersion: '0.39.1',
      sourceManagedStatePath: resolve(root, 'source-managed.json'),
    }
    const releaseContext = vi.fn(async () => undefined)

    await expect(runWebHostCommand('start', {
      prepareCheckout: async () => undefined,
      loadSavedContext: async () => undefined,
      loadContext: async () => context,
      prepareRuntime: async () => { throw new Error('Web Host runtime preparation failed') },
      releaseContext,
      startOptions: () => ({}),
    })).rejects.toThrow('Web Host runtime preparation failed')
    expect(releaseContext).toHaveBeenCalledWith(context)
  })

  it('accepts one exact structured definition and resolves its repository paths', async () => {
    const root = await temporaryDirectory('harness-worktree-definition-')
    const environmentFile = resolve(root, '.env')
    const parsed = parseSourceWorktreeDefinition(definition(environmentFile), repositoryRoot)

    expect(parsed).toEqual({
      schemaVersion: 1,
      runtimeId: 'harness-comfyui-web-development',
      runtimeRoot: resolve(repositoryRoot, '.local/web-development'),
      sourceProductionDefinitionPath: resolve(repositoryRoot, 'config/source-production.json'),
      dshProfile: 'comfyui-workbench-development',
      userEnvironmentFilePath: environmentFile,
      startupWorkspacePath: '/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness',
    })
  })

  it.each([
    ['a different schema version', value => ({ ...value, schemaVersion: 2 }), 'schemaVersion must be 1'],
    ['an unknown field', value => ({ ...value, unknown: true }), 'must contain exactly'],
    ['an escaping runtime root', value => ({ ...value, runtimeRelativeRoot: '../runtime' }), 'inside the source repository'],
    ['an absolute source definition', value => ({ ...value, sourceProductionDefinitionRelativePath: '/tmp/source.json' }), 'must be relative'],
    ['a relative environment file', value => ({ ...value, userEnvironmentFilePath: '../main/.env' }), 'must be an absolute path'],
    ['a relative startup workspace', value => ({ ...value, startupWorkspacePath: '../workspace' }), 'must be an absolute path'],
    ['an invalid Profile name', value => ({ ...value, dshProfile: '../profile' }), 'must contain only'],
  ])('rejects %s', async (_name, change, message) => {
    const root = await temporaryDirectory('harness-worktree-invalid-')
    expect(() => parseSourceWorktreeDefinition(change(definition(resolve(root, '.env'))), repositoryRoot))
      .toThrow(message)
  })

  it('rejects a normal checkout before reading runtime configuration', async () => {
    const root = await temporaryDirectory('harness-normal-checkout-')
    const definitionPath = resolve(root, 'worktree-development.json')
    await mkdir(resolve(root, '.git'))
    await writeFile(definitionPath, `${JSON.stringify(definition(resolve(root, '.env')), null, 2)}\n`, 'utf8')

    await expect(loadSourceWorktreeContext({ repositoryRoot: root, definitionPath }))
      .rejects.toThrow('must be an independent linked git worktree')
    expect(await pathExists(resolve(root, '.local'))).toBe(false)
  })

  it('loads a worktree-only context while retaining the production source definition', async () => {
    const root = await linkedWorktreeRepository('harness-worktree-context-')
    const environmentFile = resolve(root, '.env')
    const definitionPath = resolve(root, 'worktree-development.json')
    const startupWorkspacePath = resolve(root, 'startup-workspace')
    await writeFile(environmentFile, 'TEST_ONLY_KEY=value\n', { encoding: 'utf8', mode: 0o600 })
    await writeFile(
      definitionPath,
      `${JSON.stringify(definition(environmentFile, { startupWorkspacePath }), null, 2)}\n`,
      'utf8',
    )

    const context = await loadSourceWorktreeContext({
      repositoryRoot: root,
      definitionPath,
      environment: { HARNESS_COMFYUI_SERVER_PORT: '19173' },
      reservePort: async () => developmentPortReservation(18173),
    })

    expect(context.definition.runtimeId).toBe('harness-comfyui-web-development')
    expect(context.runtime.runtimeRoot).toBe(resolve(root, '.local/web-development'))
    expect(context.dshHome).toBe(resolve(root, '.local/web-development/dsh-home'))
    expect(context.sourceManagedStatePath).toBe(
      resolve(root, '.local/web-development/state/source-managed.json'),
    )
    expect(context.dshProfile).toBe('comfyui-workbench-development')
    expect(context.userEnvironmentFilePath).toBe(environmentFile)
    expect(context.startupWorkspacePath).toBe(startupWorkspacePath)
    expect(context.runtime.port).toBe(18173)
    expect(context.configReadOrder[0]).toBe(definitionPath)
    expect(context.configReadOrder[1]).toBe(resolve(root, 'config/source-production.json'))
    expect(context.definition.catalogPort).toBe(18093)
    expect(sourceWorktreeStartOptions(context).onPortOwned).toBeTypeOf('function')
    await releaseSourceWorktreeContext(context)
  })

  it('claims distinct Web Host ports for two worktrees that share the main checkout environment', async () => {
    const mainCheckout = await temporaryDirectory('harness-shared-web-main-')
    const environmentFile = resolve(mainCheckout, '.env')
    const startupWorkspacePath = resolve(mainCheckout, 'startup-workspace')
    await mkdir(startupWorkspacePath)
    await writeFile(environmentFile, 'TEST_ONLY_KEY=value\n', 'utf8')
    const worktrees = await Promise.all([
      linkedWorktreeRepository('harness-shared-web-worktree-a-'),
      linkedWorktreeRepository('harness-shared-web-worktree-b-'),
    ])
    const contexts = await Promise.all(worktrees.map(async (root, index) => {
      const definitionPath = resolve(root, 'worktree-development.json')
      await writeFile(definitionPath, `${JSON.stringify(definition(environmentFile, {
        runtimeId: `harness-comfyui-web-development-${index}`,
        startupWorkspacePath,
      }), null, 2)}\n`, 'utf8')
      return loadSourceWorktreeContext({ repositoryRoot: root, definitionPath })
    }))

    expect(contexts[0].runtime.port).not.toBe(contexts[1].runtime.port)
    expect(dirname(contexts[0].developmentPortReservation.claimPath))
      .toBe(dirname(contexts[1].developmentPortReservation.claimPath))
    await expect(lstat(contexts[0].developmentPortReservation.claimPath)).resolves.toBeDefined()
    await expect(lstat(contexts[1].developmentPortReservation.claimPath)).resolves.toBeDefined()

    await Promise.all(contexts.map(releaseSourceWorktreeContext))
    await expect(lstat(contexts[0].developmentPortReservation.claimPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(lstat(contexts[1].developmentPortReservation.claimPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('releases the Web Host port claim when source configuration loading fails', async () => {
    const root = await linkedWorktreeRepository('harness-worktree-invalid-source-config-')
    const environmentFile = resolve(root, '.env')
    const definitionPath = resolve(root, 'worktree-development.json')
    const invalidSourceDefinitionPath = resolve(root, 'invalid-source-production.json')
    const reservation = developmentPortReservation(18176)
    await writeFile(environmentFile, 'TEST_ONLY_KEY=value\n', 'utf8')
    await writeFile(invalidSourceDefinitionPath, '{}\n', 'utf8')
    await writeFile(definitionPath, `${JSON.stringify(definition(environmentFile, {
      sourceProductionDefinitionRelativePath: 'invalid-source-production.json',
      startupWorkspacePath: resolve(root, 'startup-workspace'),
    }), null, 2)}\n`, 'utf8')

    await expect(loadSourceWorktreeContext({
      repositoryRoot: root,
      definitionPath,
      reservePort: async () => reservation,
    })).rejects.toThrow('source production definition')
    expect(reservation.release).toHaveBeenCalledOnce()
  })

  it('rejects an unavailable configured user environment file without creating the DSH home', async () => {
    const root = await linkedWorktreeRepository('harness-worktree-missing-env-')
    const environmentFile = resolve(root, 'missing.env')
    const definitionPath = resolve(root, 'worktree-development.json')
    const runtimeRelativeRoot = `.local/missing-env-${randomUUID()}`
    const runtimeRoot = resolve(root, runtimeRelativeRoot)
    await writeFile(
      definitionPath,
      `${JSON.stringify(definition(environmentFile, { runtimeRelativeRoot }), null, 2)}\n`,
      'utf8',
    )

    await expect(loadSourceWorktreeContext({ repositoryRoot: root, definitionPath }))
      .rejects.toThrow('worktree development user environment file is unavailable')
    expect(await pathExists(resolve(runtimeRoot, 'dsh-home'))).toBe(false)
  })

  it.each([
    {
      name: 'a directory as the user environment file',
      prepare: async root => {
        const environmentFile = resolve(root, 'environment-directory')
        await mkdir(environmentFile)
        return definition(environmentFile)
      },
      message: 'worktree development user environment file is unavailable',
    },
    {
      name: 'a missing startup workspace',
      prepare: async root => {
        const environmentFile = resolve(root, '.env')
        await writeFile(environmentFile, 'TEST_ONLY_KEY=value\n', 'utf8')
        return definition(environmentFile, { startupWorkspacePath: resolve(root, 'missing-workspace') })
      },
      message: 'worktree development startup workspace is unavailable',
    },
    {
      name: 'a regular file as the startup workspace',
      prepare: async root => {
        const environmentFile = resolve(root, '.env')
        const workspaceFile = resolve(root, 'workspace-file')
        await writeFile(environmentFile, 'TEST_ONLY_KEY=value\n', 'utf8')
        await writeFile(workspaceFile, 'not a directory\n', 'utf8')
        return definition(environmentFile, { startupWorkspacePath: workspaceFile })
      },
      message: 'worktree development startup workspace is unavailable',
    },
  ])('rejects $name before creating the configured runtime', async ({ prepare, message }) => {
    const root = await linkedWorktreeRepository('harness-invalid-worktree-input-')
    const definitionPath = resolve(root, 'worktree-development.json')
    const runtimeRelativeRoot = `.local/invalid-input-${randomUUID()}`
    const runtimeRoot = resolve(root, runtimeRelativeRoot)
    const value = await prepare(root)
    await writeFile(
      definitionPath,
      `${JSON.stringify({ ...value, runtimeRelativeRoot }, null, 2)}\n`,
      'utf8',
    )

    await expect(loadSourceWorktreeContext({ repositoryRoot: root, definitionPath })).rejects.toThrow(message)
    expect(await pathExists(runtimeRoot)).toBe(false)
  })
})

describe('source worktree development Profile materialization', () => {
  it('keeps the production Profile and DSH home free of a development environment link', async () => {
    const root = await temporaryDirectory('harness-production-profile-')
    const dshHome = resolve(root, 'dsh-home')

    const result = await materializeSourceProfile(repositoryRoot, dshHome, {
      profileName: 'comfyui-workbench',
    })

    expect(await readFile(resolve(result.profileDirectory, 'cordis.patch.yml'), 'utf8')).toBe('- insert:\n    - id: harness-comfyui-web\n      name: harness-comfyui\n')
    expect(await pathExists(resolve(dshHome, '.env'))).toBe(false)
  })

  it('links the configured user environment file only into the development DSH home', async () => {
    const root = await temporaryDirectory('harness-development-profile-')
    const environmentFile = resolve(root, 'main-worktree.env')
    const dshHome = resolve(root, 'dsh-home')
    await writeFile(environmentFile, 'TEST_ONLY_KEY=value\n', { encoding: 'utf8', mode: 0o600 })

    const first = await materializeSourceProfile(repositoryRoot, dshHome, {
      profileName: 'comfyui-workbench-development',
      userEnvironmentFilePath: environmentFile,
    })
    const second = await materializeSourceProfile(repositoryRoot, dshHome, {
      profileName: 'comfyui-workbench-development',
      userEnvironmentFilePath: environmentFile,
    })

    const environmentLink = resolve(dshHome, '.env')
    expect((await lstat(environmentLink)).isSymbolicLink()).toBe(true)
    expect(resolve(dirname(environmentLink), await readlink(environmentLink))).toBe(environmentFile)
    expect(second).toEqual(first)
    expect(await readFile(resolve(first.profileDirectory, 'cordis.patch.yml'), 'utf8')).toBe('[]\n')
    expect(await readFile(resolve(repositoryRoot, 'cordis.patch.yml'), 'utf8')).toContain(
      'startupWorkspacePath: !!js process.env.HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH',
    )
  })

  it.each(['regular file', 'wrong symbolic link'])('does not overwrite an existing DSH home environment %s', async kind => {
    const root = await temporaryDirectory('harness-environment-conflict-')
    const environmentFile = resolve(root, 'main-worktree.env')
    const otherEnvironmentFile = resolve(root, 'other.env')
    const dshHome = resolve(root, 'dsh-home')
    const environmentLink = resolve(dshHome, '.env')
    await writeFile(environmentFile, 'TEST_ONLY_KEY=value\n', 'utf8')
    await writeFile(otherEnvironmentFile, 'OTHER_TEST_KEY=value\n', 'utf8')
    await mkdir(dshHome)
    if (kind === 'regular file') await writeFile(environmentLink, 'UNCHANGED=true\n', 'utf8')
    else await symlink(otherEnvironmentFile, environmentLink, 'file')

    await expect(materializeSourceProfile(repositoryRoot, dshHome, {
      profileName: 'comfyui-workbench-development',
      userEnvironmentFilePath: environmentFile,
    })).rejects.toThrow('must be a symbolic link to')

    if (kind === 'regular file') expect(await readFile(environmentLink, 'utf8')).toBe('UNCHANGED=true\n')
    else expect(resolve(dirname(environmentLink), await readlink(environmentLink))).toBe(otherEnvironmentFile)
  })

  it.each([
    ['missing', async path => path],
    ['a directory', async path => { await mkdir(path); return path }],
    ['an unreadable file', async path => { await writeFile(path, 'TEST_ONLY_KEY=value\n', 'utf8'); await chmod(path, 0); return path }],
  ])('rejects %s as the configured user environment file before creating the DSH home', async (_name, prepare) => {
    const root = await temporaryDirectory('harness-invalid-environment-')
    const environmentFile = await prepare(resolve(root, 'main-worktree.env'))
    const dshHome = resolve(root, 'dsh-home')

    await expect(materializeSourceProfile(repositoryRoot, dshHome, {
      profileName: 'comfyui-workbench-development',
      userEnvironmentFilePath: environmentFile,
    })).rejects.toThrow('user environment file')
    expect(await pathExists(dshHome)).toBe(false)
  })
})

describe('Web Host command adapter', () => {
  it('exposes the six lifecycle commands under the web command prefix', () => {
    expect(helpText()).toContain('pnpm web:<command>')
    for (const command of ['start', 'stop', 'restart', 'status', 'health', 'logs']) {
      expect(parseArguments([command])).toEqual({ command })
    }
    expect(parseArguments([])).toEqual({ command: 'help' })
    expect(() => parseArguments(['start', '--anything'])).toThrow('do not accept arguments')
    expect(() => parseArguments(['unknown'])).toThrow('unknown Web Host command')
  })

  it('passes the selected development Profile to the DSH executable', async () => {
    const root = await temporaryDirectory('harness-worktree-spawn-')
    const executable = resolve(root, 'fake-dsh')
    await writeFile(executable, '#!/bin/sh\nprintf "%s\\n" "$@"\n', 'utf8')
    await chmod(executable, 0o755)

    const child = spawnForeground({
      dshExecutable: executable,
      dshHome: resolve(root, 'dsh-home'),
      profile: 'comfyui-workbench-development',
      configuration: 'production',
      host: '127.0.0.1',
      port: '18173',
      cwd: repositoryRoot,
      environment: { PATH: process.env.PATH },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    const exit = await new Promise((resolveExit, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolveExit({ code, signal }))
    })

    expect(exit).toEqual({ code: 0, signal: null })
    expect(stdout.trim().split('\n')).toEqual([
      '--profile',
      'comfyui-workbench-development',
      '--host',
      '127.0.0.1',
      '--port',
      '18173',
      '--no-open',
    ])
  })

  it('uses the saved worktree context for process management without revalidating current startup inputs', async () => {
    const root = await linkedWorktreeRepository('harness-saved-worktree-context-')
    const environmentFile = resolve(root, '.env')
    const definitionPath = resolve(root, 'worktree-development.json')
    const runtimeRelativeRoot = `.local/saved-worktree-${randomUUID()}`
    const startupWorkspacePath = resolve(root, 'startup-workspace')
    await writeFile(environmentFile, 'TEST_ONLY_KEY=value\n', 'utf8')
    await writeFile(
      definitionPath,
      `${JSON.stringify(definition(environmentFile, { runtimeRelativeRoot, startupWorkspacePath }), null, 2)}\n`,
      'utf8',
    )
    const savedContext = await loadSourceWorktreeContext({
      repositoryRoot: root,
      definitionPath,
      reservePort: async () => developmentPortReservation(18175),
    })
    let currentContextLoaded = false

    const result = await runWebHostCommand('status', {
      loadContext: async () => {
        currentContextLoaded = true
        throw new Error('current startup inputs must not be loaded')
      },
      loadSavedContext: async () => ({ ...savedContext, managedStatePresent: true }),
    })

    expect(result.evidence).toMatchObject({ status: 'stopped', runtimeId: savedContext.runtime.runtimeId })
    expect(currentContextLoaded).toBe(false)
  })

  it('retains the production Profile and production DSH home defaults', async () => {
    const context = await loadSourceProductionContext({
      repositoryRoot,
      environment: { HARNESS_COMFYUI_SERVER_PORT: '18174' },
    })
    expect(context.dshProfile).toBe('comfyui-workbench')
    expect(context.userEnvironmentFilePath).toBeUndefined()
    expect(context.startupWorkspacePath).toBeUndefined()
    expect(context.dshHome).toBe(resolve(repositoryRoot, '.local/production/dsh-home'))
  })
})
