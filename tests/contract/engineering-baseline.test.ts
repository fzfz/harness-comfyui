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
      version: '0.45.0',
      private: true,
      type: 'module',
      packageManager: 'pnpm@11.11.0',
      engines: { node: '^22.19.0 || >=24.0.0' },
    })
    expect(manifest).not.toHaveProperty('bin')
    expect(manifest).not.toHaveProperty('files')
    expect(manifest.exports).toEqual({
      '.': { types: './src/index.ts', default: './.local/source-host/index.js' },
      './client': { types: './src/client/index.tsx', default: './.local/source-client/client.js' },
      './package.json': './package.json',
      './core': { types: './src/host/core/plugin.ts', default: './.local/source-host/core.js' },
      './image-reader': { types: './src/host/image-reader/plugin.ts', default: './.local/source-host/image-reader.js' },
      './cli': { types: './src/host/cli/plugin.ts', default: './.local/source-host/cli.js' },
      './web': { types: './src/host/web/plugin.ts', default: './.local/source-host/web.js' },
      './cli-workspace': { types: './src/host/cli/workspace.ts', default: './.local/source-host/cli-workspace.js' },

    })
    expect(readFileSync(resolve(root, '.node-version'), 'utf8').trim()).toBe('22.19.0')
    expect(runtimeArtifacts).toMatchObject({
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

  it('exposes plugin build, packing and official Desktop verification commands', () => {
    const scripts = readJson('package.json').scripts as Record<string, string>
    expect(scripts).toMatchObject({
      build: 'node scripts/build/cli.mjs build',
      'pack:plugin': 'node scripts/build/cli.mjs pack',
      'test:production': 'vitest run tests/production --maxWorkers=1 --no-file-parallelism',
      'test:contract': 'vitest run tests/contract tests/security',
      'test:desktop': 'node tests/desktop/run-desktop-tests.mjs',
      'verify:comfyui-workflows': 'node --experimental-strip-types scripts/verification/comfyui-workflow-matrix.mjs',
      'quality:preinstall': 'pnpm run check:manifest-lock && pnpm run security:advisories && pnpm run security:build-scripts',
      'quality:fast': 'pnpm run check:harness-boundary && pnpm run typecheck && pnpm run test:coverage && pnpm run test:contract && pnpm run test:production && pnpm run test:prototype',
      quality: 'pnpm run quality:preinstall && pnpm run quality:fast && pnpm run test:desktop',
    })
    expect(Object.keys(scripts).filter(name => /^(?:prod|dev|web):/u.test(name))).toEqual([])
    expect(scripts).not.toHaveProperty('desktop:dependencies:link')
    expect(scripts).not.toHaveProperty('cli:run')
  })

  it('pins installed dependencies and official Harness SDK peer versions', () => {
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
      if (name.startsWith('@deepseek-ai/dsh-')) expect(version).toBe(readJson('config/desktop-e2e.json').application.version)
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
    ]) {
      expect(example, `${name} must have an example assignment`).toMatch(
        new RegExp(`^(?:#\\s*)?${name}=`, 'mu'),
      )
    }
  })

  it('keeps the official plugin bundle separate from Host Profile management', () => {
    const manifest = readJson('package.json')
    expect(manifest.exports).not.toHaveProperty('./agent')
    expect(manifest.dsh.bundle).toEqual({ patch: './cordis.patch.yml' })
    expect(manifest.dsh.client.platform).toBe('web')
    expect(manifest.exports).not.toHaveProperty('./cli-runner')
    expect(readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8')).toMatch(/^packages:\n  - \.$/mu)
  })
})
