import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const materializeScript = resolve(repositoryRoot, 'scripts/profile/materialize.mjs')
const startScript = resolve(repositoryRoot, 'scripts/profile/start.mjs')

interface CommandResult {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

interface FakePnpmRecord {
  event: string
  argv?: string[]
  cwd?: string
  dshHome?: string
  configuration?: string
  pid?: number
  signal?: string
}

function createTemporaryDirectory(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `harness-comfyui-${prefix}-`))
}

function writeFakePnpm(root: string): string {
  const binDirectory = join(root, 'bin')
  mkdirSync(binDirectory, { recursive: true })
  const executable = join(binDirectory, 'pnpm')
  writeFileSync(executable, `#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const recordPath = process.env.FAKE_PNPM_RECORD
const mode = process.env.FAKE_PNPM_MODE
const record = (entry) => {
  if (recordPath) appendFileSync(recordPath, JSON.stringify(entry) + '\\n')
}

record({
  event: 'spawn',
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  dshHome: process.env.DSH_HOME,
  configuration: process.env.HARNESS_COMFYUI_CONFIGURATION_PROFILE,
  pid: process.pid,
})

if (mode === 'materialize' || mode === 'pollute-default') {
  const manifestPath = join(process.env.DSH_HOME, 'profiles', 'comfyui-workbench', 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.dependencies = { ...(manifest.dependencies ?? {}), 'harness-comfyui': 'file:.' }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\\n')
  if (mode === 'pollute-default') {
    writeFileSync(process.env.FAKE_DSH_DEFAULT_MANIFEST, '{"polluted":true}\\n')
  }
  process.exit(0)
}

if (mode === 'exit') process.exit(Number(process.env.FAKE_PNPM_EXIT_CODE ?? '0'))

const stop = (signal) => {
  record({ event: 'signal', signal })
  process.exit(0)
}
process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))
setInterval(() => {}, 1000)
`, 'utf8')
  chmodSync(executable, 0o755)
  return binDirectory
}

function commandEnvironment(binDirectory: string, recordPath: string, mode: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ''}`,
    FAKE_PNPM_RECORD: recordPath,
    FAKE_PNPM_MODE: mode,
  }
}

function runNodeScript(script: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: repositoryRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('close', (code, signal) => resolveResult({ code, signal, stdout, stderr }))
  })
}

function readRecords(recordPath: string): FakePnpmRecord[] {
  return readFileSync(recordPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as FakePnpmRecord)
}

async function waitForRecord(recordPath: string): Promise<void> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    try {
      if (readRecords(recordPath).some(record => record.event === 'spawn')) return
    } catch {
      // The fake executable has not written its launch record yet.
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 20))
  }
  throw new Error(`fake pnpm did not start: ${recordPath}`)
}

describe('profile CLI seams', () => {
  it.each([
    ['--configuration', ['--dsh-home', '/tmp/dsh', '--package-spec', '.']],
    ['--dsh-home', ['--configuration', 'development', '--package-spec', '.']],
    ['--package-spec', ['--configuration', 'development', '--dsh-home', '/tmp/dsh']],
  ] as const)('materialize requires %s', async (missingFlag, args) => {
    const root = createTemporaryDirectory('required-materialize')
    try {
      const result = await runNodeScript(materializeScript, args, process.env)
      expect(result.code).not.toBe(0)
      expect(result.stderr).toContain(missingFlag)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('materializes the exact public profile files and calls dsh plugin add in the target DSH_HOME', async () => {
    const root = createTemporaryDirectory('materialize')
    const targetHome = join(root, 'target-home')
    const homeRoot = join(root, 'os-home')
    const defaultHome = join(homeRoot, '.dsh')
    const recordPath = join(root, 'pnpm-record.jsonl')
    const defaultManifestPath = join(defaultHome, 'profiles', 'comfyui-workbench', 'package.json')
    mkdirSync(join(defaultHome, 'profiles', 'comfyui-workbench'), { recursive: true })
    writeFileSync(defaultManifestPath, '{"sentinel":true}\n', 'utf8')
    const binDirectory = writeFakePnpm(root)
    try {
      const result = await runNodeScript(materializeScript, [
        '--configuration', 'development',
        '--dsh-home', targetHome,
        '--package-spec', '.',
      ], {
        ...commandEnvironment(binDirectory, recordPath, 'materialize'),
        HOME: homeRoot,
        USERPROFILE: homeRoot,
      })
      expect(result.code).toBe(0)

      const profileDirectory = join(targetHome, 'profiles', 'comfyui-workbench')
      for (const filename of ['cordis.patch.yml', 'pnpm-workspace.yaml']) {
        expect(readFileSync(join(profileDirectory, filename), 'utf8'))
          .toBe(readFileSync(resolve(repositoryRoot, 'profiles/comfyui-workbench', filename), 'utf8'))
      }
      const profileManifest = JSON.parse(readFileSync(join(profileDirectory, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>
        dsh?: { profile?: { bundles?: string[] } }
      }
      expect(profileManifest.dependencies?.['harness-comfyui']).toBe('file:.')
      expect(profileManifest.dsh?.profile?.bundles).toEqual([
        '@deepseek-ai/dsh-base',
        '@deepseek-ai/dsh-web-app',
        'harness-comfyui',
      ])

      const [launch] = readRecords(recordPath)
      expect(launch).toMatchObject({
        event: 'spawn',
        argv: ['exec', 'dsh', 'plugin', '--profile', 'comfyui-workbench', 'add', '.'],
        cwd: repositoryRoot,
        dshHome: targetHome,
      })
      expect(readFileSync(defaultManifestPath, 'utf8')).toBe('{"sentinel":true}\n')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails when plugin installation creates the default DSH home profile', async () => {
    const root = createTemporaryDirectory('materialize-default-home-pollution')
    const targetHome = join(root, 'target-home')
    const homeRoot = join(root, 'os-home')
    const defaultHome = join(homeRoot, '.dsh')
    const defaultManifestPath = join(defaultHome, 'profiles', 'comfyui-workbench', 'package.json')
    const recordPath = join(root, 'pnpm-record.jsonl')
    mkdirSync(join(defaultHome, 'profiles', 'comfyui-workbench'), { recursive: true })
    writeFileSync(defaultManifestPath, '{"sentinel":true}\n', 'utf8')
    const binDirectory = writeFakePnpm(root)
    try {
      const result = await runNodeScript(materializeScript, [
        '--configuration', 'development',
        '--dsh-home', targetHome,
        '--package-spec', '.',
      ], {
        ...commandEnvironment(binDirectory, recordPath, 'pollute-default'),
        FAKE_DSH_DEFAULT_MANIFEST: defaultManifestPath,
        HOME: homeRoot,
        USERPROFILE: homeRoot,
      })
      expect(result.code).not.toBe(0)
      expect(result.stderr).toContain('default DSH home profile manifest changed')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects the default DSH home as the materialization target', async () => {
    const root = createTemporaryDirectory('materialize-default-home-target')
    const homeRoot = join(root, 'os-home')
    const defaultHome = join(homeRoot, '.dsh')
    const recordPath = join(root, 'pnpm-record.jsonl')
    const binDirectory = writeFakePnpm(root)
    try {
      const result = await runNodeScript(materializeScript, [
        '--configuration', 'development',
        '--dsh-home', defaultHome,
        '--package-spec', '.',
      ], {
        ...commandEnvironment(binDirectory, recordPath, 'materialize'),
        HOME: homeRoot,
        USERPROFILE: homeRoot,
      })
      expect(result.code).not.toBe(0)
      expect(result.stderr).toContain('default DSH home')
      expect(existsSync(recordPath)).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it.each([
    ['--configuration', ['--dsh-home', '/tmp/dsh', '--host', '127.0.0.1', '--port', '4173']],
    ['--dsh-home', ['--configuration', 'development', '--host', '127.0.0.1', '--port', '4173']],
    ['--host', ['--configuration', 'development', '--dsh-home', '/tmp/dsh', '--port', '4173']],
    ['--port', ['--configuration', 'development', '--dsh-home', '/tmp/dsh', '--host', '127.0.0.1']],
  ] as const)('start requires %s', async (missingFlag, args) => {
    const result = await runNodeScript(startScript, args, process.env)
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain(missingFlag)
  })

  it('starts the foreground dsh process with explicit configuration and forwards its exit code', async () => {
    const root = createTemporaryDirectory('start-exit')
    const targetHome = join(root, 'target-home')
    const recordPath = join(root, 'pnpm-record.jsonl')
    const binDirectory = writeFakePnpm(root)
    try {
      const result = await runNodeScript(startScript, [
        '--configuration', 'test',
        '--dsh-home', targetHome,
        '--host', '127.0.0.1',
        '--port', '4311',
      ], {
        ...commandEnvironment(binDirectory, recordPath, 'exit'),
        FAKE_PNPM_EXIT_CODE: '37',
      })
      expect(result.code).toBe(37)
      expect(readRecords(recordPath)[0]).toMatchObject({
        argv: ['exec', 'dsh', '--profile', 'comfyui-workbench', '--host', '127.0.0.1', '--port', '4311'],
        cwd: repositoryRoot,
        dshHome: targetHome,
        configuration: 'test',
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('forwards SIGTERM to the foreground child and leaves no child process behind', async () => {
    const root = createTemporaryDirectory('start-signal')
    const targetHome = join(root, 'target-home')
    const recordPath = join(root, 'pnpm-record.jsonl')
    const binDirectory = writeFakePnpm(root)
    const child = spawn(process.execPath, [startScript,
      '--configuration', 'release-smoke',
      '--dsh-home', targetHome,
      '--host', '127.0.0.1',
      '--port', '0',
    ], {
      cwd: repositoryRoot,
      env: commandEnvironment(binDirectory, recordPath, 'signal'),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    try {
      await waitForRecord(recordPath)
      const [launch] = readRecords(recordPath)
      expect(launch.pid).toBeTypeOf('number')
      child.kill('SIGTERM')
      const result = await new Promise<CommandResult>((resolveResult, reject) => {
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', chunk => { stdout += String(chunk) })
        child.stderr.on('data', chunk => { stderr += String(chunk) })
        child.once('error', reject)
        child.once('close', (code, signal) => resolveResult({ code, signal, stdout, stderr }))
      })
      expect(result.code).toBe(0)
      expect(readRecords(recordPath)).toContainEqual({ event: 'signal', signal: 'SIGTERM' })
      expect(() => process.kill(launch.pid!, 0)).toThrow()
    } finally {
      if (!child.killed) child.kill('SIGKILL')
      rmSync(root, { recursive: true, force: true })
    }
  })
})
