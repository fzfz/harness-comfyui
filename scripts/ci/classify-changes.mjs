import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadQualityPolicy, repositoryRoot } from './quality-policy.mjs'

const exactCommit = /^[0-9a-f]{40}$/u
const zeroCommit = /^0{40}$/u

function normalizeChangedPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) return null
  if (value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:[\\/]/u.test(value)) return null
  const normalized = value.replaceAll('\\', '/')
  if (normalized !== value || normalized.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) return null
  return normalized
}

function isFastOnlyPath(path, policy) {
  const normalized = normalizeChangedPath(path)
  if (normalized === null) return false
  return policy.fastOnlyFiles.includes(normalized) || policy.fastOnlyPrefixes.some(prefix => normalized.startsWith(prefix))
}

export function classifyChangedPaths(changedPaths, root = repositoryRoot, options = {}) {
  const policy = options.policy ?? loadQualityPolicy(root)
  const paths = Array.isArray(changedPaths) ? changedPaths : []
  if (options.workflowDispatch === true || paths.length === 0) {
    return {
      qualify: true,
      changedPaths: paths,
      fastOnlyPaths: [],
      unknownPaths: paths,
    }
  }
  const fastOnlyPaths = paths.filter(path => isFastOnlyPath(path, policy))
  const unknownPaths = paths.filter(path => !isFastOnlyPath(path, policy))
  return {
    qualify: unknownPaths.length > 0,
    changedPaths: paths,
    fastOnlyPaths,
    unknownPaths,
  }
}

function parseArguments(argv) {
  const options = { root: repositoryRoot, before: undefined, after: undefined, eventName: process.env.GITHUB_EVENT_NAME }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--root' || argument === '--before' || argument === '--after' || argument === '--event-name') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a non-empty value`)
      if (argument === '--root') options.root = resolve(value)
      if (argument === '--before') options.before = value
      if (argument === '--after') options.after = value
      if (argument === '--event-name') options.eventName = value
      index += 1
      continue
    }
    throw new Error(`unknown argument ${argument}`)
  }
  return options
}

function changedPathsFromGit(root, before, after) {
  if (!exactCommit.test(before) || !exactCommit.test(after) || zeroCommit.test(before) || zeroCommit.test(after)) {
    throw new Error('before and after must be non-zero lowercase 40-character commits')
  }
  const result = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACMR', before, after], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  })
  if (result.error) throw new Error(`git diff could not execute: ${result.error.message}`, { cause: result.error })
  if (result.status !== 0) throw new Error(`git diff failed with status ${result.status}: ${(result.stderr ?? '').trim()}`)
  return result.stdout.split(/\r?\n/u).filter(Boolean)
}

export function main(argv = process.argv.slice(2)) {
  let options
  try {
    options = parseArguments(argv)
  } catch (error) {
    process.stderr.write(`quality change classification failed closed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.stdout.write('true\n')
    return 0
  }
  let result
  try {
    if (options.eventName === 'workflow_dispatch') {
      result = classifyChangedPaths([], options.root, { workflowDispatch: true })
    } else if (!options.before || !options.after) {
      result = { qualify: true }
    } else {
      result = classifyChangedPaths(changedPathsFromGit(options.root, options.before, options.after), options.root)
    }
  } catch (error) {
    process.stderr.write(`quality change classification failed closed: ${error instanceof Error ? error.message : String(error)}\n`)
    result = { qualify: true }
  }
  process.stdout.write(`${result.qualify}\n`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}
