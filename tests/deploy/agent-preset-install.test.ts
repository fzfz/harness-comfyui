import { copyFile, cp, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

// @ts-expect-error The product installer exposes this checked-in deployment seam.
import { materializeProductAgentFiles } from '../../scripts/deploy/install.mjs'
// @ts-expect-error The lifecycle starts through this checked-in public readiness seam.
import { parseProductAgentConfig, validateProductAgentRelease } from '../../scripts/deploy/preflight.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const temporaryRoots: string[] = []

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'harness-agent-preset-install-'))
  temporaryRoots.push(root)
  const packageRoot = join(root, 'package')
  const releaseRoot = join(root, 'release')
  await mkdir(packageRoot, { recursive: true })
  await mkdir(releaseRoot, { recursive: true })
  await mkdir(join(packageRoot, 'agent-presets/harness-comfyui'), { recursive: true })
  await writeFile(join(packageRoot, 'agent-presets/harness-comfyui/preset.yml'), 'name: fixture\n', 'utf8')
  await writeFile(join(packageRoot, 'agent-presets/harness-comfyui/agent.cordis.yml'), 'rows: []\n', 'utf8')
  const productAgent = JSON.parse(await readFile(join(repositoryRoot, 'config/product-agent.json'), 'utf8'))
  return { root, packageRoot, releaseRoot, productAgent }
}

async function createReadinessFixture() {
  const fixture = await createFixture()
  await mkdir(join(fixture.packageRoot, 'lib'), { recursive: true })
  await mkdir(join(fixture.packageRoot, 'config'), { recursive: true })
  await mkdir(join(fixture.packageRoot, 'profiles/comfyui-workbench'), { recursive: true })
  await copyFile(join(repositoryRoot, 'package.json'), join(fixture.packageRoot, 'package.json'))
  await copyFile(join(repositoryRoot, 'lib/agent.js'), join(fixture.packageRoot, 'lib/agent.js'))
  await copyFile(join(repositoryRoot, 'config/product-agent.json'), join(fixture.packageRoot, 'config/product-agent.json'))
  await copyFile(
    join(repositoryRoot, 'profiles/comfyui-workbench/cordis.patch.yml'),
    join(fixture.packageRoot, 'profiles/comfyui-workbench/cordis.patch.yml'),
  )
  await mkdir(join(fixture.packageRoot, 'skills'), { recursive: true })
  await cp(fixture.packageRoot, join(fixture.releaseRoot, 'package'), { recursive: true })
  await materializeProductAgentFiles(join(fixture.releaseRoot, 'package'), fixture.releaseRoot, fixture.productAgent)
  return fixture
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('release-local Agent artifact materialization seam', () => {
  it.each([
    ['symlink', async (fixture: Awaited<ReturnType<typeof createFixture>>) => {
      await mkdir(join(fixture.releaseRoot, 'dsh-home/.agent-presets'), { recursive: true })
      await symlink('/tmp/harness-agent-preset-target', join(fixture.releaseRoot, 'dsh-home/.agent-presets/harness-comfyui'))
    }],
    ['non-directory', async (fixture: Awaited<ReturnType<typeof createFixture>>) => {
      await mkdir(join(fixture.releaseRoot, 'dsh-home/.agent-presets'), { recursive: true })
      await writeFile(join(fixture.releaseRoot, 'dsh-home/.agent-presets/harness-comfyui'), 'occupied\n', 'utf8')
    }],
  ])('rejects a %s Preset target', async (_name, prepare) => {
    const fixture = await createFixture()
    await prepare(fixture)

    await expect(materializeProductAgentFiles(fixture.packageRoot, fixture.releaseRoot, fixture.productAgent))
      .rejects.toMatchObject({ message: expect.stringMatching(/Preset target/) })
  })

  it.each([
    ['symlink', async (fixture: Awaited<ReturnType<typeof createFixture>>) => {
      await symlink('/tmp/harness-agent-skill-target', join(fixture.packageRoot, 'skills'))
    }],
    ['non-directory', async (fixture: Awaited<ReturnType<typeof createFixture>>) => {
      await writeFile(join(fixture.packageRoot, 'skills'), 'occupied\n', 'utf8')
    }],
  ])('rejects a %s Skill target', async (_name, prepare) => {
    const fixture = await createFixture()
    await prepare(fixture)

    await expect(materializeProductAgentFiles(fixture.packageRoot, fixture.releaseRoot, fixture.productAgent))
      .rejects.toMatchObject({ message: expect.stringMatching(/Skill target/) })
  })

  it('materializes the missing Skill directory and copies the Preset into the release root only', async () => {
    const fixture = await createFixture()

    await expect(materializeProductAgentFiles(fixture.packageRoot, fixture.releaseRoot, fixture.productAgent))
      .resolves.toMatchObject({
        presetTarget: join(fixture.releaseRoot, 'dsh-home/.agent-presets/harness-comfyui'),
        skillTarget: join(fixture.packageRoot, 'skills'),
      })
    const skillStats = await lstat(join(fixture.packageRoot, 'skills'))
    expect(skillStats.isDirectory()).toBe(true)
    await expect(readFile(join(fixture.releaseRoot, 'dsh-home/.agent-presets/harness-comfyui/preset.yml'), 'utf8'))
      .resolves.toBe('name: fixture\n')
    for (const relativePath of ['dsh-home/skills', '.dsh/skills', '.agents/skills']) {
      await expect(lstat(join(fixture.releaseRoot, relativePath))).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })

  it('materializes the fixed opencode-go Agent model overlay into the release DSH home', async () => {
    const fixture = await createFixture()
    expect(fixture.productAgent.agentModel).toEqual({
      provider: 'opencode-go',
      model: 'deepseek-v4-flash',
      reasoningEffort: 'max',
      apiKeyEnv: 'OPENCODE_GO_API_KEY',
    })

    await materializeProductAgentFiles(fixture.packageRoot, fixture.releaseRoot, fixture.productAgent)

    await expect(readFile(join(fixture.releaseRoot, 'dsh-home/settings.yaml'), 'utf8')).resolves.toBe(
      'agent-default-model:\n'
      + '  provider: opencode-go\n'
      + '  model: deepseek-v4-flash\n'
      + '  reasoningEffort: max\n'
      + 'llm-pi-ai:\n'
      + '  providers:\n'
      + '    opencode-go:\n'
      + '      apiKeyEnv: OPENCODE_GO_API_KEY\n',
    )
  })

  it.each([
    ['provider', { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'max', apiKeyEnv: 'DEEPSEEK_API_KEY' }],
    ['credential', { provider: 'opencode-go', model: 'deepseek-v4-flash', reasoningEffort: 'max', apiKeyEnv: 'DEEPSEEK_API_KEY' }],
  ])('rejects a non-opencode-go Agent model %s', (_label, agentModel) => {
    const value = JSON.parse(JSON.stringify({
      agentPresetId: 'harness-comfyui',
      agentPresetArtifactRelativeRoot: 'agent-presets',
      agentPresetInstallRelativeRoot: 'dsh-home/.agent-presets',
      skillRelativeRoot: 'skills',
      agentPluginExport: './agent',
      sessionListConvergenceTimeoutMs: 10000,
      agentModel,
    }))
    expect(() => parseProductAgentConfig(value)).toThrow(/must select exactly opencode-go/u)
  })

  it.each([
    ['missing', async (fixture: Awaited<ReturnType<typeof createReadinessFixture>>) => {
      await rm(join(fixture.releaseRoot, 'dsh-home/.agent-presets/harness-comfyui'), { recursive: true, force: true })
    }],
    ['symlink', async (fixture: Awaited<ReturnType<typeof createReadinessFixture>>) => {
      const target = join(fixture.releaseRoot, 'dsh-home/.agent-presets/harness-comfyui')
      await rm(target, { recursive: true, force: true })
      await symlink('/tmp/harness-agent-readiness-preset', target)
    }],
    ['non-directory', async (fixture: Awaited<ReturnType<typeof createReadinessFixture>>) => {
      const target = join(fixture.releaseRoot, 'dsh-home/.agent-presets/harness-comfyui')
      await rm(target, { recursive: true, force: true })
      await writeFile(target, 'occupied\n', 'utf8')
    }],
  ])('rejects a %s release Preset root before a Host spawn', async (_name, prepare) => {
    const fixture = await createReadinessFixture()
    await prepare(fixture)

    await expect(validateProductAgentRelease(fixture.releaseRoot))
      .rejects.toMatchObject({ message: expect.stringMatching(/Preset release root/) })
  })

  it.each([
    ['missing', async (fixture: Awaited<ReturnType<typeof createReadinessFixture>>) => {
      await rm(join(fixture.releaseRoot, 'dsh-home/.agent-presets/harness-comfyui/preset.yml'))
    }],
    ['symlink', async (fixture: Awaited<ReturnType<typeof createReadinessFixture>>) => {
      const target = join(fixture.releaseRoot, 'dsh-home/.agent-presets/harness-comfyui/preset.yml')
      await rm(target)
      await symlink('/tmp/harness-agent-readiness-preset.yml', target)
    }],
    ['non-regular', async (fixture: Awaited<ReturnType<typeof createReadinessFixture>>) => {
      const target = join(fixture.releaseRoot, 'dsh-home/.agent-presets/harness-comfyui/preset.yml')
      await rm(target)
      await mkdir(target)
    }],
  ])('rejects a %s release preset.yml before a Host spawn', async (_name, prepare) => {
    const fixture = await createReadinessFixture()
    await prepare(fixture)

    await expect(validateProductAgentRelease(fixture.releaseRoot))
      .rejects.toMatchObject({ message: expect.stringMatching(/Preset release preset\.yml/) })
  })

  it.each([
    ['missing', async (fixture: Awaited<ReturnType<typeof createReadinessFixture>>) => {
      await rm(join(fixture.releaseRoot, 'dsh-home/.agent-presets/harness-comfyui/agent.cordis.yml'))
    }],
    ['symlink', async (fixture: Awaited<ReturnType<typeof createReadinessFixture>>) => {
      const target = join(fixture.releaseRoot, 'dsh-home/.agent-presets/harness-comfyui/agent.cordis.yml')
      await rm(target)
      await symlink('/tmp/harness-agent-readiness-cordis.yml', target)
    }],
    ['non-regular', async (fixture: Awaited<ReturnType<typeof createReadinessFixture>>) => {
      const target = join(fixture.releaseRoot, 'dsh-home/.agent-presets/harness-comfyui/agent.cordis.yml')
      await rm(target)
      await mkdir(target)
    }],
  ])('rejects a %s release agent.cordis.yml before a Host spawn', async (_name, prepare) => {
    const fixture = await createReadinessFixture()
    await prepare(fixture)

    await expect(validateProductAgentRelease(fixture.releaseRoot))
      .rejects.toMatchObject({ message: expect.stringMatching(/Preset release agent\.cordis\.yml/) })
  })

  it.each([
    ['missing', async (fixture: Awaited<ReturnType<typeof createReadinessFixture>>) => {
      await rm(join(fixture.releaseRoot, 'package/lib/agent.js'))
    }],
    ['symlink', async (fixture: Awaited<ReturnType<typeof createReadinessFixture>>) => {
      const target = join(fixture.releaseRoot, 'package/lib/agent.js')
      await rm(target)
      await symlink('/tmp/harness-agent-readiness-bundle.js', target)
    }],
    ['non-regular', async (fixture: Awaited<ReturnType<typeof createReadinessFixture>>) => {
      const target = join(fixture.releaseRoot, 'package/lib/agent.js')
      await rm(target)
      await mkdir(target)
    }],
  ])('rejects a %s Agent bundle before a Host spawn', async (_name, prepare) => {
    const fixture = await createReadinessFixture()
    await prepare(fixture)

    await expect(validateProductAgentRelease(fixture.releaseRoot))
      .rejects.toMatchObject({ message: expect.stringMatching(/Agent bundle/) })
  })

  it.each([
    ['missing', async (fixture: Awaited<ReturnType<typeof createReadinessFixture>>) => {
      await rm(join(fixture.releaseRoot, 'package/skills'), { recursive: true, force: true })
    }],
    ['symlink', async (fixture: Awaited<ReturnType<typeof createReadinessFixture>>) => {
      const target = join(fixture.releaseRoot, 'package/skills')
      await rm(target, { recursive: true, force: true })
      await symlink('/tmp/harness-agent-readiness-skills', target)
    }],
    ['non-directory', async (fixture: Awaited<ReturnType<typeof createReadinessFixture>>) => {
      const target = join(fixture.releaseRoot, 'package/skills')
      await rm(target, { recursive: true, force: true })
      await writeFile(target, 'occupied\n', 'utf8')
    }],
  ])('rejects a %s release Skill root before a Host spawn', async (_name, prepare) => {
    const fixture = await createReadinessFixture()
    await prepare(fixture)

    await expect(validateProductAgentRelease(fixture.releaseRoot))
      .rejects.toMatchObject({ message: expect.stringMatching(/Skill root/) })
  })

  it.each([
    ['configuration drift', async (fixture: Awaited<ReturnType<typeof createReadinessFixture>>) => {
      await writeFile(join(fixture.releaseRoot, 'package/config/product-agent.json'), `${JSON.stringify({
        ...fixture.productAgent,
        agentPluginExport: './other-agent',
      })}\n`, 'utf8')
    }, /release package\.json\.exports/],
    ['manifest drift', async (fixture: Awaited<ReturnType<typeof createReadinessFixture>>) => {
      const manifest = JSON.parse(await readFile(join(fixture.releaseRoot, 'package/package.json'), 'utf8'))
      manifest.files = manifest.files.filter((entry: string) => entry !== 'lib/agent.js')
      await writeFile(join(fixture.releaseRoot, 'package/package.json'), `${JSON.stringify(manifest)}\n`, 'utf8')
    }, /release package\.json\.files/],
    ['Profile drift', async (fixture: Awaited<ReturnType<typeof createReadinessFixture>>) => {
      await writeFile(join(fixture.releaseRoot, 'package/profiles/comfyui-workbench/cordis.patch.yml'), '- id: agent-presets\n  config:\n    default: standard\n    includeUserRoot: true\n', 'utf8')
    }, /default: harness-comfyui/],
  ])('rejects %s before a Host spawn', async (_name, prepare, pattern) => {
    const fixture = await createReadinessFixture()
    await prepare(fixture)

    await expect(validateProductAgentRelease(fixture.releaseRoot))
      .rejects.toMatchObject({ message: expect.stringMatching(pattern) })
  })
})
