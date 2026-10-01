const ADAPTER_OPTION_KEYS = ['profilePortPatch', 'loopbackHost', 'parseYaml', 'serializeYaml']
const PROFILE_PATCH_RULE_KEYS = ['entryId', 'hostField', 'portField']
const PROFILE_UPDATE_KEYS = ['entryId', 'config']
const LOOPBACK_HOST = '127.0.0.1'

export async function loadOfficialProfilePatchAdapter(config, loadModule = name => import(name)) {
  let include
  let yaml
  try {
    ;[include, yaml] = await Promise.all([
      loadModule('@deepseek-ai/cordis-plugin-include'),
      loadModule('js-yaml'),
    ])
    if (include.entryListSchema === undefined || typeof yaml.load !== 'function' || typeof yaml.dump !== 'function') {
      throw new TypeError('Official YAML parser exports are missing')
    }
  } catch {
    const error = new Error("OFFICIAL_PROFILE_PARSER_UNAVAILABLE: the official Profile YAML parser is unavailable in this worktree's development dependency view. Configure that view to resolve the approved @deepseek-ai/cordis-plugin-include and js-yaml dependencies, then retry the Desktop command.")
    error.code = 'OFFICIAL_PROFILE_PARSER_UNAVAILABLE'
    throw error
  }
  return createOfficialProfilePatchAdapter({
    profilePortPatch: config.profilePortPatch,
    loopbackHost: config.ports.host,
    parseYaml: source => yaml.load(source, { schema: include.entryListSchema }),
    serializeYaml: document => yaml.dump(document, { schema: include.entryListSchema }),
  })
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function record(value, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`${label} must contain data properties only`)
    }
  }
  return value
}

function exactKeys(value, keys, label) {
  record(value, label)
  const actual = Reflect.ownKeys(value)
  const expected = new Set(keys)
  const missing = keys.filter(key => !Object.hasOwn(value, key))
  const unexpected = actual.filter(key => typeof key !== 'string' || !expected.has(key)).map(String)
  if (missing.length > 0 || unexpected.length > 0) {
    throw new TypeError(`${label} must contain exactly ${keys.join(', ')}${
      missing.length ? `; missing ${missing.join(', ')}` : ''
    }${unexpected.length ? `; unexpected ${unexpected.join(', ')}` : ''}`)
  }
  return value
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be a non-empty string`)
  return value
}

function parseProfilePatchRule(value) {
  const rule = exactKeys(value, PROFILE_PATCH_RULE_KEYS, 'profilePortPatch')
  nonEmptyString(rule.entryId, 'profilePortPatch.entryId')
  for (const field of ['hostField', 'portField']) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/u.test(nonEmptyString(rule[field], `profilePortPatch.${field}`))) {
      throw new TypeError(`profilePortPatch.${field} must be a field name`)
    }
  }
  if (rule.hostField === rule.portField) throw new TypeError('profilePortPatch host and port fields must be distinct')
  return rule
}

function validateEntryList(value, label = 'profile entry list', activeLists = new Set()) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be a top-level array`)
  if (activeLists.has(value)) throw new TypeError('profile entry list must not contain cycles')
  activeLists.add(value)
  try {
    for (let index = 0; index < value.length; index += 1) {
      const entry = record(value[index], `${label}[${index}]`)
      if (Object.hasOwn(entry, 'id') && typeof entry.id !== 'string') {
        throw new TypeError(`${label}[${index}].id must be a string`)
      }
      if (entry.group && Array.isArray(entry.config)) {
        validateEntryList(entry.config, `${label}[${index}].config`, activeLists)
      }
    }
  } finally {
    activeLists.delete(value)
  }
  return value
}

function findEntriesById(entries, entryId, matches, activeLists = new Set(), path = []) {
  if (activeLists.has(entries)) throw new TypeError('profile entry list must not contain cycles')
  activeLists.add(entries)
  try {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]
      const entryPath = [...path, index]
      if (entry.id === entryId) matches.push({ entry, path: entryPath })
      if (entry.group && Array.isArray(entry.config)) {
        findEntriesById(entry.config, entryId, matches, activeLists, entryPath)
      }
    }
  } finally {
    activeLists.delete(entries)
  }
  return matches
}

function entryAtPath(document, path) {
  let entries = document
  let entry
  for (let index = 0; index < path.length; index += 1) {
    entry = entries[path[index]]
    if (index < path.length - 1) entries = entry.config
  }
  return entry
}

function validatePatch(update, rule, loopbackHost) {
  const request = exactKeys(update, PROFILE_UPDATE_KEYS, 'profile patch update')
  if (request.entryId !== rule.entryId) {
    throw new TypeError(`profile patch update must target ${rule.entryId}`)
  }
  const config = exactKeys(request.config, [rule.hostField, rule.portField], 'profile patch config')
  if (config[rule.hostField] !== loopbackHost) {
    throw new TypeError(`profile patch config.${rule.hostField} must equal ${loopbackHost}`)
  }
  if (!Number.isSafeInteger(config[rule.portField]) || config[rule.portField] < 1 || config[rule.portField] > 65_535) {
    throw new TypeError(`profile patch config.${rule.portField} must be an integer from 1 through 65535`)
  }
  return config
}

/**
 * Build the probe adapter around explicitly supplied YAML parser functions.
 * Production callers supply js-yaml load/dump closures using the official
 * cordis-plugin-include entryListSchema; unit tests can inject deterministic
 * parser functions without installing or evaluating the Desktop SDK.
 */
export function createOfficialProfilePatchAdapter(options) {
  const config = exactKeys(options, ADAPTER_OPTION_KEYS, 'official profile patch adapter options')
  const profilePortPatch = parseProfilePatchRule(config.profilePortPatch)
  if (config.loopbackHost !== LOOPBACK_HOST) {
    throw new TypeError(`official profile patch adapter.loopbackHost must be ${LOOPBACK_HOST}`)
  }
  if (typeof config.parseYaml !== 'function') {
    throw new TypeError('official profile patch adapter.parseYaml must be a function')
  }
  if (typeof config.serializeYaml !== 'function') {
    throw new TypeError('official profile patch adapter.serializeYaml must be a function')
  }

  return {
    async parse(source) {
      if (typeof source !== 'string') throw new TypeError('profile YAML source must be text')
      const document = await config.parseYaml(source)
      return validateEntryList(document)
    },

    async updateProfilePatch(document, update) {
      validateEntryList(document)
      const patch = validatePatch(update, profilePortPatch, config.loopbackHost)
      const matches = findEntriesById(document, profilePortPatch.entryId, [])
      if (matches.length === 0) throw new TypeError(`profile entry ${profilePortPatch.entryId} was not found`)
      if (matches.length > 1) throw new TypeError(`profile entry ${profilePortPatch.entryId} appears more than once`)
      if (!isRecord(matches[0].entry.config)) {
        throw new TypeError(`profile entry ${profilePortPatch.entryId}.config must be an object`)
      }

      const updated = structuredClone(document)
      const target = entryAtPath(updated, matches[0].path)
      target.config = {
        ...target.config,
        [profilePortPatch.hostField]: patch[profilePortPatch.hostField],
        [profilePortPatch.portField]: patch[profilePortPatch.portField],
      }
      return updated
    },

    async serialize(document) {
      validateEntryList(document)
      const serialized = await config.serializeYaml(document)
      if (typeof serialized !== 'string') throw new TypeError('serializeYaml() must return YAML text')
      return serialized
    },
  }
}
