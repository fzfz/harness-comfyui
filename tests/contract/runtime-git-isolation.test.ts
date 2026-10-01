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


describe('source runtime git isolation', () => {
  it('ignores generated source runtime state while keeping product source files tracked', () => {
    const runtimeArtifacts = [
      'node_modules',
      '.local/desktop-e2e/run-id/run.json',
      '.local/desktop-e2e/run-id/evidence/startup-ready.json',
      '.local/desktop-development/official-environment/dsh-home/profiles/desktop/cordis.patch.yml',
      '.local/desktop-development/official-environment/dsh-home/data/plugins/harness-comfyui/runs.sqlite',
      '.local/source-client/client.js',
      '.local/source-host/core.js',
      '.local/source-cli/harness-comfyui.mjs',
    ]
    const productSources = [
      'config/environment-overrides.json',
      'config/desktop-e2e.json',
      'config/plugin-package.json',
      'src/config/load-profile.ts',
      'src/host/plugin.ts',
      'scripts/build/cli.mjs',
      'tests/desktop/official-desktop-live.test.mjs',
      'tests/desktop/fixtures/official-desktop-probe.mjs',
      'package.json',
    ]

    for (const relativePath of runtimeArtifacts) {
      expect(isIgnored(relativePath), `${relativePath} must be ignored`).toBe(true)
    }

    for (const relativePath of productSources) {
      expect(existsSync(resolve(repositoryRoot, relativePath)), `${relativePath} must exist`).toBe(true)
      expect(isIgnored(relativePath), `${relativePath} must remain eligible for source control`).toBe(false)
    }
  })
})
