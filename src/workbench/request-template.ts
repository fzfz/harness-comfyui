import configuration from './request-template.json' with { type: 'json' }

export type PromptBlockName = keyof typeof configuration.blocks
export type PromptReferenceName = keyof typeof configuration.references
export interface PromptRequestParts {
  readonly block_templates: Record<PromptBlockName, string>
  readonly reference_descriptions: Record<PromptReferenceName, string>
}
export interface PromptRequestInput {
  readonly base_model_id: string
  readonly base_model_name: string
  readonly original_request: string
  readonly change_request: string
  readonly positive_prompt: string
  readonly negative_prompt: string
  readonly reference_context: Partial<Record<PromptReferenceName, unknown>> & { selected_resources?: import('./contract.ts').ResourceSnapshot[] }
}
export const PROMPT_BLOCKS = configuration.blocks
export const PROMPT_REFERENCES = configuration.references
export const DEFAULT_PROMPT_REQUEST_PARTS: PromptRequestParts = {
  block_templates: Object.fromEntries(Object.entries(PROMPT_BLOCKS).map(([name, block]) => [name, block.template])) as Record<PromptBlockName, string>,
  reference_descriptions: Object.fromEntries(Object.entries(PROMPT_REFERENCES).map(([name, reference]) => [name, reference.description])) as Record<PromptReferenceName, string>,
}

export function requestTemplateVariables(kind = 'run', block?: PromptBlockName) {
  return block ? PROMPT_BLOCKS[block].variables : configuration.variables[kind === 'prompt' ? 'prompt' : kind === 'translate' ? 'translate' : 'task']
}

export function requestTemplateProblem(template: string, kind = 'run', block?: PromptBlockName): string {
  if (!template.trim()) return configuration.errors.empty
  const variables = requestTemplateVariables(kind, block), names: string[] = variables.map(item => item.name)
  const placeholder = names.map(name => '{{' + name + '}}').join('、')
  const tokens = [...template.matchAll(/\{\{([^{}]*)\}\}/g)]
  const problem = tokens.some(match => !names.includes(match[1].trim())) ? 'unsupported'
    : !tokens.some(match => names.includes(match[1].trim())) ? 'missing'
    : /\{\{|\}\}/.test(template.replace(/\{\{[^{}]*\}\}/g, '')) ? 'incomplete' : null
  return problem ? configuration.errors[problem].replace('{placeholder}', placeholder) : ''
}

function replaceFields(template: string, values: Readonly<Record<string, unknown>>): string {
  return template.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, (token, name: string) => {
    const value = values[name.trim()]
    return value === undefined ? token : typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  })
}

export function renderRequestTemplate(template: string, value: string, kind = 'run'): string {
  return replaceFields(template, { [requestTemplateVariables(kind)[0].name]: value })
}

export function buildPromptRequest(template: string, input: PromptRequestInput, parts: PromptRequestParts = DEFAULT_PROMPT_REQUEST_PARTS): string {
  const references = Object.fromEntries(Object.entries(input.reference_context).flatMap(([name, data]) => {
    if (data === null || data === undefined || data === '' || (Array.isArray(data) && !data.length)) return []
    const purpose = parts.reference_descriptions[name as PromptReferenceName]
    return [[name, { ...(purpose?.trim() ? { purpose } : {}), data }]]
  }))
  const conditions: Record<string, boolean> = {
    always: true, has_prompt: !!(input.positive_prompt.trim() || input.negative_prompt.trim()), has_references: !!Object.keys(references).length,
  }
  const fields = { ...input, positive_prompt: input.positive_prompt || '""', negative_prompt: input.negative_prompt || '""', reference_context: references }
  const blocks = Object.fromEntries(Object.entries(PROMPT_BLOCKS).map(([name, block]) => [
    name, conditions[block.condition] ? replaceFields(parts.block_templates[name as PromptBlockName], fields) : '',
  ]))
  return replaceFields(template, blocks).trim()
}
