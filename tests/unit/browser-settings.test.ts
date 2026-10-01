import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'

import { BrowserSettingsRemoteService } from '../../src/host/core/browser-settings-service.ts'
import { validateBrowserExecutable } from '../../src/host/core/browser-settings.ts'
import { parseBrowserExecutablePathRequest, parseBrowserExecutablePathResult } from '../../src/browser-settings-schema.ts'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('browser executable settings validation', () => {
  it('returns the current Browser path from each configuration request', async () => {
    let currentPath = '/Applications/Configured Browser/browser'
    const ctx = new Context()
    const service = new BrowserSettingsRemoteService(ctx, () => currentPath)
    try {
      await expect(service.configuration(new AbortController().signal))
        .resolves.toEqual({ browserExecutablePath: '/Applications/Configured Browser/browser' })

      currentPath = '/Applications/Saved Browser/browser'

      await expect(service.configuration(new AbortController().signal))
        .resolves.toEqual({ browserExecutablePath: '/Applications/Saved Browser/browser' })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('accepts an accessible executable at an absolute path containing spaces', async () => {
    const root = await mkdtemp(join(tmpdir(), 'comfyui-browser-settings-'))
    directories.push(root)
    const path = join(root, 'Browser With Spaces')
    await writeFile(path, '#!/bin/sh\nexit 0\n')
    await chmod(path, 0o700)
    await expect(validateBrowserExecutable({ browserExecutablePath: path }, new AbortController().signal))
      .resolves.toEqual({ ok: true, value: { browserExecutablePath: path } })
  })

  it('returns the missing path and filesystem reason so the draft can be corrected', async () => {
    const root = await mkdtemp(join(tmpdir(), 'comfyui-browser-settings-'))
    directories.push(root)
    const path = join(root, 'missing-browser')
    const result = await validateBrowserExecutable({ browserExecutablePath: path }, new AbortController().signal)
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'BROWSER_EXECUTABLE_PATH_UNAVAILABLE', path },
    })
    if (!result.ok) expect(result.error.reason).toContain('ENOENT')
  })

  it('rejects a relative browser path before filesystem validation', () => {
    expect(() => parseBrowserExecutablePathRequest({ browserExecutablePath: 'relative/browser' }))
      .toThrow()
  })

  it('rejects unknown fields in a browser validation request', () => {
    expect(() => parseBrowserExecutablePathRequest({ browserExecutablePath: '/browser', ignored: true }))
      .toThrow()
  })

  it.each([null, [], {}, { browserExecutablePath: '' }, { browserExecutablePath: '/browser\0suffix' }])(
    'rejects malformed browser setting %j', value => {
      expect(() => parseBrowserExecutablePathRequest(value)).toThrow()
    },
  )

  it('reports a directory as unavailable without changing it', async () => {
    const path = await mkdtemp(join(tmpdir(), 'comfyui-browser-directory-'))
    directories.push(path)
    await expect(validateBrowserExecutable({ browserExecutablePath: path }, new AbortController().signal))
      .resolves.toMatchObject({ ok: false, error: { code: 'BROWSER_EXECUTABLE_PATH_UNAVAILABLE', path } })
  })

  it('reports a file without executable permission as unavailable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'comfyui-browser-permission-'))
    directories.push(root)
    const path = join(root, 'browser')
    await writeFile(path, 'browser', { mode: 0o600 })
    const result = await validateBrowserExecutable({ browserExecutablePath: path }, new AbortController().signal)
    expect(result).toMatchObject({ ok: false, error: { code: 'BROWSER_EXECUTABLE_PATH_UNAVAILABLE', path } })
    if (!result.ok) expect(result.error.reason).toContain('EACCES')
  })

  it('preserves cancellation instead of returning a path failure', async () => {
    await expect(validateBrowserExecutable({ browserExecutablePath: '/missing-browser' }, AbortSignal.abort()))
      .rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('browser validation wire result', () => {
  it.each([
    { ok: true, value: { browserExecutablePath: '/browser with spaces' } },
    { ok: false, error: { code: 'BROWSER_EXECUTABLE_PATH_UNAVAILABLE', path: '/browser', reason: 'EACCES: permission denied' } },
  ])('retains a valid result %j', value => {
    expect(parseBrowserExecutablePathResult(value)).toEqual(value)
  })

  it.each([
    null, [], {},
    { ok: true, value: { browserExecutablePath: 'relative' } },
    { ok: true, value: { browserExecutablePath: '/browser' }, ignored: true },
    { ok: false, error: null },
    { ok: false, error: { code: 'UNKNOWN', path: '/browser', reason: 'missing' } },
    { ok: false, error: { code: 'BROWSER_EXECUTABLE_PATH_UNAVAILABLE', path: 'relative', reason: 'missing' } },
    { ok: false, error: { code: 'BROWSER_EXECUTABLE_PATH_UNAVAILABLE', path: '/browser', reason: ' ' } },
    { ok: false, error: { code: 'BROWSER_EXECUTABLE_PATH_UNAVAILABLE', path: '/browser', reason: 'missing', ignored: true } },
    { ok: false, error: { code: 'BROWSER_EXECUTABLE_PATH_UNAVAILABLE', reason: 'missing' }, value: {} },
  ])('rejects a malformed result %j', value => {
    expect(() => parseBrowserExecutablePathResult(value)).toThrow(TypeError)
  })
})
