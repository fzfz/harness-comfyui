import { LORA_WEIGHT_ROLE, LORA_TRIGGER_WORDS_ROLE } from '../../src/generation/lora-contract.ts'
import { JSON_VALUE_ROLE, JSON_OBJECT_ROLE, JSON_ARRAY_ROLE } from '../../src/shared/json-contract.ts'
import { contractFields, fieldIsRequired } from '../../src/shared/field-contract.ts'
import { cliInputSchemas } from '../../src/cli/input-schema.ts'
import { cliResultSchemas, cliJobResultSchemas } from '../../src/cli/result-schema.ts'

function jsonDefinition(schema) {
  if ([JSON_VALUE_ROLE, JSON_OBJECT_ROLE, JSON_ARRAY_ROLE].includes(schema.meta.role)) return schema.meta.extra
  if (schema.type === 'union') return schema.list.map(jsonDefinition).find(Boolean)
}

function typeName(schema) {
  if (schema.meta.role === LORA_WEIGHT_ROLE) return 'finite number'
  if (schema.meta.role === JSON_VALUE_ROLE) return 'JSON value'
  if (schema.meta.role === JSON_OBJECT_ROLE) return 'Record<string, JSON value>'
  if (schema.meta.role === JSON_ARRAY_ROLE) return 'JSON value[]'
  if (contractFields(schema)) return 'object'
  if (schema.type === 'transform') return typeName(schema.inner)
  if (schema.type === 'const') return JSON.stringify(schema.value)
  if (schema.type === 'union') return schema.list.some(item => item.meta.role === JSON_VALUE_ROLE) ? 'JSON value' : [...new Set(schema.list.map(typeName))].join(' | ')
  if (schema.type === 'array') return `${schema.inner.type === 'union' ? `(${typeName(schema.inner)})` : typeName(schema.inner)}[]`
  if (schema.type === 'dict') return `Record<string, ${typeName(schema.inner)}>`
  if (schema.type === 'number' && schema.meta.step === 1) return 'integer'
  return schema.type
}

function fields(schema, prefix = '', seen = new Map()) {
  if (schema.type === 'union' && schema.list.some(item => contractFields(item))) {
    const variants = schema.list.filter(item => contractFields(item))
    return variants.flatMap(item => {
      const selectors = Object.entries(item.dict).filter(([, field]) => field.type === 'const').map(([key, field]) => `${key}: ${typeName(field)}`)
      return [...(variants.length > 1 ? [`${prefix} 分支（${selectors.join('，')}）：`] : []), ...fields(item, prefix, seen)]
    })
  }
  const properties = contractFields(schema)
  if (!properties) return []
  if (seen.has(schema)) return [`${prefix} 的对象字段同上文 ${seen.get(schema)} 的对象字段。`]
  seen.set(schema, prefix)
  return Object.entries(properties).flatMap(([key, field]) => fieldLines(field, prefix ? `${prefix}.${key}` : key, seen))
}

function rangeConstraints(field) {
  const unit = { array: ['元素数量', '项'], string: ['长度', '个 UTF-16 码元'], number: ['数值', ''] }[field.type]
  if (!unit) return []
  const { min, max } = field.meta
  const [measure, suffix] = unit
  const quantity = suffix ? ` ${suffix}` : ''
  if (min !== undefined && max !== undefined) return [`${measure}为 ${min} 至 ${max}${quantity}`]
  if (min !== undefined) return [`${measure}至少 ${min}${quantity}`]
  if (max !== undefined) return [`${measure}最多 ${max}${quantity}`]
  return []
}

function fieldLines(field, path, seen, element = false) {
  const shape = field.type === 'transform' && field.inner.type !== 'any' ? field.inner : field
  const constraints = element ? [] : [fieldIsRequired(field) ? '必填' : '可选']
  if (!fieldIsRequired(field) && field.meta.default !== undefined && !['array', 'object', 'dict'].includes(field.type)) constraints.push(`默认 ${JSON.stringify(field.meta.default)}`)
  constraints.push(...rangeConstraints(shape))
  if (shape.meta.pattern) constraints.push(`格式 /${shape.meta.pattern.source}/${shape.meta.pattern.flags ?? ''}`)
  if (field.meta.role === LORA_TRIGGER_WORDS_ROLE) constraints.push('元素互不重复')
  const json = jsonDefinition(field)
  if (json?.maxDepth !== undefined) constraints.push(`最大嵌套 ${json.maxDepth} 层（根值为第 0 层）`)
  const line = `${path}: ${typeName(field)}${constraints.length ? `；${constraints.join('，')}` : ''}。`
  if (json) {
    if (seen.has(json)) return [line]
    seen.set(json, path)
    return [line,
      ...fieldLines(json.keySchema, `${path} 各层对象键`, seen, true),
    ]
  }
  if (shape.type === 'array') {
    const nested = contractFields(shape.inner) || shape.inner.type === 'union' ? fields(shape.inner, `${path}[]`, seen) : fieldLines(shape.inner, `${path}[]`, seen, true)
    return [line, ...nested]
  }
  if (field.type === 'dict') return [line, ...fieldLines(field.sKey, `${path}{key}`, seen, true), ...fieldLines(field.inner, `${path}{value}`, seen, true)]
  return [line, ...fields(field, path, seen)]
}

export function renderCommandContract(key) {
  if (key === '') return ['JSON value: null | string | finite number | boolean | JSON value[] | Record<string, JSON value>。']
  const input = cliInputSchemas[key]
  if (!input) return []
  const jobResult = cliJobResultSchemas[key]
  return ['输入 JSON：', ...fields(input), '结果文件 JSON：', ...fields(cliResultSchemas[key]), ...(jobResult ? ['Job 完成结果 JSON（job_output 的 text）：', ...fields(jobResult)] : [])]
}
