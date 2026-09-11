import { realpath } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { apply } from '../../src/host/cli/workspace.ts'

function fixture(header: object, sessionIds: string[] = []) {
  let handler: Function
  const workspace = { sessionIds, attachSession: vi.fn(async () => undefined) }
  const create = vi.fn(async () => workspace)
  apply({ on: (_event: string, callback: Function) => { handler = callback }, workspaceRegistry: { create } } as never)
  const next = vi.fn()
  return { workspace, create, next, run: () => handler({ agent: { session: { id: 'root-session', header } } }, next) }
}

describe('pure CLI root Workspace registration', () => {
  it('attaches the real root Session before continuing the Agent step', async () => {
    const f = fixture({ cwd: process.cwd() })
    f.workspace.attachSession.mockImplementation(async () => { expect(f.next).not.toHaveBeenCalled() })
    await f.run()
    expect(f.create).toHaveBeenCalledWith(await realpath(process.cwd()))
    expect(f.workspace.attachSession).toHaveBeenCalledWith('root-session')
    expect(f.next).toHaveBeenCalledOnce()
  })
  it('keeps existing membership and leaves subagent registration to its component', async () => {
    const existing = fixture({ cwd: process.cwd() }, ['root-session'])
    await existing.run()
    expect(existing.workspace.attachSession).not.toHaveBeenCalled()
    const child = fixture({ origin: 'subagent' })
    await child.run()
    expect(child.create).not.toHaveBeenCalled()
    expect(child.next).toHaveBeenCalledOnce()
  })
  it.each([{}, { cwd: '/missing/cli-workspace' }])('stops a Session with invalid cwd %#', async header => {
    const f = fixture(header)
    await expect(f.run()).rejects.toThrow()
    expect(f.next).not.toHaveBeenCalled()
  })
  it('propagates failed registration before the Agent can run a Tool', async () => {
    const f = fixture({ cwd: process.cwd() })
    f.workspace.attachSession.mockRejectedValue(new Error('storage unavailable'))
    await expect(f.run()).rejects.toThrow('storage unavailable')
    expect(f.next).not.toHaveBeenCalled()
  })
})
