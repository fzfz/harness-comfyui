import { realpath } from 'node:fs/promises'

export const name = 'harness-comfyui-project-subagent-workspace'
export const inject = ['workspaceRegistry', 'agents']

function includesSession(workspace, sessionId) {
  return workspace.sessionIds.some(id => String(id) === String(sessionId))
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

async function sessionRealpath(cwd, label, sessionId) {
  if (typeof cwd !== 'string' || cwd.length === 0) {
    const action = label === 'child'
      ? 'set the child Session cwd to its parent Session cwd'
      : 'set the parent Session cwd to a directory within its Workspace'
    throw new Error(`Registration of subagent Session ${String(sessionId)} failed because its ${label} Session has no cwd; ${action}.`)
  }
  try {
    return await realpath(cwd)
  } catch (error) {
    throw new Error(
      `Registration of subagent Session ${String(sessionId)} failed because its ${label} Session cwd at ${cwd} is unavailable: ${errorMessage(error)}; check that the path exists and is accessible, then retry.`,
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
        `Registration of subagent Session ${String(childSessionId)} failed because parent Session ${String(childHeader.parentSession)} was not found; set the child Session header.parentSession field to an existing parent Session ID.`,
      )
    }

    const parentHeader = parent.session.header
    const [childCwd, parentCwd] = await Promise.all([
      sessionRealpath(childHeader.cwd, 'child', childSessionId),
      sessionRealpath(parentHeader.cwd, 'parent', childSessionId),
    ])
    if (childCwd !== parentCwd) {
      throw new Error(
        `Registration of subagent Session ${String(childSessionId)} failed because child cwd ${childCwd} differs from parent cwd ${parentCwd}; set the child Session cwd to the parent cwd.`,
      )
    }

    let workspace
    try {
      workspace = await ctx.workspaceRegistry.resolveByPath(parentHeader.cwd)
    } catch (error) {
      throw new Error(
        `Registration of subagent Session ${String(childSessionId)} failed because Workspace lookup for parent cwd ${parentHeader.cwd} failed with ${errorMessage(error)}; check the Workspace registry and parent Session cwd, then retry.`,
        { cause: error },
      )
    }
    if (workspace === undefined || workspace === null) {
      throw new Error(
        `Registration of subagent Session ${String(childSessionId)} failed because no Workspace contains parent cwd ${parentHeader.cwd}; register a Workspace containing that cwd or set the parent Session cwd to a directory in an existing Workspace.`,
      )
    }
    if (!includesSession(workspace, parent.session.id)) {
      throw new Error(
        `Registration of subagent Session ${String(childSessionId)} failed because parent Session ${String(parent.session.id)} is not attached to Workspace ${String(workspace.id)}; attach the parent Session to that Workspace.`,
      )
    }
    if (!includesSession(workspace, childSessionId)) {
      try {
        await workspace.attachSession(childSessionId)
      } catch (error) {
        throw new Error(
          `Registration of subagent Session ${String(childSessionId)} failed because Workspace ${String(workspace.id)} could not attach the child Session: ${errorMessage(error)}; check the Workspace Session record and retry the attachment.`,
          { cause: error },
        )
      }
    }
    return next()
  })
}
