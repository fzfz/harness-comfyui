import { access, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { afterEach, describe, expect, it } from 'vitest'

import { createProfileFixture } from '../../src/testing/profile-fixture.ts'

const fixtures: Array<Awaited<ReturnType<typeof createProfileFixture>>> = []

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose()))
})

type RpcEnvelope = {
  result?: {
    ok?: boolean
    value?: unknown
    error?: { code?: string; message?: string; details?: unknown }
  }
}

type HistoryEvent = {
  event?: {
    type?: string
    data?: {
      header?: { tools?: Array<{ name?: string }> }
    }
  }
}

type HeaderToolsResult =
  | { status: 'ready'; tools: string[] }
  | { status: 'timeout'; sessionId: string; timeoutMs: number; observedEventTypes: string[] }

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string`)
  return value
}

async function rpc(fixture: Awaited<ReturnType<typeof createProfileFixture>>, method: string, payload: Record<string, unknown>): Promise<any> {
  const response = await fetch(`http://127.0.0.1:${fixture.port}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `issue16-${method}-${Date.now()}-${Math.random()}`,
      method,
      payload,
    }),
  })
  const envelope = await response.json() as RpcEnvelope
  if (!response.ok || envelope.result?.ok !== true) {
    const error = envelope.result?.error
    throw new Error(`${method} failed: ${error?.code ?? response.status} ${error?.message ?? ''}`.trim())
  }
  return envelope.result.value
}

async function prepareHostObserver(fixture: Awaited<ReturnType<typeof createProfileFixture>>): Promise<{
  observerPath: string
  packageRoot: string
  originalPatch: string
}> {
  const profileRoot = dirname(fixture.profileManifestPath)
  const packageRoot = join(profileRoot, 'node_modules/harness-comfyui')
  const observerPath = join(profileRoot, 'tests/issue16-host-tools-observer.mjs')
  const evidencePath = join(fixture.runtimeCwd, 'host-tools-schemas.json')
  await mkdir(dirname(observerPath), { recursive: true })
  await writeFile(observerPath, `import { writeFileSync } from 'node:fs'

const evidencePath = ${JSON.stringify(evidencePath)}

export const name = 'harness-comfyui/issue16-host-tools-observer'
export const inject = ['tools']
export function apply(ctx) {
  writeFileSync(evidencePath, JSON.stringify(ctx.tools.schemas()), 'utf8')
}
`, 'utf8')

  const patchPath = join(packageRoot, 'cordis.patch.yml')
  const originalPatch = await readFile(patchPath, 'utf8')
  const observerPatch = `${originalPatch.trimEnd()}
- insert:
    - id: issue16-host-tools-observer
      name: ./tests/issue16-host-tools-observer.mjs
`
  await writeFile(patchPath, observerPatch, 'utf8')
  return { observerPath, packageRoot, originalPatch }
}

async function pinNpmExecPnpm(fixture: Awaited<ReturnType<typeof createProfileFixture>>): Promise<void> {
  let candidate: string | undefined
  for (const directory of process.env.PATH?.split(':') ?? []) {
    const path = join(directory, 'pnpm')
    try {
      await access(path)
      candidate = path
      break
    } catch {
      // Continue through PATH candidates.
    }
  }
  if (candidate === undefined) throw new Error('composition fixture could not find the pinned pnpm executable')
  const binDirectory = join(fixture.runtimeCwd, 'node_modules/.bin')
  await mkdir(binDirectory, { recursive: true })
  await symlink(candidate, join(binDirectory, 'pnpm'))
}

async function promptSession(
  fixture: Awaited<ReturnType<typeof createProfileFixture>>,
  sessionId: string,
): Promise<void> {
  const result = await rpc(fixture, 'session.prompt', {
    sessionId,
    mode: 'queue',
    content: [{ type: 'text', text: 'scope' }],
  }) as { accepted?: boolean }
  if (result.accepted !== true) throw new Error(`session.prompt was not accepted for ${sessionId}`)
}

async function readHeaderTools(
  fixture: Awaited<ReturnType<typeof createProfileFixture>>,
  sessionId: string,
): Promise<{ tools?: string[]; eventTypes: string[] }> {
  const history = await rpc(fixture, 'session.history', { sessionId }) as { events?: HistoryEvent[] }
  const events = history.events ?? []
  const eventTypes = events.map(entry => text(entry.event?.type, 'session.history event type'))
  const header = events.map(entry => entry.event).find(event => event?.type === 'request/header')?.data?.header
  if (header === undefined) return { eventTypes }
  return {
    tools: (header.tools ?? []).map(tool => text(tool.name, 'request/header tool name')),
    eventTypes,
  }
}

async function waitForHeaderTools(
  fixture: Awaited<ReturnType<typeof createProfileFixture>>,
  sessionId: string,
  timeoutMs = 30000,
): Promise<HeaderToolsResult> {
  const deadline = Date.now() + timeoutMs
  let observedEventTypes: string[] = []
  while (Date.now() < deadline) {
    const result = await readHeaderTools(fixture, sessionId)
    observedEventTypes = result.eventTypes
    if (result.tools !== undefined) return { status: 'ready', tools: result.tools }
    await delay(100)
  }
  return { status: 'timeout', sessionId, timeoutMs, observedEventTypes }
}

function requireHeaderTools(result: HeaderToolsResult): string[] {
  if (result.status === 'timeout') throw new Error(`request/header was not observed: ${JSON.stringify(result)}`)
  return result.tools
}

describe('Agent Tool scope composition', () => {
  it('keeps project Tool schemas on the project Agent and out of sibling Presets', async () => {
    const fixture = await createProfileFixture({ configuration: 'test' })
    fixtures.push(fixture)
    await pinNpmExecPnpm(fixture)
    await fixture.install()
    const observer = await prepareHostObserver(fixture)
    await fixture.start()

    const hostDescription = await rpc(fixture, 'host.describe', {}) as { cwd?: string }
    const cwd = text(hostDescription.cwd, 'host.describe cwd')
    const copy = await rpc(fixture, 'agentPreset.copy', { from: 'standard', agentPreset: 'issue16-sibling' }) as { agentPreset?: string }
    expect(copy.agentPreset).toBe('issue16-sibling')

    const presetPath = join(fixture.dshHome, '.agent-presets/harness-comfyui/agent.cordis.yml')
    const pluginPath = join(fixture.dshHome, '.agent-presets/harness-comfyui/project-tool-plugin.mjs')
    const originalPreset = await readFile(presetPath, 'utf8')
    const pluginSource = await readFile(join(import.meta.dirname, 'fixtures/project-tool-plugin.mjs'), 'utf8')
    await writeFile(pluginPath, pluginSource, 'utf8')
    await mkdir(join(dirname(pluginPath), 'node_modules'), { recursive: true })
    await symlink(join(dirname(fixture.profileManifestPath), 'node_modules/harness-comfyui'), join(dirname(pluginPath), 'node_modules/harness-comfyui'))
    await writeFile(presetPath, `${originalPreset.trimEnd()}
- id: issue16-project-scope-probe
  name: ./project-tool-plugin.mjs
`, 'utf8')

    await access(observer.observerPath)
    const hostSchemas = JSON.parse(await readFile(join(fixture.runtimeCwd, 'host-tools-schemas.json'), 'utf8')) as Array<{ name?: string }>
    expect(hostSchemas).toEqual([])

    const presets = await rpc(fixture, 'agentPreset.list', {}) as { presets?: Array<{ id?: string; trust?: string; isDefault?: boolean }> }
    expect(presets.presets?.map(preset => preset.id)).toEqual(expect.arrayContaining([
      'harness-comfyui', 'standard', 'minimal', 'issue16-sibling',
    ]))

    const project = await rpc(fixture, 'session.create', { cwd, agentPreset: 'harness-comfyui' }) as { sessionId?: string; agentPreset?: string }
    const standard = await rpc(fixture, 'session.create', { cwd, agentPreset: 'standard' }) as { sessionId?: string; agentPreset?: string }
    const minimal = await rpc(fixture, 'session.create', { cwd, agentPreset: 'minimal' }) as { sessionId?: string; agentPreset?: string }
    const sibling = await rpc(fixture, 'session.create', { cwd, agentPreset: 'issue16-sibling' }) as { sessionId?: string; agentPreset?: string }
    const sessionIds = [project.sessionId, standard.sessionId, minimal.sessionId, sibling.sessionId].map((id, index) => text(id, `session.create[${index}] sessionId`))
    expect(project.agentPreset).toBe('harness-comfyui')
    expect(standard.agentPreset).toBe('standard')
    expect(minimal.agentPreset).toBe('minimal')
    expect(sibling.agentPreset).toBe('issue16-sibling')

    await Promise.all(sessionIds.map(sessionId => promptSession(fixture, sessionId)))
    const schemaResults = await Promise.all(sessionIds.map(sessionId => waitForHeaderTools(fixture, sessionId)))
    const schemas = schemaResults.map(requireHeaderTools)
    expect(schemas[0]).toHaveLength(2)
    expect([...schemas[0]].sort()).toEqual(['issue16.project-scope-probe', 'skill'])
    for (const siblingSchemas of schemas.slice(1)) {
      expect(siblingSchemas).not.toContain('issue16.project-scope-probe')
    }

    await writeFile(presetPath, originalPreset, 'utf8')
    const restoredProject = await rpc(fixture, 'session.create', { cwd, agentPreset: 'harness-comfyui' }) as { sessionId?: string }
    const restoredSessionId = text(restoredProject.sessionId, 'restored sessionId')
    await promptSession(fixture, restoredSessionId)
    expect(requireHeaderTools(await waitForHeaderTools(fixture, restoredSessionId))).toEqual(['skill'])
  }, 120000)
})
