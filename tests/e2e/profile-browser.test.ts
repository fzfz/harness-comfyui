import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

import { createProfileFixture } from '../../src/testing/profile-fixture.ts'

const fixtures: Array<Awaited<ReturnType<typeof createProfileFixture>>> = []
const execFileAsync = promisify(execFile)

async function processGroupMembers(processGroupId: number): Promise<number[]> {
  const { stdout } = await execFileAsync('/bin/ps', ['-axo', 'pid=,pgid='])
  return stdout.split('\n').flatMap(line => {
    const [pid, pgid] = line.trim().split(/\s+/).map(Number)
    return Number.isSafeInteger(pid) && pgid === processGroupId ? [pid!] : []
  })
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose()))
})

describe('release artifact browser boundary', () => {
  it('boots the real AppFrame roster and reads pluginStatus through the browser Client projection', async () => {
    const fixture = await createProfileFixture({
      configuration: 'test',
    })
    fixtures.push(fixture)

    try {
      await fixture.materialize()
      await fixture.start()

      const browser = await fixture.runRealBrowserProbe()
      expect(browser.appFrame).toBe(true)
      expect(browser.nativeDetailsModuleLoaded).toBe(true)
      expect(browser.hostClientConnected).toBe(true)
      expect(browser.clientModuleLoaded).toBe(true)
      expect(browser.consoleErrors).toEqual([])
      expect(browser.runtimeExceptions).toEqual([])
      expect(browser.pluginStatus).toEqual({
        packageName: 'harness-comfyui',
        packageVersion: fixture.artifact.version,
        configurationProfile: 'test',
        hostLoaded: true,
      })
      expect(browser.cleanup).toMatchObject({
        browserExited: true,
        browserProfileRemoved: true,
      })
      expect(browser.cleanup.profileDirectory).toContain('harness-comfyui-chrome-')
      await delay(200)
      if (browser.cleanup.processGroupId !== undefined) {
        expect(await processGroupMembers(browser.cleanup.processGroupId)).toEqual([])
      }
      await expect(access(browser.cleanup.profileDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await fixture.stop()
      await fixture.dispose()
    }
    expect(fixture.cleanupEvidence.processExit).toBeDefined()
    expect(fixture.cleanupEvidence.portReleased).toBe(true)
    expect(fixture.cleanupEvidence.dshHomeRemoved).toBe(true)
  }, 90000)
})
