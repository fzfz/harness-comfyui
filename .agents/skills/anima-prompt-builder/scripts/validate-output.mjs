const INPUT_KEYS = Object.freeze(['slots', 'display_text']);

export const SLOT_NAMES = Object.freeze([
  'quality',
  'artist_style',
  'count_gender',
  'character_series',
  'appearance',
  'clothing_state',
  'pose_action_sex',
  'expression_reaction',
  'camera_shot',
  'scene_environment',
  'detail_mood',
  'natural_language'
]);

const REQUIRED_QUALITY_PREFIX = Object.freeze([
  'masterpiece',
  'best quality',
  'score_7',
  'highres',
  'safe'
]);
const REQUIRED_ARTIST_PREFIX = '@';

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

function stripWeight(value) {
  const match = /^\(([^:()]*):\s*[+-]?\d+(?:\.\d+)?\)$/u.exec(value);
  return match ? match[1] : value;
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
      if (slotName === SLOT_NAMES.at(-1)) {
        if (!/^[a-z0-9][a-z0-9 '\u0022'’.!?;:/()&+\-]*$/u.test(value)) {
          fail(`${slotName}[${index}]`, `${slotName}[${index}] must use lowercase English text`);
        }
      } else if (value !== value.toLowerCase()) {
        fail(`${slotName}[${index}]`, `${slotName}[${index}] must use lowercase text`);
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

function assertArtistPrefixes(artistStyle) {
  artistStyle.forEach((value, index) => {
    const inner = stripWeight(value);
    if (!inner.startsWith(REQUIRED_ARTIST_PREFIX)
      || inner === REQUIRED_ARTIST_PREFIX
      || inner.startsWith(`${REQUIRED_ARTIST_PREFIX}${REQUIRED_ARTIST_PREFIX}`)) {
      fail(`artist_style[${index}]`, `artist_style[${index}] must begin with exactly one ${REQUIRED_ARTIST_PREFIX}`);
    }
  });
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
  assertArtistPrefixes(input.slots.artist_style);

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

function emptyInputTemplate() {
  return {
    slots: Object.fromEntries(SLOT_NAMES.map((name) => [name, []])),
    display_text: ''
  };
}

function parseCliArguments() {
  const args = process.argv.slice(2);
  const unknown = args.find((argument) => argument !== '--print-input-template');
  if (unknown !== undefined) throw new Error(`unknown CLI argument: ${unknown}`);
  return Object.freeze({ printInputTemplate: args.includes('--print-input-template') });
}

async function readStdin() {
  let inputText = '';
  for await (const chunk of process.stdin) inputText += chunk;
  return inputText;
}

async function runCli() {
  const options = parseCliArguments();
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
  const output = validateOutput(input);
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

if (import.meta.main) {
  runCli().catch((error) => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    if (normalized instanceof PromptOutputValidationError) {
      process.stderr.write(`${JSON.stringify({ violations: [{ path: normalized.path, message: normalized.message }] })}\n`);
      process.exitCode = 2;
      return;
    }
    process.stderr.write(`${normalized.name}: ${normalized.message}\n`);
    process.exitCode = 1;
  });
}
