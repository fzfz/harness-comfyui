import type { FunctionBinding } from './contract.ts'

type NamedFunction = Pick<FunctionBinding, 'workspace_id' | 'function_id' | 'name'>

export function functionNameProblem(binding: NamedFunction, functions: readonly NamedFunction[]): string {
  const name = typeof binding.name === 'string' ? binding.name.trim() : ''
  if (!name || functions.some(item => item.workspace_id === binding.workspace_id && item.function_id !== binding.function_id && item.name === name))
    return '请填写与已有功能不同的名称。'
  return ''
}
