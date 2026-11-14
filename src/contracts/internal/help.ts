import type Schema from '@deepseek-ai/schemastery';
import descriptions from '../../../config/workbench-tool-descriptions.json' with { type: 'json' };
import { dataSchemas, operationSchemas, results, lora } from './schema.ts';
import { JSON_VALUE_ROLE, JSON_OBJECT_ROLE, JSON_ARRAY_ROLE, contractFields, fieldIsRequired, dictionaryDefinition, type JsonContract } from './structure.ts';
import { constraintDescription } from './projection.ts';
function jsonDefinition(schema: Schema): JsonContract | undefined {
  if ([JSON_VALUE_ROLE, JSON_OBJECT_ROLE, JSON_ARRAY_ROLE].includes(schema.meta.role!))
    return schema.meta.extra as JsonContract;
  return schema.type === 'union' ? schema.list!.map(jsonDefinition).find(Boolean) : undefined;
}
function typeName(schema: Schema): string {
  if (schema.meta.role === lora.LORA_WEIGHT_ROLE)
    return 'finite number';
  if (schema.meta.role === JSON_VALUE_ROLE)
    return 'JSON value';
  if (schema.meta.role === JSON_OBJECT_ROLE)
    return 'Record<string, JSON value>';
  if (schema.meta.role === JSON_ARRAY_ROLE)
    return 'JSON value[]';
  if (contractFields(schema))
    return 'object';
  const dictionary = dictionaryDefinition(schema);
  if (dictionary)
    return `Record<string, ${typeName(dictionary.valueSchema)}>`;
  if (schema.type === 'transform')
    return typeName(schema.inner!);
  if (schema.type === 'const')
    return JSON.stringify(schema.value);
  if (schema.type === 'union')
    return schema.list!.some(item => item.meta.role === JSON_VALUE_ROLE) ? 'JSON value' : [...new Set(schema.list!.map(typeName))].join(' | ');
  if (schema.type === 'array')
    return `${schema.inner!.type === 'union' ? `(${typeName(schema.inner!)})` : typeName(schema.inner!)}[]`;
  return schema.type === 'number' && schema.meta.step === 1 ? 'integer' : schema.type;
}
function fields(schema: Schema, prefix = '', seen = new Map<object, string>()): string[] {
  if (schema.type === 'transform' && !contractFields(schema))
    return fields(schema.inner!, prefix, seen);
  if (schema.type === 'union' && schema.list!.some(item => contractFields(item))) {
    const variants = schema.list!.filter(item => contractFields(item)).map(item => contractFields(item)!);
    const common = Object.entries(variants[0]!).filter(([name, field]) => variants.every(item => item[name] === field));
    const sharedNames = new Set(common.map(([name]) => name));
    return [...common.flatMap(([name, field]) => fieldLines(field, prefix ? `${prefix}.${name}` : name, seen)), ...variants.flatMap(shape => {
      const selectors = Object.entries(shape).filter(([, field]) => field.type === 'const').map(([key, field]) => `${key}: ${typeName(field)}`);
      return [...(variants.length > 1 ? [`${prefix} 分支（${selectors.join('，')}）：`] : []), ...Object.entries(shape).filter(([name]) => !sharedNames.has(name)).flatMap(([name, field]) => fieldLines(field, prefix ? `${prefix}.${name}` : name, seen))];
    })];
  }
  const properties = contractFields(schema);
  if (!properties)
    return [];
  if (seen.has(schema))
    return [`${prefix} 的对象字段同上文 ${seen.get(schema)} 的对象字段。`];
  seen.set(schema, prefix);
  return Object.entries(properties).flatMap(([key, field]) => fieldLines(field, prefix ? `${prefix}.${key}` : key, seen));
}
function fieldLines(field: Schema, path: string, seen: Map<object, string>, element = false): string[] {
  const shape = field.type === 'transform' && field.inner!.type !== 'any' ? field.inner! : field;
  const constraints = element ? [] : [fieldIsRequired(field) ? '必填' : '可选'];
  if (!fieldIsRequired(field) && field.meta.default !== undefined && !['array', 'object', 'dict'].includes(field.type))
    constraints.push(`默认 ${JSON.stringify(field.meta.default)}`);
  constraints.push(...constraintDescription(field));
  const json = jsonDefinition(field);
  if (json?.maxDepth !== undefined)
    constraints.push(`最大嵌套 ${json.maxDepth} 层（根值为第 0 层）`);
  const line = `${path}: ${typeName(field)}${constraints.length ? `；${constraints.join('，')}` : ''}。`;
  if (json) {
    if (seen.has(json))
      return [line];
    seen.set(json, path);
    return [line, ...fieldLines(json.keySchema, `${path} 各层对象键`, seen, true)];
  }
  if (shape.type === 'array')
    return [line, ...(contractFields(shape.inner!) || shape.inner!.type === 'union' ? fields(shape.inner!, `${path}[]`, seen) : fieldLines(shape.inner!, `${path}[]`, seen, true))];
  const dictionary = dictionaryDefinition(field);
  if (dictionary)
    return [line, ...fieldLines(dictionary.keySchema, `${path}{key}`, seen, true), ...fieldLines(dictionary.valueSchema, `${path}{value}`, seen, true)];
  return [line, ...fields(field, path, seen)];
}
function businessGuidance(key: string): string[] {
  if (key === 'workbench task get') {
    const declared = fields(results.cliResultSchemas[key]);
    return ['任务字段用途：', ...Object.entries(descriptions.fields).filter(([field]) => declared.some(line => line.startsWith(`${field}:`))).map(([field, description]) => `${field}：${description}`)];
  }
  if (key === 'workbench task publish')
    return ['产物提交要求：', ...descriptions.publish.steps, ...Object.entries(descriptions.publish.artifact_fields).map(([type, description]) => `${type}：${description}`)];
  if (key === 'generation submit' || key === 'generation run-inputs')
    return ['图片字段用途：', ...(['image_refs', 'workflow_image_bindings'] as const).map(field => `${field}：${descriptions.fields[field]}`)];
  return [];
}
export function describeContract(key: string, view = 'command'): string[] {
  if (key === '')
    return ['JSON value: null | string | finite number | boolean | JSON value[] | Record<string, JSON value>。'];
  if (view === 'ids')
    return [...Object.keys(dataSchemas), ...Object.keys(operationSchemas)];
  if (Object.hasOwn(operationSchemas, key)) {
    const spec = operationSchemas[key as keyof typeof operationSchemas], job = results.cliJobResultSchemas[key as keyof typeof results.cliJobResultSchemas];
    return [...businessGuidance(key), '输入 JSON：', ...fields(spec.input), '结果文件 JSON：', ...fields(spec.output), ...(job ? ['Job 完成结果 JSON（job_output 的 text）：', ...fields(job)] : [])];
  }
  if (Object.hasOwn(dataSchemas, key))
    return fields(dataSchemas[key as keyof typeof dataSchemas]);
  return [];
}
