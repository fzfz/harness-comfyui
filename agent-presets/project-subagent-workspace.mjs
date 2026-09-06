import { realpath } from 'node:fs/promises'

export const name = 'harness-comfyui-project-subagent-workspace'
export const inject = ['workspaceRegistry', 'agents']

function includesSession(workspace, sessionId) {
  return workspace.sessionIds.some(id => String(id) === String(sessionId))
}

async function sessionRealpath(cwd, label, sessionId) {
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw new Error(`cannot register subagent Session ${String(sessionId)}: ${label} Session has no cwd`)
  }
  try {
    return await realpath(cwd)
  } catch (error) {
    throw new Error(
      `cannot register subagent Session ${String(sessionId)}: ${label} Session cwd is unavailable at ${cwd}`,
      { cause: error },
    )
  }
}

export function apply(ctx) {
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const childHeader = agent.session.header
    if (childHeader.origin !== 'subagent') return next()

    const childSessionId = agent.session.id
    const parent = ctx.agents.get(childHeader.parentSession)
    if (parent === undefined || parent === null) {
      throw new Error(
        `cannot register subagent Session ${String(childSessionId)}: parent Session ${String(childHeader.parentSession)} was not found`,
      )
    }

    const parentHeader = parent.session.header
    const [childCwd, parentCwd] = await Promise.all([
      sessionRealpath(childHeader.cwd, 'child', childSessionId),
      sessionRealpath(parentHeader.cwd, 'parent', childSessionId),
    ])
    if (childCwd !== parentCwd) {
      throw new Error(
        `cannot register subagent Session ${String(childSessionId)}: child cwd ${childCwd} differs from parent cwd ${parentCwd}`,
      )
    }

    let workspace
    try {
      workspace = await ctx.workspaceRegistry.resolveByPath(parentHeader.cwd)
    } catch (error) {
      throw new Error(
        `cannot register subagent Session ${String(childSessionId)}: Workspace lookup failed for parent cwd ${parentHeader.cwd}`,
        { cause: error },
      )
    }
    if (workspace === undefined || workspace === null) {
      throw new Error(
        `cannot register subagent Session ${String(childSessionId)}: no Workspace contains parent cwd ${parentHeader.cwd}`,
      )
    }
    if (!includesSession(workspace, parent.session.id)) {
      throw new Error(
        `cannot register subagent Session ${String(childSessionId)}: parent Session ${String(parent.session.id)} is not attached to Workspace ${String(workspace.id)}`,
      )
    }
    if (!includesSession(workspace, childSessionId)) {
      try {
        await workspace.attachSession(childSessionId)
      } catch (error) {
        throw new Error(
          `cannot register subagent Session ${String(childSessionId)} with Workspace ${String(workspace.id)}`,
          { cause: error },
        )
      }
    }
    return next()
  })
}
