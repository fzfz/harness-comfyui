const TASK_ID_TOKEN = /\{\{\s*task_id\s*\}\}/g

export function requestTemplateProblem(template: string): string {
  if (!template.trim()) return '请填写本功能的执行要求。'
  const tokens = [...template.matchAll(/\{\{([^{}]*)\}\}/g)]
  if (tokens.some(match => match[1].trim() !== 'task_id')) return '请将其他定位符替换为具体执行要求，并保留 {{task_id}}。'
  if (!tokens.some(match => match[1].trim() === 'task_id')) return '请在执行要求中保留 {{task_id}}，用于定位工作台任务。'
  if (/\{\{|\}\}/.test(template.replace(TASK_ID_TOKEN, ''))) return 'Task ID 定位符格式不完整，请使用 {{task_id}}。'
  return ''
}

export function renderRequestTemplate(template: string, taskId: string): string {
  return template.replace(TASK_ID_TOKEN, () => taskId)
}
