import sourceClientConfiguration from '../../../config/source-client.json' with { type: 'json' }
import { SourceClientError } from './http-client.ts'

const HTTP_METHODS = Object.freeze(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);

const CATALOG_OPERATION_PATH_PATTERN = /^\/internal\/semantic\/[^/?#]+$/u;

const CATALOG_OPERATION_REGISTRY = sourceClientConfiguration.catalog.operations;

const SUPPORTED_SCHEMA_KEYS = new Set([
  'type', 'description', 'example', 'default', 'enum', 'minimum', 'maximum',
  'minLength', 'maxLength', 'minItems', 'maxItems', 'items', 'properties',
  'required', 'additionalProperties', 'const', 'pattern', 'format', 'uniqueItems', 'oneOf'
]);

const UNSAFE_TEXT_PATTERN_SOURCE = '[\\u0000-\\u001f\\u061c\\u007f-\\u009f\\u200e\\u200f\\u2028-\\u202e\\u2066-\\u2069]';

const UNSAFE_TEXT_PATTERN = new RegExp(UNSAFE_TEXT_PATTERN_SOURCE, 'u');

function fail(code, message) { throw new SourceClientError(code, message); }

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasUnsafeText(value) {
  return UNSAFE_TEXT_PATTERN.test(value);
}

function assertSafeText(value, label) {
  if (typeof value !== 'string' || hasUnsafeText(value)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} contains unsafe control text`);
  return value;
}

function collectOperations(discovery) {
  return collectCatalogOperations(discovery);
}

function requireCatalogText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail('DISCOVERY_PROTOCOL_ERROR', `${label} must be a non-empty string`);
  assertSafeText(value, label);
  return value;
}

function requireLocalComponentReference(value, discovery, label, section) {
  if (!isObject(value) || Object.keys(value).length !== 1 || typeof value.$ref !== 'string') {
    fail('DISCOVERY_PROTOCOL_ERROR', `${label} must use one local ${section} reference`);
  }
  const expression = new RegExp(`^#/components/${section}/[A-Za-z0-9_.-]+$`, 'u');
  if (!expression.test(value.$ref)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} must use one local ${section} reference`);
  return resolveComponent(value, discovery, label, [section]);
}

function catalogFieldDetails({ schema, discovery, label, required }) {
  if (!isObject(schema)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} must be a Schema object`);
  const resolved = resolveSchema(schema, discovery, label);
  const description = schema.description ?? resolved.description;
  if (typeof description !== 'string' || description.trim() === '') fail('DISCOVERY_PROTOCOL_ERROR', `${label} must declare a description`);
  assertSafeText(description, `${label}.description`);
  const example = Object.hasOwn(schema, 'example') ? schema.example : resolved.example;
  if (example === undefined) fail('DISCOVERY_PROTOCOL_ERROR', `${label} must declare an example`);
  const details = schemaDetails(schema, discovery, label);
  matchesSchemaValue(example, details, `${label}.example`);
  return { name: label.slice(label.lastIndexOf('.') + 1), location: 'requestBody', required, schema: details, description, example };
}

function validateCategoryCondition(value, label) {
  if (Object.hasOwn(value, 'category_match') && !Object.hasOwn(value, 'category_ids')) fail('DISCOVERY_PROTOCOL_ERROR', `${label} violates category_match condition`);
}

function validateCatalogBranch({ schema, discovery, label, mode, allowedSearchFields }) {
  if (!isObject(schema) || schema.type !== 'object' || schema.additionalProperties !== false || Object.hasOwn(schema, 'oneOf') || Object.hasOwn(schema, 'anyOf')) {
    fail('DISCOVERY_PROTOCOL_ERROR', `${label} must be a closed object branch`);
  }
  const categoryCondition = mode === 'search' && allowedSearchFields.includes('category_match');
  if (categoryCondition) {
    const expectedCondition = [{ if: { required: ['category_match'] }, then: { required: ['category_ids'] } }];
    if (!valuesEqual(schema.allOf, expectedCondition)) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.allOf must require category_ids when category_match is present`);
  } else if (Object.hasOwn(schema, 'allOf')) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.allOf is unsupported`);
  requireCatalogText(schema.description, `${label}.description`);
  const properties = schema.properties;
  if (!isObject(properties)) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.properties must be an object`);
  const filterNames = mode === 'search' ? allowedSearchFields : [];
  const expected = mode === 'search' ? ['mode', 'query', 'page', 'page_size', ...filterNames] : ['mode', 'id'];
  if (!Array.isArray(schema.required) || JSON.stringify(schema.required) !== JSON.stringify(mode === 'search' ? ['mode'] : ['mode', 'id'])) {
    fail('DISCOVERY_PROTOCOL_ERROR', `${label}.required fields are invalid`);
  }
  if (JSON.stringify(Object.keys(properties)) !== JSON.stringify(expected)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} declares unexpected fields`);
  const fields = [];
  for (const name of expected) {
    const field = properties[name];
    if (!isObject(field)) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.${name} must be a Schema object`);
    const details = catalogFieldDetails({ schema: field, discovery, label: `${label}.${name}`, required: schema.required.includes(name) });
    fields.push(details);
  }
  const modeField = fields[0].schema;
  if (modeField.const !== mode || modeField.type !== 'string') fail('DISCOVERY_PROTOCOL_ERROR', `${label}.mode must use const ${mode}`);
  if (mode === 'search') {
    const query = fields.find((field) => field.name === 'query').schema;
    const page = fields.find((field) => field.name === 'page').schema;
    const pageSize = fields.find((field) => field.name === 'page_size').schema;
    if (query.type !== 'string' || query.minLength !== 0 || query.maxLength !== 200 || query.default !== '') fail('DISCOVERY_PROTOCOL_ERROR', `${label}.query is invalid`);
    if (page.type !== 'integer' || page.minimum !== 1 || page.maximum !== 100000 || page.default !== 1) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.page is invalid`);
    if (pageSize.type !== 'integer' || pageSize.minimum !== 1 || pageSize.maximum !== 100 || pageSize.default !== 20) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.page_size is invalid`);
    for (const name of filterNames) {
      const filter = fields.find((field) => field.name === name).schema;
      if (name === 'root_id') {
        if (filter.type !== 'string' || filter.pattern !== '^[a-z][a-z0-9_]*$') fail('DISCOVERY_PROTOCOL_ERROR', `${label}.${name} is invalid`);
      } else if (name === 'category_ids') {
        if (filter.type !== 'array' || filter.minItems !== 1 || filter.maxItems !== 16 || filter.uniqueItems !== true || filter.item.type !== 'string' || filter.item.pattern !== '^[a-z][a-z0-9_]*$') fail('DISCOVERY_PROTOCOL_ERROR', `${label}.${name} is invalid`);
      } else if (name === 'category_match') {
        if (filter.type !== 'string' || !valuesEqual(filter.enum, ['any', 'all']) || filter.default !== 'all') fail('DISCOVERY_PROTOCOL_ERROR', `${label}.${name} is invalid`);
      } else if (name === 'classification_status') {
        if (filter.type !== 'string' || !valuesEqual(filter.enum, ['classified', 'evidence_gap', 'coverage_gap', 'unclassified'])) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.${name} is invalid`);
      } else if (filter.type !== 'string' || filter.minLength !== 1 || filter.maxLength !== 20 || filter.pattern !== '^[1-9][0-9]{0,19}$') fail('DISCOVERY_PROTOCOL_ERROR', `${label}.${name} is invalid`);
    }
  } else {
    const id = fields.find((field) => field.name === 'id').schema;
    if (id.type !== 'string' || id.minLength !== 1 || id.maxLength !== 20 || id.pattern !== '^[1-9][0-9]{0,19}$') fail('DISCOVERY_PROTOCOL_ERROR', `${label}.id is invalid`);
  }
  const example = Object.fromEntries(fields.map((field) => [field.name, field.example]));
  const branchSchema = { ...schema };
  delete branchSchema.allOf;
  if (categoryCondition) {
    for (const annotation of ['example', 'default']) {
      if (!Object.hasOwn(branchSchema, annotation)) continue;
      const annotationLabel = `${label}.${annotation}`;
      schemaDetails(branchSchema, discovery, label);
      validateCategoryCondition(branchSchema[annotation], annotationLabel);
    }
  }
  return { schema: branchSchema, fields, example, categoryCondition };
}

function mergeCatalogSchemas(base, overlay) {
  const merged = { ...base, ...overlay };
  if (isObject(base?.properties) || isObject(overlay?.properties)) {
    merged.properties = { ...(base?.properties ?? {}) };
    for (const [name, property] of Object.entries(overlay?.properties ?? {})) {
      merged.properties[name] = isObject(merged.properties[name]) && isObject(property)
        ? mergeCatalogSchemas(merged.properties[name], property)
        : property;
    }
  }
  if (Array.isArray(base?.required) || Array.isArray(overlay?.required)) merged.required = [...new Set([...(base?.required ?? []), ...(overlay?.required ?? [])])];
  return merged;
}

function mergedCatalogSchema(value, discovery, label, ancestors = new Set()) {
  const resolved = resolveComponent(value, discovery, label, ['schemas']);
  if (!isObject(resolved)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} must be a Schema object`);
  if (ancestors.has(resolved)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} contains a recursive schema`);
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(resolved);
  let merged = {};
  if (resolved.allOf !== undefined) {
    if (!Array.isArray(resolved.allOf) || resolved.allOf.length === 0) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.allOf must be a non-empty array`);
    for (const [index, child] of resolved.allOf.entries()) merged = mergeCatalogSchemas(merged, mergedCatalogSchema(child, discovery, `${label}.allOf[${index}]`, nextAncestors));
  }
  const own = { ...resolved };
  delete own.allOf;
  return mergeCatalogSchemas(merged, own);
}

function catalogRequestDetails({ discovery, path, operation }) {
  const registryEntry = CATALOG_OPERATION_REGISTRY[path];
  if (registryEntry === undefined) fail('DISCOVERY_PROTOCOL_ERROR', `discovery path ${path} is not a registered Catalog operation`);
  const body = isObject(operation.requestBody) && typeof operation.requestBody.$ref === 'string'
    ? requireLocalComponentReference(operation.requestBody, discovery, `${operation.operationId}.requestBody`, 'requestBodies')
    : operation.requestBody;
  if (!isObject(body) || body.required !== true || !isObject(body.content) || Object.keys(body.content).length !== 1 || !isObject(body.content['application/json'])) {
    fail('DISCOVERY_PROTOCOL_ERROR', `${operation.operationId} must declare a required application/json request body`);
  }
  const content = body.content['application/json'];
  if (content.example !== undefined || !isObject(content.examples) || Object.keys(content.examples).length === 0) fail('DISCOVERY_PROTOCOL_ERROR', `${operation.operationId}.requestBody must declare named JSON examples`);
  const requestSchemaSource = content.schema;
  const root = requireLocalComponentReference(requestSchemaSource, discovery, `${operation.operationId}.requestBody.schema`, 'schemas');
  requireCatalogText(root.description, `${operation.operationId}.requestBody.schema.description`);
  if (root.type !== 'object' || root.additionalProperties !== undefined || !Array.isArray(root.oneOf) || root.oneOf.length !== 2) fail('DISCOVERY_PROTOCOL_ERROR', `${operation.operationId}.requestBody.schema must declare search and resolve oneOf object branches`);
  const searchSource = root.oneOf[0];
  const resolveSource = root.oneOf[1];
  const search = validateCatalogBranch({ schema: requireLocalComponentReference(searchSource, discovery, `${operation.operationId}.requestBody.schema.oneOf[0]`, 'schemas'), discovery, label: `${operation.operationId}.search`, mode: 'search', allowedSearchFields: registryEntry.searchFields });
  const resolve = validateCatalogBranch({ schema: requireLocalComponentReference(resolveSource, discovery, `${operation.operationId}.requestBody.schema.oneOf[1]`, 'schemas'), discovery, label: `${operation.operationId}.resolve`, mode: 'resolve', allowedSearchFields: [] });
  const exampleNames = Object.keys(content.examples).sort();
  if (exampleNames.length !== 2 || exampleNames[0] !== 'resolve' || exampleNames[1] !== 'search') fail('DISCOVERY_PROTOCOL_ERROR', `${operation.operationId}.requestBody must declare exactly search and resolve examples`);
  for (const [name, sourceExample] of Object.entries(content.examples)) {
    assertSafeText(name, `${operation.operationId}.requestBody.example`);
    if (!isObject(sourceExample) || !Object.hasOwn(sourceExample, 'value') || !isObject(sourceExample.value)) fail('DISCOVERY_PROTOCOL_ERROR', `${operation.operationId}.requestBody example ${name} must contain an object value`);
    if (sourceExample.value.mode !== name) fail('DISCOVERY_PROTOCOL_ERROR', `${operation.operationId}.requestBody example ${name} must match its named branch`);
    const selectedBranch = name === 'resolve' ? resolve : search;
    const branch = selectedBranch.schema;
    if (branch === null) fail('DISCOVERY_PROTOCOL_ERROR', `${operation.operationId}.requestBody example ${name} has an invalid mode`);
    const branchDetails = schemaDetails(branch, discovery, `${operation.operationId}.requestBody.example.${name}`);
    matchesSchemaValue(sourceExample.value, branchDetails, `${operation.operationId}.requestBody.example.${name}`);
    if (selectedBranch.categoryCondition) validateCategoryCondition(sourceExample.value, `${operation.operationId}.requestBody example ${name}`);
  }
  for (const annotation of ['example', 'default']) {
    if (!Object.hasOwn(root, annotation)) continue;
    const annotationLabel = `${operation.operationId}.requestBody.schema.${annotation}`;
    const rootDetails = schemaDetails(search.schema, discovery, annotationLabel);
    matchesSchemaValue(root[annotation], rootDetails, annotationLabel);
    if (search.categoryCondition) validateCategoryCondition(root[annotation], annotationLabel);
  }
  return {
    parameters: [],
    requestBody: {
      required: true,
      schema: search.schema,
      properties: search.fields,
      example: search.example,
      branches: { search, resolve }
    }
  };
}

function collectCatalogOperations(discovery) {
  if (discovery.openapi !== '3.1.0' || !isObject(discovery.paths)) fail('DISCOVERY_PROTOCOL_ERROR', 'discovery must be an OpenAPI 3.1 document with paths');
  const operations = [];
  const operationIds = new Set();
  const toolNames = new Set();
  for (const [path, pathItem] of Object.entries(discovery.paths)) {
    if (!CATALOG_OPERATION_PATH_PATTERN.test(path) || hasUnsafeText(path) || path.includes('{') || !isObject(pathItem)) fail('DISCOVERY_PROTOCOL_ERROR', `discovery path ${path} is not a valid Catalog operation`);
    const registryEntry = CATALOG_OPERATION_REGISTRY[path];
    if (registryEntry === undefined) fail('DISCOVERY_PROTOCOL_ERROR', `discovery path ${path} is not a registered Catalog operation`);
    const methods = HTTP_METHODS.filter((method) => Object.hasOwn(pathItem, method));
    if (methods.length !== 1 || methods[0] !== 'post') fail('DISCOVERY_PROTOCOL_ERROR', `discovery path ${path} must declare exactly one POST operation`);
    const operation = pathItem.post;
    if (!isObject(operation)) fail('DISCOVERY_PROTOCOL_ERROR', `discovery operation POST ${path} must be an object`);
    const operationId = requireCatalogText(operation.operationId, `POST ${path}.operationId`);
    const toolName = requireCatalogText(operation['x-harness-tool-name'], `POST ${path}.x-harness-tool-name`);
    if (operationId !== registryEntry.operationId) fail('DISCOVERY_PROTOCOL_ERROR', `POST ${path}.operationId does not match the Catalog operation registry`);
    if (toolName !== registryEntry.toolName) fail('DISCOVERY_PROTOCOL_ERROR', `POST ${path}.x-harness-tool-name does not match the Catalog operation registry`);
    requireCatalogText(operation.summary, `POST ${path}.summary`);
    requireCatalogText(operation.description, `POST ${path}.description`);
    if (operationIds.has(operationId) || toolNames.has(toolName)) fail('DISCOVERY_PROTOCOL_ERROR', `discovery operation identity is duplicated: ${operationId}`);
    operationIds.add(operationId);
    toolNames.add(toolName);
    const details = catalogRequestDetails({ discovery, path, operation });
    operations.push({ method: 'post', path, operation, catalog: true, details });
  }
  if (operations.length === 0) fail('DISCOVERY_PROTOCOL_ERROR', 'discovery requires at least one Catalog operation');
  return operations;
}

function resolveComponent(value, discovery, label, sections) {
  let current = value;
  const seen = new Set();
  while (isObject(current) && typeof current.$ref === 'string') {
    if (Object.keys(current).length !== 1) fail('DISCOVERY_PROTOCOL_ERROR', `${label} reference siblings are not supported`);
    if (!current.$ref.startsWith('#/components/')) fail('DISCOVERY_PROTOCOL_ERROR', `${label} uses a non-local schema reference`);
    if (seen.has(current.$ref)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} contains a recursive schema reference`);
    seen.add(current.$ref);
    const match = /^#\/components\/([A-Za-z0-9_.-]+)\/([^/]+)$/u.exec(current.$ref);
    if (!match || !sections.includes(match[1]) || !isObject(discovery.components?.[match[1]]) || !Object.hasOwn(discovery.components[match[1]], match[2])) {
      fail('DISCOVERY_PROTOCOL_ERROR', `${label} references an unsupported or unknown component`);
    }
    current = discovery.components[match[1]][match[2]];
  }
  return current;
}

function resolveSchema(value, discovery, label) {
  return resolveComponent(value, discovery, label, ['schemas']);
}

function scalarType(schema, label, { allowOneOf = false } = {}) {
  if (!isObject(schema)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} schema must be an object`);
  for (const key of Object.keys(schema)) if (!SUPPORTED_SCHEMA_KEYS.has(key)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} uses unsupported Schema keyword ${key}`);
  if (schema.description !== undefined) assertSafeText(schema.description, `${label}.description`);
  if ((Object.hasOwn(schema, 'oneOf') && !allowOneOf) || Object.hasOwn(schema, 'anyOf') || Object.hasOwn(schema, 'allOf')
    || Object.hasOwn(schema, 'not') || Object.hasOwn(schema, 'if') || Object.hasOwn(schema, 'then') || Object.hasOwn(schema, 'else')) {
    fail('DISCOVERY_PROTOCOL_ERROR', `${label} uses an unsupported composed schema`);
  }
  let type = schema.type;
  if (type === undefined && Object.hasOwn(schema, 'const')) {
    type = schema.const === null ? 'null' : Array.isArray(schema.const) ? 'array' : typeof schema.const;
    if (type === 'number' && Number.isInteger(schema.const)) type = 'integer';
  }
  let nullable = false;
  let types = null;
  if (Array.isArray(type)) {
    if (type.length === 0 || new Set(type).size !== type.length
      || type.some((item) => !['string', 'integer', 'number', 'boolean', 'object', 'array', 'null'].includes(item))) {
      fail('DISCOVERY_PROTOCOL_ERROR', `${label} uses an unsupported union type`);
    }
    types = type;
    nullable = type.includes('null');
    if (type.length === 2 && nullable) type = type.find((item) => item !== 'null');
    else type = 'union';
  }
  if (!['string', 'integer', 'number', 'boolean', 'null', 'object', 'array', 'union'].includes(type)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} has an unsupported JSON type`);
  return { type, types: types ?? [type], nullable };
}

function validInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function valuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((item, index) => valuesEqual(item, right[index]));
  if (isObject(left)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && valuesEqual(left[key], right[key]));
  }
  return false;
}

function jsonValueTypes(value) {
  if (value === null) return ['null'];
  if (Array.isArray(value)) return ['array'];
  if (typeof value === 'number') return Number.isSafeInteger(value) ? ['integer', 'number'] : ['number'];
  return [typeof value];
}

function matchesStringFormat(value, format) {
  if (format === undefined) return true;
  if (typeof value !== 'string') return false;
  if (format === 'uri') {
    if (!/^[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+$/u.test(value) || /%(?![0-9A-Fa-f]{2})/u.test(value)) return false;
    const rawUri = /^(?:https?):\/\/[^/?#]+(?<suffix>.*)$/iu.exec(value);
    if (!rawUri || /[\[\]]/u.test(rawUri.groups.suffix)) return false;
    try {
      const parsed = new URL(value);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname !== '';
    } catch {
      return false;
    }
  }
  if (format === 'uri-reference') {
    return /^[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]*$/u.test(value) && !/%(?![0-9A-Fa-f]{2})/u.test(value);
  }
  if (format === 'date-time') {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/u.exec(value);
    if (!match) return false;
    const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetHourText = '00', offsetMinuteText = '00'] = match;
    const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = [
      yearText, monthText, dayText, hourText, minuteText, secondText, offsetHourText, offsetMinuteText
    ].map(Number);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]
      && hour <= 23 && minute <= 59 && second <= 59 && offsetHour <= 23 && offsetMinute <= 59;
  }
  return false;
}

function matchesSchemaValue(value, details, label) {
  if (Array.isArray(details.oneOf)) {
    let matchingBranches = 0;
    for (const [index, branch] of details.oneOf.entries()) {
      try {
        matchesSchemaValue(value, branch, `${label}.oneOf[${index}]`);
        matchingBranches += 1;
      } catch {
        // A response oneOf is valid only when exactly one complete branch matches.
      }
    }
    if (matchingBranches !== 1) fail('DISCOVERY_PROTOCOL_ERROR', `${label} must match exactly one response branch`);
  }
  if (details.type === 'union') {
    if (!jsonValueTypes(value).some((type) => details.types.includes(type))) fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default does not match its Schema`);
    if (Object.hasOwn(details, 'const') && !valuesEqual(details.const, value)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default does not match its const`);
    if (Array.isArray(details.enum) && !details.enum.some((item) => valuesEqual(item, value))) fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default is outside its enum`);
    return true;
  }
  if (value === null) {
    if (details.nullable || details.type === 'null') {
      if (Object.hasOwn(details, 'const') && !valuesEqual(details.const, value)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default does not match its const`);
      if (Array.isArray(details.enum) && !details.enum.some((item) => item === null)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default is outside its enum`);
      return true;
    }
    fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default does not match its Schema`);
  }
  if (details.type === 'null') fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default does not match its Schema`);
  if (details.type === 'string' && typeof value !== 'string') fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default does not match its Schema`);
  if (details.type === 'integer' && (!Number.isSafeInteger(value))) fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default does not match its Schema`);
  if (details.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default does not match its Schema`);
  if (details.type === 'boolean' && typeof value !== 'boolean') fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default does not match its Schema`);
  if (details.type === 'array') {
    if (!Array.isArray(value)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default does not match its Schema`);
    if (details.minItems !== undefined && value.length < details.minItems || details.maxItems !== undefined && value.length > details.maxItems) fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default violates array size constraints`);
    for (const [index, item] of value.entries()) matchesSchemaValue(item, details.item, `${label}[${index}]`);
    if (details.uniqueItems && value.some((item, index) => value.slice(0, index).some((previous) => valuesEqual(previous, item)))) fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default violates uniqueItems`);
  }
  if (details.type === 'object') {
    if (!isObject(value)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default does not match its Schema`);
    if (details.additionalProperties === false && Object.keys(value).some((key) => !Object.hasOwn(details.propertyDetails ?? {}, key))) fail('DISCOVERY_PROTOCOL_ERROR', `${label} example contains an unknown property`);
    for (const name of details.required ?? []) if (!Object.hasOwn(value, name)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} example is missing required property ${name}`);
    for (const [name, property] of Object.entries(details.propertyDetails ?? {})) if (Object.hasOwn(value, name)) matchesSchemaValue(value[name], property, `${label}.${name}`);
  }
  if (details.type === 'string') {
    const length = Array.from(value).length;
    if (details.minLength !== undefined && length < details.minLength || details.maxLength !== undefined && length > details.maxLength) fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default violates string length constraints`);
  }
  if (details.type === 'number' || details.type === 'integer') {
    if (details.minimum !== undefined && value < details.minimum || details.maximum !== undefined && value > details.maximum) fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default violates numeric range constraints`);
  }
  if (Object.hasOwn(details, 'const') && !valuesEqual(details.const, value)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default does not match its const`);
  if (details.pattern !== undefined) {
    let pattern;
    try { pattern = new RegExp(details.pattern, 'u'); } catch { fail('DISCOVERY_PROTOCOL_ERROR', `${label}.pattern must be a valid regular expression`); }
    if (typeof value !== 'string' || !pattern.test(value)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default does not match its pattern`);
  }
  if (details.format !== undefined && !matchesStringFormat(value, details.format)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default does not match its format`);
  if (Array.isArray(details.enum) && !details.enum.some((item) => valuesEqual(item, value))) fail('DISCOVERY_PROTOCOL_ERROR', `${label} example/default is outside its enum`);
  return true;
}

function validateSchemaDefinition(schema, details, label, { validateExamples = true } = {}) {
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0 || schema.enum.some((item, index) => schema.enum.slice(0, index).some((previous) => valuesEqual(previous, item))))) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.enum must be a non-empty unique array`);
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean') fail('DISCOVERY_PROTOCOL_ERROR', `${label}.additionalProperties must be boolean`);
  for (const [name, value] of [['minimum', schema.minimum], ['maximum', schema.maximum]]) if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.${name} must be a finite number`);
  if (schema.minimum !== undefined && schema.maximum !== undefined && schema.minimum > schema.maximum) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.minimum must not exceed maximum`);
  for (const [name, value] of [['minLength', schema.minLength], ['maxLength', schema.maxLength], ['minItems', schema.minItems], ['maxItems', schema.maxItems]]) if (value !== undefined && !validInteger(value)) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.${name} must be a non-negative integer`);
  if (schema.minLength !== undefined && schema.maxLength !== undefined && schema.minLength > schema.maxLength) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.minLength must not exceed maxLength`);
  if (schema.minItems !== undefined && schema.maxItems !== undefined && schema.minItems > schema.maxItems) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.minItems must not exceed maxItems`);
  const schemaTypes = details.types ?? [details.type];
  if ((schema.minimum !== undefined || schema.maximum !== undefined) && schemaTypes.some((type) => !['number', 'integer', 'null'].includes(type))) fail('DISCOVERY_PROTOCOL_ERROR', `${label} has numeric constraints on a non-numeric type`);
  if ((schema.minLength !== undefined || schema.maxLength !== undefined) && schemaTypes.some((type) => !['string', 'null'].includes(type))) fail('DISCOVERY_PROTOCOL_ERROR', `${label} has string constraints on a non-string type`);
  if ((schema.minItems !== undefined || schema.maxItems !== undefined) && schemaTypes.some((type) => !['array', 'null'].includes(type))) fail('DISCOVERY_PROTOCOL_ERROR', `${label} has array constraints on a non-array type`);
  if (schema.uniqueItems !== undefined && (typeof schema.uniqueItems !== 'boolean' || schemaTypes.some((type) => !['array', 'null'].includes(type)))) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.uniqueItems must be a boolean on an array schema`);
  if (schema.format !== undefined && (schemaTypes.some((type) => !['string', 'null'].includes(type)) || !['uri', 'uri-reference', 'date-time'].includes(schema.format))) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.format is unsupported`);
  if (schema.const !== undefined) {
    const { const: _ignoredConst, enum: _ignoredEnum, ...constDetails } = details;
    matchesSchemaValue(schema.const, constDetails, `${label}.const`);
  }
  if (schema.pattern !== undefined) {
    if (schemaTypes.some((type) => !['string', 'null'].includes(type)) || typeof schema.pattern !== 'string') fail('DISCOVERY_PROTOCOL_ERROR', `${label}.pattern must be declared on a string schema`);
    try { new RegExp(schema.pattern, 'u'); } catch { fail('DISCOVERY_PROTOCOL_ERROR', `${label}.pattern must be a valid regular expression`); }
  }
  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required) || schema.required.some((name) => typeof name !== 'string') || new Set(schema.required).size !== schema.required.length || schema.required.some((name) => !Object.hasOwn(schema.properties ?? {}, name))) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.required must contain unique property names`);
  }
  if (schema.additionalProperties !== undefined && schemaTypes.some((type) => !['object', 'null'].includes(type))) fail('DISCOVERY_PROTOCOL_ERROR', `${label} has object constraints on a non-object type`);
  if ((schema.properties !== undefined || schema.required !== undefined) && schemaTypes.some((type) => !['object', 'null'].includes(type))) fail('DISCOVERY_PROTOCOL_ERROR', `${label} has object constraints on a non-object type`);
  if (schema.items !== undefined && schemaTypes.some((type) => !['array', 'null'].includes(type))) fail('DISCOVERY_PROTOCOL_ERROR', `${label} has array constraints on a non-array type`);
  if (validateExamples && schema.default !== undefined) matchesSchemaValue(schema.default, details, `${label}.default`);
  if (validateExamples && schema.example !== undefined) matchesSchemaValue(schema.example, details, `${label}.example`);
  if (validateExamples && Array.isArray(schema.enum)) for (const [index, value] of schema.enum.entries()) matchesSchemaValue(value, { ...details, enum: undefined }, `${label}.enum[${index}]`);
}

function schemaDetails(schema, discovery, label, ancestors = new Set(), options = {}) {
  const resolved = resolveSchema(schema, discovery, label);
  if (ancestors.has(resolved)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} contains a recursive schema`);
  const merged = mergedCatalogSchema(schema, discovery, label, ancestors);
  const descendants = new Set(ancestors);
  descendants.add(resolved);
  if (Object.hasOwn(merged, 'oneOf') && (!options.allowOneOf || !Array.isArray(merged.oneOf) || merged.oneOf.length < 2)) {
    fail('DISCOVERY_PROTOCOL_ERROR', `${label} uses an unsupported or invalid response oneOf`);
  }
  const scalar = scalarType(merged, label, options);
  const type = scalar.type;
  const oneOf = [];
  if (Array.isArray(merged.oneOf)) {
    const branchBase = { ...merged };
    delete branchBase.oneOf;
    for (const [index, branch] of merged.oneOf.entries()) {
      const resolvedBranch = mergedCatalogSchema(branch, discovery, `${label}.oneOf[${index}]`, descendants);
      if (Object.hasOwn(resolvedBranch, 'oneOf')) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.oneOf[${index}] must not be recursive or composed`);
      oneOf.push(schemaDetails(mergeCatalogSchemas(branchBase, resolvedBranch), discovery, `${label}.oneOf[${index}]`, descendants, { ...options, allowOneOf: false }));
    }
  }
  if (type === 'array') {
    if (!isObject(merged.items)) fail('DISCOVERY_PROTOCOL_ERROR', `${label} array must declare items`);
    const item = schemaDetails(merged.items, discovery, `${label}.items`, descendants, options);
    const details = { ...merged, ...(oneOf.length > 0 ? { oneOf } : {}), type, types: scalar.types, nullable: scalar.nullable, item };
    validateSchemaDefinition(merged, details, label, options);
    return details;
  }
  if (type === 'object' && merged.properties !== undefined && !isObject(merged.properties)) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.properties must be an object`);
  if (type === 'object' && merged.additionalProperties !== false) fail('DISCOVERY_PROTOCOL_ERROR', `${label} object must declare additionalProperties: false`);
  const propertyDetails = Object.create(null);
  if (type === 'object') {
    if (merged.required !== undefined && !Array.isArray(merged.required)) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.required must be an array`);
    for (const [name, property] of Object.entries(merged.properties ?? {})) {
      if (!isObject(property)) fail('DISCOVERY_PROTOCOL_ERROR', `${label}.${name} must be a schema object`);
      propertyDetails[name] = schemaDetails(property, discovery, `${label}.${name}`, descendants, options);
    }
  }
  const details = { ...merged, ...(oneOf.length > 0 ? { oneOf } : {}), type, types: scalar.types, nullable: scalar.nullable, propertyDetails };
  validateSchemaDefinition(merged, details, label, options);
  return details;
}

function operationParameters({ discovery, path, operation }) {
  return catalogRequestDetails({ discovery, path, operation });
}

function invalidInput(message) {
  fail('INVALID_ARGUMENT', message);
}

function validateInputValue(value, schema, label) {
  if (value === null) {
    if (!schema.nullable && schema.type !== 'null') invalidInput(`${label} does not allow JSON null`);
  } else if (schema.type === 'null') invalidInput(`${label} must be JSON null`);
  else if (schema.type === 'string' && typeof value !== 'string') invalidInput(`${label} must be a string`);
  else if (schema.type === 'integer' && !Number.isSafeInteger(value)) invalidInput(`${label} must be a decimal safe integer`);
  else if (schema.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) invalidInput(`${label} must be a finite JSON number`);
  else if (schema.type === 'boolean' && typeof value !== 'boolean') invalidInput(`${label} must be true or false`);
  else if (schema.type === 'object') {
    if (!isObject(value)) invalidInput(`${label} must be a complete JSON object`);
    if (schema.additionalProperties === false) {
      const unknown = Object.keys(value).find((name) => !Object.hasOwn(schema.propertyDetails, name));
      if (unknown !== undefined) invalidInput(`${label} contains unknown property ${unknown}`);
    }
    for (const name of schema.required ?? []) if (!Object.hasOwn(value, name)) invalidInput(`${label} is missing required property ${name}`);
    for (const [name, property] of Object.entries(schema.propertyDetails ?? {})) if (Object.hasOwn(value, name)) validateInputValue(value[name], property, `${label}.${name}`);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) invalidInput(`${label} must be an array`);
    for (const [index, item] of value.entries()) validateInputValue(item, schema.item, `${label}[${index}]`);
    if (schema.uniqueItems && value.some((item, index) => value.slice(0, index).some((previous) => valuesEqual(previous, item)))) invalidInput(`${label} must contain unique items`);
  }
  if (value === null) {
    if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => valuesEqual(candidate, value))) invalidInput(`${label} is outside its enum`);
    if (Object.hasOwn(schema, 'const') && !valuesEqual(schema.const, value)) invalidInput(`${label} has an invalid value`);
    return value;
  }
  if (schema.type === 'string') {
    const length = Array.from(value).length;
    if (schema.minLength !== undefined && length < schema.minLength || schema.maxLength !== undefined && length > schema.maxLength) invalidInput(`${label} violates string length constraints`);
  }
  if (schema.type === 'array' && (schema.minItems !== undefined && value.length < schema.minItems || schema.maxItems !== undefined && value.length > schema.maxItems)) invalidInput(`${label} violates array size constraints`);
  if ((schema.type === 'integer' || schema.type === 'number') && (schema.minimum !== undefined && value < schema.minimum || schema.maximum !== undefined && value > schema.maximum)) invalidInput(`${label} violates numeric range constraints`);
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => valuesEqual(candidate, value))) invalidInput(`${label} is outside its enum`);
  if (Object.hasOwn(schema, 'const') && !valuesEqual(schema.const, value)) invalidInput(`${label} has an invalid value`);
  if (schema.pattern !== undefined) {
    let pattern;
    try { pattern = new RegExp(schema.pattern, 'u'); } catch { invalidInput(`${label} has an invalid pattern`); }
    if (typeof value !== 'string' || !pattern.test(value)) invalidInput(`${label} violates its pattern`);
  }
  if (schema.format !== undefined && !matchesStringFormat(value, schema.format)) invalidInput(`${label} violates its format`);
  return value;
}

function requestDetailsForMode(details, mode) {
  const branch = details.requestBody?.branches?.[mode];
  if (!branch) invalidInput('mode must be search or resolve');
  return {
    ...details,
    requestBody: {
      required: true,
      schema: branch.schema,
      properties: branch.fields,
      example: branch.example,
      categoryCondition: branch.categoryCondition,
      branches: details.requestBody.branches
    }
  };
}

export function prepareCatalogRequest(discovery, path, input) {
  const operations = collectOperations(discovery);
  const selected = operations.find(operation => operation.path === path);
  if (!selected) fail('INVALID_ARGUMENT', 'Requested Catalog operation is absent from discovery: ' + path);
  const details = requestDetailsForMode(operationParameters({ discovery, path, operation: selected.operation }), input.mode);
  const definitions = new Map(details.requestBody.properties.map(field => [field.name, field]));
  for (const [name, value] of Object.entries(input)) {
    const definition = definitions.get(name);
    if (!definition) invalidInput('Unknown request field: ' + name);
    validateInputValue(value, definition.schema, name);
  }
  for (const definition of definitions.values()) {
    if (definition.required && !Object.hasOwn(input, definition.name)) invalidInput('Missing required request field: ' + definition.name);
  }
  if (details.requestBody.categoryCondition && Object.hasOwn(input, 'category_match') && !Object.hasOwn(input, 'category_ids')) invalidInput('category_match requires category_ids');
  return { ...input };
}
