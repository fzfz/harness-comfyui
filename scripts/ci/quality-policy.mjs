import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const policyFilename = 'config/quality-gates.json'
const artifactNameKeys = ['candidate', 'qualified', 'manifest', 'record']

function fail(message) {
  throw new Error(`quality gate policy: ${message}`)
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`quality gate policy cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

function assertStringArray(value, field, options = {}) {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || item.length === 0)) {
    fail(`${field} must be a non-empty array of non-empty strings`)
  }
  if (options.unique && new Set(value).size !== value.length) fail(`${field} must not contain duplicates`)
  return value
}

function assertThresholds(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('coverage.thresholds must be an object')
  const keys = ['branches', 'functions', 'lines', 'statements']
  const actualKeys = Object.keys(value).sort()
  if (JSON.stringify(actualKeys) !== JSON.stringify(keys)) fail(`coverage.thresholds must contain exactly ${keys.join(', ')}`)
  for (const key of keys) {
    if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 100) {
      fail(`coverage.thresholds.${key} must be an integer from 0 through 100`)
    }
  }
  return value
}

function assertQualification(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('qualification must be an object')
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) fail('qualification.schemaVersion must be a positive integer')
  if (typeof value.workflowName !== 'string' || value.workflowName.length === 0) fail('qualification.workflowName must be a non-empty string')
  const configuredIds = assertStringArray(value.requiredGateIds, 'qualification.requiredGateIds', { unique: true })
  if (!value.artifactNames || typeof value.artifactNames !== 'object' || Array.isArray(value.artifactNames)) {
    fail('qualification.artifactNames must be an object')
  }
  const artifactKeys = Object.keys(value.artifactNames).sort()
  if (JSON.stringify(artifactKeys) !== JSON.stringify([...artifactNameKeys].sort())) {
    fail(`qualification.artifactNames must contain exactly ${artifactNameKeys.join(', ')}`)
  }
  for (const key of artifactNameKeys) {
    if (typeof value.artifactNames[key] !== 'string' || value.artifactNames[key].length === 0) {
      fail(`qualification.artifactNames.${key} must be a non-empty string`)
    }
  }
  if (!Array.isArray(value.gates) || value.gates.length !== configuredIds.length) fail('qualification.gates must define every required gate exactly once')
  const gateIds = value.gates.map((gate) => {
    if (!gate || typeof gate !== 'object' || Array.isArray(gate)) fail('qualification.gates entries must be objects')
    if (typeof gate.id !== 'string' || typeof gate.job !== 'string' || typeof gate.command !== 'string') {
      fail('qualification.gates entries require id, job, and command strings')
    }
    return gate.id
  })
  if (JSON.stringify(gateIds) !== JSON.stringify(configuredIds)) fail('qualification.gates must use requiredGateIds in order')
  return value
}

export function validateQualityPolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) fail('root must be an object')
  if (!policy.coverage || typeof policy.coverage !== 'object' || Array.isArray(policy.coverage)) fail('coverage must be an object')
  if (policy.coverage.provider !== 'v8') fail('coverage.provider must be v8')
  assertStringArray(policy.coverage.include, 'coverage.include')
  assertStringArray(policy.coverage.exclude, 'coverage.exclude')
  assertThresholds(policy.coverage.thresholds)
  assertStringArray(policy.fastOnlyFiles, 'fastOnlyFiles', { unique: true })
  assertStringArray(policy.fastOnlyPrefixes, 'fastOnlyPrefixes', { unique: true })
  for (const file of policy.fastOnlyFiles) {
    if (file.startsWith('/') || file.includes('..')) fail(`fastOnlyFiles contains an unsafe path ${file}`)
  }
  for (const prefix of policy.fastOnlyPrefixes) {
    if (prefix.startsWith('/') || prefix.includes('..') || !prefix.endsWith('/')) fail(`fastOnlyPrefixes contains an unsafe prefix ${prefix}`)
  }
  assertQualification(policy.qualification)
  return policy
}

export function loadQualityPolicy(root = repositoryRoot) {
  const policyPath = join(resolve(root), policyFilename)
  return validateQualityPolicy(readJson(policyPath))
}

export { policyFilename, repositoryRoot }
