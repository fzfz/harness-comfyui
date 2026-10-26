import { describe, expect, it, vi } from 'vitest'

import { resolveGenerationWorkspaceId, workspaceSessionScopeForSession } from '../../src/host/generation/workspace-access.ts'

function fixture() {
  const headers = new Map([
    ['root', { cwd: '/project' }],
    ['child', { cwd: '/project' }],
    ['grandchild', { cwd: '/project' }],
    ['foreign', { cwd: '/other-project' }],
  ])
  const registry = { resolveByPath: vi.fn(async (path: string) => path === '/project' ? { id: 'workspace' } : { id: 'other-workspace' }) }
  const persistence = { stat: vi.fn(async (id: string) => {
    const header = headers.get(id)
    return header === undefined ? undefined : { header: { id, ...header }, revision: id }
  }) }
  const subagents = { listDescendants: vi.fn(async () => [
    { kind: 'child', id: 'child', mode: 'continuable', parentId: 'root', depth: 1 },
    { kind: 'child', id: 'grandchild', mode: 'one-shot', parentId: 'child', depth: 2 },
    { kind: 'child', id: 'foreign', mode: 'continuable', parentId: 'root', depth: 1 },
    { kind: 'child', id: 'external', mode: 'external', parentId: 'root', depth: 1 },
  ]) }
  const controller = new AbortController()
  return { headers, registry, persistence, subagents, controller,
    read: () => workspaceSessionScopeForSession(registry, persistence as never, subagents as never, 'root', controller.signal) }
}

describe('Generation Workspace access through native Session facts', () => {
  it('resolves original project ownership without Workspace membership or writes', async () => {
    const { registry } = fixture()
    await expect(resolveGenerationWorkspaceId(registry, '/project')).resolves.toBe('workspace')
    expect(registry.resolveByPath).toHaveBeenCalledExactlyOnceWith('/project')
  })

  it.each([undefined, ''])('reports a missing original project directory %s', async cwd => {
    const { registry } = fixture()
    await expect(resolveGenerationWorkspaceId(registry, cwd)).rejects.toMatchObject({ code: 'GENERATION_WORKSPACE_REQUIRED' })
    expect(registry.resolveByPath).not.toHaveBeenCalled()
  })

  it('guides the caller to the official Workspace entry when the original directory is unregistered', async () => {
    await expect(resolveGenerationWorkspaceId({ resolveByPath: async () => undefined }, '/project'))
      .rejects.toMatchObject({ code: 'GENERATION_WORKSPACE_REQUIRED', message: expect.stringContaining('Workspace') })
  })

  it('uses native durable descendants and includes only local Sessions in the original project', async () => {
    const f = fixture()
    await expect(f.read()).resolves.toEqual({ workspaceId: 'workspace', sessionIds: ['root', 'child', 'grandchild'] })
    expect(f.subagents.listDescendants).toHaveBeenCalledExactlyOnceWith('root', f.controller.signal)
    expect(f.persistence.stat.mock.calls.map(([id]) => id)).toEqual(['root', 'child', 'grandchild', 'foreign'])
  })

  it.each(['corrupt', 'unavailable', 'unsupported'])('reports the native %s branch diagnostic before granting access', async reason => {
    const f = fixture()
    f.subagents.listDescendants.mockResolvedValue([{ kind: 'diagnostic', id: 'child', reason, parentId: 'root', depth: 1 }] as never)
    await expect(f.read()).rejects.toMatchObject({ code: 'GENERATION_SESSION_UNAVAILABLE', message: expect.stringContaining('child') })
  })

  it('rejects a missing root Session', async () => {
    const f = fixture()
    f.headers.delete('root')
    await expect(f.read()).rejects.toMatchObject({ code: 'GENERATION_SESSION_NOT_FOUND' })
    expect(f.subagents.listDescendants).not.toHaveBeenCalled()
  })

  it('reports a local descendant whose durable metadata disappears', async () => {
    const f = fixture()
    f.headers.delete('child')
    await expect(f.read()).rejects.toMatchObject({ code: 'GENERATION_SESSION_UNAVAILABLE', message: expect.stringContaining('child') })
  })

  it('forwards cancellation to native catalog queries and stops after cancellation', async () => {
    const f = fixture()
    f.subagents.listDescendants.mockImplementation(async (_id?: unknown, signal?: AbortSignal) => {
      expect(signal).toBe(f.controller.signal)
      f.controller.abort()
      return []
    })
    await expect(f.read()).rejects.toMatchObject({ name: 'AbortError' })
    expect(f.persistence.stat).toHaveBeenCalledTimes(1)
  })

  it('stops before reading native services when already cancelled', async () => {
    const f = fixture()
    f.controller.abort()
    await expect(f.read()).rejects.toMatchObject({ name: 'AbortError' })
    expect(f.persistence.stat).not.toHaveBeenCalled()
    expect(f.subagents.listDescendants).not.toHaveBeenCalled()
  })

  it('propagates native query failures', async () => {
    const f = fixture()
    const error = new Error('native catalog read failed')
    f.subagents.listDescendants.mockRejectedValue(error)
    await expect(f.read()).rejects.toBe(error)
  })
})
