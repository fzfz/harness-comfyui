import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const registry = 'https://registry.npmjs.org'
const severities = ['critical', 'high', 'moderate', 'low']

function parseArguments(argv) {
  if (argv.length === 0) return repositoryRoot
  if (argv.length !== 2 || argv[0] !== '--root' || argv[1].length === 0) {
    throw new Error('usage: audit-lockfile [--root <repository>]')
  }
  return resolve(argv[1])
}

export function parseAuditJson(output, scope) {
  let parsed
  try {
    parsed = JSON.parse(output.trim())
  } catch (error) {
    throw new Error(`${scope} audit returned malformed JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  const vulnerabilities = parsed?.metadata?.vulnerabilities
  if (vulnerabilities === null || typeof vulnerabilities !== 'object' || Array.isArray(vulnerabilities)) {
    throw new Error(`${scope} audit JSON is missing metadata.vulnerabilities`)
  }
  const counts = Object.fromEntries(severities.map(severity => {
    const count = vulnerabilities[severity]
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(`${scope} audit has invalid ${severity} count`)
    return [severity, count]
  }))
  const nonZero = severities.filter(severity => counts[severity] !== 0)
  if (nonZero.length > 0) throw new Error(`${scope} audit found vulnerabilities: ${nonZero.map(key => `${key}=${counts[key]}`).join(', ')}`)
  return counts
}

function runAudit(root, production) {
  const command = process.env.PNPM_BIN ?? (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
  const args = ['audit']
  if (production) args.push('--prod')
  args.push('--json', `--registry=${registry}`)
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env }, encoding: 'utf8', shell: false })
  if (result.error !== undefined) throw new Error(`cannot execute pnpm audit: ${String(result.error)}`)
  if (result.status !== 0) throw new Error(`pnpm audit exited with code ${String(result.status)}\n${String(result.stdout ?? '')}${String(result.stderr ?? '')}`)
  return parseAuditJson(String(result.stdout ?? ''), production ? 'production' : 'full')
}

export function auditLockfile(root = repositoryRoot) {
  return { full: runAudit(root, false), production: runAudit(root, true) }
}

function formatCounts(counts) {
  return severities.map(severity => `${severity}=${counts[severity]}`).join(' ')
}

export function main(argv = process.argv.slice(2)) {
  const root = parseArguments(argv)
  const result = auditLockfile(root)
  process.stdout.write(`full: ${formatCounts(result.full)}\n`)
  process.stdout.write(`production: ${formatCounts(result.production)}\n`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main()
  } catch (error) {
    process.stderr.write(`security:advisories: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
