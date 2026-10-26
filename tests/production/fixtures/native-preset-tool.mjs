export const inject = ['tools', 'systemPrompt']

export function apply(ctx, config = {}) {
  ctx.tools.register(fixtureTool(config.toolName ?? 'preset_tool'))
  ctx.systemPrompt.section({ name: 'fixture:preset', order: 0, text: 'Preset prompt fixture' })
  if (config.fail === true) throw new Error('fixture activation failed')
}

export function fixtureTool(name) {
  return {
    name,
    description: `${name} fixture tool`,
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: { type: 'object' }, render: () => [] },
    execute: async () => ({}),
  }
}
