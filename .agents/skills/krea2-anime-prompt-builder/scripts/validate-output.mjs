import { runWithHelp, errorGuide } from './cli-help.mjs'
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const GENERATION_OUTPUT_SCHEMA = JSON.parse(readFileSync(
  new URL('../references/generation-output-schema.json', import.meta.url),
  'utf8',
))
const GENERATION_PROFILES = JSON.parse(readFileSync(
  new URL('../references/generation-profiles.json', import.meta.url),
  'utf8',
))

export class GenerationOutputValidationError extends Error {
  constructor(path, message) {
    super(message)
    this.name = 'GenerationOutputValidationError'
    this.code = 'GENERATION_OUTPUT_INVALID'
    this.path = path
  }
}

function fail(path, message) {
  throw new GenerationOutputValidationError(path, message)
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function greatestCommonDivisor(left, right) {
  let a = left
  let b = right
  while (b !== 0) [a, b] = [b, a % b]
  return a
}

function assertPropertyType(input, name, contract) {
  const value = input[name]
  const types = contract.type === undefined
    ? []
    : Array.isArray(contract.type)
      ? contract.type
      : [contract.type]
  const matches = types.length === 0 || types.some((type) => {
    if (type === 'null') return value === null
    if (type === 'string') return typeof value === 'string'
    if (type === 'integer') return Number.isSafeInteger(value)
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
    return false
  })
  if (!matches) fail(name, `${name} does not match its schema type`)
  if (typeof value === 'string' && contract.minLength !== undefined && value.length < contract.minLength) {
    fail(name, `${name} must be non-empty`)
  }
  if (typeof value === 'number' && contract.minimum !== undefined && value < contract.minimum) {
    fail(name, `${name} is below its minimum`)
  }
  if (typeof value === 'number' && contract.exclusiveMinimum !== undefined && value <= contract.exclusiveMinimum) {
    fail(name, `${name} must be greater than ${contract.exclusiveMinimum}`)
  }
  if (Array.isArray(contract.enum) && !contract.enum.includes(value)) {
    fail(name, `${name} is not an allowed value`)
  }
  if (typeof value === 'string' && contract.pattern !== undefined && !new RegExp(contract.pattern, 'u').test(value)) {
    fail(name, `${name} does not match its schema pattern`)
  }
}

export function validateGenerationOutput(input) {
  if (!isObject(input)) fail('$', 'input must be an object')
  const required = GENERATION_OUTPUT_SCHEMA.required
  const allowed = new Set(Object.keys(GENERATION_OUTPUT_SCHEMA.properties))
  for (const name of Object.keys(input)) {
    if (!allowed.has(name)) fail(name, `${name} is not allowed`)
  }
  for (const name of required) {
    if (!Object.hasOwn(input, name)) fail(name, `${name} is required`)
  }
  for (const [name, contract] of Object.entries(GENERATION_OUTPUT_SCHEMA.properties)) {
    if (Object.hasOwn(input, name)) assertPropertyType(input, name, contract)
  }

  const route = GENERATION_PROFILES.model_routes[input.model_route]
  if (!isObject(route)) fail('model_route', 'model_route is not defined by generation-profiles.json')
  if (input.negative_mode !== route.negative_mode) fail('negative_mode', 'negative_mode does not match model_route')
  if (input.negative_mode === 'native_negative') {
    if (typeof input.negative_prompt !== 'string' || input.negative_prompt.length === 0) {
      fail('negative_prompt', 'native_negative requires a non-empty negative_prompt')
    }
    if (input.positive_avoidance !== null) {
      fail('positive_avoidance', 'native_negative requires positive_avoidance to be null')
    }
  } else {
    if (input.negative_prompt !== null) {
      fail('negative_prompt', 'positive_rewrite requires negative_prompt to be null')
    }
    if (typeof input.positive_avoidance !== 'string' || input.positive_avoidance.length === 0) {
      fail('positive_avoidance', 'positive_rewrite requires non-empty positive_avoidance')
    }
  }

  const ratioMatch = /^([1-9][0-9]*):([1-9][0-9]*)$/u.exec(input.aspect_ratio)
  if (ratioMatch === null) fail('aspect_ratio', 'aspect_ratio is invalid')
  const ratioWidth = Number(ratioMatch[1])
  const ratioHeight = Number(ratioMatch[2])
  if (!Number.isSafeInteger(ratioWidth) || !Number.isSafeInteger(ratioHeight)
    || greatestCommonDivisor(ratioWidth, ratioHeight) !== 1) {
    fail('aspect_ratio', 'aspect_ratio must contain reduced safe integers')
  }
  const sizeDivisor = greatestCommonDivisor(input.width, input.height)
  if (`${input.width / sizeDivisor}:${input.height / sizeDivisor}` !== input.aspect_ratio) {
    fail('aspect_ratio', 'aspect_ratio does not match width and height')
  }
  const actualMegapixels = input.width * input.height / 1_000_000
  if (Math.abs(actualMegapixels - input.megapixels) / input.megapixels > 0.05) {
    fail('megapixels', 'megapixels differs from width and height by more than five percent')
  }
  return Object.freeze(structuredClone(input))
}

async function readStdin() {
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  return input
}

async function runCli(args) {
  if (args.length > 0) fail('$', 'validator does not accept command-line arguments')
  let input
  try {
    input = JSON.parse(await readStdin())
  } catch {
    fail('$', 'input must be valid JSON')
  }
  process.stdout.write(`${JSON.stringify(validateGenerationOutput(input))}\n`)
}

if (process.argv[1]
  && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  runWithHelp(runCli).catch((error) => {
    const normalized = error instanceof Error ? error : new Error(String(error))
    if (normalized instanceof GenerationOutputValidationError) {
      process.stderr.write(`${JSON.stringify({ violations: [{ path: normalized.path, message: normalized.message }] })}\n`)
      process.exitCode = 2
      return
    }
    process.stderr.write(`${normalized.name}: ${normalized.message}\n`)
    process.exitCode = 1
  }).finally(errorGuide)
}
