import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const policyFilename = 'config/quality-gates.json'
const qualificationFileKeys = ['manifest', 'record']

function fail(message) {
  throw new Error(`quality gate policy: ${message}`)
}

function assertExactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
  const actualKeys = Object.keys(value).sort()
  const sortedExpected = [...expectedKeys].sort()
  if (JSON.stringify(actualKeys) !== JSON.stringify(sortedExpected)) {
    fail(`${label} must contain exactly ${expectedKeys.join(', ')}`)
  }
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

export function normalizeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || value.includes('\\')) return null
  if (value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value)) return null
  const segments = value.split('/')
  if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')) return null
  return value
}

function assertFastOnlyFile(value) {
  if (normalizeRelativePath(value) === null) fail(`fastOnlyFiles contains an invalid relative path ${String(value)}`)
}

function assertFastOnlyPrefix(value) {
  if (typeof value !== 'string' || !value.endsWith('/')) fail(`fastOnlyPrefixes must end with /: ${String(value)}`)
  if (normalizeRelativePath(value.slice(0, -1)) === null) fail(`fastOnlyPrefixes contains an invalid relative prefix ${String(value)}`)
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
  assertExactKeys(value, ['files', 'requiredGateIds', 'schemaVersion', 'workflowName'], 'qualification')
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) fail('qualification.schemaVersion must be a positive integer')
  if (typeof value.workflowName !== 'string' || value.workflowName.length === 0) fail('qualification.workflowName must be a non-empty string')
  assertStringArray(value.requiredGateIds, 'qualification.requiredGateIds', { unique: true })
  if (!value.files || typeof value.files !== 'object' || Array.isArray(value.files)) {
    fail('qualification.files must be an object')
  }
  const fileKeys = Object.keys(value.files).sort()
  if (JSON.stringify(fileKeys) !== JSON.stringify([...qualificationFileKeys].sort())) {
    fail(`qualification.files must contain exactly ${qualificationFileKeys.join(', ')}`)
  }
  for (const key of qualificationFileKeys) {
    if (typeof value.files[key] !== 'string' || value.files[key].length === 0) {
      fail(`qualification.files.${key} must be a non-empty string`)
    }
  }
  if (new Set(qualificationFileKeys.map(key => value.files[key])).size !== qualificationFileKeys.length) {
    fail('qualification.files values must be unique')
  }
  return value
}

export function validateQualityPolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) fail('root must be an object')
  assertExactKeys(policy, ['coverage', 'fastOnlyFiles', 'fastOnlyPrefixes', 'qualification'], 'policy')
  if (!policy.coverage || typeof policy.coverage !== 'object' || Array.isArray(policy.coverage)) fail('coverage must be an object')
  assertExactKeys(policy.coverage, ['exclude', 'include', 'provider', 'thresholds'], 'coverage')
  if (policy.coverage.provider !== 'v8') fail('coverage.provider must be v8')
  assertStringArray(policy.coverage.include, 'coverage.include')
  assertStringArray(policy.coverage.exclude, 'coverage.exclude')
  assertThresholds(policy.coverage.thresholds)
  assertStringArray(policy.fastOnlyFiles, 'fastOnlyFiles', { unique: true })
  assertStringArray(policy.fastOnlyPrefixes, 'fastOnlyPrefixes', { unique: true })
  for (const file of policy.fastOnlyFiles) assertFastOnlyFile(file)
  for (const prefix of policy.fastOnlyPrefixes) assertFastOnlyPrefix(prefix)
  assertQualification(policy.qualification)
  return policy
}

export function loadQualityPolicy(root = repositoryRoot) {
  const policyPath = join(resolve(root), policyFilename)
  return validateQualityPolicy(readJson(policyPath))
}

export { policyFilename, repositoryRoot }
