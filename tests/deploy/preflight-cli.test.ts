import { createServer, type AddressInfo } from 'node:net'
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

import { afterEach, describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const cliScript = join(repositoryRoot, 'scripts/deploy/cli.mjs')
const temporaryRoots: string[] = []

type ProcessResult = {
  status: number
  stdout: string
  stderr: string
}

async function runProcess(command: string, args: string[], options: Parameters<typeof spawn>[2] = {}): Promise<ProcessResult> {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env: process.env,
    shell: false,
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', chunk => { stdout += chunk })
  child.stderr?.on('data', chunk => { stderr += chunk })
  const status = await new Promise<number>(resolveExit => child.on('close', code => resolveExit(code ?? 1)))
  return { status, stdout, stderr }
}

async function findFreePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolveListen())
  })
  const address = server.address() as AddressInfo
  const port = address.port
  await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
  return port
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'harness-preflight-cli-'))
  temporaryRoots.push(root)
  const installationRoot = join(root, 'installation')
  const packageRoot = join(root, 'package')
  const tarballPath = join(root, 'harness-comfyui-0.1.0-test.1.tgz')
  const inputPath = join(root, 'installation.json')
  const discoveryLog = join(root, 'discovery.log')
  const catalogCliPath = join(root, 'catalog-discovery.mjs')
  const sourceCliPath = join(root, 'source-discovery.mjs')
  const discovery = {
    contract_id: 'imagegen-source-contract',
    contract_version: 1,
    openapi: { openapi: '3.1.0', info: { title: 'fixture', version: '1' }, paths: {} },
  }

  await mkdir(packageRoot, { recursive: true })
  await writeFile(join(packageRoot, 'package.json'), `${JSON.stringify({
    name: 'harness-comfyui',
    version: '0.1.0-test.1',
    packageManager: 'pnpm@11.7.0',
    type: 'module',
    engines: { node: '^22.19.0 || >=24.0.0' },
    devDependencies: {
      '@deepseek-ai/dsh': '0.1.0-rc.8',
      '@deepseek-ai/dsh-base': '0.1.0-rc.8',
      '@deepseek-ai/dsh-web-app': '0.1.0-rc.8',
    },
  })}\n`, 'utf8')
  await mkdir(join(packageRoot, 'deployment/runtime'), { recursive: true })
  await writeFile(join(packageRoot, 'deployment/runtime/package.json'), `${JSON.stringify({
    name: 'harness-comfyui-runtime',
    private: true,
    dependencies: {
      '@deepseek-ai/dsh': '0.1.0-rc.8',
      '@deepseek-ai/dsh-base': '0.1.0-rc.8',
      '@deepseek-ai/dsh-web-app': '0.1.0-rc.8',
    },
  }, null, 2)}\n`, 'utf8')
  await writeFile(join(packageRoot, 'deployment/runtime/pnpm-lock.yaml'), await readFile(join(repositoryRoot, 'deployment/runtime/pnpm-lock.yaml'), 'utf8'), 'utf8')
  await writeFile(join(packageRoot, 'deployment/runtime/pnpm-workspace.yaml'), await readFile(join(repositoryRoot, 'deployment/runtime/pnpm-workspace.yaml'), 'utf8'), 'utf8')
  await mkdir(join(packageRoot, 'lib'), { recursive: true })
  await copyFile(join(repositoryRoot, 'lib/config-profile-validator.js'), join(packageRoot, 'lib/config-profile-validator.js'))
  await mkdir(join(packageRoot, 'config/profiles'), { recursive: true })
  for (const relativePath of [
    'config/base.json',
    'config/environment-overrides.json',
    'config/profiles/production.json',
  ]) {
    await writeFile(join(packageRoot, relativePath), await readFile(join(repositoryRoot, relativePath), 'utf8'), 'utf8')
  }
  const tar = await runProcess('tar', ['-czf', tarballPath, '-C', root, 'package'])
  if (tar.status !== 0) throw new Error(`fixture tarball failed: ${tar.stderr}`)

  for (const [path, label] of [[catalogCliPath, 'catalog'], [sourceCliPath, 'source']] as const) {
    await writeFile(path, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs'
if (process.argv[2] !== '--discovery-json') process.exit(2)
appendFileSync(${JSON.stringify(discoveryLog)}, ${JSON.stringify(`${label}\n`)})
process.stdout.write(${JSON.stringify(JSON.stringify(discovery))})
`, 'utf8')
    await chmod(path, 0o755)
  }

  const port = await findFreePort()
  const installation = {
    schemaVersion: 1,
    installationId: 'fixture-preflight',
    root: installationRoot,
    configurationProfile: 'production',
    host: '127.0.0.1',
    port,
    paths: {
      dataDir: join(installationRoot, 'shared/data'),
      runRepositoryFile: join(installationRoot, 'shared/data/runs.sqlite'),
      runDirectory: join(installationRoot, 'shared/runs'),
      savedMediaDirectory: join(installationRoot, 'shared/saved-media'),
      logDirectory: join(installationRoot, 'shared/logs'),
    },
    comfyui: { defaultInstanceId: 'fixture-instance' },
    source: {
      catalogCliPath,
      sourceCliPath,
      contractId: 'imagegen-source-contract',
      supportedContractVersions: [1],
    },
    client: { runRefreshIntervalMs: 1000 },
    process: { shutdownTimeoutMs: 10000 },
  }
  await writeFile(inputPath, `${JSON.stringify(installation, null, 2)}\n`, 'utf8')

  return { root, packageRoot, installation, inputPath, tarballPath, discoveryLog, catalogCliPath, sourceCliPath }
}

async function repackFixture(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  edit: (packageRoot: string) => Promise<void>,
) {
  await edit(fixture.packageRoot)
  const tar = await runProcess('tar', ['-czf', fixture.tarballPath, '-C', fixture.root, 'package'])
  if (tar.status !== 0) throw new Error(`fixture tarball failed: ${tar.stderr}`)
}

async function rewriteInstallation(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  edit: (installation: Record<string, any>) => void,
) {
  const installation = JSON.parse(JSON.stringify(fixture.installation)) as Record<string, any>
  edit(installation)
  await writeFile(fixture.inputPath, `${JSON.stringify(installation, null, 2)}\n`, 'utf8')
}

async function runPreflight(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  options: Parameters<typeof runProcess>[2] = {},
) {
  return runProcess(process.execPath, [
    cliScript,
    'preflight',
    '--installation', fixture.inputPath,
    '--artifact', fixture.tarballPath,
  ], options)
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('harness-comfyui preflight CLI', () => {
  it('validates a tarball, installation paths, free port, and both source discovery CLIs', async () => {
    const fixture = await createFixture()

    const result = await runPreflight(fixture)

    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' })
    expect(JSON.parse(result.stdout)).toMatchObject({
      stage: 'preflight',
      status: 'passed',
      installation: {
        installationId: 'fixture-preflight',
        configurationProfile: 'production',
        host: '127.0.0.1',
        port: fixture.installation.port,
      },
      artifact: { name: 'harness-comfyui', version: '0.1.0-test.1' },
      source: {
        catalog: { contract_id: 'imagegen-source-contract', contract_version: 1 },
        source: { contract_id: 'imagegen-source-contract', contract_version: 1 },
      },
    })
    expect((await readFile(fixture.discoveryLog, 'utf8')).trim().split('\n')).toEqual(['catalog', 'source'])
  })

  it('uses the packed packageManager version as the pnpm compatibility contract', async () => {
    const fixture = await createFixture()
    await repackFixture(fixture, async packageRoot => {
      const manifestPath = join(packageRoot, 'package.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
      manifest.packageManager = 'pnpm@11.8.0'
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    })

    const result = await runPreflight(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('pnpm version must be 11.8.0')
    expect(result.stderr).not.toContain('discovery CLI')
  })

  it('rejects a packed artifact without packageManager evidence', async () => {
    const fixture = await createFixture()
    await repackFixture(fixture, async packageRoot => {
      const manifestPath = join(packageRoot, 'package.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
      delete manifest.packageManager
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    })

    const result = await runPreflight(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('packageManager')
    expect(result.stderr).not.toContain('discovery CLI')
  })

  it('validates a production profile from an extracted package without node_modules', async () => {
    const fixture = await createFixture()
    await mkdir(join(fixture.packageRoot, 'lib'), { recursive: true })
    await mkdir(join(fixture.packageRoot, 'scripts/deploy'), { recursive: true })
    await copyFile(join(repositoryRoot, 'lib/config-profile-validator.js'), join(fixture.packageRoot, 'lib/config-profile-validator.js'))
    for (const filename of ['activate.mjs', 'cli.mjs', 'contracts.mjs', 'install.mjs', 'lifecycle.mjs', 'preflight.mjs', 'runtime-contract.mjs']) {
      await copyFile(join(repositoryRoot, 'scripts/deploy', filename), join(fixture.packageRoot, 'scripts/deploy', filename))
    }
    const tar = await runProcess('tar', ['-czf', fixture.tarballPath, '-C', fixture.root, 'package'])
    if (tar.status !== 0) throw new Error(`fixture tarball failed: ${tar.stderr}`)
    const extractedRoot = await mkdtemp(join(tmpdir(), 'harness-preflight-packed-'))
    temporaryRoots.push(extractedRoot)
    const extract = await runProcess('tar', ['-xzf', fixture.tarballPath, '-C', extractedRoot])
    if (extract.status !== 0) throw new Error(`fixture extraction failed: ${extract.stderr}`)

    const packageRoot = join(extractedRoot, 'package')
    const bundle = await readFile(join(packageRoot, 'lib/config-profile-validator.js'), 'utf8')
    const externalImports = [...bundle.matchAll(/(?:from|import\(|require\()\s*["']([^"']+)["']/gu)]
      .map(match => match[1])
      .filter(specifier => !specifier.startsWith('node:'))
    expect(externalImports).toEqual([])
    await expect(lstat(join(packageRoot, 'node_modules'))).rejects.toMatchObject({ code: 'ENOENT' })

    const env = { ...process.env }
    delete env.NODE_PATH
    const result = await runProcess(process.execPath, [
      join(packageRoot, 'scripts/deploy/cli.mjs'),
      'preflight',
      '--installation', fixture.inputPath,
      '--artifact', fixture.tarballPath,
    ], { cwd: extractedRoot, env })
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' })
    expect(JSON.parse(result.stdout)).toMatchObject({
      stage: 'preflight',
      status: 'passed',
      configuration: { profile: 'production' },
    })
  })

  it('rejects a runtime dependency version drift before probing the installation', async () => {
    const fixture = await createFixture()
    await repackFixture(fixture, async packageRoot => {
      const manifestPath = join(packageRoot, 'deployment/runtime/package.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { dependencies: Record<string, string> }
      manifest.dependencies['@deepseek-ai/dsh'] = '0.1.0-rc.6'
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    })

    const result = await runPreflight(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('runtime dependency @deepseek-ai/dsh')
    expect(result.stderr).toContain('0.1.0-rc.8')
    expect(result.stderr).not.toContain('discovery CLI')
  })

  it('rejects a tarball that omits a frozen runtime entry', async () => {
    const fixture = await createFixture()
    await repackFixture(fixture, async packageRoot => {
      await rm(join(packageRoot, 'deployment/runtime/pnpm-lock.yaml'))
    })

    const result = await runPreflight(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('deployment/runtime/pnpm-lock.yaml')
  })

  it('rejects a runtime workspace that declares any package besides .', async () => {
    const fixture = await createFixture()
    await repackFixture(fixture, async packageRoot => {
      const workspacePath = join(packageRoot, 'deployment/runtime/pnpm-workspace.yaml')
      const workspace = await readFile(workspacePath, 'utf8')
      await writeFile(workspacePath, workspace.replace('  - .\n', '  - .\n  - extra\n'), 'utf8')
    })

    const result = await runPreflight(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('must declare only package .')
  })

  it.each([
    ['a lock importer specifier drift', async (packageRoot: string) => {
      const lockPath = join(packageRoot, 'deployment/runtime/pnpm-lock.yaml')
      const lock = await readFile(lockPath, 'utf8')
      await writeFile(lockPath, lock.replace("specifier: 0.1.0-rc.8", "specifier: 0.1.0-rc.6"), 'utf8')
    }, 'importer . must resolve'],
    ['a lock package resolution drift', async (packageRoot: string) => {
      const lockPath = join(packageRoot, 'deployment/runtime/pnpm-lock.yaml')
      const lock = await readFile(lockPath, 'utf8')
      await writeFile(lockPath, lock.replace(/^  '@deepseek-ai\/dsh@0\.1\.0-rc\.8.*':$/gmu, "  '@deepseek-ai/dsh@0.1.0-rc.6':"), 'utf8')
    }, 'missing package resolution'],
    ['a workspace strict dependency policy drift', async (packageRoot: string) => {
      const workspacePath = join(packageRoot, 'deployment/runtime/pnpm-workspace.yaml')
      const workspace = await readFile(workspacePath, 'utf8')
      await writeFile(workspacePath, workspace.replace('strictDepBuilds: true', 'strictDepBuilds: false'), 'utf8')
    }, 'strictDepBuilds: true'],
    ['a workspace build allowlist drift', async (packageRoot: string) => {
      const workspacePath = join(packageRoot, 'deployment/runtime/pnpm-workspace.yaml')
      const workspace = await readFile(workspacePath, 'utf8')
      await writeFile(workspacePath, workspace.replace("  'koffi@3.1.5': true", "  'koffi@3.1.4': true"), 'utf8')
    }, 'frozen workspace policy'],
    ['a workspace overrides policy drift', async (packageRoot: string) => {
      const workspacePath = join(packageRoot, 'deployment/runtime/pnpm-workspace.yaml')
      const workspace = await readFile(workspacePath, 'utf8')
      await writeFile(workspacePath, workspace.replace(/overrides:\n(?:  [^\n]+\n)*/u, 'overrides:\n'), 'utf8')
    }, 'frozen overrides policy'],
  ])('rejects %s with frozen runtime evidence', async (_label, edit, expectedMessage) => {
    const fixture = await createFixture()
    await repackFixture(fixture, edit)

    const result = await runPreflight(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(expectedMessage)
  })

  it.each([
    ['an additional allowBuilds entry', (workspace: string) => workspace.replace(
      'allowBuilds:\n',
      "allowBuilds:\n  'unreviewed-package@1.0.0': true\n",
    ), 'allowBuilds'],
    ['a missing allowBuilds entry', (workspace: string) => workspace.replace(
      "  'koffi@3.1.5': true\n",
      '',
    ), 'allowBuilds'],
    ['a replaced allowBuilds decision', (workspace: string) => workspace.replace(
      "  'koffi@3.1.5': true\n",
      "  'koffi@3.1.5': false\n",
    ), 'allowBuilds'],
    ['an additional override entry', (workspace: string) => workspace.replace(
      'overrides:\n',
      "overrides:\n  'unreviewed-package@1.0.0': '1.0.0'\n",
    ), 'overrides'],
    ['a missing override entry', (workspace: string) => workspace.replace(
      "  'nanoid@>=3.0.0 <3.3.18': '3.3.18'\n",
      '',
    ), 'overrides'],
    ['a replaced override value', (workspace: string) => workspace.replace(
      "  'nanoid@>=3.0.0 <3.3.18': '3.3.18'\n",
      "  'nanoid@>=3.0.0 <3.3.18': '3.3.17'\n",
    ), 'overrides'],
  ])('rejects %s by comparing the complete frozen workspace policy', async (_label, edit, expectedMessage) => {
    const fixture = await createFixture()
    await repackFixture(fixture, async packageRoot => {
      const workspacePath = join(packageRoot, 'deployment/runtime/pnpm-workspace.yaml')
      const workspace = await readFile(workspacePath, 'utf8')
      await writeFile(workspacePath, edit(workspace), 'utf8')
    })

    const result = await runPreflight(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(expectedMessage)
    expect(result.stderr).toMatch(/frozen|policy|differs|exact/i)
  })

  it('rejects a tarball that omits the selected Configuration Profile', async () => {
    const fixture = await createFixture()
    await repackFixture(fixture, async packageRoot => {
      await rm(join(packageRoot, 'config/profiles/production.json'))
    })

    const result = await runPreflight(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('production')
    expect(result.stderr).toContain('config/profiles/production.json')
  })

  it('ignores ambient HARNESS_COMFYUI_* values and derives overrides only from installation.json', async () => {
    const fixture = await createFixture()

    const result = await runPreflight(fixture, {
      env: {
        ...process.env,
        HARNESS_COMFYUI_SERVER_PORT: 'not-a-port',
        HARNESS_COMFYUI_UNLISTED: 'must-be-ignored',
      },
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })

  it.each([
    ['a malformed selected profile', async (packageRoot: string) => {
      await writeFile(join(packageRoot, 'config/profiles/production.json'), '[not-an-object]\n', 'utf8')
    }, 'production'],
    ['an unknown selected profile property', async (packageRoot: string) => {
      const profilePath = join(packageRoot, 'config/profiles/production.json')
      const profile = JSON.parse(await readFile(profilePath, 'utf8')) as Record<string, unknown>
      profile.unknownProfileField = true
      await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8')
    }, 'unknown property'],
    ['an invalid merged profile value', async (packageRoot: string) => {
      const profilePath = join(packageRoot, 'config/profiles/production.json')
      const profile = JSON.parse(await readFile(profilePath, 'utf8')) as { source: Record<string, unknown> }
      profile.source.contractId = 'wrong-contract'
      await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8')
    }, 'contractId'],
    ['a malformed environment override map', async (packageRoot: string) => {
      const overridePath = join(packageRoot, 'config/environment-overrides.json')
      const overrides = JSON.parse(await readFile(overridePath, 'utf8')) as Record<string, unknown>
      overrides.HARNESS_COMFYUI_SERVER_PORT = 4173
      await writeFile(overridePath, `${JSON.stringify(overrides, null, 2)}\n`, 'utf8')
    }, 'environment-overrides.json'],
  ])('rejects %s with profile or tarball entry evidence', async (_label, edit, expectedMessage) => {
    const fixture = await createFixture()
    await repackFixture(fixture, edit)

    const result = await runPreflight(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(expectedMessage)
    expect(result.stderr).toContain('production')
  })

  it('exposes exactly ten commands and rejects unknown and unimplemented commands', async () => {
    const help = await runProcess(process.execPath, [cliScript, '--help'])
    expect(help.status).toBe(0)
    for (const command of [
      'install', 'preflight', 'start', 'stop', 'restart',
      'status', 'health', 'logs', 'upgrade', 'rollback',
    ]) {
      expect(help.stdout).toContain(`  ${command}`)
    }

    const unknown = await runProcess(process.execPath, [cliScript, 'unknown-command'])
    expect(unknown.status).not.toBe(0)
    expect(unknown.stderr).toContain('unknown command: unknown-command')

    const missingInstallation = await runProcess(process.execPath, [cliScript, 'restart'])
    expect(missingInstallation.status).not.toBe(0)
    expect(missingInstallation.stderr).toContain('usage: harness-comfyui restart --installation <absolute-json>')
    expect(missingInstallation.stderr).not.toContain('not implemented in this slice')
  })

  it.each([
    ['unknown root field', (installation: Record<string, any>) => { installation.unexpected = true }, 'installation.unexpected is an unknown field'],
    ['missing client field', (installation: Record<string, any>) => { delete installation.client }, 'installation.client is required'],
  ])('rejects an installation with a %s', async (_label, edit, message) => {
    const fixture = await createFixture()
    await rewriteInstallation(fixture, edit)

    const result = await runPreflight(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(message)
  })

  it.each([
    ['a data directory outside root', (installation: Record<string, any>) => {
      installation.paths.dataDir = join(installation.root, 'other-data')
    }, 'installation.paths.dataDir must equal'],
    ['a run repository outside dataDir', (installation: Record<string, any>) => {
      installation.paths.runRepositoryFile = join(installation.root, 'outside.sqlite')
    }, 'installation.paths.runRepositoryFile must be inside paths.dataDir'],
  ])('rejects %s', async (_label, edit, message) => {
    const fixture = await createFixture()
    await rewriteInstallation(fixture, edit)

    const result = await runPreflight(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(message)
  })

  it('rejects a source discovery identity that does not match the installation contract', async () => {
    const fixture = await createFixture()
    const discovery = {
      contract_id: 'wrong-contract',
      contract_version: 1,
      openapi: { openapi: '3.1.0', info: { title: 'fixture', version: '1' }, paths: {} },
    }
    await writeFile(fixture.sourceCliPath, `#!/usr/bin/env node
process.stdout.write(${JSON.stringify(JSON.stringify(discovery))})
`, 'utf8')
    await chmod(fixture.sourceCliPath, 0o755)

    const result = await runPreflight(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('source discovery contract_id must be imagegen-source-contract')
  })

  it('rejects an occupied installation port without starting a product process', async () => {
    const fixture = await createFixture()
    const blocker = createServer()
    await new Promise<void>((resolveListen, reject) => {
      blocker.once('error', reject)
      blocker.listen(fixture.installation.port, fixture.installation.host, () => resolveListen())
    })

    try {
      const result = await runPreflight(fixture)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain(`port ${fixture.installation.host}:${fixture.installation.port} is unavailable`)
      await expect(readFile(fixture.discoveryLog, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await new Promise<void>((resolveClose, reject) => blocker.close(error => error ? reject(error) : resolveClose()))
    }
  })
})
