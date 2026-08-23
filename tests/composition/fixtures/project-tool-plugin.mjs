import { createAgentPlugin } from 'harness-comfyui/agent'

const definition = {
  name: 'issue16.project-scope-probe',
  description: 'Issue 16 project scope isolation probe.',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  output: {
    schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    render: () => [{ type: 'text', text: 'Issue 16 project scope isolation probe.' }],
  },
  execute: async () => ({}),
}

const plugin = createAgentPlugin([definition])

export const name = 'harness-comfyui/issue16-project-scope-probe'
export const inject = plugin.inject
export const apply = plugin.apply
