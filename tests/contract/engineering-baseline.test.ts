import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const readJson = (path: string): Record<string, any> => JSON.parse(readFileSync(resolve(root, path), 'utf8')) as Record<string, any>

describe('source workspace engineering contract', () => {
  it('uses one private source package with source exports', () => {
    const manifest = readJson('package.json')
    expect(manifest).toMatchObject({
      name: 'harness-comfyui',
      version: '0.36.1',
      private: true,
      type: 'module',
      packageManager: 'pnpm@11.7.0',
      engines: { node: '^22.19.0 || >=24.0.0' },
    })
    expect(manifest).not.toHaveProperty('bin')
    expect(manifest).not.toHaveProperty('files')
    expect(manifest.exports).toEqual({
      '.': { types: './src/index.ts', default: './src/index.ts' },
      './client': { types: './src/client/index.tsx', default: './.local/source-client/client.js' },
      './package.json': './package.json',
    })
    expect(readFileSync(resolve(root, '.node-version'), 'utf8').trim()).toBe('22.19.0')
  })

  it('exposes only source process management and automated quality commands', () => {
    const scripts = readJson('package.json').scripts as Record<string, string>
    expect(scripts).toMatchObject({
      'prod:start': 'node scripts/production/cli.mjs start',
      'prod:stop': 'node scripts/production/cli.mjs stop',
      'prod:restart': 'node scripts/production/cli.mjs restart',
      'prod:status': 'node scripts/production/cli.mjs status',
      'prod:health': 'node scripts/production/cli.mjs health',
      'prod:logs': 'node scripts/production/cli.mjs logs',
      'worktree:start': 'node scripts/worktree/cli.mjs start',
      'worktree:stop': 'node scripts/worktree/cli.mjs stop',
      'worktree:restart': 'node scripts/worktree/cli.mjs restart',
      'worktree:status': 'node scripts/worktree/cli.mjs status',
      'worktree:health': 'node scripts/worktree/cli.mjs health',
      'worktree:logs': 'node scripts/worktree/cli.mjs logs',
      'prod:test': 'vitest run tests/production --maxWorkers=1 --no-file-parallelism',
      'test:contract': 'vitest run tests/contract tests/security',
      'verify:comfyui-workflows': 'node --experimental-strip-types scripts/verification/comfyui-workflow-matrix.mjs',
      'quality:preinstall': 'pnpm run check:manifest-lock && pnpm run security:advisories && pnpm run security:build-scripts',
      'quality:fast': 'pnpm run check:harness-boundary && pnpm run typecheck && pnpm run test:coverage && pnpm run test:contract && pnpm run prod:test && pnpm run test:prototype',
      quality: 'pnpm run quality:preinstall && pnpm run quality:fast',
    })
    expect(Object.keys(scripts).sort()).toEqual([
      'check:harness-boundary',
      'check:manifest-lock',
      'prod:health',
      'prod:logs',
      'prod:restart',
      'prod:start',
      'prod:status',
      'prod:stop',
      'prod:test',
      'quality',
      'quality:fast',
      'quality:preinstall',
      'security:advisories',
      'security:build-scripts',
      'test:contract',
      'test:coverage',
      'test:integration',
      'test:prototype',
      'test:unit',
      'typecheck',
      'verify:comfyui-workflows',
      'worktree:health',
      'worktree:logs',
      'worktree:restart',
      'worktree:start',
      'worktree:status',
      'worktree:stop',
    ].sort())
  })

  it('pins every package dependency to one exact version', () => {
    const manifest = readJson('package.json')
    const exactVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u
    const observed = new Map<string, string>()
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
      for (const [name, version] of Object.entries(manifest[field] as Record<string, string>)) {
        expect(version, `${field}.${name}`).toMatch(exactVersion)
        expect(observed.get(name) ?? version, name).toBe(version)
        observed.set(name, version)
      }
    }
    expect(Object.keys(manifest.peerDependenciesMeta).sort()).toEqual(Object.keys(manifest.peerDependencies).sort())
  })

  it('keeps the public DSH bundle and source profile composition explicit', () => {
    const manifest = readJson('package.json')
    expect(manifest.exports).not.toHaveProperty('./agent')
    expect(manifest.dsh.bundle).toEqual({ patch: './cordis.patch.yml' })
    expect(manifest.dsh.client.platform).toBe('web')
    expect(readJson('profiles/comfyui-workbench/package.json').dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      'harness-comfyui',
    ])
    expect(readJson('profiles/comfyui-workbench-development/package.json').dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      'harness-comfyui',
    ])
    expect(readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8')).toMatch(/^packages:\n  - \.$/mu)
  })
})
