import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const readJson = (path: string): Record<string, any> => JSON.parse(readFileSync(resolve(root, path), 'utf8')) as Record<string, any>

describe('Issue #2 public package and composition contracts', () => {
  it('keeps package dependencies in the locked classifications and versions', () => {
    const manifest = readJson('package.json')
    const harnessPeerVersions = {
      '@deepseek-ai/cordis': '4.0.1',
      '@deepseek-ai/dsh-agent': '0.1.0-rc.7',
      '@deepseek-ai/dsh-api-remotes': '0.1.0-rc.7',
      '@deepseek-ai/dsh-client-locale': '0.1.0-rc.7',
      '@deepseek-ai/dsh-client-runtime': '0.1.0-rc.7',
      '@deepseek-ai/dsh-client-ui-conversation': '0.1.0-rc.7',
      '@deepseek-ai/dsh-client-ui-input-trigger': '0.1.0-rc.7',
      '@deepseek-ai/dsh-client-ui-layout': '0.1.0-rc.7',
      '@deepseek-ai/dsh-client-ui-primitives': '0.1.0-rc.7',
      '@deepseek-ai/dsh-client-ui-sidebar': '0.1.0-rc.7',
      '@deepseek-ai/dsh-client-ui-slots': '0.1.0-rc.7',
      '@deepseek-ai/dsh-invariants': '0.1.0-rc.7',
      '@deepseek-ai/dsh-jobs': '0.1.0-rc.7',
      '@deepseek-ai/dsh-session': '0.1.0-rc.7',
      '@deepseek-ai/dsh-tools': '0.1.0-rc.7',
      '@deepseek-ai/dsh-typert-protocol': '0.1.0-rc.7',
      react: '18.3.1',
      'react-dom': '18.3.1',
    }
    expect(manifest.dependencies).toEqual({ '@deepseek-ai/schemastery': '3.18.1' })
    expect(manifest.peerDependencies).toEqual(harnessPeerVersions)
    expect(manifest.devDependencies).toEqual({
      ...harnessPeerVersions,
      '@deepseek-ai/dsh': '0.1.0-rc.7',
      '@deepseek-ai/dsh-base': '0.1.0-rc.7',
      '@deepseek-ai/dsh-typert-generator': '0.1.0-rc.7',
      '@deepseek-ai/dsh-web-app': '0.1.0-rc.7',
      '@types/node': '22.20.0',
      '@types/react': '18.3.31',
      tsdown: '0.22.2',
      typescript: '6.0.3',
      vitest: '4.1.8',
    })
  })

  it('pins the runtime and public command aliases', () => {
    const manifest = readJson('package.json')
    expect(manifest.packageManager).toBe('pnpm@11.7.0')
    expect(manifest.engines).toEqual({ node: '^22.19.0 || >=24.0.0' })
    expect(readFileSync(resolve(root, '.node-version'), 'utf8').trim()).toBe('22.19.0')
    expect(manifest.scripts['profile:materialize:development']).toBe(
      'node scripts/profile/materialize.mjs --configuration development --dsh-home .local/dsh/development --package-spec .',
    )
    expect(manifest.scripts['dev:start']).toBe(
      'node scripts/profile/start.mjs --configuration development --dsh-home .local/dsh/development --host 127.0.0.1 --port 4173',
    )
    expect(manifest.files).toEqual([
      'lib/index.js',
      'lib/client.js',
      'lib/client.js.map',
      'lib/types/index.d.ts',
      'lib/types/client.d.ts',
      'cordis.patch.yml',
      'config/base.json',
      'config/environment-overrides.json',
      'config/profiles/development.json',
      'config/profiles/production.json',
      'config/profiles/release-smoke.json',
      'config/profiles/test.json',
      'profiles/comfyui-workbench/cordis.patch.yml',
      'profiles/comfyui-workbench/package.json',
      'profiles/comfyui-workbench/pnpm-workspace.yaml',
      'scripts/profile/materialize.mjs',
      'scripts/profile/start.mjs',
    ])
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
      './package.json': './package.json',
    })
    expect(manifest.dsh).toEqual({
      bundle: { patch: './cordis.patch.yml' },
      client: {
        platform: 'web',
        inject: [
          '@deepseek-ai/dsh-client-runtime',
          '@deepseek-ai/dsh-api-remotes',
          '@deepseek-ai/dsh-client-locale',
          '@deepseek-ai/dsh-client-ui-conversation',
          '@deepseek-ai/dsh-client-ui-input-trigger',
          '@deepseek-ai/dsh-client-ui-layout',
          '@deepseek-ai/dsh-client-ui-primitives',
          '@deepseek-ai/dsh-client-ui-sidebar',
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
