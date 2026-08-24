import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const readJson = (path: string): Record<string, any> => JSON.parse(readFileSync(resolve(root, path), 'utf8')) as Record<string, any>

describe('source workspace engineering contract', () => {
  it('uses one private source package without package or deployment entrypoints', () => {
    const manifest = readJson('package.json')
    expect(manifest).toMatchObject({
      name: 'harness-comfyui',
      version: '0.2.0',
      private: true,
      type: 'module',
      packageManager: 'pnpm@11.7.0',
      engines: { node: '^22.19.0 || >=24.0.0' },
    })
    expect(manifest).not.toHaveProperty('bin')
    expect(manifest.files).toEqual([
      'lib/typert.host.js',
      'lib/typert.host.d.ts',
      'lib/typert.remote-client.js',
      'lib/typert.remote-client.d.ts',
    ])
    expect(readFileSync(resolve(root, '.node-version'), 'utf8').trim()).toBe('22.19.0')
  })

  it('exposes development, source production, test, and build commands only', () => {
    const scripts = readJson('package.json').scripts as Record<string, string>
    expect(scripts).toMatchObject({
      'profile:materialize:development': 'node scripts/profile/materialize.mjs --configuration development --dsh-home .local/dsh/development --package-spec . --dsh-executable "$PWD/node_modules/.bin/dsh" --pnpm-executable "$(command -v pnpm)"',
      'dev:start': 'node scripts/profile/start.mjs --configuration development --dsh-home .local/dsh/development --dsh-executable "$PWD/node_modules/.bin/dsh" --host 127.0.0.1 --port 4173',
      'prod:start': 'node scripts/production/cli.mjs start',
      'prod:stop': 'node scripts/production/cli.mjs stop',
      'prod:restart': 'node scripts/production/cli.mjs restart',
      'prod:status': 'node scripts/production/cli.mjs status',
      'prod:health': 'node scripts/production/cli.mjs health',
      'prod:logs': 'node scripts/production/cli.mjs logs',
      'test:production': 'vitest run tests/production --maxWorkers=1 --no-file-parallelism',
      'test:contract': 'vitest run tests/contract tests/security',
      build: 'tsc -b tsconfig.host.json && tsdown --config tsdown.config.ts && node scripts/build/bundle-generated-typert.ts && node scripts/build/tsdown-client-bundle.ts',
      'quality:preinstall': 'pnpm run check:manifest-lock && pnpm run security:advisories && pnpm run security:build-scripts',
      'quality:fast': 'pnpm run check:harness-boundary && pnpm run typecheck && pnpm run test:coverage && pnpm run test:contract && pnpm run test:production && pnpm run test:prototype && pnpm run build',
      quality: 'pnpm run quality:preinstall && pnpm run quality:fast',
    })
    expect(Object.keys(scripts)).not.toEqual(expect.arrayContaining([
      'test:deploy', 'test:composition', 'test:e2e', 'test:release-smoke',
      'package:pack', 'package:validate', 'quality:artifact',
      'release:dry-run', 'release:smoke', 'deploy:install', 'deploy:upgrade', 'deploy:rollback',
    ]))
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
    expect(manifest.exports['./agent']).toEqual({ default: './lib/agent.js' })
    expect(manifest.dsh.bundle).toEqual({ patch: './cordis.patch.yml' })
    expect(manifest.dsh.client.platform).toBe('web')
    expect(readJson('profiles/comfyui-workbench/package.json').dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      'harness-comfyui',
    ])
    expect(readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8')).toMatch(/^packages:\n  - \.$/mu)
  })
})
