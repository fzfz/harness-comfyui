import Schema from '@deepseek-ai/schemastery';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import descriptions from '../../config/workbench-tool-descriptions.json' with { type: 'json' };
import delegationDescriptions from '../../config/workbench-delegation-tools.json' with { type: 'json' };
import roles from '../../config/workbench-agent-roles.json' with { type: 'json' };
import { WORKBENCH_REMOTE_CONFIG } from '../workbench/remote-config.ts';
import { dataSchemas, dataOutputSchemas, operationSchemas, remoteMethods, remoteOutput, remoteResultSchemas } from './internal/schema.ts';
import { contractFields, fieldIsRequired, resolveValue, objectIsExact, dictionaryDefinition, validationContext, parseJsonValue, type JsonValue } from './internal/structure.ts';
import { nativeProjection } from './internal/projection.ts';
import { describeContract } from './internal/help.ts';
import { settingsDeclaration } from './internal/settings.ts';
import { createCliFileLoader, type CliFileIo } from './internal/cli-adapter.ts';
type Source<S> = S extends Schema<infer Value, any, any> ? Value : never;
type UnionKeys<Value> = Value extends Value ? keyof Value : never;
type CompleteUnion<Value, Whole = Value> = Value extends Value ? Value & Partial<Record<Exclude<UnionKeys<Whole>, keyof Value>, never>> : never;
type Resolved<S> = S extends (...args: never[]) => infer Value ? Value : never;
type Data = typeof dataSchemas;
type Operations = typeof operationSchemas;
type Remote = typeof remoteMethods;
export type ContractDirection = 'input' | 'output';
export type ContractId = keyof Data | keyof Operations | `workbench remote ${keyof Remote}` | 'taskInputForKind' | 'generationInputReady';
export type ContractValue<Id extends ContractId> = Id extends keyof Data ? CompleteUnion<Resolved<Data[Id]>> : ContractOutput<Id>;
export type ContractInput<Id extends ContractId> = Id extends keyof Operations ? Source<Operations[Id]['input']> : Id extends `workbench remote ${infer Method extends keyof Remote}` ? Source<Remote[Method]> : Id extends keyof Data ? Source<Data[Id]> : Id extends 'generationInputReady' ? ContractValue<'generationInput'> : Id extends 'taskInputForKind' ? Source<Data['taskInputForKindInput']> : never;
export type ContractOutput<Id extends ContractId> = Id extends keyof Operations ? Resolved<Operations[Id]['output']> : Id extends `workbench remote ${infer Method extends keyof Remote}` ? Method extends keyof typeof remoteResultSchemas ? Resolved<(typeof remoteResultSchemas)[Method]> : Record<string, unknown> : Id extends 'taskInputForKind' ? ContractValue<'taskInput'> : Id extends keyof typeof dataOutputSchemas ? Resolved<(typeof dataOutputSchemas)[Id]> : Id extends keyof Data ? ContractValue<Id> : ContractInput<Id>;
export type DeepReadonly<Value> = [
  JsonValue
] extends [
    Value
  ] ? Value : Value extends (...args: never[]) => unknown ? Value : Value extends readonly unknown[] ? {
    readonly [Key in keyof Value]: DeepReadonly<Value[Key]>;
  } : Value extends object ? {
    readonly [Key in keyof Value]: DeepReadonly<Value[Key]>;
  } : Value;
export type ContractReadonlyValue<Id extends ContractId> = DeepReadonly<ContractValue<Id>>;
export type { JsonValue, JsonPrimitive } from './internal/structure.ts';
function issuePath(parent: string, child: string): string {
  const base = parent.replace(/^\$\.?/u, '').split('.').filter(Boolean);
  const relative = child.replace(/^\$\.?/u, '').split('.').filter(Boolean);
  let overlap = Math.min(base.length, relative.length);
  while (overlap && base.slice(-overlap).join('.') !== relative.slice(0, overlap).join('.'))
    overlap--;
  return '$' + [...base, ...relative.slice(overlap)].map(part => part.startsWith('[') ? part : '.' + part).join('');
}
export class ContractError extends TypeError {
  readonly code: string;
  readonly issues: {
    path: string;
    message: string;
  }[];
  readonly contractId: string;
  readonly direction: ContractDirection;
  constructor(contractId: string, direction: ContractDirection, error: unknown, path = '$') {
    const detail = error instanceof Error ? error.message : String(error);
    const structured = error as {
      code?: string;
      issues?: {
        path: string;
        message: string;
      }[];
    };
    const issues = structured?.issues?.map(issue => ({ ...issue, path: issuePath(path, issue.path) })) ?? [{ path, message: detail }];
    super(`${contractId} ${direction} ${issues[0]?.path ?? path}: ${detail}`);
    this.name = 'ContractError';
    this.contractId = contractId;
    this.direction = direction;
    this.code = structured?.code ?? 'WORKBENCH_INVALID_INPUT';
    this.issues = issues;
  }
}
function diagnostic(schema: Schema, value: unknown, path = '$'): {
  path: string;
  error: unknown;
} {
  let failure: unknown = new TypeError('Value does not satisfy the contract');
  try {
    resolveValue(schema, value);
  }
  catch (error) {
    failure = error;
  }
  if (value === undefined && fieldIsRequired(schema))
    return { path, error: failure };
  const fields = contractFields(schema);
  if (fields && value && typeof value === 'object' && !Array.isArray(value)) {
    const source = value as Record<string, unknown>;
    for (const [key, field] of Object.entries(fields))
      if (fieldIsRequired(field) && (!Object.hasOwn(source, key) || source[key] === undefined))
        return { path: `${path}.${key}`, error: new TypeError('Required value is missing') };
    if (objectIsExact(schema))
      for (const key of Object.keys(source)) {
        if (!Object.hasOwn(fields, key))
          return { path: `${path}.${key}`, error: new TypeError(`Property ${key} is not defined`) };
        if (source[key] === undefined)
          return { path: `${path}.${key}`, error: new TypeError(`Property ${key} must have a value`) };
      }
    for (const [key, field] of Object.entries(fields)) {
      if (fieldIsRequired(field) && (!Object.hasOwn(source, key) || source[key] === undefined))
        return { path: `${path}.${key}`, error: new TypeError('Required value is missing') };
      try {
        resolveValue(field, source[key]);
      }
      catch {
        return diagnostic(field, source[key], `${path}.${key}`);
      }
    }
  }
  if (schema.type === 'array' && Array.isArray(value))
    for (const [index, item] of value.entries()) {
      try {
        resolveValue(schema.inner!, item);
      }
      catch {
        return diagnostic(schema.inner!, item, `${path}[${index}]`);
      }
    }
  if (schema.type === 'union') {
    const candidates = schema.list!.filter(candidate => {
      const shape = contractFields(candidate);
      if (shape) {
        if (!value || typeof value !== 'object' || Array.isArray(value))
          return false;
        const selectors = Object.entries(shape).filter(([, field]) => field.type === 'const');
        return selectors.every(([key, field]) => Object.is((value as Record<string, unknown>)[key], field.value));
      }
      return candidate.type === typeof value;
    });
    if (candidates.length === 1)
      return diagnostic(candidates[0]!, value, path);
  }
  const dictionary = dictionaryDefinition(schema);
  if (dictionary && value && typeof value === 'object' && !Array.isArray(value))
    for (const [key, item] of Object.entries(value)) {
      try {
        resolveValue(dictionary.keySchema, key);
      }
      catch {
        return diagnostic(dictionary.keySchema, key, `${path}.${key}`);
      }
      try {
        resolveValue(dictionary.valueSchema, item);
      }
      catch {
        return diagnostic(dictionary.valueSchema, item, `${path}.${key}`);
      }
    }
  if (schema.type === 'transform' && !fields && schema.inner?.type !== 'any') {
    try {
      resolveValue(schema.inner!, value);
    }
    catch {
      return diagnostic(schema.inner!, value, path);
    }
  }
  return { path, error: failure };
}
function schemaFor(id: string, direction: ContractDirection): Schema {
  if (id.startsWith('workbench remote ')) {
    const method = id.slice('workbench remote '.length) as keyof Remote;
    if (!Object.hasOwn(remoteMethods, method))
      throw new TypeError(`Unknown contract ${id}`);
    return direction === 'input' ? remoteMethods[method] : remoteOutput(method);
  }
  if (direction === 'output' && Object.hasOwn(dataOutputSchemas, id))
    return dataOutputSchemas[id as keyof typeof dataOutputSchemas];
  if (Object.hasOwn(dataSchemas, id))
    return dataSchemas[id as keyof Data];
  if (Object.hasOwn(operationSchemas, id))
    return operationSchemas[id as keyof Operations][direction];
  throw new TypeError(`Unknown contract ${id}`);
}
export type ContractParsed<Id extends ContractId, Direction extends ContractDirection> = Id extends keyof Operations ? Resolved<Operations[Id][Direction]> : Id extends `workbench remote ${infer Method extends keyof Remote}` ? Direction extends 'input' ? Resolved<Remote[Method]> : Resolved<(typeof remoteResultSchemas)[Method]> : Id extends keyof Data ? Direction extends 'output' ? ContractOutput<Id> : ContractValue<Id> : ContractOutput<Id>;
function parseValue(id: string, direction: ContractDirection, value: unknown): unknown {
  try {
    const schema = schemaFor(id, direction);
    let parsed: unknown;
    try {
      parsed = resolveValue(schema, value);
    }
    catch (error) {
      const context = validationContext(error);
      const target = context ?? { schema, value };
      let detail = { path: '$', error };
      try {
        resolveValue(target.schema, target.value);
      }
      catch {
        detail = diagnostic(target.schema, target.value);
      }
      throw new ContractError(id, direction, detail.error, context?.prefix ? '$.' + context.prefix + (detail.path === '$' ? '' : detail.path.slice(1)) : detail.path);
    }
    return parsed as never;
  }
  catch (error) {
    if (error instanceof ContractError)
      throw error;
    throw new ContractError(id, direction, error);
  }
}
type NativeId = Extract<keyof Operations, `workbench_${string}`>;
interface NativeOptions<Id extends NativeId> {
  execute: (args: ContractParsed<Id, 'input'>, execution: ToolRunContext) => unknown | Promise<unknown>;
  assertSchema: (schema: ReturnType<typeof nativeProjection>) => void;
  description?: string;
  render?: ToolDefinition['output']['render'];
  name?: string;
}
function nativeDescription(id: string): string {
  if (id === 'workbench_task_get')
    return descriptions.summary;
  if (id === 'workbench_task_publish')
    return [descriptions.publish.summary, ...descriptions.publish.steps].join('\n');
  if (id === 'workbench_experiment_end')
    return descriptions.end.summary;
  if (id === 'workbench_function_list')
    return delegationDescriptions.list;
  if (id === 'workbench_function_delegate')
    return delegationDescriptions.delegate;
  const definition = roles.nativeTools[id as keyof typeof roles.nativeTools];
  return definition ? `${definition.purpose}${'guidance' in definition ? `。${definition.guidance}` : ''}` : id;
}
function bind<Id extends keyof Data>(id: Id, channel: 'settings'): Data[Id];
function bind<Id extends NativeId>(id: Id, channel: 'native', options: NativeOptions<Id>): ToolDefinition;
function bind(id: 'workbench remote', channel: 'remote'): TypertRemoteContribution;
function bind(id: 'cliRequest', channel: 'cli-files', io: CliFileIo): ReturnType<typeof createCliFileLoader>;
function bind<Id extends keyof Operations | 'cliRequest', Args extends unknown[]>(id: Id, channel: 'cli', handler: (args: ContractParsed<Id, 'input'>, ...context: Args) => unknown | Promise<unknown>): (value: unknown, ...context: Args) => Promise<ContractOutput<Id>>;
function bind(id: string, channel: string, options?: unknown): unknown {
  if (channel === 'settings') return settingsDeclaration(id, schemaFor(id, 'input'));
  if (channel === 'cli-files')
    return createCliFileLoader(options as CliFileIo, (key, value) => parseValue(key, 'input', value) as never);
  if (channel === 'remote') {
    const namespace = WORKBENCH_REMOTE_CONFIG.namespace;
    return {
      package: 'harness-comfyui', descriptors: Object.keys(remoteMethods).map(method => ({
        id: `harness-comfyui#${namespace}/${method}`,
        service: namespace,
        namespace,
        method,
        invocation: { kind: 'direct' },
        ...(method === 'subscribe' ? { mode: 'stream' } : {}),
        parameters: [{
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: `harness-comfyui/workbench#${method}Request`,
            create: () => ({ parse: (value: unknown) => parseValue(`workbench remote ${method}`, 'input', value) })
          }
        }],
        cancellation: { parameter: 'signal' },
        result: {
          mode: 'strict',
          typeSymbol: `harness-comfyui/workbench#${method}Result`,
          create: () => ({ parse: (value: unknown) => parseValue(`workbench remote ${method}`, 'output', value) })
        },
      }))
    };
  }
  if (channel === 'native') {
    const native = options as {
      execute: (args: never, execution: ToolRunContext) => unknown;
      assertSchema: (schema: ReturnType<typeof nativeProjection>) => void;
      description?: string;
      render?: ToolDefinition['output']['render'];
      name?: string;
    };
    const fields = id.startsWith('workbench_function_') ? delegationDescriptions.fields : descriptions.fields;
    const parameters = nativeProjection(schemaFor(id, 'input'), fields), output = nativeProjection(schemaFor(id, 'output'));
    native.assertSchema(parameters);
    native.assertSchema(output);
    const render: ToolDefinition['output']['render'] = native.render ?? ((_args, value) => {
      if (id === 'workbench_task_get') {
        const task = value as Record<string, unknown>, kind = task.kind as keyof typeof descriptions.fields_by_kind;
        const names = [...descriptions.common_fields, ...descriptions.fields_by_kind[kind]];
        return [{ type: 'text', text: JSON.stringify({ ...task, guidance: { fields: Object.fromEntries(names.map(field => [field, descriptions.fields[field as keyof typeof descriptions.fields]])), usage: descriptions.usage_by_kind[kind] } }) }];
      }
      return [{ type: 'text', text: JSON.stringify(value) }];
    });
    return {
      name: native.name ?? id,
      description: native.description ?? nativeDescription(id),
      parameters,
      output: { schema: output, render },
      async execute(value: unknown, execution: ToolRunContext) {
        execution.signal.throwIfAborted();
        const input: unknown = parseValue(id, 'input', value);
        const result = await native.execute(input as never, execution);
        return parseJsonValue(parseValue(id, 'output', result), { keySchema: Schema.string().required() });
      }
    };
  }
  const handler = options as (value: never, ...context: unknown[]) => unknown;
  return async (value: unknown, ...context: unknown[]) => {
    const input: unknown = parseValue(id, 'input', value);
    const result = await handler(input as never, ...context);
    const outputId = id === 'cliRequest' ? (input as {
      command: string;
    }).command.replaceAll('.', ' ') : id;
    return parseValue(outputId, 'output', result);
  };
}
const parse = parseValue as unknown as <Id extends ContractId, Direction extends ContractDirection>(id: Id, direction: Direction, value: unknown) => ContractParsed<Id, Direction>;
export const contracts = Object.freeze({
  parse,
  bind,
  describe: describeContract
});
