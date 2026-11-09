import { expect, it } from 'vitest'
import { formatExperimentAgentModel } from '../../src/client/workbench/experiment-function-settings.tsx'

it.each([['off', 'Off', '关闭（off）'], ['high', 'High', '高'], ['xhigh', 'Extra High', '更高']])('uses the prototype reasoning label for %s while preserving provider and model names', (id, name, expected) => {
  expect(formatExperimentAgentModel({ provider: 'actual-provider', model: 'actual-model', reasoningEffort: id }, [{ id: 'actual-provider', name: '实际提供商', models: [{ id: 'actual-model', name: '实际模型', reasoning: { efforts: [{ id, name }] } }] }])).toBe(`实际提供商 · 实际模型 · ${expected}`)
})
