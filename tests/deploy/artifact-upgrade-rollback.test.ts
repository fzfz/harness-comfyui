import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createProfileFixture,
  type ProfileFixture,
} from '../../src/testing/profile-fixture.ts'
import { deriveCandidateArtifact, type CandidateFailureMode } from './fixtures/candidate-artifact.ts'

type ProcessState = {
  activeVersion: string
  pid: number
  previousRelease: { activeVersion: string; releasePath: string } | null
  releasePath: string
}

type CandidateEvidence = {
  event: 'candidate-start-failure' | 'candidate-host-started' | 'candidate-health-failure'
  pid?: number
}

const fixtures: ProfileFixture[] = []

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ESRCH') return false
    if (code === 'EPERM') return true
    throw error
  }
}

async function waitFor<T>(probe: () => Promise<T | undefined>, description: string, timeoutMs = 60000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const result = await probe()
      if (result !== undefined) return result
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`timed out waiting for ${description}${lastError === undefined ? '' : `: ${String(lastError)}`}`)
}

async function readProcessState(fixture: ProfileFixture): Promise<ProcessState> {
  return JSON.parse(await readFile(join(fixture.installationRoot, 'state/process.json'), 'utf8')) as ProcessState
}

async function readActiveReleaseState(fixture: ProfileFixture): Promise<ProcessState> {
  return JSON.parse(await readFile(join(fixture.installationRoot, 'state/active-release.json'), 'utf8')) as ProcessState
}

async function waitForProcessState(fixture: ProfileFixture, predicate: (state: ProcessState) => boolean, description: string): Promise<ProcessState> {
  return waitFor(async () => {
    try {
      const state = await readProcessState(fixture)
      return predicate(state) ? state : undefined
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }, description)
}

async function waitForRunningStatus(fixture: ProfileFixture, version: string, description: string, pid?: number): Promise<void> {
  await waitFor(async () => {
    const status = await fixture.status().catch(() => undefined)
    if (status?.status !== 'running' || status.activeVersion !== version) return undefined
    if (pid !== undefined && status.pid !== pid) return undefined
    return true
  }, description)
}

async function waitForEvidence(path: string, predicate: (evidence: CandidateEvidence[]) => boolean, description: string): Promise<CandidateEvidence[]> {
  return waitFor(async () => {
    try {
      const evidence = (await readFile(path, 'utf8')).trim().split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line) as CandidateEvidence)
      return predicate(evidence) ? evidence : undefined
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }, description)
}

async function waitForProcessGone(pid: number): Promise<void> {
  await waitFor(async () => processIsAlive(pid) ? undefined : true, `candidate PID ${pid} to exit`)
}

async function installAndStartFixture(): Promise<ProfileFixture> {
  const fixture = await createProfileFixture({ configuration: 'test' })
  fixtures.push(fixture)
  await expect(fixture.preflight()).resolves.toMatchObject({ stage: 'preflight', status: 'passed' })
  await fixture.install()
  await fixture.start()
  return fixture
}

async function sharedMarker(fixture: ProfileFixture): Promise<{ path: string; contents: string }> {
  const path = join(fixture.installationRoot, 'shared/data/issue-2-lifecycle-marker.txt')
  await mkdir(dirname(path), { recursive: true })
  const contents = 'shared-data-must-survive-release-switches\n'
  await writeFile(path, contents, 'utf8')
  return { path, contents }
}

async function assertFinalCleanup(fixture: ProfileFixture): Promise<void> {
  expect(fixture.cleanupEvidence.processStateRemoved).toBe(true)
  expect(fixture.cleanupEvidence.portReleased).toBe(true)
  expect(fixture.cleanupEvidence.noChildProcesses).toBe(true)
  await expect(lstat(join(fixture.installationRoot, 'state/process.json'))).rejects.toMatchObject({ code: 'ENOENT' })
}

async function runCandidateFailureCase(mode: Exclude<CandidateFailureMode, 'none'>): Promise<void> {
  const fixture = await installAndStartFixture()
  const initialState = await readProcessState(fixture)
  const marker = join(fixture.installationRoot, `candidate-${mode}.jsonl`)
  const shared = await sharedMarker(fixture)
  const candidate = await deriveCandidateArtifact(fixture.artifact, fixture.installationRoot, {
    mode,
    versionSuffix: mode === 'start' ? 'candidate.2' : 'candidate.3',
  })
  const upgrade = fixture.spawnCli([
    'upgrade', '--installation', fixture.installationPath, '--artifact', candidate.tarballPath,
  ], { HARNESS_TEST_CANDIDATE_MODE: mode, HARNESS_TEST_CANDIDATE_EVIDENCE: marker })

  const evidence = await waitForEvidence(
    marker,
    entries => entries.some(entry => entry.event === (mode === 'start' ? 'candidate-start-failure' : 'candidate-health-failure')),
    `${mode} candidate evidence`,
  )
  const recovered = await waitForProcessState(
    fixture,
    state => state.activeVersion === fixture.artifact.version && state.pid !== initialState.pid,
    `${mode} failure recovery Host`,
  )
  await waitForRunningStatus(fixture, fixture.artifact.version, `${mode} failure recovery Host status`, recovered.pid)
  await expect(fixture.status()).resolves.toMatchObject({ status: 'running', activeVersion: fixture.artifact.version, pid: recovered.pid })
  await expect(fixture.health()).resolves.toMatchObject({ stage: 'health', status: 'passed' })
  expect(await readActiveReleaseState(fixture)).toMatchObject({
    activeVersion: fixture.artifact.version,
    previousRelease: null,
  })
  expect(await readFile(shared.path, 'utf8')).toBe(shared.contents)
  expect(evidence.some(entry => entry.event === 'candidate-host-started')).toBe(mode === 'health')
  const candidateHostPid = evidence.find(entry => entry.event === 'candidate-host-started')?.pid
  if (candidateHostPid !== undefined) await waitForProcessGone(candidateHostPid)
  expect(processIsAlive(recovered.pid)).toBe(true)
  expect(recovered.pid).not.toBe(initialState.pid)

  await fixture.stop()
  const result = await upgrade.result
  expect(result.code).toBe(1)
  expect(result.signal).toBeNull()
  await assertFinalCleanup(fixture)
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose()))
}, 300000)

describe('verified release artifact upgrade and rollback lifecycle', () => {
  it('upgrades the verified artifact to one candidate Host and exits the foreground upgrade on external stop', async () => {
    const fixture = await installAndStartFixture()
    const initialState = await readProcessState(fixture)
    const shared = await sharedMarker(fixture)
    const candidate = await deriveCandidateArtifact(fixture.artifact, fixture.installationRoot, {
      mode: 'none',
      versionSuffix: 'candidate.1',
    })
    const upgrade = fixture.spawnCli([
      'upgrade', '--installation', fixture.installationPath, '--artifact', candidate.tarballPath,
    ])

    const candidateState = await waitForProcessState(
      fixture,
      state => state.activeVersion === candidate.version,
      'successful candidate Host',
    )
    await waitForRunningStatus(fixture, candidate.version, 'successful candidate Host status', candidateState.pid)
    const candidateStatus = await fixture.status()
    expect(candidateStatus).toMatchObject({
      status: 'running', activeVersion: candidate.version, pid: candidateState.pid, port: fixture.port,
    })
    await expect(fixture.health()).resolves.toMatchObject({ stage: 'health', status: 'passed' })
    const activeState = await readActiveReleaseState(fixture)
    expect(activeState).toMatchObject({
      activeVersion: candidate.version,
      releasePath: join(fixture.installationRoot, 'releases', candidate.version),
      previousRelease: {
        activeVersion: fixture.artifact.version,
        releasePath: join(fixture.installationRoot, 'releases', fixture.artifact.version),
      },
    })
    expect(candidateState.pid).not.toBe(initialState.pid)
    expect(processIsAlive(candidateState.pid)).toBe(true)
    expect(processIsAlive(initialState.pid)).toBe(false)
    expect(await readFile(shared.path, 'utf8')).toBe(shared.contents)

    await fixture.stop()
    const result = await upgrade.result
    expect(result.code).toBe(0)
    expect(result.signal).toBeNull()
    await assertFinalCleanup(fixture)
  }, 300000)

  it.each([
    ['start', 'candidate start failure'],
    ['health', 'candidate health failure'],
  ] as const)('%s failure restores the original active release and healthy Host', async (mode, _description) => {
    await runCandidateFailureCase(mode)
  }, 300000)

  it('rolls back the active candidate to previous release, keeps health passing, and exits both foreground commands on stop', async () => {
    const fixture = await installAndStartFixture()
    const initialState = await readProcessState(fixture)
    const shared = await sharedMarker(fixture)
    const candidate = await deriveCandidateArtifact(fixture.artifact, fixture.installationRoot, {
      mode: 'none',
      versionSuffix: 'candidate.4',
    })
    const upgrade = fixture.spawnCli([
      'upgrade', '--installation', fixture.installationPath, '--artifact', candidate.tarballPath,
    ])
    const candidateState = await waitForProcessState(
      fixture,
      state => state.activeVersion === candidate.version,
      'candidate Host before rollback',
    )
    await waitForRunningStatus(fixture, candidate.version, 'candidate Host before rollback status', candidateState.pid)
    await expect(fixture.health()).resolves.toMatchObject({ stage: 'health', status: 'passed' })

    const rollback = fixture.spawnCli(['rollback', '--installation', fixture.installationPath])
    const restoredState = await waitForProcessState(
      fixture,
      state => state.activeVersion === fixture.artifact.version && state.pid !== candidateState.pid,
      'previous release Host after rollback',
    )
    await waitForProcessGone(candidateState.pid)
    await waitForRunningStatus(fixture, fixture.artifact.version, 'previous release Host after rollback status', restoredState.pid)
    await expect(fixture.status()).resolves.toMatchObject({
      status: 'running',
      activeVersion: fixture.artifact.version,
      pid: restoredState.pid,
      port: fixture.port,
    })
    await expect(fixture.health()).resolves.toMatchObject({ stage: 'health', status: 'passed' })
    expect(await readActiveReleaseState(fixture)).toMatchObject({
      activeVersion: fixture.artifact.version,
      releasePath: join(fixture.installationRoot, 'releases', fixture.artifact.version),
      previousRelease: {
        activeVersion: candidate.version,
        releasePath: join(fixture.installationRoot, 'releases', candidate.version),
      },
    })
    expect(restoredState.pid).not.toBe(initialState.pid)
    expect(restoredState.pid).not.toBe(candidateState.pid)
    expect(processIsAlive(restoredState.pid)).toBe(true)
    expect(await readFile(shared.path, 'utf8')).toBe(shared.contents)

    await fixture.stop()
    const [upgradeResult, rollbackResult] = await Promise.all([upgrade.result, rollback.result])
    expect(upgradeResult.code).toBe(0)
    expect(rollbackResult.code).toBe(0)
    expect(upgradeResult.signal).toBeNull()
    expect(rollbackResult.signal).toBeNull()
    await assertFinalCleanup(fixture)
  }, 300000)
})
