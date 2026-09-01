import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const INPUT_KEYS = Object.freeze(['positions', 'display_text']);
const OUTPUT_KIND = 'noobai_assistant_prompt';
const CONTRACT_VERSION = '1.0.0';

const WEIGHT_POLICY = JSON.parse(readFileSync(
  new URL('../references/prompt-weight-policy.json', import.meta.url),
  'utf8'
));

const TAG_POSITION_NAMES = Object.freeze([...WEIGHT_POLICY.positions.tag]);
const RELATION_POSITION_NAMES = Object.freeze([...WEIGHT_POLICY.positions.relation_text]);
export const POSITION_NAMES = Object.freeze([...TAG_POSITION_NAMES, ...RELATION_POSITION_NAMES]);

const POSITION_NAME_SET = new Set(POSITION_NAMES);
const TAG_POSITION_NAME_SET = new Set(TAG_POSITION_NAMES);
const CONTROL_OR_LINE_SEPARATOR = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const SENTENCE_ENDING = /[.!?]$/u;
const WEIGHT_PATTERN = new RegExp(WEIGHT_POLICY.syntax.explicit_weight.ascii_decimal_pattern, 'u');
const ESCAPE_CHARACTER = WEIGHT_POLICY.syntax.payload.escape_character;
const ESCAPABLE_CHARACTERS = new Set(WEIGHT_POLICY.syntax.payload.escapable_characters);
const REJECTED_PAYLOAD_DELIMITERS = new Set(
  WEIGHT_POLICY.syntax.payload.reject_unescaped_delimiters_inside_wrapper
);
const UNWEIGHTED_QUALITY_POSITION = WEIGHT_POLICY.recommendations.unweighted_quality.position;
const UNWEIGHTED_QUALITY_CONTENT = new Set(
  WEIGHT_POLICY.recommendations.unweighted_quality.content
);

export class PromptFinalizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PromptFinalizationError';
    this.code = 'PROMPT_FINAL_OUTPUT_INVALID';
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function frozenViolation(path, message) {
  return Object.freeze({ path, message });
}

function addViolation(violations, path, message) {
  violations.push(frozenViolation(path, message));
}

function validSingleLineString(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.trim() === value
    && !CONTROL_OR_LINE_SEPARATOR.test(value);
}

class TagSyntaxError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TagSyntaxError';
  }
}

function assertPayloadSyntax(payload) {
  if (payload.length === 0 || payload.trim() !== payload) {
    throw new TagSyntaxError('payload 必须非空且首尾无空白');
  }
  for (let index = 0; index < payload.length; index += 1) {
    const character = payload[index];
    if (character === ESCAPE_CHARACTER) {
      const escaped = payload[index + 1];
      if (escaped === undefined || !ESCAPABLE_CHARACTERS.has(escaped)) {
        throw new TagSyntaxError('payload 包含无效反斜杠转义');
      }
      index += 1;
      continue;
    }
    if (REJECTED_PAYLOAD_DELIMITERS.has(character)) {
      throw new TagSyntaxError('payload 包含未转义的圆括号或方括号');
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

function parseTagElement(value) {
  const startsWrapper = value.startsWith('(');
  const closingIndex = value.length - 1;
  const endsWrapper = value[closingIndex] === ')' && !isCharacterEscaped(value, closingIndex);
  if (startsWrapper !== endsWrapper) {
    throw new TagSyntaxError('必须使用完整的 payload、(payload) 或 (payload:weight) 格式');
  }
  if (!startsWrapper) {
    assertPayloadSyntax(value);
    return Object.freeze({ payload: value, weight: null });
  }

  const inner = value.slice(1, -1);
  const separatorCount = [...inner].filter(character => character === ':').length;
  if (separatorCount > WEIGHT_POLICY.syntax.payload.maximum_unescaped_colons_inside_wrapper) {
    throw new TagSyntaxError('权重外层最多包含一个冒号');
  }

  const separator = inner.indexOf(':');
  const payload = separator === -1 ? inner : inner.slice(0, separator);
  assertPayloadSyntax(payload);
  if (separator === -1) return Object.freeze({ payload, weight: null });

  const weight = inner.slice(separator + 1);
  const numeric = Number(weight);
  if (!WEIGHT_PATTERN.test(weight)
    || (WEIGHT_POLICY.syntax.explicit_weight.require_finite && !Number.isFinite(numeric))
    || numeric <= WEIGHT_POLICY.syntax.explicit_weight.minimum_exclusive) {
    throw new TagSyntaxError('weight 必须是大于 0 的有限 ASCII 十进制数');
  }
  return Object.freeze({ payload, weight });
}

function validateCommonElement(value, path, violations) {
  if (typeof value !== 'string') {
    addViolation(violations, path, '必须是字符串');
    return false;
  }
  if (!validSingleLineString(value)) {
    addViolation(violations, path, '必须是首尾无空白且不含控制字符的单行非空字符串');
    return false;
  }
  return true;
}

function collectInputViolations(input) {
  const violations = [];
  if (!isObject(input)) {
    addViolation(violations, '$', '必须是包含 positions 和 display_text 的 JSON 对象');
    return violations;
  }

  for (const key of Object.keys(input)) {
    if (!INPUT_KEYS.includes(key)) addViolation(violations, key.length === 0 ? '$[""]' : key, '不允许未定义的顶层属性');
  }
  for (const key of INPUT_KEYS) {
    if (!Object.hasOwn(input, key)) addViolation(violations, key, '缺少必填属性');
  }

  const positions = input.positions;
  if (Object.hasOwn(input, 'positions')) {
    if (!isObject(positions) || Object.keys(positions).length === 0) {
      addViolation(violations, 'positions', '必须是包含至少一个实际 Prompt 位置的对象');
    } else {
      for (const name of Object.keys(positions)) {
        if (!POSITION_NAME_SET.has(name)) addViolation(violations, `positions.${name}`, '不允许未定义的 Prompt 位置');
      }

      for (const name of POSITION_NAMES) {
        if (!Object.hasOwn(positions, name)) continue;
        const values = positions[name];
        if (!Array.isArray(values) || values.length === 0) {
          addViolation(violations, `positions.${name}`, '必须是非空字符串数组');
          continue;
        }
        values.forEach((value, index) => {
          const path = `positions.${name}[${index}]`;
          if (!validateCommonElement(value, path, violations)) return;
          if (TAG_POSITION_NAME_SET.has(name)) {
            try {
              const parsed = parseTagElement(value);
              if (name === UNWEIGHTED_QUALITY_POSITION
                && UNWEIGHTED_QUALITY_CONTENT.has(parsed.payload)
                && value !== parsed.payload) {
                addViolation(violations, path, '默认质量内容必须保持未加权');
              }
            } catch (error) {
              if (error instanceof TagSyntaxError) addViolation(violations, path, error.message);
              else throw error;
            }
          }
          if (name === 'relation_narrative' && !SENTENCE_ENDING.test(value)) {
            addViolation(violations, path, '必须以 .、! 或 ? 结束');
          }
        });
      }

      if (Object.hasOwn(positions, 'relation_narrative')
        && Array.isArray(positions.relation_narrative)
        && positions.relation_narrative.length > 0
        && !TAG_POSITION_NAMES.some((name) => Array.isArray(positions[name]) && positions[name].length > 0)) {
        addViolation(violations, 'positions.relation_narrative', '使用 relation_narrative 时前十四个位置必须至少包含一项 Prompt 内容');
      }
    }
  }

  if (Object.hasOwn(input, 'display_text')) {
    if (!validSingleLineString(input.display_text)) {
      addViolation(violations, 'display_text', '必须是首尾无空白且不含控制字符的单行非空字符串');
    }
  }

  const positionsAreComposable = isObject(positions)
    && Object.keys(positions).length > 0
    && !violations.some((violation) => violation.path === 'positions' || violation.path.startsWith('positions.'));
  if (positionsAreComposable) {
    const promptText = assemblePromptText(positions);
    if (promptText.length < 1) {
      addViolation(violations, 'prompt_text', '组合后的 Prompt 必须是非空字符串');
    }
  }

  return violations;
}

function assemblePromptText(positions) {
  const tags = TAG_POSITION_NAMES.flatMap((name) => positions[name] ?? []);
  const relation = positions.relation_narrative ?? [];
  const tagText = tags.join(', ');
  return relation.length === 0 ? tagText : `${tagText}, ${relation.join(' ')}`;
}

function successOutput(input) {
  return Object.freeze({
    kind: OUTPUT_KIND,
    result: 'success',
    contract_version: CONTRACT_VERSION,
    prompt_text: assemblePromptText(input.positions),
    display_text: input.display_text
  });
}

function failureResult(violations) {
  return Object.freeze({ valid: false, violations: Object.freeze([...violations]) });
}

function successResult(output) {
  return Object.freeze({ valid: true, violations: Object.freeze([]), output });
}

export function validatePromptInput(input) {
  const violations = collectInputViolations(input);
  if (violations.length > 0) return failureResult(violations);
  const output = successOutput(input);
  validateSkillOutput({ output });
  return successResult(output);
}

function failFinalOutput(message) {
  throw new PromptFinalizationError(message);
}

function exactKeys(value, expected) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === [...expected].sort()[index]);
}

function assertOutputString(value, name) {
  if (!validSingleLineString(value)) {
    failFinalOutput(`${name} 不符合最终输出结构`);
  }
}

export function validateSkillOutput({ output } = {}) {
  if (!isObject(output)) failFinalOutput('最终输出必须是 JSON 对象');
  if (output.kind !== OUTPUT_KIND) failFinalOutput('kind 不符合最终输出结构');
  if (output.contract_version !== CONTRACT_VERSION) failFinalOutput('contract_version 不符合最终输出结构');
  if (output.result === 'success') {
    if (!exactKeys(output, ['kind', 'result', 'contract_version', 'prompt_text', 'display_text'])) {
      failFinalOutput('成功 JSON 必须严格包含五个属性');
    }
    assertOutputString(output.prompt_text, 'prompt_text');
    assertOutputString(output.display_text, 'display_text');
    return output;
  }
  if (output.result === 'error') {
    if (!exactKeys(output, ['kind', 'result', 'contract_version', 'display_text'])) {
      failFinalOutput('错误 JSON 必须严格包含四个属性');
    }
    assertOutputString(output.display_text, 'display_text');
    return output;
  }
  failFinalOutput('result 不符合最终输出结构');
}

function invalidJsonResult() {
  const violations = [frozenViolation('$', '必须是有效的 JSON 对象')];
  return failureResult(violations);
}

async function readStdin() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function runCli() {
  if (process.argv.length > 2) failFinalOutput('校验器不接受命令行参数');
  const source = await readStdin();
  let result;
  try {
    result = validatePromptInput(JSON.parse(source));
  } catch (error) {
    if (error instanceof SyntaxError) result = invalidJsonResult();
    else throw error;
  }
  if (result.valid) {
    process.stdout.write(`${JSON.stringify(result.output)}\n`);
  } else {
    process.stderr.write(`${JSON.stringify({ violations: result.violations })}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    process.stderr.write(`${normalized.name}: ${normalized.message}\n`);
    process.exitCode = 1;
  });
}
