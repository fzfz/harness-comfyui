import configuration from './request-template.json' with { type: 'json' }

function variable(kind: string): string {
  return configuration.variables[kind === 'translate' ? 'translate' : 'task']
}

export function requestTemplateProblem(template: string, kind = 'run'): string {
  if (!template.trim()) return configuration.errors.empty
  const name = variable(kind), placeholder = `{{${name}}}`
  const tokens = [...template.matchAll(/\{\{([^{}]*)\}\}/g)]
  const problem = tokens.some(match => match[1].trim() !== name) ? 'unsupported'
    : !tokens.some(match => match[1].trim() === name) ? 'missing'
    : /\{\{|\}\}/.test(template.replace(/\{\{[^{}]*\}\}/g, '')) ? 'incomplete' : null
  return problem ? configuration.errors[problem].replace('{placeholder}', placeholder) : ''
}

export function renderRequestTemplate(template: string, value: string, kind = 'run'): string {
  return template.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, (token, name: string) => name.trim() === variable(kind) ? value : token)
}
