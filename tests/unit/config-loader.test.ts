import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import Schema from '@deepseek-ai/schemastery'
import { describe, expect, it } from 'vitest'

import { ConfigurationProfileSchema } from '../../config/schema.ts'
import { ConfigurationProfileError, loadProfile } from '../../src/config/load-profile.ts'

const productionEnvironment = {
  HARNESS_COMFYUI_DATA_DIR: '.local/production/data',
  HARNESS_COMFYUI_API_WORKFLOW_CACHE_DIRECTORY: '.local/production/data/api-workflow-cache',
  HARNESS_COMFYUI_RUN_REPOSITORY_FILE: '.local/production/data/runs.sqlite',
  HARNESS_COMFYUI_RUN_DIRECTORY: '.local/production/runs',
  HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY: '.local/production/saved-media',
  HARNESS_COMFYUI_LOG_DIRECTORY: '.local/production/logs',
  HARNESS_COMFYUI_DEFAULT_INSTANCE_ID: 'production',
  HARNESS_COMFYUI_FRONTEND_BROWSER_EXECUTABLE_PATH: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  HARNESS_COMFYUI_FRONTEND_CACHE_EPOCH: '1',
  HARNESS_COMFYUI_FRONTEND_COMPILER_TIMEOUT_MS: '120000',
  HARNESS_COMFYUI_FRONTEND_DEVTOOLS_PORT_TIMEOUT_MS: '10000',
  HARNESS_COMFYUI_FRONTEND_TARGET_CREATE_TIMEOUT_MS: '10000',
  HARNESS_COMFYUI_FRONTEND_WEBSOCKET_CONNECT_TIMEOUT_MS: '10000',
  HARNESS_COMFYUI_FRONTEND_DOMAIN_ENABLE_TIMEOUT_MS: '10000',
  HARNESS_COMFYUI_FRONTEND_NAVIGATION_TIMEOUT_MS: '10000',
  HARNESS_COMFYUI_FRONTEND_INFRASTRUCTURE_ATTEMPTS: '2',
  HARNESS_COMFYUI_CATALOG_PORT: '18093',
  HARNESS_COMFYUI_CLIENT_RUN_REFRESH_INTERVAL_MS: '1100',
}

function copyConfiguration(prefix: string): string {
  const temporaryConfigRoot = mkdtempSync(join(tmpdir(), prefix))
  cpSync(resolve('config'), temporaryConfigRoot, { recursive: true })
  return temporaryConfigRoot
}

describe('production Configuration Profile loader', () => {
  it('uses the browser path saved in the plugin configuration', () => {
    const profile = loadProfile('production', {
      environment: {},
      storageRoot: '/official-home',
      browserExecutablePath: '/Applications/Chromium With Spaces.app/Contents/MacOS/Chromium',
    })
    expect(profile.comfyui.frontendCompiler.browserExecutablePath)
      .toBe('/Applications/Chromium With Spaces.app/Contents/MacOS/Chromium')
  })

  it('reports the profile field and correction for an invalid saved browser path', () => {
    expect(() => loadProfile('production', { environment: {}, browserExecutablePath: 'relative/browser' }))
      .toThrowError(expect.objectContaining({
        name: 'ConfigurationProfileError',
        profileName: 'production',
        property: 'comfyui.frontendCompiler.browserExecutablePath',
      }))
  })

  it('uses the plugin data directory configuration for all business storage', () => {
    const profile = loadProfile('production', {
      environment: productionEnvironment,
      storageRoot: '/official-home',
      dataDirectory: '/Custom Plugin Data With Spaces',
    })
    expect(profile.paths).toEqual({
      dataDir: '/Custom Plugin Data With Spaces',
      apiWorkflowCacheDirectory: '/Custom Plugin Data With Spaces/api-workflow-cache',
      runRepositoryFile: '/Custom Plugin Data With Spaces/runs.sqlite',
      runDirectory: '/Custom Plugin Data With Spaces/runs',
      savedMediaDirectory: '/Custom Plugin Data With Spaces/media',
      logDirectory: '/Custom Plugin Data With Spaces/logs',
    })
  })

  it('derives custom data directory children from the selected configuration root', () => {
    const configRoot = copyConfiguration('plugin-data-configuration-root-')
    try {
      const basePath = join(configRoot, 'base.json')
      const base = JSON.parse(readFileSync(basePath, 'utf8'))
      base.paths.savedMediaDirectory = `${base.paths.dataDir}/custom-media`
      writeFileSync(basePath, JSON.stringify(base), 'utf8')
      const profile = loadProfile('production', { configRoot, environment: {}, dataDirectory: '/Custom Data' })
      expect(profile.paths.savedMediaDirectory).toBe('/Custom Data/custom-media')
    } finally { rmSync(configRoot, { recursive: true, force: true }) }
  })

  it.each(['', 'relative/data', '/data\0suffix'])('rejects invalid plugin data directory %j with a configuration field', dataDirectory => {
    expect(() => loadProfile('production', { environment: {}, dataDirectory }))
      .toThrowError(expect.objectContaining({ name: 'ConfigurationProfileError', property: 'dataDirectory' }))
  })

  it('loads the production profile and applies declared environment overrides', () => {
    const profile = loadProfile('production', {
      configRoot: 'config',
      environment: {
        ...productionEnvironment,
        HARNESS_COMFYUI_CLIENT_RUN_REFRESH_INTERVAL_MS: '1200',
      },
    })

    expect(profile.configurationProfile).toBe('production')
    expect(profile.cliServer).toEqual({ host: '127.0.0.1', port: 0, shutdownTimeoutMs: 5000 })
    expect(profile.client.runRefreshIntervalMs).toBe(1200)
    expect(profile.source.catalogPort).toBe(18093)
    expect(profile.paths.dataDir).toBe('.local/production/data')
    expect(profile.paths.apiWorkflowCacheDirectory).toBe('.local/production/data/api-workflow-cache')
    expect(profile.comfyui.frontendCompiler).toEqual({
      browserExecutablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      instanceCacheEpoch: '1',
      timeoutMs: 120000,
      preReadiness: {
        devToolsPortMs: 10000,
        targetCreateMs: 10000,
        webSocketConnectMs: 10000,
        domainEnableMs: 10000,
        navigationMs: 10000,
        infrastructureAttempts: 2,
      },
    })
  })

  it.each([
    'HARNESS_COMFYUI_SERVER_HOST',
    'HARNESS_COMFYUI_SERVER_PORT',
    'HARNESS_COMFYUI_SKILL_DIR',
  ])('rejects retired configuration environment variable %s', key => {
    expect(() => loadProfile('production', {
      configRoot: 'config',
      environment: { [key]: 'retired-value' },
    })).toThrowError(expect.objectContaining({ property: key }))
  })

  it.each([
    ['HARNESS_COMFYUI_FRONTEND_DEVTOOLS_PORT_TIMEOUT_MS', '0', 'comfyui.frontendCompiler.preReadiness.devToolsPortMs'],
    ['HARNESS_COMFYUI_FRONTEND_TARGET_CREATE_TIMEOUT_MS', '1.5', 'comfyui.frontendCompiler.preReadiness.targetCreateMs'],
    ['HARNESS_COMFYUI_FRONTEND_INFRASTRUCTURE_ATTEMPTS', '3', 'comfyui.frontendCompiler.preReadiness.infrastructureAttempts'],
  ])('rejects invalid pre-readiness override %s=%s', (key, value, property) => {
    expect(() => loadProfile('production', {
      configRoot: 'config',
      environment: { ...productionEnvironment, [key]: value },
    })).toThrowError(expect.objectContaining({ property }))
  })

  it('reports the production file and property when an override is invalid', () => {
    expect(() => loadProfile('production', {
      configRoot: 'config',
      environment: {
        ...productionEnvironment,
        HARNESS_COMFYUI_FRONTEND_COMPILER_TIMEOUT_MS: 'not-a-number',
      },
    })).toThrowError(ConfigurationProfileError)

    try {
      loadProfile('production', {
        configRoot: 'config',
        environment: {
          ...productionEnvironment,
          HARNESS_COMFYUI_FRONTEND_COMPILER_TIMEOUT_MS: 'not-a-number',
        },
      })
    } catch (error) {
      expect(error).toMatchObject({
        profileName: 'production',
        property: 'comfyui.frontendCompiler.timeoutMs',
      })
      expect((error as Error).message).toContain('config/profiles/production.json')
      return
    }

    throw new Error('expected loadProfile to reject an invalid override value')
  })

  it('rejects a Configuration Profile that binds Harness Web outside loopback', () => {
    const temporaryConfigRoot = copyConfiguration('harness-comfyui-config-loopback-')
    try {
      const basePath = join(temporaryConfigRoot, 'base.json')
      const base = JSON.parse(readFileSync(basePath, 'utf8')) as { cliServer: { host: string } }
      base.cliServer.host = '0.0.0.0'
      writeFileSync(basePath, JSON.stringify(base), 'utf8')

      try {
        loadProfile('production', { configRoot: temporaryConfigRoot, environment: productionEnvironment })
      } catch (error) {
        expect(error).toMatchObject({
          profileName: 'production',
          property: 'cliServer.host',
        })
        return
      }

      throw new Error('expected a non-loopback Harness Web host to be rejected')
    } finally {
      rmSync(temporaryConfigRoot, { recursive: true, force: true })
    }
  })

  it('resolves installed plugin storage under the explicit Harness home', () => {
    const profile = loadProfile('production', {
      storageRoot: '/isolated Harness home',
      environment: {},
    })
    expect(profile.paths.dataDir).toBe('/isolated Harness home/data/plugins/harness-comfyui')
    expect(profile.paths.runRepositoryFile).toBe('/isolated Harness home/data/plugins/harness-comfyui/runs.sqlite')
    expect(profile.paths.savedMediaDirectory).toBe('/isolated Harness home/data/plugins/harness-comfyui/media')
  })

  it('retains an absolute user storage override in the installed plugin', () => {
    const profile = loadProfile('production', {
      storageRoot: '/isolated Harness home',
      environment: {
        HARNESS_COMFYUI_DATA_DIR: '/user data',
        HARNESS_COMFYUI_API_WORKFLOW_CACHE_DIRECTORY: '/user data/api-workflow-cache',
      },
    })
    expect(profile.paths.dataDir).toBe('/user data')
    expect(profile.paths.apiWorkflowCacheDirectory).toBe('/user data/api-workflow-cache')
  })

  it.each(['', 'relative-home'])('requires an absolute nonempty Host storage root: %s', storageRoot => {
    expect(() => loadProfile('production', { storageRoot, environment: {} }))
      .toThrowError(expect.objectContaining({ property: 'storageRoot' }))
  })

  it('requires the official API Workflow cache directory to be inside paths.dataDir', () => {
    expect(() => loadProfile('production', {
      configRoot: 'config',
      environment: {
        ...productionEnvironment,
        HARNESS_COMFYUI_API_WORKFLOW_CACHE_DIRECTORY: '.local/production/outside-cache',
      },
    })).toThrowError(expect.objectContaining({ property: 'paths.apiWorkflowCacheDirectory' }))
  })

  it('rejects an unknown JSON property with file and property evidence', () => {
    const temporaryConfigRoot = copyConfiguration('harness-comfyui-config-')
    try {
      const profilePath = join(temporaryConfigRoot, 'profiles', 'production.json')
      const profile = JSON.parse(readFileSync(profilePath, 'utf8')) as Record<string, unknown>
      profile.credential = 'must-not-be-accepted'
      writeFileSync(profilePath, JSON.stringify(profile), 'utf8')

      try {
        loadProfile('production', { configRoot: temporaryConfigRoot, environment: productionEnvironment })
      } catch (error) {
        expect(error).toMatchObject({
          profileName: 'production',
          property: 'credential',
          configPath: profilePath,
        })
        return
      }

      throw new Error('expected an unknown JSON property to be rejected')
    } finally {
      rmSync(temporaryConfigRoot, { recursive: true, force: true })
    }
  })

  it('reports a corrupt environment override file', () => {
    const temporaryConfigRoot = copyConfiguration('harness-comfyui-config-overrides-corrupt-')
    try {
      const overridesPath = join(temporaryConfigRoot, 'environment-overrides.json')
      writeFileSync(overridesPath, '{"HARNESS_COMFYUI_CATALOG_PORT":', 'utf8')

      try {
        loadProfile('production', { configRoot: temporaryConfigRoot, environment: productionEnvironment })
      } catch (error) {
        expect(error).toMatchObject({
          profileName: 'production',
          configPath: overridesPath,
          property: '<file>',
        })
        return
      }

      throw new Error('expected a corrupt environment override file to be rejected')
    } finally {
      rmSync(temporaryConfigRoot, { recursive: true, force: true })
    }
  })

  it('rejects an invalid environment override map value with key evidence', () => {
    const temporaryConfigRoot = copyConfiguration('harness-comfyui-config-overrides-invalid-')
    try {
      const overridesPath = join(temporaryConfigRoot, 'environment-overrides.json')
      const overrides = JSON.parse(readFileSync(overridesPath, 'utf8')) as Record<string, unknown>
      overrides.HARNESS_COMFYUI_CATALOG_PORT = 4199
      writeFileSync(overridesPath, JSON.stringify(overrides), 'utf8')

      try {
        loadProfile('production', { configRoot: temporaryConfigRoot, environment: productionEnvironment })
      } catch (error) {
        expect(error).toMatchObject({
          profileName: 'production',
          configPath: overridesPath,
          property: 'HARNESS_COMFYUI_CATALOG_PORT',
        })
        return
      }

      throw new Error('expected an invalid override map value to be rejected')
    } finally {
      rmSync(temporaryConfigRoot, { recursive: true, force: true })
    }
  })

  it('uses the schema dictionary as the JSON property allowlist', () => {
    const temporaryConfigRoot = copyConfiguration('harness-comfyui-config-schema-')
    const schemaDict = ConfigurationProfileSchema.dict!
    try {
      schemaDict.schemaOwnedFixtureField = Schema.string().required()
      const profilePath = join(temporaryConfigRoot, 'profiles', 'production.json')
      const profile = JSON.parse(readFileSync(profilePath, 'utf8')) as Record<string, unknown>
      profile.schemaOwnedFixtureField = 'accepted-from-schema'
      writeFileSync(profilePath, JSON.stringify(profile), 'utf8')

      const loaded = loadProfile('production', {
        configRoot: temporaryConfigRoot,
        environment: productionEnvironment,
      }) as unknown as Record<string, unknown>
      expect(loaded.schemaOwnedFixtureField).toBe('accepted-from-schema')
    } finally {
      delete schemaDict.schemaOwnedFixtureField
      rmSync(temporaryConfigRoot, { recursive: true, force: true })
    }
  })

  it('resolves default configuration from the package instead of the process cwd', () => {
    const pollutedCwd = mkdtempSync(join(tmpdir(), 'harness-comfyui-polluted-cwd-'))
    try {
      mkdirSync(join(pollutedCwd, 'config/profiles'), { recursive: true })
      cpSync(resolve('config'), join(pollutedCwd, 'config'), { recursive: true })
      const pollutedPath = join(pollutedCwd, 'config/profiles/production.json')
      const polluted = JSON.parse(readFileSync(pollutedPath, 'utf8')) as { comfyui: { defaultInstanceId: string } }
      polluted.comfyui.defaultInstanceId = 'polluted-config'
      writeFileSync(pollutedPath, JSON.stringify(polluted), 'utf8')
      const moduleUrl = pathToFileURL(resolve('src/config/load-profile.ts')).href
      const result = spawnSync(process.execPath, [
        '--input-type=module',
        '--eval',
        `const { loadProfile } = await import(${JSON.stringify(moduleUrl)}); process.stdout.write(loadProfile('production', { environment: ${JSON.stringify(productionEnvironment)} }).comfyui.defaultInstanceId)`,
      ], { cwd: pollutedCwd, encoding: 'utf8', shell: false })

      expect({ status: result.status, stderr: result.stderr, stdout: result.stdout }).toEqual({
        status: 0,
        stderr: '',
        stdout: 'production',
      })
    } finally {
      rmSync(pollutedCwd, { recursive: true, force: true })
    }
  })

  it('rejects unlisted Harness ComfyUI environment variables', () => {
    try {
      loadProfile('production', {
        configRoot: 'config',
        environment: { ...productionEnvironment, HARNESS_COMFYUI_UNLISTED: 'unexpected' },
      })
    } catch (error) {
      expect(error).toMatchObject({
        profileName: 'production',
        property: 'HARNESS_COMFYUI_UNLISTED',
      })
      return
    }

    throw new Error('expected an unlisted environment variable to be rejected')
  })

  it('rejects every Configuration Profile name except production', () => {
    try {
      loadProfile('invalid', { configRoot: 'config', environment: {} })
    } catch (error) {
      expect(error).toMatchObject({
        profileName: 'invalid',
        property: 'profileName',
      })
      expect((error as Error).message).toContain('expected production')
      return
    }

    throw new Error('expected an unknown profile name to be rejected')
  })

  it('defines the complete Configuration Profile field set', () => {
    const schemaDict = ConfigurationProfileSchema.dict!
    expect(Object.keys(schemaDict)).toEqual([
      'paths',
      'comfyui',
      'source',
      'jobs',
      'media',
      'client',
      'cliServer',
    ])
    expect(Object.keys(schemaDict.paths.dict!)).toEqual([
      'dataDir',
      'apiWorkflowCacheDirectory',
      'runRepositoryFile',
      'runDirectory',
      'savedMediaDirectory',
      'logDirectory',
    ])
    expect(Object.keys(schemaDict.comfyui.dict!)).toEqual(['defaultInstanceId', 'frontendCompiler'])
    expect(Object.keys(schemaDict.comfyui.dict!.frontendCompiler!.dict!)).toEqual([
      'browserExecutablePath',
      'instanceCacheEpoch',
      'timeoutMs',
      'preReadiness',
    ])
    expect(Object.keys(schemaDict.comfyui.dict!.frontendCompiler!.dict!.preReadiness!.dict!)).toEqual([
      'devToolsPortMs',
      'targetCreateMs',
      'webSocketConnectMs',
      'domainEnableMs',
      'navigationMs',
      'infrastructureAttempts',
    ])
    expect(Object.keys(schemaDict.source.dict!)).toEqual(['catalogPort'])
    expect(Object.keys(schemaDict.jobs.dict!)).toEqual(['pollIntervalMs', 'missingObservationMs'])
    expect(Object.keys(schemaDict.media.dict!)).toEqual(['maxFileBytes'])
    expect(Object.keys(schemaDict.client.dict!)).toEqual(['runRefreshIntervalMs'])
  })
})
