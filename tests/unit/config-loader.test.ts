import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ConfigurationProfileSchema } from '../../config/schema.ts'
import { ConfigurationProfileError, loadProfile } from '../../src/config/load-profile.ts'

describe('Configuration Profile loader', () => {
  const isolatedEnvironment = {
    HARNESS_COMFYUI_DATA_DIR: '.local/isolated/data',
    HARNESS_COMFYUI_RUN_REPOSITORY_FILE: '.local/isolated/runs.sqlite',
    HARNESS_COMFYUI_RUN_DIRECTORY: '.local/isolated/runs',
    HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY: '.local/isolated/media',
    HARNESS_COMFYUI_LOG_DIRECTORY: '.local/isolated/logs',
    HARNESS_COMFYUI_DEFAULT_INSTANCE_ID: 'isolated-instance',
    HARNESS_COMFYUI_CATALOG_CLI_PATH: 'node',
    HARNESS_COMFYUI_SOURCE_CLI_PATH: 'node',
    HARNESS_COMFYUI_SERVER_HOST: '127.0.0.1',
    HARNESS_COMFYUI_SERVER_PORT: '4199',
  }

  it('loads the development profile and applies an allowed environment override', () => {
    const profile = loadProfile('development', {
      configRoot: 'config',
      environment: {
        HARNESS_COMFYUI_SERVER_PORT: '4199',
      },
    })

    expect(profile.configurationProfile).toBe('development')
    expect(profile.server.port).toBe(4199)
    expect(profile.paths.dataDir).toBe('.local/development')
  })

  it('reports the profile path and property when the port override is invalid', () => {
    try {
      loadProfile('development', {
        configRoot: 'config',
        environment: {
          HARNESS_COMFYUI_SERVER_PORT: 'not-a-port',
        },
      })
      throw new Error('expected loadProfile to reject an invalid port')
    } catch (error) {
      expect(error).toMatchObject({
        name: 'ConfigurationProfileError',
        profileName: 'development',
        property: 'server.port',
      })
      expect((error as Error).message).toContain('config/profiles/development.json')
      expect((error as Error).message).toContain('server.port')
    }
  })

  it.each(['development', 'test', 'release-smoke', 'production'] as const)(
    'loads the %s profile with isolated values and never falls back to development values',
    (configurationProfile) => {
      const profile = loadProfile(configurationProfile, {
        configRoot: 'config',
        environment: isolatedEnvironment,
      })

      expect(profile.configurationProfile).toBe(configurationProfile)
      expect(profile.paths.dataDir).toBe('.local/isolated/data')
      expect(profile.paths.dataDir).not.toBe('.local/development')
      expect(profile.server.port).toBe(4199)
    },
  )

  it.each(['test', 'release-smoke', 'production'] as const)(
    'requires isolated values for %s instead of inheriting development paths',
    (configurationProfile) => {
      expect(() => loadProfile(configurationProfile, {
        configRoot: 'config',
        environment: {
          HARNESS_COMFYUI_SERVER_PORT: '4199',
        },
      })).toThrowError(ConfigurationProfileError)

      try {
        loadProfile(configurationProfile, {
          configRoot: 'config',
          environment: {
            HARNESS_COMFYUI_SERVER_PORT: '4199',
          },
        })
      } catch (error) {
        expect(error).toMatchObject({
          profileName: configurationProfile,
          property: 'paths.dataDir',
        })
        expect((error as Error).message).toContain(`profiles/${configurationProfile}.json`)
        return
      }

      throw new Error(`expected ${configurationProfile} to require isolated path overrides`)
    },
  )

  it('rejects an unknown JSON property with profile, file, and property evidence', () => {
    const temporaryConfigRoot = mkdtempSync(join(tmpdir(), 'harness-comfyui-config-'))
    try {
      cpSync(resolve('config'), temporaryConfigRoot, { recursive: true })
      const profilePath = join(temporaryConfigRoot, 'profiles', 'development.json')
      const profile = JSON.parse(readFileSync(profilePath, 'utf8')) as Record<string, unknown>
      profile.credential = 'must-not-be-accepted'
      writeFileSync(profilePath, JSON.stringify(profile), 'utf8')

      try {
        loadProfile('development', {
          configRoot: temporaryConfigRoot,
          environment: {
            HARNESS_COMFYUI_SERVER_PORT: '4199',
          },
        })
      } catch (error) {
        expect(error).toMatchObject({
          profileName: 'development',
          property: 'credential',
          configPath: profilePath,
        })
        expect((error as Error).message).toContain('unknown property')
        return
      }

      throw new Error('expected an unknown JSON property to be rejected')
    } finally {
      rmSync(temporaryConfigRoot, { recursive: true, force: true })
    }
  })

  it('rejects an unlisted HARNESS_COMFYUI override', () => {
    try {
      loadProfile('development', {
        configRoot: 'config',
        environment: {
          HARNESS_COMFYUI_UNLISTED: 'unexpected',
        },
      })
    } catch (error) {
      expect(error).toMatchObject({
        name: 'ConfigurationProfileError',
        profileName: 'development',
        property: 'HARNESS_COMFYUI_UNLISTED',
      })
      expect((error as Error).message).toContain('environment override is not allowed')
      return
    }

    throw new Error('expected an unlisted HARNESS_COMFYUI override to be rejected')
  })

  it('rejects an unknown profile name before reading profile configuration', () => {
    try {
      loadProfile('preview', {
        configRoot: 'config',
        environment: {},
      })
    } catch (error) {
      expect(error).toMatchObject({
        name: 'ConfigurationProfileError',
        profileName: 'preview',
        property: 'profileName',
      })
      expect((error as Error).message).toContain('config/profiles/preview.json')
      return
    }

    throw new Error('expected an unknown profile name to be rejected')
  })

  it('defines exactly the Issue #2 configuration fields and no credential field', () => {
    const schemaDict = ConfigurationProfileSchema.dict!
    expect(Object.keys(schemaDict)).toEqual([
      'paths',
      'comfyui',
      'source',
      'jobs',
      'server',
      'process',
    ])
    expect(Object.keys(schemaDict.paths.dict!)).toEqual([
      'dataDir',
      'runRepositoryFile',
      'runDirectory',
      'savedMediaDirectory',
      'logDirectory',
    ])
    expect(Object.keys(schemaDict.comfyui.dict!)).toEqual(['defaultInstanceId'])
    expect(Object.keys(schemaDict.source.dict!)).toEqual([
      'catalogCliPath',
      'sourceCliPath',
      'contractId',
      'supportedContractVersions',
    ])
    expect(Object.keys(schemaDict.jobs.dict!)).toEqual([
      'pollIntervalMs',
      'missingObservationMs',
    ])
    expect(Object.keys(schemaDict.server.dict!)).toEqual(['host', 'port'])
    expect(Object.keys(schemaDict.process.dict!)).toEqual(['shutdownTimeoutMs'])
  })
})
