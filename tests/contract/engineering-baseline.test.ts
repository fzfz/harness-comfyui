import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const readJson = (path: string): Record<string, any> => JSON.parse(readFileSync(resolve(root, path), 'utf8')) as Record<string, any>

describe('source workspace engineering contract', () => {
  it('uses one private source package with source exports', () => {
    const manifest = readJson('package.json')
    const runtimeArtifacts = readJson('config/runtime-artifacts.json')
    expect(manifest).toMatchObject({
      name: 'harness-comfyui',
      version: '0.39.2',
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
    expect(runtimeArtifacts).toEqual({
      frontendCompilerWorker: {
        sourceEntryRelativePath: 'src/host/generation/comfy-frontend-worker.ts',
        outputEntryRelativePath: '.local/source-host/comfy-frontend-worker.js',
      },
      managedCli: {
        sourceEntryRelativePath: 'scripts/cli/harness-comfyui.mjs',
        outputEntryRelativePath: '.local/source-cli/harness-comfyui.mjs',
      },
    })
  })

  it('exposes only source process management and automated quality commands', () => {
    const scripts = readJson('package.json').scripts as Record<string, string>
    expect(scripts).toMatchObject({
      'prod:start': 'node scripts/desktop/production-cli.mjs start',
      'prod:stop': 'node scripts/desktop/production-cli.mjs stop',
      'prod:restart': 'node scripts/desktop/production-cli.mjs restart',
      'prod:status': 'node scripts/desktop/production-cli.mjs status',
      'prod:logs': 'node scripts/desktop/production-cli.mjs logs',
      'dev:start': 'node scripts/desktop/cli.mjs start',
      'dev:stop': 'node scripts/desktop/cli.mjs stop',
      'dev:restart': 'node scripts/desktop/cli.mjs restart',
      'dev:status': 'node scripts/desktop/cli.mjs status',
      'dev:logs': 'node scripts/desktop/cli.mjs logs',
      'web:start': 'node scripts/worktree/cli.mjs start',
      'web:stop': 'node scripts/worktree/cli.mjs stop',
      'web:restart': 'node scripts/worktree/cli.mjs restart',
      'web:status': 'node scripts/worktree/cli.mjs status',
      'web:health': 'node scripts/worktree/cli.mjs health',
      'web:logs': 'node scripts/worktree/cli.mjs logs',
      'desktop:dependencies:link': 'node scripts/desktop/dependencies.mjs',
      'prod:test': 'vitest run tests/production --maxWorkers=1 --no-file-parallelism',
      'test:contract': 'vitest run tests/contract tests/security',
      'test:desktop': 'vitest run tests/desktop --maxWorkers=1 --no-file-parallelism --testTimeout=120000',
      'verify:comfyui-workflows': 'node --experimental-strip-types scripts/verification/comfyui-workflow-matrix.mjs',
      'quality:preinstall': 'pnpm run check:manifest-lock && pnpm run security:advisories && pnpm run security:build-scripts',
      'quality:fast': 'pnpm run check:harness-boundary && pnpm run typecheck && pnpm run test:coverage && pnpm run test:contract && pnpm run prod:test && pnpm run test:prototype',
      quality: 'pnpm run quality:preinstall && pnpm run quality:fast && pnpm run test:desktop',
    })
    expect(Object.keys(scripts).sort()).toEqual([
      'check:harness-boundary',
      'check:manifest-lock',
      'dev:logs',
      'dev:restart',
      'dev:start',
      'dev:status',
      'dev:stop',
      'desktop:dependencies:link',
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
      'test:desktop',
      'test:integration',
      'test:prototype',
      'test:unit',
      'typecheck',
      'verify:comfyui-workflows',
      'web:health',
      'web:logs',
      'web:restart',
      'web:start',
      'web:status',
      'web:stop',
    ].sort())
  })

  it('pins installed dependencies while allowing bounded Harness peer versions', () => {
    const manifest = readJson('package.json')
    const exactVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u
    for (const [name, version] of Object.entries(manifest.dependencies as Record<string, string>)) {
      expect(version, `dependencies.${name}`).toMatch(exactVersion)
    }
    for (const [name, version] of Object.entries(manifest.devDependencies as Record<string, string>)) {
      expect(name === '@deepseek-ai/cordis' || name.startsWith('@deepseek-ai/dsh')).toBe(false)
      expect(version, `devDependencies.${name}`).toMatch(exactVersion)
    }
    for (const [name, version] of Object.entries(manifest.peerDependencies as Record<string, string>)) {
      if (name.startsWith('@deepseek-ai/dsh-')) expect(version).toBe('>=0.1.2-rc.1 <0.2.0')
      else expect(version, `peerDependencies.${name}`).toMatch(exactVersion)
    }
    expect(Object.keys(manifest.peerDependenciesMeta).sort()).toEqual(Object.keys(manifest.peerDependencies).sort())
  })

  it('does not ask the registry to install unpublished optional Harness peers', () => {
    expect(readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8')).toContain('autoInstallPeers: false')
  })

  it('documents every user-configurable environment variable in the example file', () => {
    const example = readFileSync(resolve(root, '.env.example'), 'utf8')
    for (const name of [
      'OPENCODE_GO_API_KEY',
      'COMFYUI_WORKBENCH_DESKTOP_MOBILE_BRIDGE_PORT',
      'HARNESS_COMFYUI_DEFAULT_INSTANCE_ID',
      'HARNESS_COMFYUI_FRONTEND_BROWSER_EXECUTABLE_PATH',
      'HARNESS_COMFYUI_FRONTEND_CACHE_EPOCH',
      'HARNESS_COMFYUI_FRONTEND_COMPILER_TIMEOUT_MS',
      'HARNESS_COMFYUI_FRONTEND_DEVTOOLS_PORT_TIMEOUT_MS',
      'HARNESS_COMFYUI_FRONTEND_TARGET_CREATE_TIMEOUT_MS',
      'HARNESS_COMFYUI_FRONTEND_WEBSOCKET_CONNECT_TIMEOUT_MS',
      'HARNESS_COMFYUI_FRONTEND_DOMAIN_ENABLE_TIMEOUT_MS',
      'HARNESS_COMFYUI_FRONTEND_NAVIGATION_TIMEOUT_MS',
      'HARNESS_COMFYUI_FRONTEND_INFRASTRUCTURE_ATTEMPTS',
      'HARNESS_COMFYUI_CLIENT_RUN_REFRESH_INTERVAL_MS',
      'HARNESS_COMFYUI_MEDIA_MAX_FILE_BYTES',
      'HARNESS_COMFYUI_SERVER_PORT',
    ]) {
      expect(example, `${name} must have an example assignment`).toMatch(
        new RegExp(`^(?:#\\s*)?${name}=`, 'mu'),
      )
    }
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
