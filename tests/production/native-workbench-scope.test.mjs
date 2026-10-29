import { execFile as execFileCallback } from 'node:child_process'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const execFile = promisify(execFileCallback)
const repositoryRoot = resolve(import.meta.dirname, '../..')
const { application } = JSON.parse(await readFile(resolve(repositoryRoot, 'config/desktop-e2e.json'), 'utf8'))

describe('official workbench Preset assembly', () => {
  it.each([
    ['jobs', 'notifies the owner of Run completion and preserves Runs after observation cancellation'],
    ['goal', 'executes native Goal tools and commands within the workbench lifecycle'],
    ['inheritance', 'applies native tool selection in standing, parent, and child scopes'],
    ['lateRegistration', 'activates before optional global tools and restricts their later registrations'],
    ['lifecycle', 'retains active generations and releases them before reload'],
    ['failure', 'cleans failed activation before the same Preset is registered again'],
    ['prompt', 'uses the workbench persona and retains execution context for parent and child'],
    ['skills', 'reads packaged business Skills without global and workspace discovery'],
    ['customSkills', 'uses explicitly configured user Skill directories alongside packaged Skills'],
  ])('%s: %s', async (scenario) => {
    const { stdout } = await execFile(resolve(application.bundlePath, application.executableRelativePath), [
      resolve(import.meta.dirname, 'fixtures/native-workbench-preset-runtime.mjs'), scenario,
      resolve(application.bundlePath, 'Contents/Resources/app.asar/dsh/package.json'),
    ], { cwd: repositoryRoot, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
    expect(JSON.parse(stdout)).toEqual({ scenario, passed: true })
  })
})
