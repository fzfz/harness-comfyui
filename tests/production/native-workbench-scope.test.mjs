import { execFile as execFileCallback } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const execFile = promisify(execFileCallback)
const repositoryRoot = resolve(import.meta.dirname, '../..')

describe('official workbench Preset assembly', () => {
  it.each([
    ['inheritance', 'inherits Host and Preset tools in standing, parent, and child scopes'],
    ['lifecycle', 'retains active generations and releases them before reload'],
    ['failure', 'cleans failed activation before the same Preset is registered again'],
    ['prompt', 'preserves Host sections, runtime context, variables, and parent-child tool assembly'],
  ])('%s: %s', async (scenario) => {
    const { stdout } = await execFile(process.execPath, [
      resolve(import.meta.dirname, 'fixtures/native-workbench-preset-runtime.mjs'), scenario,
    ], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(JSON.parse(stdout)).toEqual({ scenario, passed: true })
  })
})
