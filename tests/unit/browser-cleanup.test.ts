import { execFile, spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

import {
  removeBrowserProfileWhenStable,
  terminateBrowserProcessGroup,
} from '../../src/testing/browser-cdp.ts'

const processGroups = new Set<number>()
const profileDirectories = new Set<string>()
const execFileAsync = promisify(execFile)

async function processGroupMembers(processGroupId: number): Promise<number[]> {
  const { stdout } = await execFileAsync('/bin/ps', ['-axo', 'pid=,pgid='])
  return stdout.split('\n').flatMap(line => {
    const [pid, pgid] = line.trim().split(/\s+/).map(Number)
    return Number.isSafeInteger(pid) && pgid === processGroupId ? [pid!] : []
  })
}

async function waitForGroupToDisappear(processGroupId: number, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if ((await processGroupMembers(processGroupId)).length === 0) return
    await delay(20)
  }
  throw new Error(`process group ${processGroupId} survived test cleanup`)
}

afterEach(async () => {
  for (const processGroupId of processGroups) {
    if ((await processGroupMembers(processGroupId)).length > 0) process.kill(-processGroupId, 'SIGKILL')
    await waitForGroupToDisappear(processGroupId)
  }
  processGroups.clear()
  await Promise.all([...profileDirectories].map(path => rm(path, { recursive: true, force: true })))
  profileDirectories.clear()
})

describe.skipIf(process.platform === 'win32')('browser resource cleanup', () => {
  it('kills descendants that ignore SIGTERM after the process-group leader exits', async () => {
    const leader = spawn(process.execPath, ['-e', `
      const { spawn } = require('node:child_process');
      const descendant = spawn(process.execPath, ['-e', \`
        process.on('SIGTERM', () => {});
        setInterval(() => {}, 1000);
      \`], { detached: false, stdio: 'ignore' });
      descendant.unref();
      process.stdout.write(String(descendant.pid), () => process.exit(0));
    `], {
      detached: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    if (leader.pid === undefined) throw new Error('fixture leader did not expose a PID')
    const processGroupId = leader.pid
    processGroups.add(processGroupId)

    let descendantPid = ''
    leader.stdout.on('data', chunk => { descendantPid += String(chunk) })
    await new Promise<void>((resolve, reject) => {
      leader.once('error', reject)
      leader.once('close', () => resolve())
    })
    expect(Number(descendantPid)).toBeGreaterThan(0)
    expect(await processGroupMembers(processGroupId)).toEqual([Number(descendantPid)])

    await expect(terminateBrowserProcessGroup(leader, processGroupId, {
      terminateTimeoutMs: 100,
      killTimeoutMs: 2000,
      pollIntervalMs: 20,
    })).resolves.toBe(true)

    await delay(150)
    expect(await processGroupMembers(processGroupId)).toEqual([])
    processGroups.delete(processGroupId)
  })

  it('does not report a removed profile while another writer keeps rebuilding it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'harness-comfyui-profile-cleanup-test-'))
    const profileDirectory = join(root, 'profile')
    profileDirectories.add(root)
    await mkdir(profileDirectory)
    const recreation = setInterval(() => {
      void mkdir(profileDirectory, { recursive: true })
    }, 10)

    try {
      await expect(removeBrowserProfileWhenStable(profileDirectory, {
        stableWindowMs: 100,
        timeoutMs: 250,
        pollIntervalMs: 20,
      })).rejects.toThrow(/continuously absent/i)
    } finally {
      clearInterval(recreation)
    }

    await expect(access(profileDirectory)).resolves.toBeUndefined()
    await expect(removeBrowserProfileWhenStable(profileDirectory, {
      stableWindowMs: 100,
      timeoutMs: 1000,
      pollIntervalMs: 20,
    })).resolves.toBe(true)
    await delay(150)
    await expect(access(profileDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
