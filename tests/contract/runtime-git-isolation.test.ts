import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '../..')

function gitSucceeds(args: string[]): boolean {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })

  if (result.error) throw result.error
  return result.status === 0
}

function isIgnored(relativePath: string): boolean {
  return gitSucceeds(['check-ignore', '--no-index', '--quiet', '--', relativePath])
}

function isTracked(relativePath: string): boolean {
  return gitSucceeds(['ls-files', '--error-unmatch', '--', relativePath])
}

describe('runtime installation git isolation', () => {
  it('ignores runtime artifacts while keeping product source files tracked', () => {
    const runtimeArtifacts = [
      'runtime/production/installation.json',
      'runtime/production/state/process.json',
      'runtime/production/logs/host.stdout.log',
      'runtime/production/logs/operations.jsonl',
      'runtime/production/releases/1.0.0/package.json',
    ]
    const productSources = ['src/host/plugin.ts', 'scripts/deploy/cli.mjs', 'package.json']

    for (const relativePath of runtimeArtifacts) {
      expect(isIgnored(relativePath), `${relativePath} must be ignored`).toBe(true)
    }

    for (const relativePath of productSources) {
      expect(isTracked(relativePath), `${relativePath} must remain tracked`).toBe(true)
      expect(isIgnored(relativePath), `${relativePath} must not be ignored`).toBe(false)
    }
  })
})
