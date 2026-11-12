import type Schema from '@deepseek-ai/schemastery';
import { LORA_TRIGGER_WORDS_ROLE } from './schema.ts';
import type { JsonSchemaNode } from '@deepseek-ai/dsh-tools';
import { contractFields, fieldIsRequired, objectIsExact, dictionaryDefinition, JSON_ARRAY_ROLE, JSON_OBJECT_ROLE, JSON_VALUE_ROLE } from './structure.ts';
const annotations = new Set(['description', 'title']);
function unconstrained(node: JsonSchemaNode): boolean { return Object.keys(node).every(key => annotations.has(key)); }
function values(node: JsonSchemaNode): readonly unknown[] | undefined {
  return Object.hasOwn(node, 'const') ? [node.const] : node.enum;
}
function acceptsLiteral(type: JsonSchemaNode['type'], value: unknown): boolean {
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (value === null) return type === 'null';
  if (type === 'array') return Array.isArray(value);
  return typeof value === type && !Array.isArray(value);
}
function disjoint(left: JsonSchemaNode, right: JsonSchemaNode): boolean {
  const a = values(left), b = values(right);
  if (a && b) return a.every(item => !b.some(other => Object.is(item, other)));
  const finite = a ?? b, other = a ? right : left;
  if (finite && other.type) return finite.every(value => !acceptsLiteral(other.type, value));
  if (left.type !== right.type)
    return !([left.type, right.type].includes('number') && [left.type, right.type].includes('integer'));
  if (left.type === 'object') {
    if (right.additionalProperties === false && left.required?.some(key => !Object.hasOwn(right.properties ?? {}, key)))
      return true;
    if (left.additionalProperties === false && right.required?.some(key => !Object.hasOwn(left.properties ?? {}, key)))
      return true;
    for (const key of left.required ?? []) {
      if (!right.required?.includes(key))
        continue;
      const first = left.properties?.[key], second = right.properties?.[key];
      if (first && second && values(first) && values(second) && disjoint(first, second))
        return true;
    }
  }
  return false;
}
function assertions(node: JsonSchemaNode): JsonSchemaNode {
  const { description: _description, title: _title, ...result } = node;
  if (node.properties) result.properties = Object.fromEntries(Object.entries(node.properties).map(([name, field]) => [name, assertions(field)]));
  if (node.items) result.items = assertions(node.items);
  if (node.oneOf) result.oneOf = node.oneOf.map(assertions);
  return result;
}

function comparable(value: unknown): string {
  const sorted = (item: unknown): unknown => Array.isArray(item) ? item.map(sorted) : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, sorted(entry)])) : item;
  return JSON.stringify(sorted(value));
}

function includes(superset: JsonSchemaNode, subset: JsonSchemaNode): boolean {
  const outerBranches = superset.oneOf ?? [superset], innerBranches = subset.oneOf ?? [subset];
  return innerBranches.every(inner => outerBranches.some(outer => includesBranch(outer, inner)));
}

function includesBranch(superset: JsonSchemaNode, subset: JsonSchemaNode): boolean {
  if (unconstrained(superset) || comparable(superset) === comparable(subset)) return true;
  const outerValues = values(superset), innerValues = values(subset);
  if (outerValues) return !!innerValues && innerValues.every(value => outerValues.some(other => Object.is(value, other)));
  if (innerValues && Object.keys(superset).every(key => key === 'type')) return innerValues.every(value => acceptsLiteral(superset.type, value));
  if (superset.type !== subset.type && !(superset.type === 'number' && subset.type === 'integer')) return false;
  if (Object.keys(superset).every(key => key === 'type')) return true;
  if (superset.type === 'array' && subset.type === 'array') {
    const { items: outerItems, ...outer } = superset, { items: innerItems, ...inner } = subset;
    return comparable(outer) === comparable(inner) && includes(outerItems ?? {}, innerItems ?? {});
  }
  if (superset.type === 'object' && subset.type === 'object') {
    const { properties: outerFields = {}, required: outerRequired = [], additionalProperties: outerAdditional, ...outer } = superset;
    const { properties: innerFields = {}, required: innerRequired = [], additionalProperties: innerAdditional, ...inner } = subset;
    if (comparable(outer) !== comparable(inner) || outerRequired.some(key => !innerRequired.includes(key))) return false;
    if (outerAdditional === false && (innerAdditional !== false || Object.keys(innerFields).some(key => !Object.hasOwn(outerFields, key)))) return false;
    return Object.entries(outerFields).every(([key, field]) => Object.hasOwn(innerFields, key) ? includes(field, innerFields[key]!) : innerAdditional === false || unconstrained(field));
  }
  return false;
}

function projectedDescriptions(node: JsonSchemaNode, path = ''): string[] {
  return [
    ...[node.title, node.description].filter((value): value is string => typeof value === 'string').map(value => path ? `${path}: ${value}` : value),
    ...Object.entries(node.properties ?? {}).flatMap(([name, field]) => projectedDescriptions(field, path ? `${path}.${name}` : name)),
    ...(node.items ? projectedDescriptions(node.items, `${path}[]`) : []),
    ...(node.oneOf?.flatMap((branch, index) => projectedDescriptions(branch, `${path} 分支 ${index + 1}`)) ?? []),
  ];
}

function alternativeDescription(descriptions: string[], types: (string | undefined)[]): string | undefined {
  if (!descriptions.some(Boolean)) return undefined;
  if (descriptions.every(description => description === descriptions[0])) return descriptions[0];
  return '以下说明分别对应联合类型的各个分支：\n' + descriptions.map((description, index) => `${index + 1}. ${description || types[index] || 'JSON value'}`).join('\n');
}

function union(alternatives: JsonSchemaNode[], path: string): JsonSchemaNode {
  const flat = alternatives.flatMap(node => node.oneOf ?? [node]);
  const reduced: JsonSchemaNode[] = [];
  for (const alternative of flat) {
    const node = assertions(alternative);
    if (reduced.some(other => includes(other, node))) continue;
    for (let index = reduced.length - 1; index >= 0; index--) if (includes(node, reduced[index]!)) reduced.splice(index, 1);
    reduced.push(node);
  }
  const grouped: JsonSchemaNode[] = [];
  for (const node of reduced) {
    if (!values(node)) { grouped.push(node); continue; }
    const existing = grouped.find(other => other.type === node.type && values(other));
    if (!existing) grouped.push(node);
    else {
      const distinct = [...values(existing)!, ...values(node)!].filter((item, index, all) => all.findIndex(other => Object.is(item, other)) === index);
      delete existing.const;
      existing.enum = distinct as (string | number | boolean | null)[];
    }
  }
  for (let left = 0; left < grouped.length; left++) for (let right = left + 1; right < grouped.length; right++) {
    if (!disjoint(grouped[left]!, grouped[right]!)) throw new TypeError(`${path}: overlapping union cannot be represented by the host declaration`);
  }
  const result = grouped.length === 1 ? grouped[0]! : { oneOf: grouped };
  const description = alternativeDescription(alternatives.map(node => projectedDescriptions(node).join('；')), alternatives.map(node => node.type));
  return { ...result, ...(description ? { description } : {}) };
}
function descriptionShape(schema: Schema): Schema {
  while (schema.type === 'transform' && schema.inner?.type !== 'any') schema = schema.inner!;
  return schema;
}

function localConstraintDescription(schema: Schema): string[] {
  const shape = descriptionShape(schema);
  const parts: string[] = [];
  if (shape.type === 'number') {
    if (shape.meta.min !== undefined) parts.push(`数值须大于或等于 ${shape.meta.min}`);
    if (shape.meta.max !== undefined) parts.push(`数值须小于或等于 ${shape.meta.max}`);
  } else {
    const units = { string: ['长度', '个 UTF-16 码元'], array: ['元素数量', '项'] }[shape.type as 'string' | 'array'];
    if (units) {
      const [measure, unit] = units;
      if (shape.meta.min !== undefined && shape.meta.max !== undefined) parts.push(`${measure}为 ${shape.meta.min} 至 ${shape.meta.max} ${unit}`);
      else if (shape.meta.min !== undefined) parts.push(`${measure}至少 ${shape.meta.min} ${unit}`);
      else if (shape.meta.max !== undefined) parts.push(`${measure}最多 ${shape.meta.max} ${unit}`);
    }
  }
  if (shape.meta.pattern) parts.push(`内容须匹配正则表达式 /${shape.meta.pattern.source}/${shape.meta.pattern.flags ?? ''}`);
  if (schema.meta.role === LORA_TRIGGER_WORDS_ROLE) parts.push('元素互不重复');
  return parts;
}

function schemaDescriptions(schema: Schema, path = ''): string[] {
  const shape = descriptionShape(schema);
  const own = [typeof schema.meta.description === 'string' ? schema.meta.description : undefined, ...constraintDescription(schema)].filter((value): value is string => typeof value === 'string');
  const fields = contractFields(schema);
  return [
    ...own.map(value => path ? `${path}: ${value}` : value),
    ...(fields ? Object.entries(fields).flatMap(([name, field]) => schemaDescriptions(field, path ? `${path}.${name}` : name)) : shape.type === 'array' ? schemaDescriptions(shape.inner!, `${path}[]`) : []),
  ];
}

export function constraintDescription(schema: Schema): string[] {
  const shape = descriptionShape(schema);
  const parts = localConstraintDescription(schema);
  if (shape.type === 'union') {
    const description = alternativeDescription(shape.list!.map(branch => schemaDescriptions(branch).join('；')), shape.list!.map(branch => {
      const child = descriptionShape(branch);
      return contractFields(branch) ? 'object' : child.type === 'const' ? JSON.stringify(child.value) : child.type === 'number' && child.meta.step === 1 ? 'integer' : child.type === 'transform' ? 'JSON value' : child.type;
    }));
    if (description) parts.push(description);
  }
  return parts;
}
export function nativeProjection(schema: Schema, descriptions: Readonly<Record<string, string>> = {}, path = '$'): JsonSchemaNode {
  const fields = contractFields(schema);
  let node: JsonSchemaNode;
  if (fields)
    node = {
      type: 'object',
      properties: Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, nativeProjection(field, descriptions, path === '$' ? key : `${path}.${key}`)])),
      required: Object.entries(fields).filter(([, field]) => fieldIsRequired(field)).map(([key]) => key),
      additionalProperties: !objectIsExact(schema),
    };
  else if (schema.meta.role === JSON_VALUE_ROLE || schema.type === 'any')
    node = {};
  else if (schema.meta.role === JSON_OBJECT_ROLE || dictionaryDefinition(schema))
    node = { type: 'object' };
  else if (schema.meta.role === JSON_ARRAY_ROLE)
    node = { type: 'array', items: {} };
  else if (schema.type === 'transform')
    node = nativeProjection(schema.inner!, descriptions, path);
  else if (schema.type === 'array')
    node = { type: 'array', items: nativeProjection(schema.inner!, descriptions, `${path}[]`) };
  else if (schema.type === 'union')
    node = union(schema.list!.map(item => nativeProjection(item, descriptions, path)), path);
  else if (schema.type === 'const')
    node = { type: schema.value === null ? 'null' : typeof schema.value as 'string' | 'number' | 'boolean', const: schema.value as string | number | boolean | null };
  else if (schema.type === 'number')
    node = { type: schema.meta.step === 1 ? 'integer' : 'number' };
  else if (schema.type === 'string' || schema.type === 'boolean')
    node = { type: schema.type };
  else
    throw new TypeError(`${path}: unsupported contract type ${schema.type}`);
  const description = [...new Set([node.description, descriptions[path], typeof schema.meta.description === 'string' ? schema.meta.description : undefined, ...localConstraintDescription(schema)].filter(Boolean))].join('\n');
  return { ...node, ...(description ? { description } : {}) };
}
