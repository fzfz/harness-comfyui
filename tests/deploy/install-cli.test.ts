import { access, chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
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

async function runProcess(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<ProcessResult> {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', chunk => { stdout += String(chunk) })
  child.stderr?.on('data', chunk => { stderr += String(chunk) })
  const status = await new Promise<number>(resolveExit => child.on('close', code => resolveExit(code ?? 1)))
  return { status, stdout, stderr }
}

async function createFakePnpm(root: string): Promise<{ binDirectory: string; home: string }> {
  const binDirectory = join(root, 'fake-bin')
  const home = join(root, 'home')
  const dshSource = join(root, 'fake-dsh.mjs')
  await mkdir(binDirectory, { recursive: true })
  await mkdir(home, { recursive: true })
  await writeFile(dshSource, `#!/usr/bin/env node
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

if (process.argv.slice(2, 5).join(' ') !== 'plugin --profile comfyui-workbench') process.exit(2)
const manifestPath = join(process.env.DSH_HOME, 'profiles', 'comfyui-workbench', 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const packageSpec = process.argv.at(-1)
if (packageSpec === undefined) process.exit(3)
manifest.dependencies = { ...(manifest.dependencies ?? {}), 'harness-comfyui': 'file:' + packageSpec }
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\\n')
const profileDirectory = join(process.env.DSH_HOME, 'profiles', 'comfyui-workbench')
const installedPackage = join(profileDirectory, 'node_modules', 'harness-comfyui')
const unpackRoot = mkdtempSync(join(tmpdir(), 'harness-profile-package-'))
try {
  execFileSync('tar', ['-xzf', packageSpec, '-C', unpackRoot], { stdio: 'ignore' })
  cpSync(join(unpackRoot, 'package'), installedPackage, { recursive: true })
} finally {
  rmSync(unpackRoot, { recursive: true, force: true })
}
const ordinaryDependency = join(installedPackage, 'node_modules', '@deepseek-ai', 'schemastery')
mkdirSync(ordinaryDependency, { recursive: true })
writeFileSync(join(ordinaryDependency, 'package.json'), JSON.stringify({ name: '@deepseek-ai/schemastery', version: '3.18.1', type: 'module' }) + '\\n')
writeFileSync(join(ordinaryDependency, 'index.js'), 'export const resolvedFrom = "profile-node-modules"\\n')
mkdirSync(join(installedPackage, 'lib'), { recursive: true })
writeFileSync(join(installedPackage, 'lib/index.js'), 'import { resolvedFrom } from "@deepseek-ai/schemastery"\\nif (resolvedFrom !== "profile-node-modules") process.exit(4)\\n')
`, 'utf8')
  await chmod(dshSource, 0o755)
  await writeFile(join(binDirectory, 'pnpm'), `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
if (args.length === 1 && args[0] === '--version') {
  process.stdout.write('11.7.0\\n')
  process.exit(0)
}
if (args[0] !== 'install') process.exit(2)
const target = path.join(process.cwd(), 'node_modules', '.bin')
fs.mkdirSync(target, { recursive: true })
fs.copyFileSync(process.env.FAKE_DSH_SOURCE, path.join(target, 'dsh'))
fs.chmodSync(path.join(target, 'dsh'), 0o755)
`, 'utf8')
  await chmod(join(binDirectory, 'pnpm'), 0o755)
  return { binDirectory, home }
}

async function findFreePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolveListen())
  })
  const port = (server.address() as AddressInfo).port
  await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
  return port
}

async function createFixture({ symlinkEntry = false, outsideEntry = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'harness-install-cli-'))
  temporaryRoots.push(root)
  const installationRoot = join(root, 'installation')
  const packageRoot = join(root, 'package')
  const tarballPath = join(root, 'harness-comfyui-0.1.0-test.1.tgz')
  const inputPath = join(root, 'installation.json')
  const catalogCliPath = join(root, 'catalog-discovery.mjs')
  const sourceCliPath = join(root, 'source-discovery.mjs')
  const discovery = {
    contract_id: 'imagegen-source-contract',
    contract_version: 1,
    openapi: { openapi: '3.1.0', info: { title: 'fixture', version: '1' }, paths: {} },
  }
  const packageFiles = [
    'scripts/deploy/cli.mjs',
    'scripts/deploy/contracts.mjs',
    'scripts/deploy/install.mjs',
    'scripts/deploy/lifecycle.mjs',
    'scripts/deploy/preflight.mjs',
    'deployment/runtime/package.json',
    'deployment/runtime/pnpm-lock.yaml',
    'deployment/runtime/pnpm-workspace.yaml',
    'scripts/profile/materialize.mjs',
    'scripts/profile/start.mjs',
    'profiles/comfyui-workbench/package.json',
    'profiles/comfyui-workbench/cordis.patch.yml',
    'profiles/comfyui-workbench/pnpm-workspace.yaml',
  ]

  await mkdir(packageRoot, { recursive: true })
  await writeFile(join(packageRoot, 'package.json'), `${JSON.stringify({
    name: 'harness-comfyui',
    version: '0.1.0-test.1',
    engines: { node: '^22.19.0 || >=24.0.0' },
    bin: { 'harness-comfyui': 'scripts/deploy/cli.mjs' },
    dependencies: { '@deepseek-ai/schemastery': '3.18.1' },
    devDependencies: {
      '@deepseek-ai/dsh': '0.1.0-rc.7',
      '@deepseek-ai/dsh-base': '0.1.0-rc.7',
      '@deepseek-ai/dsh-web-app': '0.1.0-rc.7',
    },
    files: packageFiles,
  }, null, 2)}\n`, 'utf8')
  for (const relativePath of packageFiles) {
    const target = join(packageRoot, relativePath)
    await mkdir(resolve(target, '..'), { recursive: true })
    await copyFile(join(repositoryRoot, relativePath), target)
  }
  await mkdir(join(packageRoot, 'deployment/runtime'), { recursive: true })
  await writeFile(join(packageRoot, 'deployment/runtime/package.json'), `${JSON.stringify({
    name: 'harness-comfyui-runtime',
    private: true,
    dependencies: {
      '@deepseek-ai/dsh': '0.1.0-rc.7',
      '@deepseek-ai/dsh-base': '0.1.0-rc.7',
      '@deepseek-ai/dsh-web-app': '0.1.0-rc.7',
    },
  }, null, 2)}\n`, 'utf8')
  await writeFile(join(packageRoot, 'deployment/runtime/pnpm-lock.yaml'), 'lockfileVersion: \'9.0\'\n\nimporters: {}\n', 'utf8')
  await writeFile(join(packageRoot, 'deployment/runtime/pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n', 'utf8')
  if (symlinkEntry) await symlink('/tmp/harness-install-outside', join(packageRoot, 'unsafe-link'))
  if (outsideEntry) await writeFile(join(root, 'outside-entry.txt'), 'outside\n', 'utf8')

  await writeFile(catalogCliPath, `#!/usr/bin/env node
process.stdout.write(${JSON.stringify(JSON.stringify(discovery))})
`, 'utf8')
  await writeFile(sourceCliPath, `#!/usr/bin/env node
process.stdout.write(${JSON.stringify(JSON.stringify(discovery))})
`, 'utf8')
  await chmod(catalogCliPath, 0o755)
  await chmod(sourceCliPath, 0o755)

  const tarEntries = outsideEntry ? ['package', 'outside-entry.txt'] : ['package']
  const tar = await runProcess('tar', ['-czf', tarballPath, '-C', root, ...tarEntries], process.env)
  if (tar.status !== 0) throw new Error(`fixture tarball failed: ${tar.stderr}`)
  const fake = await createFakePnpm(root)
  const port = await findFreePort()
  const installation = {
    schemaVersion: 1,
    installationId: 'fixture-install',
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
  const env = {
    ...process.env,
    HOME: fake.home,
    USERPROFILE: fake.home,
    PATH: `${fake.binDirectory}${delimiter}${process.env.PATH ?? ''}`,
    FAKE_DSH_SOURCE: join(root, 'fake-dsh.mjs'),
  }
  return { root, installation, inputPath, tarballPath, env }
}

async function runInstall(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  artifactPath = fixture.tarballPath,
  env = fixture.env,
) {
  return runProcess(process.execPath, [
    cliScript,
    'install',
    '--installation', fixture.inputPath,
    '--artifact', artifactPath,
  ], env)
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    try {
      await access(path)
      return
    } catch {
      await new Promise(resolveDelay => setTimeout(resolveDelay, 25))
    }
  }
  throw new Error(`timed out waiting for ${path}`)
}

async function waitForProcessGone(pid: number): Promise<void> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
    } catch {
      return
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 25))
  }
  throw new Error(`process ${pid} is still running`)
}

async function runStableSignalCase(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  signal: NodeJS.Signals,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  const state = JSON.parse(await readFile(join(fixture.installation.root, 'state/active-release.json'), 'utf8')) as { releasePath: string }
  const releaseCli = join(state.releasePath, 'package/scripts/deploy/cli.mjs')
  const readyPath = join(fixture.root, `${signal}.ready`)
  const pidPath = join(fixture.root, `${signal}.pid`)
  const markerPath = join(fixture.root, `${signal}.received`)
  await writeFile(releaseCli, `import { appendFileSync, writeFileSync } from 'node:fs'

writeFileSync(${JSON.stringify(readyPath)}, 'ready\\n')
writeFileSync(${JSON.stringify(pidPath)}, String(process.pid))
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    appendFileSync(${JSON.stringify(markerPath)}, signal + '\\n')
    process.exit(signal === 'SIGINT' ? 130 : 143)
  })
}
setInterval(() => {}, 1000)
`, 'utf8')

  const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
  const child = spawn(stableBin, ['signal-test'], {
    cwd: repositoryRoot,
    env: {
      ...fixture.env,
      SIGNAL_UNRELATED_ENV: 'must-not-be-read-by-wrapper',
    },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let childPid: number | undefined
  const resultPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveResult, rejectResult) => {
    const timeout = setTimeout(() => rejectResult(new Error(`timed out waiting for stable bin ${signal} exit`)), 1500)
    child.once('error', error => {
      clearTimeout(timeout)
      rejectResult(error)
    })
    child.once('close', (code, exitSignal) => {
      clearTimeout(timeout)
      resolveResult({ code, signal: exitSignal })
    })
  })

  try {
    await waitForFile(readyPath)
    childPid = Number((await readFile(pidPath, 'utf8')).trim())
    if (!Number.isInteger(childPid)) throw new Error(`invalid child pid: ${childPid}`)
    expect(child.kill(signal)).toBe(true)
    const result = await resultPromise
    expect((await readFile(markerPath, 'utf8')).trim()).toBe(signal)
    await waitForProcessGone(childPid)
    return result
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    if (childPid !== undefined) {
      try {
        process.kill(childPid, 'SIGKILL')
      } catch {
        // The child already exited.
      }
    }
  }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('harness-comfyui install CLI', () => {
  it('creates a release package, runtime, dsh-home, active state, and stable help entry without process state', async () => {
    const fixture = await createFixture()

    const result = await runInstall(fixture)

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ stage: 'install', status: 'passed' })
    const releaseRoot = join(fixture.installation.root, 'releases/0.1.0-test.1')
    for (const relativePath of [
      'package/package.json',
      'harness-runtime/package.json',
      'harness-runtime/pnpm-lock.yaml',
      'harness-runtime/pnpm-workspace.yaml',
      'harness-runtime/node_modules/.bin/dsh',
      'dsh-home/profiles/comfyui-workbench/package.json',
      'dsh-home/profiles/comfyui-workbench/cordis.patch.yml',
      'dsh-home/profiles/comfyui-workbench/pnpm-workspace.yaml',
    ]) {
      await expect(lstat(join(releaseRoot, relativePath))).resolves.toBeDefined()
    }
    for (const relativePath of ['shared/data', 'shared/runs', 'shared/saved-media', 'shared/logs', 'state']) {
      await expect(lstat(join(fixture.installation.root, relativePath))).resolves.toBeDefined()
    }
    const state = JSON.parse(await readFile(join(fixture.installation.root, 'state/active-release.json'), 'utf8'))
    expect(state).toMatchObject({
      installationId: 'fixture-install',
      activeVersion: '0.1.0-test.1',
      previousRelease: null,
    })
    expect(state.releasePath).toBe(releaseRoot)
    const profileDependency = JSON.parse(await readFile(join(releaseRoot, 'dsh-home/profiles/comfyui-workbench/package.json'), 'utf8')).dependencies['harness-comfyui']
    expect(profileDependency).toBe(`file:${fixture.tarballPath}`)
    expect(profileDependency).not.toBe(`file:${releaseRoot}/package`)
    const installedPackageRoot = join(releaseRoot, 'dsh-home/profiles/comfyui-workbench/node_modules/harness-comfyui')
    const installedPackageStats = await lstat(installedPackageRoot)
    expect(installedPackageStats.isDirectory()).toBe(true)
    expect(installedPackageStats.isSymbolicLink()).toBe(false)
    const releaseLocalHost = await runProcess(process.execPath, [join(installedPackageRoot, 'lib/index.js')], fixture.env)
    expect(releaseLocalHost.status, releaseLocalHost.stderr).toBe(0)
    const stableBin = join(fixture.installation.root, 'bin/harness-comfyui')
    const stableHelp = await runProcess(stableBin, ['--help'], fixture.env)
    expect(stableHelp.status, stableHelp.stderr).toBe(0)
    expect(stableHelp.stdout).toContain('Commands:')
    await expect(lstat(join(fixture.installation.root, 'state/process.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  }, 30_000)

  it('rejects a duplicate release version without replacing the first release', async () => {
    const fixture = await createFixture()
    expect((await runInstall(fixture)).status).toBe(0)
    const statePath = join(fixture.installation.root, 'state/active-release.json')
    const before = await readFile(statePath, 'utf8')

    const result = await runInstall(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('already exists')
    expect(await readFile(statePath, 'utf8')).toBe(before)
  })

  it('rejects a tarball containing a symlink before creating a release', async () => {
    const fixture = await createFixture({ symlinkEntry: true })

    const result = await runInstall(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/symlink|unsafe tar/i)
    await expect(lstat(join(fixture.installation.root, 'releases'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a tarball entry outside package/ before creating a release', async () => {
    const fixture = await createFixture({ outsideEntry: true })

    const result = await runInstall(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/outside package|unsafe tar/i)
    await expect(lstat(join(fixture.installation.root, 'releases'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not commit a release when stable bin creation fails', async () => {
    const fixture = await createFixture()
    const binPath = join(fixture.installation.root, 'bin')
    await mkdir(fixture.installation.root, { recursive: true })
    await writeFile(binPath, 'bin path is occupied\n', 'utf8')

    const result = await runInstall(fixture)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('EEXIST')
    await expect(lstat(join(fixture.installation.root, 'state/active-release.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(lstat(join(fixture.installation.root, 'releases/0.1.0-test.1'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects install when an active release already exists and preserves it', async () => {
    const fixture = await createFixture()
    expect((await runInstall(fixture)).status).toBe(0)
    const statePath = join(fixture.installation.root, 'state/active-release.json')
    const stablePath = join(fixture.installation.root, 'bin/harness-comfyui')
    const beforeState = await readFile(statePath, 'utf8')
    const beforeStable = await readFile(stablePath, 'utf8')
    const packageManifestPath = join(fixture.root, 'package/package.json')
    const packageManifest = JSON.parse(await readFile(packageManifestPath, 'utf8'))
    packageManifest.version = '0.1.0-test.2'
    await writeFile(packageManifestPath, `${JSON.stringify(packageManifest, null, 2)}\n`, 'utf8')
    const secondArtifact = join(fixture.root, 'harness-comfyui-0.1.0-test.2.tgz')
    const tar = await runProcess('tar', ['-czf', secondArtifact, '-C', fixture.root, 'package'], process.env)
    expect(tar.status).toBe(0)

    const result = await runInstall(fixture, secondArtifact)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/upgrade/i)
    expect(await readFile(statePath, 'utf8')).toBe(beforeState)
    expect(await readFile(stablePath, 'utf8')).toBe(beforeStable)
    await expect(lstat(join(fixture.installation.root, 'releases/0.1.0-test.2'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.skipIf(process.env.HARNESS_REAL_ARTIFACT === undefined)('installs the current packed artifact with its frozen runtime', async () => {
    const fixture = await createFixture()
    const artifactPath = process.env.HARNESS_REAL_ARTIFACT
    if (artifactPath === undefined) return
    const result = await runInstall(fixture, artifactPath, {
      ...fixture.env,
      PATH: process.env.PATH ?? '',
    })

    expect(result.status).toBe(0)
    const evidence = JSON.parse(result.stdout)
    const releaseRoot = join(fixture.installation.root, 'releases', evidence.artifact.version)
    await expect(lstat(join(releaseRoot, 'harness-runtime/node_modules/.bin/dsh'))).resolves.toBeDefined()
    await expect(lstat(join(fixture.installation.root, 'bin/harness-comfyui'))).resolves.toBeDefined()
    await expect(lstat(join(fixture.installation.root, 'state/process.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  }, 120_000)

  it.skipIf(process.platform === 'win32')('forwards SIGINT and SIGTERM from the generated stable bin to its foreground child', async () => {
    const expected = { SIGINT: 130, SIGTERM: 143 } as const

    for (const signal of Object.keys(expected) as Array<keyof typeof expected>) {
      const fixture = await createFixture()
      expect((await runInstall(fixture)).status).toBe(0)

      const result = await runStableSignalCase(fixture, signal)

      expect(result.signal).toBeNull()
      expect(result.code).toBe(expected[signal])
    }
  }, 30_000)

  it('preserves the foreground child exit code in the generated stable bin', async () => {
    const fixture = await createFixture()
    expect((await runInstall(fixture)).status).toBe(0)
    const state = JSON.parse(await readFile(join(fixture.installation.root, 'state/active-release.json'), 'utf8')) as { releasePath: string }
    await writeFile(join(state.releasePath, 'package/scripts/deploy/cli.mjs'), 'process.exit(23)\n', 'utf8')

    const result = await runProcess(join(fixture.installation.root, 'bin/harness-comfyui'), ['normal-exit'], fixture.env)

    expect(result.status).toBe(23)
  })
})
