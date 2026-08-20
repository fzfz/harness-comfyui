import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const sharedReleaseSteps = Object.freeze([
  Object.freeze(['run', 'build']),
  Object.freeze(['run', 'package:pack']),
  Object.freeze(['run', 'package:validate']),
  Object.freeze(['run', 'release:smoke']),
])

function defaultRunCommand({ root, args }) {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const result = spawnSync(pnpm, args, {
    cwd: root,
    shell: false,
    stdio: 'inherit',
  })
  if (result.error) throw new Error(`release dry-run could not execute pnpm: ${result.error.message}`, { cause: result.error })
  return result.status ?? 1
}

function parseArguments(argv) {
  let root = repositoryRoot
  let seenRoot = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument !== '--root') throw new Error(`unknown argument ${argument}`)
    if (seenRoot) throw new Error('duplicate argument --root')
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error('--root requires a non-empty value')
    root = resolve(value)
    seenRoot = true
    index += 1
  }
  return root
}

export function runReleaseDryRun(root = repositoryRoot, options = {}) {
  const resolvedRoot = resolve(root)
  const runCommand = options.runCommand ?? defaultRunCommand
  for (const args of sharedReleaseSteps) {
    const status = runCommand({ root: resolvedRoot, args: [...args] })
    if (status !== 0) throw new Error(`release dry-run step ${args.join(' ')} failed with status ${status}`)
  }
  process.stdout.write('release dry-run completed without publish or deployment actions\n')
  return { steps: sharedReleaseSteps.map((args) => [...args]) }
}

export function main(argv = process.argv.slice(2)) {
  runReleaseDryRun(parseArguments(argv))
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main()
  } catch (error) {
    process.stderr.write(`release:dry-run: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
