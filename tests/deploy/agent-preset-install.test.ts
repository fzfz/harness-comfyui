import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

// @ts-expect-error The product installer exposes this checked-in deployment seam.
import { materializeProductAgentFiles } from '../../scripts/deploy/install.mjs'

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
})
