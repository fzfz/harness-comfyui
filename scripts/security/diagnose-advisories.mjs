import { spawn } from 'node:child_process'
import { Resolver } from 'node:dns/promises'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const registryOrigin = 'https://registry.npmjs.org'
const bulkPath = '/-/npm/v1/security/advisories/bulk'
const quickPath = '/-/npm/v1/security/audits/quick'
const pingPath = '/-/ping'
const defaultTimeoutMs = 15_000
const maximumTimeoutMs = 300_000
const processDeadlineMarginMs = 250

export function parseArguments(argv) {
  let root = repositoryRoot
  let timeoutMs = defaultTimeoutMs
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (name === '--root' && value) root = resolve(value)
    else if (
      name === '--timeout-ms'
      && /^\d+$/u.test(value ?? '')
      && Number.isSafeInteger(Number(value))
      && Number(value) > 0
      && Number(value) <= maximumTimeoutMs
    ) timeoutMs = Number(value)
    else throw new Error('usage: diagnose-advisories [--root <repository>] [--timeout-ms <milliseconds>]')
  }
  return { root, timeoutMs }
}

export function run(command, args, { cwd, env = process.env, input, timeoutMs }) {
  return new Promise(resolveResult => {
    const startedAt = performance.now()
    const child = spawn(command, args, { cwd, env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let spawnError
    let settled = false
    let timer

    const finish = (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveResult({ code, signal, timedOut, spawnError, stdout, stderr, durationMs: Math.round(performance.now() - startedAt) })
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', error => {
      spawnError = error
      finish(null, null)
    })
    child.on('close', finish)

    timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 500).unref()
    }, timeoutMs)

    child.stdin.end(input)
  })
}

function listen(server) {
  return new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolveListen()
    })
  })
}

function close(server) {
  return new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
}

async function collectBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

export async function probeLocalPnpm(root, timeoutMs = defaultTimeoutMs) {
  const requests = []
  const server = createServer((request, response) => {
    collectBody(request).then(body => {
      requests.push({ method: request.method, url: request.url, headers: request.headers, body })
      response.writeHead(request.method === 'POST' && request.url === bulkPath ? 200 : 404, { 'content-type': 'application/json' })
      response.end('{}')
    }).catch(() => {
      if (!response.destroyed) response.destroy()
    })
  })
  await listen(server)
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('local registry did not expose a TCP port')
  const pnpm = process.env.PNPM_BIN ?? (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
  let commandResult
  try {
    commandResult = await run(pnpm, ['--pm-on-fail=ignore', 'audit', '--json', `--registry=http://127.0.0.1:${address.port}`], { cwd: root, timeoutMs })
  } finally {
    await close(server)
  }
  const bulkRequest = requests.find(request => request.method === 'POST' && request.url === bulkPath)
  let payload
  try {
    payload = JSON.parse(bulkRequest?.body ?? '')
  } catch {
    payload = null
  }
  const packageCount = payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.keys(payload).length : 0
  const versionCount = packageCount === 0 ? 0 : Object.values(payload).reduce(
    (count, versions) => count + (Array.isArray(versions) ? versions.length : 0),
    0,
  )
  return {
    ok: commandResult.code === 0 && !commandResult.timedOut && packageCount > 0,
    commandResult,
    requestBody: bulkRequest?.body ?? '',
    requestHeaders: Object.fromEntries(
      ['accept', 'accept-encoding', 'content-type', 'npm-command', 'npm-scope', 'user-agent']
        .flatMap(name => typeof bulkRequest?.headers[name] === 'string' ? [[name, bulkRequest.headers[name]]] : []),
    ),
    requestBytes: Buffer.byteLength(bulkRequest?.body ?? ''),
    packageCount,
    versionCount,
    registryPort: address.port,
  }
}

function withoutProxy(environment) {
  const direct = { ...environment }
  for (const name of ['ALL_PROXY', 'HTTPS_PROXY', 'HTTP_PROXY', 'all_proxy', 'https_proxy', 'http_proxy']) delete direct[name]
  return direct
}

function proxyIsConfigured(environment) {
  return ['ALL_PROXY', 'HTTPS_PROXY', 'HTTP_PROXY', 'all_proxy', 'https_proxy', 'http_proxy'].some(name => Boolean(environment[name]))
}

export async function probeCurl(path, { method = 'GET', body, headers = {}, route, timeoutMs, environment = process.env }) {
  const timeoutSeconds = String(timeoutMs / 1000)
  const args = [
    '--silent',
    '--show-error',
    '--output', process.platform === 'win32' ? 'NUL' : '/dev/null',
    '--write-out', '%{http_code}\t%{remote_ip}\t%{time_namelookup}\t%{time_connect}\t%{time_appconnect}\t%{time_starttransfer}\t%{size_download}',
    '--connect-timeout', timeoutSeconds,
    '--max-time', timeoutSeconds,
  ]
  if (route === 'direct') args.push('--noproxy', '*')
  if (method === 'POST') {
    args.push('--request', 'POST', '--data-binary', '@-')
    const requestHeaders = Object.keys(headers).length === 0 ? { 'content-type': 'application/json' } : headers
    for (const [name, value] of Object.entries(requestHeaders)) args.push('--header', `${name}: ${value}`)
  }
  args.push(`${registryOrigin}${path}`)
  const commandEnvironment = route === 'direct' ? withoutProxy(environment) : environment
  const result = await run(environment.CURL_BIN ?? 'curl', args, {
    cwd: repositoryRoot,
    env: commandEnvironment,
    input: body,
    timeoutMs: timeoutMs + processDeadlineMarginMs,
  })
  const [statusText, remoteAddress = '', dnsSeconds = '0', connectSeconds = '0', tlsSeconds = '0', firstByteSeconds = '0', bytesText = '0'] = result.stdout.trim().split('\t')
  const status = Number(statusText)
  return {
    ok: result.code === 0 && status >= 200 && status < 300,
    responded: status > 0,
    status: Number.isFinite(status) ? status : 0,
    remoteAddress,
    dnsMs: Math.round(Number(dnsSeconds) * 1000),
    connectMs: Math.round(Number(connectSeconds) * 1000),
    tlsMs: Math.round(Number(tlsSeconds) * 1000),
    firstByteMs: Math.round(Number(firstByteSeconds) * 1000),
    responseBytes: Number(bytesText) || 0,
    timedOut: result.timedOut || result.code === 28,
    exitCode: result.code,
    durationMs: result.durationMs,
  }
}

export function diagnoseAdvisoryFailure(result) {
  if (!result.localPnpm.ok) return { code: 'LOCAL_PNPM_OR_LOCKFILE', message: 'pnpm audit could not complete against the local registry fixture.' }
  if (!result.dns.ok) return { code: 'DNS_RESOLUTION', message: 'registry.npmjs.org did not resolve.' }
  if (!result.configuredPing.ok && result.directPing.ok) return { code: 'CONFIGURED_NETWORK_ROUTE', message: 'The configured network route failed while the direct registry route succeeded.' }
  if (!result.configuredPing.ok && !result.directPing.ok) return { code: 'REGISTRY_CONNECTIVITY', message: 'Neither the configured nor direct route reached the registry ping endpoint.' }
  if (!result.configuredBulk.ok && result.directBulk.ok) return { code: 'CONFIGURED_BULK_ROUTE', message: 'The exact bulk request failed through the configured route and succeeded through the direct route.' }
  if (!result.configuredBulk.ok && !result.directBulk.ok && result.directQuick.responded) {
    return { code: 'ADVISORIES_BULK_PATH', message: 'The exact bulk request failed through both routes while the direct security quick endpoint responded.' }
  }
  if (!result.configuredBulk.ok && !result.directBulk.ok && (result.directQuickGet.responded || result.directBulkGet.responded)) {
    return { code: 'REGISTRY_SECURITY_POST_HANDLING', message: 'The registry security paths responded to GET but did not respond to POST.' }
  }
  if (!result.configuredBulk.ok && !result.directBulk.ok && result.directPostPing.responded) {
    return { code: 'REGISTRY_SECURITY_API_PATHS', message: 'The registry responded to ordinary GET and POST requests but did not respond on either security API path.' }
  }
  if (!result.configuredBulk.ok && !result.directBulk.ok) return { code: 'HTTP_POST_CONNECTIVITY', message: 'The registry GET probe succeeded, but the direct POST probes did not return a response.' }
  return { code: 'NONE', message: 'The configured route completed the exact pnpm advisories bulk request.' }
}

export async function probeDns(timeoutMs = defaultTimeoutMs, createResolver = () => new Resolver()) {
  const startedAt = performance.now()
  const resolver = createResolver()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    resolver.cancel()
  }, timeoutMs)
  try {
    const results = await Promise.allSettled([
      resolver.resolve4('registry.npmjs.org'),
      resolver.resolve6('registry.npmjs.org'),
    ])
    const addresses = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
    const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
    return {
      ok: addresses.length > 0,
      addressCount: addresses.length,
      durationMs: Math.round(performance.now() - startedAt),
      timedOut,
      ...(addresses.length === 0 && errors.length > 0
        ? { error: errors.map(error => error instanceof Error ? error.message : String(error)).join('; ') }
        : {}),
    }
  } finally {
    clearTimeout(timer)
  }
}

function formatProbe(name, probe) {
  const outcome = probe.ok ? 'PASS' : probe.responded ? 'RESPONDED' : probe.timedOut ? 'TIMEOUT' : 'FAIL'
  return `${name}: ${outcome} status=${probe.status} exit=${String(probe.exitCode)} dns=${probe.dnsMs}ms connect=${probe.connectMs}ms tls=${probe.tlsMs}ms first_byte=${probe.firstByteMs}ms total=${probe.durationMs}ms bytes=${probe.responseBytes}`
}

export async function diagnose(root = repositoryRoot, timeoutMs = defaultTimeoutMs, dependencies = {}) {
  const probeDnsFn = dependencies.probeDnsFn ?? probeDns
  const probeLocalPnpmFn = dependencies.probeLocalPnpmFn ?? probeLocalPnpm
  const probeCurlFn = dependencies.probeCurlFn ?? probeCurl
  const environment = dependencies.environment ?? process.env
  const dns = await probeDnsFn(timeoutMs)

  const localPnpm = await probeLocalPnpmFn(root, timeoutMs)
  const [
    configuredPing,
    directPing,
    configuredPostPing,
    directPostPing,
    configuredQuickGet,
    directQuickGet,
    configuredQuick,
    directQuick,
    configuredBulkGet,
    directBulkGet,
    configuredBulk,
    directBulk,
  ] = await Promise.all([
    probeCurlFn(pingPath, { route: 'configured', timeoutMs, environment }),
    probeCurlFn(pingPath, { route: 'direct', timeoutMs, environment }),
    probeCurlFn(pingPath, { method: 'POST', body: '{}', route: 'configured', timeoutMs, environment }),
    probeCurlFn(pingPath, { method: 'POST', body: '{}', route: 'direct', timeoutMs, environment }),
    probeCurlFn(quickPath, { route: 'configured', timeoutMs, environment }),
    probeCurlFn(quickPath, { route: 'direct', timeoutMs, environment }),
    probeCurlFn(quickPath, { method: 'POST', body: '{}', route: 'configured', timeoutMs, environment }),
    probeCurlFn(quickPath, { method: 'POST', body: '{}', route: 'direct', timeoutMs, environment }),
    probeCurlFn(bulkPath, { route: 'configured', timeoutMs, environment }),
    probeCurlFn(bulkPath, { route: 'direct', timeoutMs, environment }),
    probeCurlFn(bulkPath, { method: 'POST', body: localPnpm.requestBody, headers: localPnpm.requestHeaders, route: 'configured', timeoutMs, environment }),
    probeCurlFn(bulkPath, { method: 'POST', body: localPnpm.requestBody, headers: localPnpm.requestHeaders, route: 'direct', timeoutMs, environment }),
  ])
  const result = {
    dns,
    localPnpm,
    configuredPing,
    directPing,
    configuredPostPing,
    directPostPing,
    configuredQuickGet,
    directQuickGet,
    configuredQuick,
    directQuick,
    configuredBulkGet,
    directBulkGet,
    configuredBulk,
    directBulk,
  }
  return { ...result, diagnosis: diagnoseAdvisoryFailure(result), proxyConfigured: proxyIsConfigured(environment) }
}

export function formatResult(result) {
  return [
    `dns: ${result.dns.ok ? 'PASS' : 'FAIL'} addresses=${result.dns.addressCount} total=${result.dns.durationMs}ms`,
    `local_pnpm: ${result.localPnpm.ok ? 'PASS' : result.localPnpm.commandResult.timedOut ? 'TIMEOUT' : 'FAIL'} packages=${result.localPnpm.packageCount} versions=${result.localPnpm.versionCount} request_bytes=${result.localPnpm.requestBytes} exit=${String(result.localPnpm.commandResult.code)} total=${result.localPnpm.commandResult.durationMs}ms`,
    `configured_route_proxy_environment: ${result.proxyConfigured ? 'present' : 'absent'}`,
    formatProbe('configured_ping', result.configuredPing),
    formatProbe('direct_ping', result.directPing),
    formatProbe('configured_ping_post', result.configuredPostPing),
    formatProbe('direct_ping_post', result.directPostPing),
    formatProbe('configured_quick_get', result.configuredQuickGet),
    formatProbe('direct_quick_get', result.directQuickGet),
    formatProbe('configured_quick', result.configuredQuick),
    formatProbe('direct_quick', result.directQuick),
    formatProbe('configured_bulk_get', result.configuredBulkGet),
    formatProbe('direct_bulk_get', result.directBulkGet),
    formatProbe('configured_bulk', result.configuredBulk),
    formatProbe('direct_bulk', result.directBulk),
    `diagnosis: ${result.diagnosis.code} ${result.diagnosis.message}`,
  ].join('\n') + '\n'
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const { root, timeoutMs } = parseArguments(argv)
  const diagnoseFn = dependencies.diagnoseFn ?? diagnose
  const write = dependencies.write ?? (output => process.stdout.write(output))
  const result = await diagnoseFn(root, timeoutMs)
  write(formatResult(result))
  return result.diagnosis.code === 'NONE' ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    exitCode => { process.exitCode = exitCode },
    error => {
      process.stderr.write(`diagnose:advisories: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    },
  )
}
