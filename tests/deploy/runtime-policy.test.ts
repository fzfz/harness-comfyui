import { describe, expect, it } from 'vitest'

import {
  RUNTIME_DEPENDENCY_POLICY,
  readPnpmPackageManagerVersion,
  runtimeInstallEnvironment,
  runtimeInstallNpmrc,
} from '../../scripts/deploy/runtime-contract.mjs'

describe('runtime dependency policy contract', () => {
  it('defines the exact frozen runtime package set and fail-closed install policy', () => {
    expect(RUNTIME_DEPENDENCY_POLICY).toMatchObject({
      packages: [
        '@deepseek-ai/dsh',
        '@deepseek-ai/dsh-base',
        '@deepseek-ai/dsh-web-app',
      ],
      install: {
        strictDepBuilds: true,
        strictPeerDependencies: true,
      },
      workspace: {
        strictDepBuilds: true,
        allowBuilds: {
          '@deepseek-ai/dsh-subprocess-local@0.1.0-rc.7': true,
          '@google/genai@1.52.0': true,
          'koffi@3.1.5': true,
          'node-pty@1.2.0-beta.15': true,
          'protobufjs@7.6.5': true,
        },
        overrides: {
          'brace-expansion@>=5.0.0 <5.0.9': '5.0.9',
          'fast-uri@>=3.0.0 <3.1.5': '3.1.5',
          'ip-address@>=10.0.0 <10.3.1': '10.3.1',
          'js-yaml@>=4.0.0 <4.3.1': '4.3.1',
          'nanoid@>=3.0.0 <3.3.18': '3.3.18',
          'postcss@>=8.0.0 <8.5.23': '8.5.23',
          'undici@>=7.0.0 <7.29.0': '7.29.0',
        },
      },
    })
    expect(Object.isFrozen(RUNTIME_DEPENDENCY_POLICY)).toBe(true)
    expect(Object.isFrozen(RUNTIME_DEPENDENCY_POLICY.packages)).toBe(true)
    expect(Object.isFrozen(RUNTIME_DEPENDENCY_POLICY.install)).toBe(true)
    expect(Object.isFrozen(RUNTIME_DEPENDENCY_POLICY.workspace)).toBe(true)
    expect(Object.isFrozen(RUNTIME_DEPENDENCY_POLICY.workspace.allowBuilds)).toBe(true)
    expect(Object.isFrozen(RUNTIME_DEPENDENCY_POLICY.workspace.overrides)).toBe(true)
  })

  it('resolves only an exact pnpm packageManager declaration', () => {
    expect(readPnpmPackageManagerVersion({ packageManager: 'pnpm@11.7.0' }, 'package.json'))
      .toBe('11.7.0')
    expect(() => readPnpmPackageManagerVersion({}, 'package.json'))
      .toThrow(/packageManager.*pnpm/i)
    expect(() => readPnpmPackageManagerVersion({ packageManager: 'npm@11.7.0' }, 'package.json'))
      .toThrow(/packageManager.*pnpm/i)
    expect(() => readPnpmPackageManagerVersion({ packageManager: 'pnpm@latest' }, 'package.json'))
      .toThrow(/exact|version/i)
  })

  it('generates a fail-closed runtime install policy without an override path', () => {
    expect(runtimeInstallNpmrc()).toBe('strict-dep-builds=true\nstrict-peer-dependencies=true\n')
    expect(runtimeInstallNpmrc()).not.toContain('false')
    expect(runtimeInstallEnvironment({
      NPM_CONFIG_STRICT_DEP_BUILDS: 'false',
      npm_config_strict_dep_builds: 'false',
      NPM_CONFIG_STRICT_PEER_DEPENDENCIES: 'false',
      npm_config_strict_peer_dependencies: 'false',
    }))
      .toMatchObject({
        NPM_CONFIG_STRICT_DEP_BUILDS: 'true',
        NPM_CONFIG_STRICT_PEER_DEPENDENCIES: 'true',
      })
    expect(runtimeInstallEnvironment({ npm_config_strict_peer_dependencies: 'false' }))
      .not.toHaveProperty('npm_config_strict_peer_dependencies')
  })
})
