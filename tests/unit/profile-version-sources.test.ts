import { describe, expect, it } from 'vitest'

import { readProfileVersionEvidence } from '../../src/testing/profile-fixture.ts'

describe('profile version evidence sources', () => {
  it('keeps the artifact app version independent from the three DSH runtime versions', async () => {
    const profileVersions = new Map<string, string | undefined>([
      ['harness-comfyui', '9.8.7'],
      ['@deepseek-ai/dsh-base', undefined],
      ['@deepseek-ai/dsh-web-app', undefined],
    ])
    const runtimeVersions = new Map([
      ['@deepseek-ai/dsh', '0.1.0-rc.7'],
      ['@deepseek-ai/dsh-base', '0.1.0-rc.7'],
      ['@deepseek-ai/dsh-web-app', '0.1.0-rc.7'],
    ])

    await expect(readProfileVersionEvidence({
      async profilePackageVersion(packageName) {
        return profileVersions.get(packageName)
      },
      async runtimePackageVersion(packageName) {
        const version = runtimeVersions.get(packageName)
        if (version === undefined) throw new Error(`missing runtime fixture ${packageName}`)
        return version
      },
    })).resolves.toEqual({
      profileVersions: {
        harnessComfyui: '9.8.7',
        dshBase: undefined,
        dshWebApp: undefined,
      },
      runtimeBundleVersions: {
        cliDsh: '0.1.0-rc.7',
        dshBase: '0.1.0-rc.7',
        dshWebApp: '0.1.0-rc.7',
      },
    })
  })

  it('rejects an empty artifact app version instead of substituting the DSH CLI version', async () => {
    await expect(readProfileVersionEvidence({
      async profilePackageVersion(packageName) {
        return packageName === 'harness-comfyui' ? '' : undefined
      },
      async runtimePackageVersion() {
        return '0.1.0-rc.7'
      },
    })).rejects.toThrow('harness-comfyui version')
  })
})
