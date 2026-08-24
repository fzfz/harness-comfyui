import { existsSync } from 'node:fs'
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

describe('source runtime git isolation', () => {
  it('ignores generated source runtime state while keeping product source files tracked', () => {
    const runtimeArtifacts = [
      '.local/production/state/process.json',
      '.local/production/state/operations.jsonl',
      '.local/production/shared/logs/host.stdout.log',
      '.local/source-production-managed.json',
    ]
    const productSources = [
      'agent-presets/harness-comfyui/agent.cordis.yml',
      'agent-presets/harness-comfyui/preset.yml',
      'config/environment-overrides.json',
      'config/product-agent.json',
      'config/source-production.json',
      'lib/agent.js',
      'profiles/comfyui-workbench/cordis.patch.yml',
      'profiles/comfyui-workbench/package.json',
      'profiles/comfyui-workbench/pnpm-workspace.yaml',
      'src/config/load-profile.ts',
      'src/host/plugin.ts',
      'scripts/production/cli.mjs',
      'scripts/production/runtime.mjs',
      'package.json',
    ]

    for (const relativePath of runtimeArtifacts) {
      expect(isIgnored(relativePath), `${relativePath} must be ignored`).toBe(true)
    }

    for (const relativePath of productSources) {
      expect(existsSync(resolve(repositoryRoot, relativePath)), `${relativePath} must exist`).toBe(true)
      expect(isTracked(relativePath), `${relativePath} must be tracked`).toBe(true)
    }
  })
})
