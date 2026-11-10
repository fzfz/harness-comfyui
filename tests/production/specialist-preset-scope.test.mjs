import { execFile as execFileCallback } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execute = promisify(execFileCallback)
const root = resolve(import.meta.dirname, '../..')
const { application } = JSON.parse(await readFile(resolve(root, 'config/desktop-e2e.json'), 'utf8'))

describe('official specialist preset assembly', () => {
  it('mounts each role independently and under a parent with only its declared tools, Skills and whole MCP services', async () => {
    const { stdout } = await execute(resolve(application.bundlePath, application.executableRelativePath), [
      resolve(import.meta.dirname, 'fixtures/specialist-preset-runtime.mjs'),
      resolve(application.bundlePath, 'Contents/Resources/app.asar/dsh/package.json'),
    ], { cwd: root, encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
    expect(JSON.parse(stdout)).toEqual({ roles: 7, standalone: 7, child: 7, released: true })
  }, 30_000)
})
