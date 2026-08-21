import { createServer, type AddressInfo } from 'node:net'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
    engines: { node: '^22.19.0 || >=24.0.0' },
  })}\n`, 'utf8')
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

  return { root, installation, inputPath, tarballPath, discoveryLog, catalogCliPath, sourceCliPath }
}

async function rewriteInstallation(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  edit: (installation: Record<string, any>) => void,
) {
  const installation = JSON.parse(JSON.stringify(fixture.installation)) as Record<string, any>
  edit(installation)
  await writeFile(fixture.inputPath, `${JSON.stringify(installation, null, 2)}\n`, 'utf8')
}

async function runPreflight(fixture: Awaited<ReturnType<typeof createFixture>>) {
  return runProcess(process.execPath, [
    cliScript,
    'preflight',
    '--installation', fixture.inputPath,
    '--artifact', fixture.tarballPath,
  ])
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

    const unimplemented = await runProcess(process.execPath, [cliScript, 'restart'])
    expect(unimplemented.status).not.toBe(0)
    expect(unimplemented.stderr).toContain('command restart is not implemented in this slice')
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
