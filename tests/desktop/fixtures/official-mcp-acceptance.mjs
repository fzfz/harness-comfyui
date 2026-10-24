import assert from 'node:assert/strict'
import { OFFICIAL_MCP_FIXTURE } from './official-mcp-services.mjs'

export function requestMessageText(message) {
  if (typeof message.content === 'string') return message.content
  if (!Array.isArray(message.content)) return ''
  return message.content.flatMap(part => typeof part?.text === 'string' ? [part.text] : []).join('\n')
}

export function isOfficialMcpChildRequest(request, sequenceStart) {
  return request.sequence >= sequenceStart
    && (request.body.messages ?? []).some(message => message.role === 'user'
      && requestMessageText(message).includes(OFFICIAL_MCP_FIXTURE.workflowPrompt))
}

export function assertSuccessfulProjectActivations(sessions, presetIds) {
  assert.equal(sessions.length, presetIds.length, 'Every project Preset must produce one activation result')
  assert.deepEqual(sessions.map(session => session.presetId).sort(), [...presetIds].sort(),
    'Activation results must cover every project Preset exactly once')
  for (const session of sessions) {
    assert.equal(session.result.ok, true, `${session.presetId}: Preset reactivation must succeed`)
    assert.equal(typeof session.result.value.sessionId, 'string', `${session.presetId}: Session ID is required`)
    assert.notEqual(session.result.value.sessionId, '', `${session.presetId}: Session ID must be nonempty`)
  }
  return sessions
}

export function assertSuccessfulProjectWorkflows(workflows, presetIds, toolNames) {
  assert.equal(workflows.length, presetIds.length, 'Every recovered project Preset must complete one MCP workflow')
  assert.deepEqual(workflows.map(workflow => workflow.presetId).sort(), [...presetIds].sort(),
    'MCP workflows must cover every recovered project Preset exactly once')
  for (const workflow of workflows) {
    assert.deepEqual(workflow.calls.map(call => call.params.name), toolNames,
      `${workflow.presetId}: Every required MCP query must execute exactly once in order`)
    for (const call of workflow.calls) {
      assert.equal(call.method, 'tools/call', `${workflow.presetId}: MCP query evidence must be a tool call`)
      assert.equal(call.status, 200, `${workflow.presetId}: MCP queries must succeed`)
      assert.equal(call.result.result.isError, false, `${workflow.presetId}: MCP tool results must succeed`)
    }
    assert.equal(workflow.resultReceivedByModel, true, `${workflow.presetId}: The model must receive MCP results`)
  }
  return workflows
}

export function assertToolScope(tools, { required = [], forbidden = [] }) {
  const declared = name => tools.some(tool => typeof tool === 'string' && tool.endsWith(name))
  for (const name of required) assert.equal(declared(name), true, `${name}: required tool must be declared`)
  for (const name of forbidden) assert.equal(declared(name), false, `${name}: isolated tool must not be declared`)
}
