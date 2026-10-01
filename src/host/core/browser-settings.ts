import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import {
  parseBrowserExecutablePathRequest,
  type BrowserExecutablePathRequest,
  type BrowserExecutablePathResult,
} from '../../browser-settings-schema.ts'

export async function validateBrowserExecutable(
  request: BrowserExecutablePathRequest,
  signal: AbortSignal,
): Promise<BrowserExecutablePathResult> {
  const value = parseBrowserExecutablePathRequest(request)
  signal.throwIfAborted()
  try {
    const file = await stat(value.browserExecutablePath)
    if (!file.isFile()) throw new TypeError('The browser path points to a directory or another file type; select the Chrome or Chromium executable file.')
    await access(value.browserExecutablePath, constants.X_OK)
  } catch (error) {
    signal.throwIfAborted()
    return {
      ok: false,
      error: {
        code: 'BROWSER_EXECUTABLE_PATH_UNAVAILABLE',
        path: value.browserExecutablePath,
        reason: error instanceof Error ? error.message : String(error),
      },
    }
  }
  signal.throwIfAborted()
  return { ok: true, value }
}
