import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const readJson = (path: string): Record<string, any> => JSON.parse(readFileSync(resolve(root, path), 'utf8')) as Record<string, any>
const readRootImporter = (): string => {
  const lockfile = readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8')
  const match = lockfile.match(/^importers:\n\n  \.:\n([\s\S]*?)\n\npackages:\n/mu)
  if (match === null) throw new Error('pnpm-lock.yaml is missing the root importer')
  return match[1]
}

const readImporterEntry = (importer: string, packageName: string): { specifier: string; version: string } | null => {
  const yamlKey = packageName.startsWith('@') ? `'${packageName}'` : packageName
  const escapedKey = yamlKey.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const match = importer.match(new RegExp(`^      ${escapedKey}:\\n        specifier: ([^\\n]+)\\n        version: ([^\\n]+)$`, 'mu'))
  return match === null ? null : { specifier: match[1], version: match[2] }
}

describe('Issue #2 public package and composition contracts', () => {
  it('keeps package dependencies in the locked classifications and versions', () => {
    const manifest = readJson('package.json')
    const harnessPeerVersions = {
      '@deepseek-ai/cordis': '4.0.1',
      '@deepseek-ai/dsh-agent': '0.1.0-rc.8',
      '@deepseek-ai/dsh-api-remotes': '0.1.0-rc.8',
      '@deepseek-ai/dsh-client-connection': '0.1.0-rc.8',
      '@deepseek-ai/dsh-client-locale': '0.1.0-rc.8',
      '@deepseek-ai/dsh-client-runtime': '0.1.0-rc.8',
      '@deepseek-ai/dsh-client-ui-conversation': '0.1.0-rc.8',
      '@deepseek-ai/dsh-client-ui-input-trigger': '0.1.0-rc.8',
      '@deepseek-ai/dsh-client-ui-layout': '0.1.0-rc.8',
      '@deepseek-ai/dsh-client-ui-primitives': '0.1.0-rc.8',
      '@deepseek-ai/dsh-client-ui-slots': '0.1.0-rc.8',
      '@deepseek-ai/dsh-invariants': '0.1.0-rc.8',
      '@deepseek-ai/dsh-jobs': '0.1.0-rc.8',
      '@deepseek-ai/dsh-session': '0.1.0-rc.8',
      '@deepseek-ai/dsh-tools': '0.1.0-rc.8',
      '@deepseek-ai/dsh-typert-protocol': '0.1.0-rc.8',
      '@deepseek-ai/dsh-workspace': '0.1.0-rc.8',
      react: '18.3.1',
      'react-dom': '18.3.1',
    }
    expect(manifest.dependencies).toEqual({
      '@deepseek-ai/schemastery': '3.18.1',
    })
    expect(manifest.peerDependencies).toEqual(harnessPeerVersions)
    expect(manifest.devDependencies).toEqual({
      ...harnessPeerVersions,
      '@deepseek-ai/dsh': '0.1.0-rc.8',
      '@deepseek-ai/dsh-base': '0.1.0-rc.8',
      '@deepseek-ai/dsh-typert-generator': '0.1.0-rc.8',
      '@deepseek-ai/dsh-web-app': '0.1.0-rc.8',
      '@types/node': '22.20.0',
      '@types/react': '18.3.31',
      tsdown: '0.22.2',
      typescript: '6.0.3',
      '@vitest/coverage-v8': '4.1.8',
      vitest: '4.1.8',
    })

    expect(manifest.peerDependenciesMeta).toEqual(
      Object.fromEntries(Object.keys(harnessPeerVersions).map((name) => [name, { optional: true }])),
    )
    expect(Object.keys(manifest.peerDependenciesMeta).sort()).toEqual(Object.keys(manifest.peerDependencies).sort())

    const importer = readRootImporter()
    for (const packageName of ['@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-workspace']) {
      expect(readImporterEntry(importer, packageName)).toEqual({
        specifier: '0.1.0-rc.8',
        version: expect.stringMatching(/^0\.1\.0-rc\.8(?:\(|$)/u),
      })
    }
    expect(readImporterEntry(importer, '@deepseek-ai/dsh-client-ui-sidebar')).toBeNull()
    expect(readImporterEntry(importer, 'zod')).toBeNull()
  })

  it('pins the runtime and public command aliases', () => {
    const manifest = readJson('package.json')
    expect(manifest.packageManager).toBe('pnpm@11.7.0')
    expect(manifest.engines).toEqual({ node: '^22.19.0 || >=24.0.0' })
    expect(manifest.bin).toEqual({ 'harness-comfyui': 'scripts/deploy/cli.mjs' })
    expect(readFileSync(resolve(root, '.node-version'), 'utf8').trim()).toBe('22.19.0')
    expect(manifest.scripts['profile:materialize:development']).toBe(
      'node scripts/profile/materialize.mjs --configuration development --dsh-home .local/dsh/development --package-spec . --dsh-executable "$PWD/node_modules/.bin/dsh" --pnpm-executable "$(command -v pnpm)"',
    )
    expect(manifest.scripts['dev:start']).toBe(
      'node scripts/profile/start.mjs --configuration development --dsh-home .local/dsh/development --dsh-executable "$PWD/node_modules/.bin/dsh" --host 127.0.0.1 --port 4173',
    )
    expect(manifest.scripts['deploy:preflight']).toBe('node scripts/deploy/cli.mjs preflight')
    expect(manifest.scripts['deploy:install']).toBe('node scripts/deploy/cli.mjs install')
    expect(manifest.scripts['deploy:start']).toBe('node scripts/deploy/cli.mjs start')
    expect(manifest.scripts['deploy:stop']).toBe('node scripts/deploy/cli.mjs stop')
    expect(manifest.scripts['deploy:status']).toBe('node scripts/deploy/cli.mjs status')
    expect(manifest.scripts['test:deploy']).toBe('vitest run tests/deploy --maxWorkers=1 --no-file-parallelism')
    expect(manifest.files).toEqual([
      'lib/index.js',
      'lib/config-profile-validator.js',
      'lib/agent.js',
      'lib/client.js',
      'lib/client.js.map',
      'lib/types/index.d.ts',
      'lib/types/client.d.ts',
      'lib/types/types.d.ts',
      'lib/types.js',
      'lib/typert.host.js',
      'lib/typert.host.js.map',
      'lib/typert.host.d.ts',
      'lib/typert.remote-client.js',
      'lib/typert.remote-client.js.map',
      'lib/typert.remote-client.d.ts',
      'lib/typert.remote-client.d.ts.map',
      'agent-presets/harness-comfyui/preset.yml',
      'agent-presets/harness-comfyui/agent.cordis.yml',
      'cordis.patch.yml',
      'README.md',
      'config/base.json',
      'config/environment-overrides.json',
      'config/product-agent.json',
      'config/profiles/development.json',
      'config/profiles/production.json',
      'config/profiles/release-smoke.json',
      'config/profiles/test.json',
      'profiles/comfyui-workbench/cordis.patch.yml',
      'profiles/comfyui-workbench/package.json',
      'profiles/comfyui-workbench/pnpm-workspace.yaml',
      'deployment/runtime/package.json',
      'deployment/runtime/pnpm-lock.yaml',
      'deployment/runtime/pnpm-workspace.yaml',
      'skills/**',
      'scripts/deploy/*.mjs',
      'scripts/profile/materialize.mjs',
      'scripts/profile/start.mjs',
    ])
  })

  it('runs built-artifact and packed-runtime tests only after their artifacts exist', () => {
    const scripts = readJson('package.json').scripts as Record<string, string>
    expect(scripts['test:contract']).toBe(
      'vitest run tests/contract tests/deploy/deployment-scripts.test.ts tests/release-package/dry-run.test.ts tests/release-package/package-scripts.test.ts tests/security/audit-lockfile.test.ts tests/security/check-build-scripts.test.ts tests/security/check-manifest-lock.test.ts',
    )
    expect(scripts['test:e2e']).toBe('vitest run tests/e2e --maxWorkers=1 --no-file-parallelism')
    expect(scripts['test:build-artifacts']).toBe('vitest run tests/build-artifacts.test.ts')
    expect(scripts['test:packed-runtime']).toBe('vitest run tests/release-package/runtime-closure.test.ts')
    expect(scripts['package:validate']).toBe(
      'node scripts/release/validate-package.mjs && pnpm run test:build-artifacts && pnpm run test:packed-runtime',
    )
    expect(scripts.build).toBe(
      'tsc -b tsconfig.host.json && tsdown --config tsdown.config.ts && node scripts/build/bundle-generated-typert.ts && node scripts/build/tsdown-client-bundle.ts',
    )
    expect(scripts['release:smoke']).toBe(
      'node scripts/release/smoke.mjs',
    )
    expect(scripts['quality:preinstall']).toBe(
      'pnpm run check:manifest-lock && pnpm run security:advisories && pnpm run security:build-scripts',
    )
    expect(scripts['test:coverage']).toBe(
      'vitest run tests/unit tests/integration --coverage --testTimeout=30000',
    )
    expect(scripts['quality:fast']).toBe(
      'pnpm run check:harness-boundary && pnpm run typecheck && pnpm run test:coverage && pnpm run test:contract && pnpm run test:prototype && pnpm run build',
    )
    expect(scripts.quality).toBe(
      'pnpm run quality:preinstall && pnpm run quality:fast',
    )
    expect(scripts['quality:artifact']).toBe(
      'pnpm run quality && pnpm run package:pack && pnpm run package:validate && pnpm test:deploy && pnpm test:composition && pnpm test:e2e && pnpm run release:smoke',
    )
  })

  it('exposes only the declared host and client build surfaces', () => {
    const manifest = readJson('package.json')

    expect(manifest.exports).toEqual({
      '.': {
        types: './lib/types/index.d.ts',
        default: './lib/index.js',
      },
      './client': {
        types: './lib/types/client.d.ts',
        default: './lib/client.js',
      },
      './types': {
        types: './lib/types/types.d.ts',
        default: './lib/types.js',
      },
      './typert': {
        types: './lib/typert.host.d.ts',
        default: './lib/typert.host.js',
      },
      './remote': {
        types: './lib/typert.remote-client.d.ts',
        default: './lib/typert.remote-client.js',
      },
      './agent': {
        default: './lib/agent.js',
      },
      './package.json': './package.json',
    })
    expect(manifest.dsh).toEqual({
      bundle: { patch: './cordis.patch.yml' },
      client: {
        platform: 'web',
        inject: [
          '@deepseek-ai/dsh-client-connection',
          '@deepseek-ai/dsh-api-remotes',
          '@deepseek-ai/dsh-client-locale',
          '@deepseek-ai/dsh-client-runtime',
          '@deepseek-ai/dsh-client-ui-conversation',
          '@deepseek-ai/dsh-client-ui-input-trigger',
          '@deepseek-ai/dsh-client-ui-layout',
        ],
      },
    })
  })

  it('declares the exact ordered comfyui-workbench bundle composition', () => {
    const profile = readJson('profiles/comfyui-workbench/package.json')
    expect(profile).toEqual({
      name: 'dsh-profile-comfyui-workbench',
      private: true,
      dependencies: {},
      dsh: {
        profile: {
          bundles: [
            '@deepseek-ai/dsh-base',
            '@deepseek-ai/dsh-web-app',
            'harness-comfyui',
          ],
        },
      },
    })
  })
})
