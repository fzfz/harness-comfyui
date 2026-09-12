import { runWithHelp, errorGuide } from './cli-help.mjs'
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const INPUT_KEYS = Object.freeze(['slots', 'display_text']);

const WEIGHT_POLICY = JSON.parse(readFileSync(
  new URL('../references/prompt-weight-policy.json', import.meta.url),
  'utf8'
));

const GENERATION_OUTPUT_SCHEMA = JSON.parse(readFileSync(
  new URL('../references/generation-output-schema.json', import.meta.url),
  'utf8'
));
const GENERATION_PROFILES = JSON.parse(readFileSync(
  new URL('../references/generation-profiles.json', import.meta.url),
  'utf8'
));

const TAG_SLOT_NAMES = Object.freeze([...WEIGHT_POLICY.positions.tag]);
const RELATION_SLOT_NAMES = Object.freeze([...WEIGHT_POLICY.positions.relation_text]);
export const SLOT_NAMES = Object.freeze([...TAG_SLOT_NAMES, ...RELATION_SLOT_NAMES]);

const REQUIRED_QUALITY_PREFIX = Object.freeze([
  ...WEIGHT_POLICY.recommendations.unweighted_quality.content
]);
const REQUIRED_ARTIST_PREFIX = '@';
const RELATION_SLOT_NAME_SET = new Set(RELATION_SLOT_NAMES);
const WEIGHT_PATTERN = new RegExp(WEIGHT_POLICY.syntax.explicit_weight.ascii_decimal_pattern, 'u');
const ESCAPE_CHARACTER = WEIGHT_POLICY.syntax.payload.escape_character;
const ESCAPABLE_CHARACTERS = new Set(WEIGHT_POLICY.syntax.payload.escapable_characters);
const REJECTED_PAYLOAD_DELIMITERS = new Set(
  WEIGHT_POLICY.syntax.payload.reject_unescaped_delimiters_inside_wrapper
);

export const OUTPUT_RULES = Object.freeze({
  keys: Object.freeze(['kind', 'result', 'contract_version', 'prompt_text', 'display_text']),
  fixed: Object.freeze({
    kind: 'noobai_assistant_prompt',
    result: 'success',
    contract_version: '1.0.0'
  })
});

const SLOT_NAME_SET = new Set(SLOT_NAMES);

export class PromptOutputValidationError extends Error {
  constructor(path, message) {
    super(message);
    this.name = 'PromptOutputValidationError';
    this.code = 'PROMPT_OUTPUT_INVALID';
    this.path = path;
  }
}

function fail(path, message) {
  throw new PromptOutputValidationError(path, message);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertInputShape(input) {
  if (!isObject(input)) fail('$', 'input must be an object');
  for (const key of Object.keys(input)) {
    if (!INPUT_KEYS.includes(key)) fail(key.length === 0 ? '$[""]' : key, `input contains unknown key: ${key}`);
  }
  if (!Object.hasOwn(input, 'slots')) fail('slots', 'slots is required');
  if (!Object.hasOwn(input, 'display_text')) fail('display_text', 'display_text is required');
  if (!isObject(input.slots)) fail('slots', 'slots must be an object');
}

function assertSlotKeys(slots) {
  const missing = SLOT_NAMES.filter((name) => !Object.hasOwn(slots, name));
  const unknown = Object.keys(slots).filter((name) => !SLOT_NAME_SET.has(name));
  if (missing.length > 0 || unknown.length > 0 || Object.keys(slots).length !== SLOT_NAMES.length) {
    const details = [
      missing.length > 0 ? `missing: ${missing.join(', ')}` : '',
      unknown.length > 0 ? `unknown: ${unknown.join(', ')}` : ''
    ].filter(Boolean).join('; ');
    fail('slots', `slots must contain exactly ${SLOT_NAMES.length} canonical keys${details ? ` (${details})` : ''}`);
  }
}

function assertDisplayText(displayText) {
  if (typeof displayText !== 'string') fail('display_text', 'display_text must be a string');
  if (displayText.length === 0) fail('display_text', 'display_text must be non-empty');
}

function assertPayloadSyntax(payload, label) {
  if (payload.length === 0 || payload.trim() !== payload) {
    fail(label, `${label} payload must be non-empty without surrounding whitespace`);
  }
  for (let index = 0; index < payload.length; index += 1) {
    const character = payload[index];
    if (character === ESCAPE_CHARACTER) {
      const escaped = payload[index + 1];
      if (escaped === undefined || !ESCAPABLE_CHARACTERS.has(escaped)) {
        fail(label, `${label} payload contains an invalid escape sequence`);
      }
      index += 1;
      continue;
    }
    if (REJECTED_PAYLOAD_DELIMITERS.has(character)) {
      fail(label, `${label} payload contains an unescaped delimiter`);
    }
  }
}

function isCharacterEscaped(value, targetIndex) {
  for (let index = 0; index < targetIndex; index += 1) {
    if (value[index] !== ESCAPE_CHARACTER) continue;
    if (index + 1 === targetIndex) return true;
    index += 1;
  }
  return false;
}

function parseTagElement(value, label) {
  const startsWrapper = value.startsWith('(');
  const closingIndex = value.length - 1;
  const endsWrapper = value[closingIndex] === ')' && !isCharacterEscaped(value, closingIndex);
  if (startsWrapper !== endsWrapper) {
    fail(label, `${label} must use a complete payload, (payload), or (payload:weight) form`);
  }
  if (!startsWrapper) {
    assertPayloadSyntax(value, label);
    return Object.freeze({ payload: value, weight: null });
  }

  const inner = value.slice(1, -1);
  const separatorCount = [...inner].filter(character => character === ':').length;
  if (separatorCount > WEIGHT_POLICY.syntax.payload.maximum_unescaped_colons_inside_wrapper) {
    fail(label, `${label} weighted wrapper must contain at most one colon`);
  }

  const separator = inner.indexOf(':');
  const payload = separator === -1 ? inner : inner.slice(0, separator);
  assertPayloadSyntax(payload, label);
  if (separator === -1) return Object.freeze({ payload, weight: null });

  const weight = inner.slice(separator + 1);
  const numeric = Number(weight);
  if (!WEIGHT_PATTERN.test(weight)
    || (WEIGHT_POLICY.syntax.explicit_weight.require_finite && !Number.isFinite(numeric))
    || numeric <= WEIGHT_POLICY.syntax.explicit_weight.minimum_exclusive) {
    fail(label, `${label} weight must be a positive finite ASCII decimal`);
  }
  return Object.freeze({ payload, weight });
}

function assertCommonElement(value, slotName, index) {
  const label = `${slotName}[${index}]`;
  if (typeof value !== 'string') fail(label, `${label} must be a string`);
  if (value.length === 0 || value.trim() !== value || /[\r\n]/u.test(value)) {
    fail(label, `${label} must be a non-empty string without surrounding whitespace or newlines`);
  }
  if (value.includes(',')) fail(label, `${label} must not contain commas`);
}

function assertSlotElements(slots) {
  for (const slotName of SLOT_NAMES) {
    const values = slots[slotName];
    if (!Array.isArray(values)) fail(slotName, `${slotName} must be an array`);
    values.forEach((value, index) => {
      assertCommonElement(value, slotName, index);
      const label = `${slotName}[${index}]`;
      if (RELATION_SLOT_NAME_SET.has(slotName)) {
        if (!/^[a-z0-9][a-z0-9 '\u0022'’.!?;:/()&+\-]*$/u.test(value)) {
          fail(label, `${label} must use lowercase English text`);
        }
        return;
      }

      const parsed = parseTagElement(value, label);
      if (parsed.payload !== parsed.payload.toLowerCase()) {
        fail(label, `${label} must use lowercase text`);
      }
      if (slotName === 'artist_style') {
        assertArtistPayload(parsed.payload, label);
      }
    });
  }
}

function assertQualityPrefix(quality) {
  const hasRequiredPrefix = quality.length >= REQUIRED_QUALITY_PREFIX.length
    && REQUIRED_QUALITY_PREFIX.every((value, index) => quality[index] === value);
  if (!hasRequiredPrefix) {
    fail('quality', `quality must begin with fixed prefix: ${REQUIRED_QUALITY_PREFIX.join(', ')}`);
  }
}

function assertArtistPayload(payload, label) {
  if (!payload.startsWith(REQUIRED_ARTIST_PREFIX)
    || payload === REQUIRED_ARTIST_PREFIX
    || payload.startsWith(`${REQUIRED_ARTIST_PREFIX}${REQUIRED_ARTIST_PREFIX}`)) {
    fail(label, `${label} payload must begin with exactly one ${REQUIRED_ARTIST_PREFIX}`);
  }
}

function assemblePromptText(slots) {
  return SLOT_NAMES.flatMap((slotName) => slots[slotName]).join(', ');
}

function assertPromptLength(promptText) {
  if (promptText.length < 1) fail('prompt_text', 'prompt_text must be non-empty');
}

export function validateOutput(input) {
  assertInputShape(input);
  assertSlotKeys(input.slots);
  assertDisplayText(input.display_text);
  assertSlotElements(input.slots);
  assertQualityPrefix(input.slots.quality);

  const promptText = assemblePromptText(input.slots);
  assertPromptLength(promptText);

  return {
    kind: OUTPUT_RULES.fixed.kind,
    result: OUTPUT_RULES.fixed.result,
    contract_version: OUTPUT_RULES.fixed.contract_version,
    prompt_text: promptText,
    display_text: input.display_text
  };
}

function greatestCommonDivisor(left, right) {
  let a = left;
  let b = right;
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function assertGenerationPropertyType(input, name, contract) {
  const value = input[name];
  const types = contract.type === undefined
    ? []
    : Array.isArray(contract.type)
      ? contract.type
      : [contract.type];
  const matches = types.length === 0 || types.some((type) => {
    if (type === 'null') return value === null;
    if (type === 'string') return typeof value === 'string';
    if (type === 'integer') return Number.isSafeInteger(value);
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    return false;
  });
  if (!matches) fail(name, `${name} does not match its schema type`);
  if (typeof value === 'string' && contract.minLength !== undefined && value.length < contract.minLength) {
    fail(name, `${name} must be non-empty`);
  }
  if (typeof value === 'number' && contract.minimum !== undefined && value < contract.minimum) {
    fail(name, `${name} is below its minimum`);
  }
  if (typeof value === 'number' && contract.exclusiveMinimum !== undefined && value <= contract.exclusiveMinimum) {
    fail(name, `${name} must be greater than ${contract.exclusiveMinimum}`);
  }
  if (Array.isArray(contract.enum) && !contract.enum.includes(value)) fail(name, `${name} is not an allowed value`);
  if (typeof value === 'string' && contract.pattern !== undefined && !new RegExp(contract.pattern, 'u').test(value)) {
    fail(name, `${name} does not match its schema pattern`);
  }
}

export function validateGenerationOutput(input) {
  if (!isObject(input)) fail('$', 'input must be an object');
  const required = GENERATION_OUTPUT_SCHEMA.required;
  const allowed = new Set(Object.keys(GENERATION_OUTPUT_SCHEMA.properties));
  for (const name of Object.keys(input)) if (!allowed.has(name)) fail(name, `${name} is not allowed`);
  for (const name of required) if (!Object.hasOwn(input, name)) fail(name, `${name} is required`);
  for (const [name, contract] of Object.entries(GENERATION_OUTPUT_SCHEMA.properties)) {
    if (Object.hasOwn(input, name)) assertGenerationPropertyType(input, name, contract);
  }

  const route = GENERATION_PROFILES.model_routes[input.model_route];
  if (!isObject(route)) fail('model_route', 'model_route is not defined by generation-profiles.json');
  if (input.negative_mode !== route.negative_mode) fail('negative_mode', 'negative_mode does not match model_route');
  if (input.negative_mode === 'native_negative') {
    if (typeof input.negative_prompt !== 'string' || input.negative_prompt.length === 0) {
      fail('negative_prompt', 'native_negative requires a non-empty negative_prompt');
    }
    if (input.positive_avoidance !== null) fail('positive_avoidance', 'native_negative requires positive_avoidance to be null');
  } else {
    if (input.negative_prompt !== null) fail('negative_prompt', 'positive_rewrite requires negative_prompt to be null');
    if (typeof input.positive_avoidance !== 'string' || input.positive_avoidance.length === 0) {
      fail('positive_avoidance', 'positive_rewrite requires non-empty positive_avoidance');
    }
  }

  const ratioMatch = /^([1-9][0-9]*):([1-9][0-9]*)$/u.exec(input.aspect_ratio);
  if (ratioMatch === null) fail('aspect_ratio', 'aspect_ratio is invalid');
  const ratioWidth = Number(ratioMatch[1]);
  const ratioHeight = Number(ratioMatch[2]);
  if (!Number.isSafeInteger(ratioWidth) || !Number.isSafeInteger(ratioHeight)
    || greatestCommonDivisor(ratioWidth, ratioHeight) !== 1) {
    fail('aspect_ratio', 'aspect_ratio must contain reduced safe integers');
  }
  const sizeDivisor = greatestCommonDivisor(input.width, input.height);
  if (`${input.width / sizeDivisor}:${input.height / sizeDivisor}` !== input.aspect_ratio) {
    fail('aspect_ratio', 'aspect_ratio does not match width and height');
  }
  const actualMegapixels = input.width * input.height / 1_000_000;
  if (Math.abs(actualMegapixels - input.megapixels) / input.megapixels > 0.05) {
    fail('megapixels', 'megapixels differs from width and height by more than five percent');
  }
  return Object.freeze(structuredClone(input));
}

function emptyInputTemplate() {
  return {
    slots: Object.fromEntries(SLOT_NAMES.map((name) => [name, []])),
    display_text: ''
  };
}

function parseCliArguments(args) {
  const unknown = args.find((argument) => argument !== '--print-input-template' && argument !== '--prompt-format');
  if (unknown !== undefined) throw new Error(`unknown CLI argument: ${unknown}`);
  if (args.includes('--print-input-template') && args.includes('--prompt-format')) {
    throw new Error('--print-input-template and --prompt-format cannot be combined');
  }
  return Object.freeze({
    printInputTemplate: args.includes('--print-input-template'),
    promptFormat: args.includes('--prompt-format')
  });
}

async function readStdin() {
  let inputText = '';
  for await (const chunk of process.stdin) inputText += chunk;
  return inputText;
}

async function runCli(args) {
  const options = parseCliArguments(args);
  const inputText = await readStdin();
  if (options.printInputTemplate) {
    if (inputText.trim().length > 0) fail('$', '--print-input-template requires empty stdin');
    process.stdout.write(`${JSON.stringify(emptyInputTemplate())}\n`);
    return;
  }

  let input;
  try {
    input = JSON.parse(inputText);
  } catch {
    throw new PromptOutputValidationError('$', 'input must be valid JSON');
  }
  const output = options.promptFormat ? validateOutput(input) : validateGenerationOutput(input);
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

if (process.argv[1]
  && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  runWithHelp(runCli).catch((error) => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    if (normalized instanceof PromptOutputValidationError) {
      process.stderr.write(`${JSON.stringify({ violations: [{ path: normalized.path, message: normalized.message }] })}\n`);
      process.exitCode = 2;
      return;
    }
    process.stderr.write(`${normalized.name}: ${normalized.message}\n`);
    process.exitCode = 1;
  }).finally(errorGuide);
}
