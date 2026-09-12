import { afterEach, expect, it, vi } from 'vitest'

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal()
  return Object.fromEntries(Object.entries(actual).map(([key, value]) => [key,
    typeof value === 'function' ? vi.fn(value) : value]))
})
vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, spawn: vi.fn(), execFile: vi.fn(), spawnSync: vi.fn() }
})

afterEach(() => vi.restoreAllMocks())

it.each([
  ['../../scripts/desktop/cli.mjs', ['', 'start', 'stop', 'restart', 'status', 'logs']],
  ['../../scripts/desktop/production-cli.mjs', ['', 'start', 'stop', 'restart', 'status', 'logs']],
  ['../../scripts/worktree/cli.mjs', ['', 'start', 'stop', 'restart', 'status', 'logs', 'health']],
  ['../../scripts/production/cli.mjs', ['', 'start', 'stop', 'restart', 'status', 'logs', 'health']],
  ['../../scripts/cli/run.mjs', ['']],
])('%s help performs no filesystem or process lifecycle operations', async (path, commands) => {
  const { main } = await import(path)
  const fs = await import('node:fs/promises')
  const processTools = await import('node:child_process')
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  for (const command of commands) {
    vi.clearAllMocks()
    await main([...(command ? [command] : []), '--help'])
    for (const value of Object.values(fs)) if (vi.isMockFunction(value)) expect(value).not.toHaveBeenCalled()
    for (const name of ['spawn', 'execFile', 'spawnSync']) expect(processTools[name]).not.toHaveBeenCalled()
    expect(process.stdout.write).toHaveBeenCalled()
    expect(process.stderr.write).not.toHaveBeenCalled()
  }
})
