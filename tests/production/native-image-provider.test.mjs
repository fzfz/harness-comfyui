import { execFile as execFileCallback } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const execFile = promisify(execFileCallback)
const repositoryRoot = resolve(import.meta.dirname, '../..')
const { application } = JSON.parse(await readFile(resolve(repositoryRoot, 'config/desktop-e2e.json'), 'utf8'))

describe('official native image Provider protocol', () => {
  it.each([
    ['success', 'stop'],
    ['max-tokens', 'max-tokens'],
    ['cancel', 'aborted'],
    ['auth', 'error'],
    ['interrupted', 'error'],
    ['disconnected', 'error'],
  ])('%s: sends an admitted image through the installed Provider', async (scenario, finishKind) => {
    const { stdout } = await execFile(resolve(application.bundlePath, application.executableRelativePath), [
      resolve(import.meta.dirname, 'fixtures/native-image-provider-runtime.mjs'), scenario,
      resolve(application.bundlePath, 'Contents/Resources/app.asar/dsh/package.json'),
    ], {
      cwd: repositoryRoot, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      encoding: 'utf8', timeout: 20_000, maxBuffer: 1024 * 1024,
    })
    const result = JSON.parse(stdout)
    expect(result.scenario).toBe(scenario)
    expect(result.settingsConfigured).toBe(true)
    expect(result.requestCount).toBe(1)
    expect(result.request).toMatchObject({
      method: 'POST', path: '/v1/chat/completions', authorizationMatches: true,
      body: { model: 'fixture-vision', stream: true, temperature: 0.35 },
    })
    expect(result.request.body.max_tokens ?? result.request.body.max_completion_tokens).toBe(256)
    expect(result.request.images).toEqual([expect.objectContaining({ mediaType: 'image/png', width: 2, height: 2 })])
    expect(result.request.images[0].bytes).toBeGreaterThan(0)
    expect(result.runtime.applicationVersion).toBe(application.version)
    expect(result.runtime.buildCommit).toMatch(/^[0-9a-f]{40}$/u)
    expect(result.finish.kind).toBe(finishKind)
    expect(result.portReleased).toBe(true)
    if (scenario === 'success') expect(result.text).toBe('Native image observation')
    if (scenario === 'max-tokens') expect(result.text).toBe('Truncated image observation')
    if (scenario === 'cancel') expect(result.responseClosed).toBe(true)
    if (scenario === 'auth') expect(result.finish.failure.code).toBe('AUTH')
    if (scenario === 'interrupted' || scenario === 'disconnected') expect(result.finish.failure.code).toBe('TRANSPORT')
  }, 25_000)
})
