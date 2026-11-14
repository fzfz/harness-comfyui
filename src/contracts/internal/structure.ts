import Schema from '@deepseek-ai/schemastery';
export type JsonPrimitive = null | string | number | boolean;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | {
  readonly [key: string]: JsonValue;
};
export const JSON_VALUE_ROLE = 'json-value';
export const JSON_OBJECT_ROLE = 'json-object';
export const JSON_ARRAY_ROLE = 'json-array';
const DICTIONARY_ROLE = 'contract-dictionary';
const OBJECT_ROLE = 'contract-object';
const NULLABLE_ROLE = 'required-nullable';
const VALIDATION_CONTEXT = Symbol('contract-validation-context');
export interface ValidationContext {
  readonly schema: Schema;
  readonly value: unknown;
  readonly prefix?: string;
}
export function validationContext(error: unknown): ValidationContext | undefined {
  return error && typeof error === 'object' ? (error as {
    [VALIDATION_CONTEXT]?: ValidationContext;
  })[VALIDATION_CONTEXT] : undefined;
}
export function resolveContext(schema: Schema, value: unknown): unknown {
  try {
    return resolveValue(schema, value);
  }
  catch (error) {
    if (error && typeof error === 'object' && !validationContext(error))
      Object.defineProperty(error, VALIDATION_CONTEXT, { value: { schema, value }, configurable: true });
    throw error;
  }
}
export function withValidationPath<Value>(prefix: string, parse: () => Value): Value {
  try {
    return parse();
  }
  catch (error) {
    const context = validationContext(error);
    if (context)
      Object.defineProperty(error, VALIDATION_CONTEXT, { value: { ...context, prefix: [prefix, context.prefix].filter(Boolean).join('.') }, configurable: true });
    throw error;
  }
}
export function fieldIsRequired(schema: Schema): boolean {
  return schema.meta.required === true || (schema.meta.role === NULLABLE_ROLE && schema.meta.default === undefined);
}
export function contractFields(schema: Schema): Readonly<Record<string, Schema>> | undefined {
  if (schema.type === 'object' || schema.meta.role === OBJECT_ROLE)
    return schema.dict;
  return schema.type === 'transform' ? contractFields(schema.inner!) : undefined;
}
export function objectIsExact(schema: Schema): boolean {
  if (schema.meta.role === OBJECT_ROLE)
    return (schema.meta.extra as {
      exact: boolean;
    }).exact;
  return schema.type === 'transform' ? objectIsExact(schema.inner!) : false;
}
type InputOf<Node> = Node extends Schema<infer Input, any, any> ? Input : never;
type OutputOf<Node> = Node extends (...args: never[]) => infer Output ? Output : never;
export function transform<const Node extends Schema, Output>(schema: Node, callback: (value: OutputOf<Node>, options: Schemastery.Options) => Output, preserve = true): Schema<InputOf<Node>, Output> {
  return Schema.transform(schema, (value, options) => callback(value as OutputOf<Node>, options), preserve);
}
export function refined<const Node extends Schema>(schema: Node, check: (value: OutputOf<Node>) => unknown): Node {
  const result = Schema.transform(schema, value => { check(value as OutputOf<Node>); return value; }, true);
  result.meta = { ...schema.meta };
  result.dict = schema.dict;
  return result as Node;
}
export function projected<const Node extends Schema>(schema: Node): Schema<unknown, OutputOf<Node>, 'defined'> {
  const fields = contractFields(schema);
  if (!fields)
    throw new TypeError('Projection requires an object contract');
  const result = transform(Schema.any<unknown>().required(), value => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new TypeError('Expected an object');
    const source = value as Record<string, unknown>;
    return resolveValue(schema, Object.fromEntries(Object.keys(fields).filter(key => Object.hasOwn(source, key)).map(key => [key, source[key]]))) as OutputOf<Node>;
  }, true).required().role(OBJECT_ROLE, { exact: false });
  result.dict = fields;
  return result;
}
export interface DictionaryDefinition {
  readonly keySchema: Schema;
  readonly valueSchema: Schema;
}
export function dictionaryDefinition(schema: Schema): DictionaryDefinition | undefined {
  return schema.meta.role === DICTIONARY_ROLE ? schema.meta.extra as DictionaryDefinition : undefined;
}
export function dictionary<const Value extends Schema, const Key extends Schema<any, string> = Schema<string>>(valueSchema: Value, keySchema: Key = Schema.string() as Key): Schema<Record<string, InputOf<Value>>, Record<string, OutputOf<Value>>> {
  return transform(Schema.any<unknown>().required(), value => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new TypeError('Expected a dictionary object');
    const keys = new Set<string>();
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      const normalizedKey = resolveValue(keySchema, key) as string;
      if (keys.has(normalizedKey))
        throw new TypeError(`Dictionary key ${key} duplicates ${normalizedKey}`);
      keys.add(normalizedKey);
      return [normalizedKey, resolveValue(valueSchema, item) as OutputOf<Value>];
    }));
  }, true).role(DICTIONARY_ROLE, { keySchema, valueSchema }) as Schema<Record<string, InputOf<Value>>, Record<string, OutputOf<Value>>>;
}
export function requiredNullable<const Node extends Schema>(inner: Node) {
  const union = Schema.union([inner, Schema.const(null)]);
  return Schema.transform(union, value => {
    if (value === undefined)
      throw new TypeError('Required value is missing');
    return value;
  }, true).role(NULLABLE_ROLE) as Schema<InputOf<Node> | null, OutputOf<Node> | null, 'defined'>;
}
export function defaulted<const Node extends Schema>(schema: Node, value: NoInfer<OutputOf<Node>> | Partial<InputOf<Node>>) {
  return schema.default(value).required(false) as Schema<InputOf<Node>, OutputOf<Node>, 'defined'> & {
    readonly __contractDefault: true;
  };
}
export function optional<const Node extends Schema>(schema: Node): Schema<InputOf<Node>, OutputOf<Node>, 'plain'> {
  return schema.default(undefined as never).required(false);
}
export function clone<const Node extends Schema>(schema: Node): Node { return Schema(schema) as Node; }
function inputWithDefault(schema: Schema, value: unknown): unknown {
  return value === undefined && schema.meta.default !== undefined ? structuredClone(schema.meta.default) : value;
}
export function resolveValue(schema: Schema, value: unknown): unknown {
  if (value === undefined && fieldIsRequired(schema))
    throw new TypeError('Required value is missing');
  value = inputWithDefault(schema, value);
  if ((value === undefined || value === null) && schema.type === 'transform' && schema.inner?.type === 'any' && !schema.inner.meta.required && !schema.meta.required)
    return schema.callback!(value);
  return Schema.resolve(value, schema, {})[0];
}
function acceptsNull(schema: Schema): boolean {
  return schema.type === 'any' || schema.meta.role === NULLABLE_ROLE || schema.meta.role === JSON_VALUE_ROLE
    || (schema.type === 'const' && schema.value === null)
    || (schema.type === 'union' && schema.list!.some(acceptsNull));
}
type RequiredKeys<Fields> = {
  [Key in keyof Fields]: Fields[Key] extends Schema<any, any, infer Mode> ? Mode extends 'defined' ? Key : never : never;
}[keyof Fields];
type FieldValue<Value> = Value extends (...args: never[]) => infer Output ? Output : never;
type FieldInput<Value> = Value extends Schema<infer Input, any, any> ? Input : never;
type RequiredInputKeys<Fields> = {
  [Key in RequiredKeys<Fields>]: Fields[Key] extends {
    readonly __contractDefault: true;
  } ? never : Key;
}[RequiredKeys<Fields>];
export type ObjectValue<Fields> = {
  -readonly [Key in RequiredKeys<Fields>]: FieldValue<Fields[Key]>;
} & {
  -readonly [Key in Exclude<keyof Fields, RequiredKeys<Fields>>]?: FieldValue<Fields[Key]>;
};
export type ObjectInput<Fields> = {
  -readonly [Key in RequiredInputKeys<Fields>]: FieldInput<Fields[Key]>;
} & {
  -readonly [Key in Exclude<keyof Fields, RequiredInputKeys<Fields>>]?: FieldInput<Fields[Key]>;
};
export function contractObject<const Fields extends Record<string, Schema>>(fields: Fields, options: {
  readonly exact?: boolean;
} = {}) {
  const shape = Schema.object(fields).required();
  const result = Schema.transform(Schema.any<unknown>().required(), value => {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      throw new TypeError('Expected an object');
    const source = value as Record<string, unknown>;
    if (options.exact)
      for (const key of Object.keys(source)) {
        if (!Object.hasOwn(fields, key))
          throw new TypeError(`Property ${key} is not defined`);
        if (source[key] === undefined)
          throw new TypeError(`Property ${key} must have a value`);
      }
    for (const [key, field] of Object.entries(fields)) {
      if (fieldIsRequired(field) && (!Object.hasOwn(source, key) || source[key] === undefined))
        throw new TypeError(`Property ${key} is required`);
      if (source[key] === null && !acceptsNull(field))
        throw new TypeError(`Property ${key} does not accept null`);
      if (typeof source[key] === 'number' && !Number.isFinite(source[key]))
        throw new TypeError(`Property ${key} must contain a finite number`);
    }
    const supplied = { ...source };
    for (const [key, field] of Object.entries(fields)) {
      if (!Object.hasOwn(supplied, key) && field.meta.default !== undefined)
        supplied[key] = inputWithDefault(field, undefined);
    }
    return Schema.resolve(supplied, shape, {})[0] as ReturnType<typeof shape>;
  }, true).required().role(OBJECT_ROLE, { exact: options.exact === true });
  result.dict = shape.dict;
  return result as Schema<ObjectInput<Fields>, ObjectValue<Fields>, 'defined'>;
}
export interface JsonContract {
  readonly keySchema: Schema<string>;
  readonly maxDepth?: number;
}
export function parseJsonValue(value: unknown, contract: JsonContract, path = '$', depth = 0): JsonValue {
  if (contract.maxDepth !== undefined && depth > contract.maxDepth)
    throw new TypeError(`${path} exceeds the maximum JSON depth`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError(`${path} contains an invalid number`);
    return value;
  }
  if (Array.isArray(value))
    return value.map((item, index) => parseJsonValue(item, contract, `${path}[${index}]`, depth + 1));
  if (typeof value !== 'object')
    throw new TypeError(`${path} must be a JSON value`);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    try {
      Schema.resolve(key, contract.keySchema, {});
    }
    catch {
      throw new TypeError(`${path} key is invalid`);
    }
    return [key, parseJsonValue(item, contract, `${path}.${key}`, depth + 1)];
  }));
}
export function jsonValueSchema(contract: JsonContract) {
  return Schema.transform(Schema.any<unknown>(), value => parseJsonValue(value, contract), true).role(JSON_VALUE_ROLE, contract);
}
export function jsonObjectSchema(contract: JsonContract) {
  return Schema.transform(Schema.any<unknown>().required(), value => {
    const parsed = parseJsonValue(value, contract);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new TypeError('JSON value must be an object');
    return parsed as {
      [key: string]: JsonValue;
    };
  }, true).required().role(JSON_OBJECT_ROLE, contract);
}
export function jsonArraySchema(contract: JsonContract) {
  return Schema.transform(Schema.any<unknown>(), value => {
    const parsed = parseJsonValue(value, contract);
    if (!Array.isArray(parsed))
      throw new TypeError('JSON value must be an array');
    return parsed;
  }, true).role(JSON_ARRAY_ROLE, contract);
}
