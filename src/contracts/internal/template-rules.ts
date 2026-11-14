import configuration from '../../workbench/request-template.json' with { type: 'json' }

export type TemplateBlockName = keyof typeof configuration.blocks

export function requestTemplateVariables(kind: string, block?: TemplateBlockName) {
  return block ? configuration.blocks[block].variables : configuration.variables[kind === 'prompt' ? 'prompt' : kind === 'translate' ? 'translate' : 'task']
}

export function requestTemplateProblem(template: string, kind: string, block?: TemplateBlockName): string {
  if (!template.trim()) return configuration.errors.empty
  const variables = requestTemplateVariables(kind, block)
  const names: string[] = variables.map(item => item.name)
  const placeholder = names.map(name => '{{' + name + '}}').join('、')
  const tokens = [...template.matchAll(/\{\{([^{}]*)\}\}/g)]
  const problem = tokens.some(match => !names.includes(match[1].trim())) ? 'unsupported'
    : !tokens.some(match => names.includes(match[1].trim())) ? 'missing'
      : /\{\{|\}\}/.test(template.replace(/\{\{[^{}]*\}\}/g, '')) ? 'incomplete' : null
  return problem ? configuration.errors[problem].replace('{placeholder}', placeholder) : ''
}
