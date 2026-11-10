import assert from 'node:assert/strict'
import translation from '../../../config/workbench-translation.json' with { type: 'json' }

export function assertTranslationPresetObservation(observation, runtimeModel) {
  assert.equal(observation.presetId, translation.preset_id)
  assert.deepEqual(observation.configuredModel, translation.agent_model)
  assert.deepEqual(observation.tools, [], 'Translation requests must declare no tools')
  assert.deepEqual(observation.skills, [], 'Translation Sessions must discover no Skills')
  assert.deepEqual(observation.mcpCalls, [], 'Translation Sessions must execute no MCP calls')
  assert.deepEqual(observation.selected, runtimeModel, 'Translation selection must match the explicit model route')
  assert.deepEqual(observation.projectionModel, runtimeModel, 'Translation request header must retain that model route')
  assert.equal(observation.requestModel, runtimeModel.model, 'The provider request must use the selected model')
  return observation
}
