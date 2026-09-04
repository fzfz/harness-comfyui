import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const {
  diagnose,
  diagnoseAdvisoryFailure,
  formatResult,
  main,
  parseArguments,
  probeCurl,
  probeDns,
  probeLocalPnpm,
  run,
} = await import(
  // @ts-expect-error Checked-in JavaScript diagnostic module.
  '../../scripts/security/diagnose-advisories.mjs'
)

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

type Probe = { ok: boolean; responded: boolean }

const pass = { ok: true, responded: true }
const timeout = { ok: false, responded: false }
const temporaryRoots: string[] = []
const originalCurlBin = process.env.CURL_BIN
const originalPnpmBin = process.env.PNPM_BIN

const completeProbe = {
  ok: true,
  responded: true,
  status: 200,
  remoteAddress: '127.0.0.1',
  dnsMs: 1,
  connectMs: 2,
  tlsMs: 3,
  firstByteMs: 4,
  responseBytes: 2,
  timedOut: false,
  exitCode: 0,
  durationMs: 5,
}

function completeResult() {
  return {
    ...result(),
    dns: { ok: true, addressCount: 1, durationMs: 1 },
    localPnpm: {
      ok: true,
      commandResult: { code: 0, timedOut: false, durationMs: 5 },
      requestBody: 'request-body-secret',
      requestHeaders: { 'content-type': 'application/json' },
      requestBytes: 19,
      packageCount: 2,
      versionCount: 3,
    },
    configuredPing: completeProbe,
    directPing: completeProbe,
    configuredPostPing: completeProbe,
    directPostPing: completeProbe,
    configuredQuickGet: completeProbe,
    directQuickGet: completeProbe,
    configuredQuick: completeProbe,
    directQuick: completeProbe,
    configuredBulkGet: completeProbe,
    directBulkGet: completeProbe,
    configuredBulk: completeProbe,
    directBulk: completeProbe,
    diagnosis: { code: 'NONE', message: 'completed' },
    proxyConfigured: true,
  }
}

afterEach(async () => {
  if (originalCurlBin === undefined) delete process.env.CURL_BIN
  else process.env.CURL_BIN = originalCurlBin
  if (originalPnpmBin === undefined) delete process.env.PNPM_BIN
  else process.env.PNPM_BIN = originalPnpmBin
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function result(overrides: Record<string, Probe> = {}) {
  return {
    localPnpm: pass,
    dns: pass,
    configuredPing: pass,
    directPing: pass,
    configuredPostPing: pass,
    directPostPing: pass,
    configuredQuickGet: pass,
    directQuickGet: pass,
    configuredQuick: pass,
    directQuick: pass,
    configuredBulkGet: pass,
    directBulkGet: pass,
    configuredBulk: pass,
    directBulk: pass,
    ...overrides,
  }
}

describe('npm advisory failure diagnosis', () => {
  it('rejects incomplete and invalid command arguments', () => {
    expect(() => parseArguments(['--root'])).toThrow(/usage: diagnose-advisories/u)
    expect(() => parseArguments(['--timeout-ms', '0'])).toThrow(/usage: diagnose-advisories/u)
    expect(() => parseArguments(['--timeout-ms', '300001'])).toThrow(/usage: diagnose-advisories/u)
    expect(() => parseArguments(['--timeout-ms', '9007199254740992'])).toThrow(/usage: diagnose-advisories/u)
    expect(() => parseArguments(['--unknown', 'value'])).toThrow(/usage: diagnose-advisories/u)
  })

  it('reports process startup failure and enforces the process deadline', async () => {
    const missing = await run('/path/that/does/not/exist', [], { cwd: repositoryRoot, timeoutMs: 100 })
    expect(missing.spawnError).toBeInstanceOf(Error)
    expect(missing.timedOut).toBe(false)

    const overdue = await run(process.execPath, ['--input-type=module', '--eval', 'setInterval(() => {}, 1000)'], {
      cwd: repositoryRoot,
      timeoutMs: 50,
    })
    expect(overdue.timedOut).toBe(true)
  })

  it('returns a failed probe when curl cannot connect', async () => {
    const root = await mkdtemp(join(tmpdir(), 'harness-audit-curl-'))
    temporaryRoots.push(root)
    const fakeCurl = join(root, 'curl')
    await writeFile(fakeCurl, '#!/bin/sh\nexit 7\n', 'utf8')
    await chmod(fakeCurl, 0o755)
    process.env.CURL_BIN = fakeCurl

    await expect(probeCurl('/-/ping', { route: 'direct', timeoutMs: 1_000 })).resolves.toMatchObject({
      ok: false,
      responded: false,
      timedOut: false,
      exitCode: 7,
    })
  })

  it('closes the local registry after pnpm exits without a bulk request', async () => {
    const root = await mkdtemp(join(tmpdir(), 'harness-audit-pnpm-'))
    temporaryRoots.push(root)
    const fakePnpm = join(root, 'pnpm')
    await writeFile(fakePnpm, '#!/bin/sh\nexit 1\n', 'utf8')
    await chmod(fakePnpm, 0o755)
    process.env.PNPM_BIN = fakePnpm

    await expect(probeLocalPnpm(repositoryRoot, 100)).resolves.toMatchObject({
      ok: false,
      requestBody: '',
      requestBytes: 0,
      packageCount: 0,
      versionCount: 0,
    })
  })

  it('closes the local registry when pnpm is terminated during a partial bulk upload', async () => {
    const root = await mkdtemp(join(tmpdir(), 'harness-audit-partial-'))
    temporaryRoots.push(root)
    const fakePnpm = join(root, 'pnpm')
    await writeFile(fakePnpm, `#!/usr/bin/env node
import http from 'node:http'
const registryArgument = process.argv.find(value => value.startsWith('--registry='))
const registry = new URL(registryArgument.slice('--registry='.length))
const request = http.request({ hostname: registry.hostname, port: registry.port, path: '/-/npm/v1/security/advisories/bulk', method: 'POST' })
request.write('{"partial":')
setInterval(() => {}, 1000)
`, 'utf8')
    await chmod(fakePnpm, 0o755)
    process.env.PNPM_BIN = fakePnpm

    const probe = await probeLocalPnpm(repositoryRoot, 100)
    expect(probe.ok).toBe(false)
    expect(probe.commandResult.timedOut).toBe(true)
    await expect(fetch(`http://127.0.0.1:${probe.registryPort}/-/ping`)).rejects.toThrow()
  })

  it('captures the real pnpm bulk request through a local registry', async () => {
    const probe = await probeLocalPnpm(repositoryRoot, 5_000)
    expect(probe.ok).toBe(true)
    expect(probe.packageCount).toBeGreaterThan(0)
    expect(probe.versionCount).toBeGreaterThanOrEqual(probe.packageCount)
    expect(probe.requestBytes).toBeGreaterThan(0)
    expect(probe.requestHeaders['content-type']).toMatch(/^application\/json/u)
  })

  it('runs the complete DNS, local pnpm, configured-route, and direct-route probe matrix', async () => {
    const calls: Array<{ path: string; options: Record<string, unknown> }> = []
    const localPnpm = completeResult().localPnpm
    const diagnostic = await diagnose(repositoryRoot, 321, {
      probeDnsFn: async () => ({ ok: true, addressCount: 1, durationMs: 1, timedOut: false }),
      probeLocalPnpmFn: async () => localPnpm,
      probeCurlFn: async (path: string, options: Record<string, unknown>) => {
        calls.push({ path, options })
        return completeProbe
      },
      environment: { HTTPS_PROXY: 'http://proxy-address-secret' },
    })

    expect(calls).toHaveLength(12)
    expect(calls.map(call => [call.path, call.options.method ?? 'GET', call.options.route])).toEqual([
      ['/-/ping', 'GET', 'configured'],
      ['/-/ping', 'GET', 'direct'],
      ['/-/ping', 'POST', 'configured'],
      ['/-/ping', 'POST', 'direct'],
      ['/-/npm/v1/security/audits/quick', 'GET', 'configured'],
      ['/-/npm/v1/security/audits/quick', 'GET', 'direct'],
      ['/-/npm/v1/security/audits/quick', 'POST', 'configured'],
      ['/-/npm/v1/security/audits/quick', 'POST', 'direct'],
      ['/-/npm/v1/security/advisories/bulk', 'GET', 'configured'],
      ['/-/npm/v1/security/advisories/bulk', 'GET', 'direct'],
      ['/-/npm/v1/security/advisories/bulk', 'POST', 'configured'],
      ['/-/npm/v1/security/advisories/bulk', 'POST', 'direct'],
    ])
    expect(calls.at(-1)?.options).toMatchObject({
      body: localPnpm.requestBody,
      headers: localPnpm.requestHeaders,
      timeoutMs: 321,
    })
    expect(diagnostic.diagnosis.code).toBe('NONE')
    expect(diagnostic.proxyConfigured).toBe(true)
  })

  it('applies the DNS deadline and returns a DNS failure diagnosis', async () => {
    const rejecters: Array<(error: Error) => void> = []
    const activeHandle = setInterval(() => {}, 1_000)
    let cancelled = false
    const createResolver = () => ({
      resolve4: () => new Promise<string[]>((_, reject) => { rejecters.push(reject) }),
      resolve6: () => new Promise<string[]>((_, reject) => { rejecters.push(reject) }),
      cancel: () => {
        cancelled = true
        clearInterval(activeHandle)
        rejecters.splice(0).forEach(reject => reject(new Error('cancelled')))
      },
    })
    const startedAt = performance.now()
    const diagnostic = await diagnose(repositoryRoot, 50, {
      probeDnsFn: (timeoutMs: number) => probeDns(timeoutMs, createResolver),
      probeLocalPnpmFn: async () => completeResult().localPnpm,
      probeCurlFn: async () => completeProbe,
      environment: {},
    })

    expect(performance.now() - startedAt).toBeLessThan(500)
    expect(cancelled).toBe(true)
    expect(diagnostic.dns).toMatchObject({ ok: false, addressCount: 0 })
    expect(diagnostic.diagnosis.code).toBe('DNS_RESOLUTION')
  })

  it('uses the same environment for route reporting and curl, with exact millisecond deadlines', async () => {
    const root = await mkdtemp(join(tmpdir(), 'harness-audit-curl-env-'))
    temporaryRoots.push(root)
    const fakeCurl = join(root, 'curl')
    const slowCurl = join(root, 'slow-curl')
    const capturePath = join(root, 'capture.txt')
    await writeFile(fakeCurl, `#!/bin/sh
printf '%s\n' "$HTTPS_PROXY|$HTTP_PROXY|$https_proxy|$http_proxy|$*" > "$CAPTURE_PATH"
printf '200\t127.0.0.1\t0.001\t0.002\t0.003\t0.004\t2'
`, 'utf8')
    await writeFile(slowCurl, '#!/bin/sh\nwhile :; do :; done\n', 'utf8')
    await chmod(fakeCurl, 0o755)
    await chmod(slowCurl, 0o755)
    const environment = {
      ...process.env,
      CURL_BIN: fakeCurl,
      CAPTURE_PATH: capturePath,
      HTTPS_PROXY: 'https://configured-proxy',
      HTTP_PROXY: 'http://configured-proxy',
      https_proxy: 'https://configured-lower-proxy',
      http_proxy: 'http://configured-lower-proxy',
    }

    const configured = await probeCurl('/-/ping', { route: 'configured', timeoutMs: 900, environment })
    expect(configured.ok).toBe(true)
    const configuredCapture = await readFile(capturePath, 'utf8')
    expect(configuredCapture).toContain('https://configured-proxy|http://configured-proxy')
    expect(configuredCapture).toContain('--connect-timeout 0.9 --max-time 0.9')

    const direct = await probeCurl('/-/ping', { route: 'direct', timeoutMs: 901, environment })
    expect(direct.ok).toBe(true)
    const directCapture = await readFile(capturePath, 'utf8')
    expect(directCapture).toMatch(/^\|\|\|\|/u)
    expect(directCapture).toContain('--connect-timeout 0.901 --max-time 0.901 --noproxy *')

    const slowStartedAt = performance.now()
    const slow = await probeCurl('/-/ping', {
      route: 'direct',
      timeoutMs: 50,
      environment: { ...environment, CURL_BIN: slowCurl },
    })
    expect(slow.timedOut).toBe(true)
    expect(performance.now() - slowStartedAt).toBeLessThan(1_000)
  })

  it('returns the diagnosis exit code and prints only the formatted diagnostic summary', async () => {
    const successful = completeResult()
    const output: string[] = []
    await expect(main(['--root', repositoryRoot, '--timeout-ms', '321'], {
      diagnoseFn: async () => successful,
      write: (value: string) => { output.push(value) },
    })).resolves.toBe(0)
    expect(output.join('')).toBe(formatResult(successful))
    expect(output.join('')).not.toContain(successful.localPnpm.requestBody)
    expect(output.join('')).not.toContain('proxy-address-secret')

    await expect(main([], {
      diagnoseFn: async () => ({ ...successful, diagnosis: { code: 'DNS_RESOLUTION', message: 'failed' } }),
      write: () => {},
    })).resolves.toBe(1)
  })

  it('identifies a local pnpm or lockfile failure before network failures', () => {
    expect(diagnoseAdvisoryFailure(result({ localPnpm: timeout, dns: timeout })).code).toBe('LOCAL_PNPM_OR_LOCKFILE')
  })

  it('identifies DNS and registry connectivity failures', () => {
    expect(diagnoseAdvisoryFailure(result({ dns: timeout })).code).toBe('DNS_RESOLUTION')
    expect(diagnoseAdvisoryFailure(result({ configuredPing: timeout, directPing: timeout })).code).toBe('REGISTRY_CONNECTIVITY')
  })

  it('identifies a configured route failure when direct access succeeds', () => {
    expect(diagnoseAdvisoryFailure(result({ configuredPing: timeout })).code).toBe('CONFIGURED_NETWORK_ROUTE')
    expect(diagnoseAdvisoryFailure(result({ configuredBulk: timeout })).code).toBe('CONFIGURED_BULK_ROUTE')
  })

  it('identifies the advisories bulk path when both routes fail but the direct control responds', () => {
    expect(diagnoseAdvisoryFailure(result({ configuredBulk: timeout, directBulk: timeout })).code).toBe('ADVISORIES_BULK_PATH')
  })

  it('identifies POST handling on registry security paths', () => {
    expect(diagnoseAdvisoryFailure(result({
      configuredBulk: timeout,
      directBulk: timeout,
      directQuick: timeout,
    })).code).toBe('REGISTRY_SECURITY_POST_HANDLING')
  })

  it('identifies the registry security API paths when ordinary POST responds', () => {
    expect(diagnoseAdvisoryFailure(result({
      configuredBulk: timeout,
      directBulk: timeout,
      directQuick: timeout,
      directQuickGet: timeout,
      directBulkGet: timeout,
    })).code).toBe('REGISTRY_SECURITY_API_PATHS')
  })

  it('identifies broad POST connectivity when no POST probe responds', () => {
    expect(diagnoseAdvisoryFailure(result({
      configuredBulk: timeout,
      directBulk: timeout,
      directQuick: timeout,
      directQuickGet: timeout,
      directBulkGet: timeout,
      directPostPing: timeout,
    })).code).toBe('HTTP_POST_CONNECTIVITY')
  })

  it('reports success when the configured route completes the exact bulk request', () => {
    expect(diagnoseAdvisoryFailure(result()).code).toBe('NONE')
  })
})
