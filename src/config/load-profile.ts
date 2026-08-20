import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ConfigurationProfileSchema,
  configurationProfileNames,
  parseConfigurationProfile,
  type ConfigurationProfile,
  type ConfigurationProfileName,
} from '../../config/schema.ts'

type JsonObject = Record<string, unknown>

export interface LoadProfileOptions {
  configRoot?: string
  environment?: NodeJS.ProcessEnv
}

export class ConfigurationProfileError extends TypeError {
  readonly profileName: string
  readonly configPath: string
  readonly property: string

  constructor(profileName: string, configPath: string, property: string, message: string) {
    super(`Configuration Profile "${profileName}" failed at ${configPath} (${property}): ${message}`)
    this.name = 'ConfigurationProfileError'
    this.profileName = profileName
    this.configPath = configPath
    this.property = property
  }
}

interface ObjectSchema {
  type?: string
  dict?: Record<string, ObjectSchema>
}

function locatePackageConfigurationRoot(): string {
  let directory = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 4; depth += 1) {
    try {
      const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8')) as { name?: string }
      const configRoot = resolve(directory, 'config')
      readFileSync(resolve(configRoot, 'base.json'), 'utf8')
      if (manifest.name === 'harness-comfyui') return configRoot
    } catch {
      // Continue to the package parent containing package.json and config/base.json.
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  throw new Error(`cannot locate harness-comfyui package configuration from ${fileURLToPath(import.meta.url)}`)
}

const packageConfigurationRoot = locatePackageConfigurationRoot()

function readJson(path: string): JsonObject {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError(`expected a JSON object in ${path}`)
  }
  return parsed as JsonObject
}

function mergeObjects(base: JsonObject, overlay: JsonObject): JsonObject {
  const merged: JsonObject = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && merged[key] && typeof merged[key] === 'object' && !Array.isArray(merged[key])) {
      merged[key] = mergeObjects(merged[key] as JsonObject, value as JsonObject)
    } else {
      merged[key] = value
    }
  }
  return merged
}

function assignPath(target: JsonObject, dottedPath: string, value: unknown): void {
  const segments = dottedPath.split('.')
  let current = target
  for (const segment of segments.slice(0, -1)) {
    const next = current[segment]
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      current[segment] = {}
    }
    current = current[segment] as JsonObject
  }
  current[segments.at(-1)!] = value
}

function assertSchemaFields(value: unknown, schema: ObjectSchema, path: string, profileName: string, configPath: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  if (schema.type !== 'object' || schema.dict === undefined) return
  for (const key of Object.keys(value)) {
    if (schema.dict[key] === undefined) {
      throw new ConfigurationProfileError(profileName, configPath, path ? `${path}.${key}` : key, 'unknown property')
    }
  }
  for (const [key, child] of Object.entries(value)) {
    assertSchemaFields(child, schema.dict[key]!, path ? `${path}.${key}` : key, profileName, configPath)
  }
}

function parseEnvironmentValue(key: string, value: string): unknown {
  if (key === 'HARNESS_COMFYUI_SERVER_PORT') {
    if (!/^\d+$/.test(value)) return value
    return Number(value)
  }
  return value
}

function isProfileName(value: string): value is ConfigurationProfileName {
  return (configurationProfileNames as readonly string[]).includes(value)
}

export function loadProfile(profileName: string, options: LoadProfileOptions = {}): ConfigurationProfile {
  const configRoot = resolve(options.configRoot ?? packageConfigurationRoot)
  const profilePath = resolve(configRoot, 'profiles', `${profileName}.json`)
  if (!isProfileName(profileName)) {
    throw new ConfigurationProfileError(profileName, profilePath, 'profileName', `unknown profile; expected ${configurationProfileNames.join(', ')}`)
  }

  let merged: JsonObject
  try {
    merged = mergeObjects(readJson(resolve(configRoot, 'base.json')), readJson(profilePath))
  } catch (error) {
    if (error instanceof ConfigurationProfileError) throw error
    const message = error instanceof Error ? error.message : String(error)
    throw new ConfigurationProfileError(profileName, profilePath, '<file>', message)
  }
  const environment = options.environment ?? process.env
  const overridesPath = resolve(configRoot, 'environment-overrides.json')
  let overrideMap: JsonObject
  try {
    overrideMap = readJson(overridesPath)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new ConfigurationProfileError(profileName, overridesPath, '<file>', message)
  }
  const allowedEnvironmentKeys = new Set(Object.keys(overrideMap))
  for (const key of allowedEnvironmentKeys) {
    if (typeof overrideMap[key] !== 'string' || !overrideMap[key]) {
      throw new ConfigurationProfileError(profileName, overridesPath, key, 'environment override is not allowed')
    }
  }
  for (const [key, rawValue] of Object.entries(environment)) {
    if (rawValue === undefined) continue
    if (!allowedEnvironmentKeys.has(key)) {
      if (key.startsWith('HARNESS_COMFYUI_')) {
        throw new ConfigurationProfileError(profileName, overridesPath, key, 'environment override is not allowed')
      }
      continue
    }
    assignPath(merged, overrideMap[key] as string, parseEnvironmentValue(key, rawValue))
  }

  assertSchemaFields(merged, ConfigurationProfileSchema, '', profileName, profilePath)
  try {
    return {
      ...parseConfigurationProfile(merged),
      configurationProfile: profileName,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const propertyMatch = /\$\.([A-Za-z0-9_.]+)/.exec(message)
    const property = propertyMatch?.[1] ?? 'profile'
    throw new ConfigurationProfileError(profileName, profilePath, property, message)
  }
}
