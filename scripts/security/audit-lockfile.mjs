import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runtimeDirectory } from './check-manifest-lock.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const registry = 'https://registry.npmjs.org'
const severities = ['critical', 'high', 'moderate', 'low']

function parseArguments(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag !== '--root') throw new Error(`unknown argument ${flag}`)
    if (values.has(flag)) throw new Error('duplicate argument --root')
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--') || value.length === 0) {
      throw new Error('--root requires a non-empty value')
    }
    values.set(flag, value)
    index += 1
  }
  return resolve(values.get('--root') ?? repositoryRoot)
}

function runPnpmAudit(workspaceRoot, workspaceName, production) {
  const command = process.env.PNPM_BIN ?? (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
  const args = ['audit']
  if (production) args.push('--prod')
  args.push('--json', `--registry=${registry}`)
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    env: { ...process.env },
    encoding: 'utf8',
    shell: false,
  })
  if (result.error !== undefined) {
    throw new Error(`${workspaceName} ${production ? 'production' : 'full'} audit could not execute pnpm: ${String(result.error)}`)
  }
  const output = String(result.stdout ?? '')
  if (result.status !== 0) {
    throw new Error(`${workspaceName} ${production ? 'production' : 'full'} audit exited with code ${String(result.status)}\n${output}${String(result.stderr ?? '')}`)
  }
  return output
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
  const counts = {}
  for (const severity of severities) {
    const count = vulnerabilities[severity]
    if (typeof count !== 'number' || !Number.isFinite(count) || !Number.isInteger(count) || count < 0) {
      throw new Error(`${scope} audit JSON has invalid metadata.vulnerabilities.${severity}`)
    }
    counts[severity] = count
  }
  const nonZero = severities.filter(severity => counts[severity] !== 0)
  if (nonZero.length > 0) {
    throw new Error(`${scope} audit found vulnerabilities: ${nonZero.map(severity => `${severity}=${counts[severity]}`).join(', ')}`)
  }
  return counts
}

export function auditLockfile(root = repositoryRoot) {
  const workspaces = [
    { name: 'root', path: resolve(root) },
    { name: 'runtime', path: resolve(root, runtimeDirectory) },
  ]
  const summaries = {}
  for (const workspace of workspaces) {
    const full = parseAuditJson(runPnpmAudit(workspace.path, workspace.name, false), `${workspace.name} full`)
    const production = parseAuditJson(runPnpmAudit(workspace.path, workspace.name, true), `${workspace.name} production`)
    summaries[workspace.name] = { full, production }
  }
  return {
    ...summaries,
    full: summaries.root.full,
    production: summaries.root.production,
  }
}

function formatCounts(counts) {
  return severities.map(severity => `${severity}=${counts[severity]}`).join(' ')
}

export function main(argv = process.argv.slice(2)) {
  const root = parseArguments(argv)
  const summaries = auditLockfile(root)
  process.stdout.write(`full: ${formatCounts(summaries.root.full)} (root)\n`)
  process.stdout.write(`production: ${formatCounts(summaries.root.production)} (root)\n`)
  process.stdout.write(`runtime full: ${formatCounts(summaries.runtime.full)}\n`)
  process.stdout.write(`runtime production: ${formatCounts(summaries.runtime.production)}\n`)
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
