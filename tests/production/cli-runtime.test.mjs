import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, writeFile, readlink, rm, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import configuration from '../../config/cli-runtime.json' with { type: 'json' }
import profile from '../../profiles/comfyui-cli/package.json' with { type: 'json' }
import { parseCliRuntime } from '../../config/cli-runtime-schema.mjs'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), cli: vi.fn(), host: vi.fn(), profile: vi.fn(), preset: vi.fn(), presetPatch: vi.fn(), product: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
vi.mock('../../scripts/production/cli-module.mjs', () => ({ materializeSourceCliModule: mocks.cli }))
vi.mock('../../scripts/production/host-module.mjs', () => ({ materializeSourceHostModule: mocks.host }))
vi.mock('../../scripts/profile/source.mjs', () => ({ materializeSourceProfile: mocks.profile }))
vi.mock('../../scripts/profile/agent-preset.mjs', () => ({ materializeSourceProductAgentPreset: mocks.preset, materializeDeclaredAgentPresetPatch: mocks.presetPatch }))
vi.mock('../../scripts/profile/product-agent-config.mjs', () => ({ loadProductAgentConfiguration: mocks.product }))
import { prepareCliRuntime, runCliProcess } from '../../scripts/cli/run.mjs'

const roots = []
afterEach(async () => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cli-launch-')))
  roots.push(root)
  await writeFile(join(root, 'package.json'), '{}')
  for (const [name, version] of Object.entries(profile.dependencies)) {
    const directory = join(root, 'node_modules', name)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version }))
  }
  mocks.profile.mockResolvedValue({ profileDirectory: join(root, 'profile') })
  mocks.preset.mockResolvedValue({ presets: [] })
  mocks.product.mockResolvedValue({ repositorySkillsEnvironmentVariable: 'HARNESS_COMFYUI_SKILL_DIR', repositorySkillsRoot: join(root, '.agents/skills') })
  return root
}

describe('pure CLI startup', () => {
  it('prepares the declared Profile and isolates managed environment values', async () => {
    const root = await fixture()
    vi.stubEnv('HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH', '/ambient-workspace')
    vi.stubEnv('HARNESS_COMFYUI_DATA_DIR', '/ambient-data')
    vi.stubEnv('CLI_TEST_PROVIDER_KEY', 'retained-test-value')
    const runtime = await prepareCliRuntime(root)
    expect(mocks.host).toHaveBeenCalledWith(root, { web: false })
    expect(mocks.cli).toHaveBeenCalledWith(root)
    expect(mocks.profile).toHaveBeenCalledWith(root, join(root, configuration.runtimeRelativeRoot, 'dsh-home'), { profileName: configuration.profile, userEnvironmentFilePath: join(root, '.env') })
    expect(mocks.presetPatch).toHaveBeenCalledWith({ presets: [] }, join(root, 'profile'))
    expect(runtime.environment.HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH).toBeUndefined()
    expect(runtime.environment.HARNESS_COMFYUI_DATA_DIR).toBe(join(root, configuration.runtimeRelativeRoot, 'data'))
    expect(runtime.environment.CLI_TEST_PROVIDER_KEY).toBe('retained-test-value')
    expect(runtime.environment.HARNESS_COMFYUI_SKILL_DIR).toBe(join(root, '.agents/skills'))
    expect(await readlink(join(root, 'profile/node_modules/@deepseek-ai/dsh-base'))).toBe(join(root, 'node_modules/@deepseek-ai/dsh-base'))
    await expect(prepareCliRuntime(root)).resolves.toMatchObject({ executable: runtime.executable })
  })
  it('rejects wrong DSH versions before building', async () => {
    const root = await fixture()
    await writeFile(join(root, 'node_modules/@deepseek-ai/dsh/package.json'), JSON.stringify({ version: '0.0.1' }))
    await expect(prepareCliRuntime(root)).rejects.toThrow('requires 0.1.7-rc.2')
    expect(mocks.host).not.toHaveBeenCalled()
  })
  it('rejects wrong existing bundle links', async () => {
    const root = await fixture()
    const directory = join(root, 'profile/node_modules/@deepseek-ai')
    await mkdir(directory, { recursive: true })
    await symlink(join(root, 'node_modules/@deepseek-ai/dsh'), join(directory, 'dsh-base'))
    await expect(prepareCliRuntime(root)).rejects.toThrow('Recreate this Profile dependency link')
  })
  it('propagates preparation failures', async () => {
    const root = await fixture()
    mocks.host.mockRejectedValue(new Error('build failed'))
    await expect(prepareCliRuntime(root)).rejects.toThrow('build failed')
    expect(mocks.profile).not.toHaveBeenCalled()
  })
  it.each([0, 7, null])('returns child exit status %s and removes signal listeners', async code => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() })
    mocks.spawn.mockReturnValue(child)
    const previous = process.listenerCount('SIGINT')
    const run = runCliProcess({ executable: '/dsh/lib/bin.js', environment: {} }, ['task'])
    expect(mocks.spawn).toHaveBeenCalledWith(process.execPath, ['/dsh/lib/bin.js', '--profile', configuration.profile, 'task'], { stdio: 'inherit', env: {} })
    process.emit('SIGINT')
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    child.emit('exit', code)
    await expect(run).resolves.toBe(code ?? 1)
    expect(process.listenerCount('SIGINT')).toBe(previous)
  })
  it('propagates spawn errors and removes handlers', async () => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() })
    mocks.spawn.mockReturnValue(child)
    const previous = process.listenerCount('SIGTERM')
    const run = runCliProcess({ executable: '/missing', environment: {} }, [])
    child.emit('error', new Error('ENOENT'))
    await expect(run).rejects.toThrow('ENOENT')
    expect(process.listenerCount('SIGTERM')).toBe(previous)
  })
  it('validates the runtime path definition', () => {
    expect(parseCliRuntime(configuration)).toEqual(configuration)
    for (const path of ['/outside', '../outside', 'data/../../outside']) expect(() => parseCliRuntime({ ...configuration, runtimeRelativeRoot: path })).toThrow()
  })
})
