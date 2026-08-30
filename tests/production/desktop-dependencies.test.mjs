import { mkdir, mkdtemp, readlink, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { linkDesktopHarnessDevelopmentDependencies } from '../../scripts/desktop/dependencies.mjs'

const roots = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture(packages = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-agent']) {
  const root = await mkdtemp(resolve(tmpdir(), 'desktop-harness-dependencies-'))
  roots.push(root)
  const desktopSource = resolve(root, 'dsh-desktop')
  for (const name of packages) {
    const source = resolve(desktopSource, 'node_modules', name)
    await mkdir(source, { recursive: true })
    await writeFile(resolve(source, 'package.json'), `${JSON.stringify({ name })}\n`)
  }
  const executable = resolve(desktopSource, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
  await mkdir(resolve(executable, '..'), { recursive: true })
  await writeFile(executable, '#!/usr/bin/env node\n')
  return {
    repositoryRoot: root,
    desktopSource,
    executables: { dsh: '@deepseek-ai/dsh/lib/bin.js' },
    packages,
  }
}

describe('Desktop Harness development dependencies', () => {
  it('links declared Harness packages from the installed Desktop without manifest link dependencies', async () => {
    const value = await fixture()

    await expect(linkDesktopHarnessDevelopmentDependencies(value)).resolves.toEqual({ linked: 2, executables: 1 })

    for (const name of value.packages) {
      expect(resolve(value.repositoryRoot, 'node_modules', name, await readlink(resolve(value.repositoryRoot, 'node_modules', name))))
        .toBe(resolve(value.desktopSource, 'node_modules', name))
    }
    expect(resolve(value.repositoryRoot, 'node_modules/.bin', await readlink(resolve(value.repositoryRoot, 'node_modules/.bin/dsh'))))
      .toBe(resolve(value.desktopSource, 'node_modules/@deepseek-ai/dsh/lib/bin.js'))
  })

  it('rejects a Desktop installation that does not provide every declared Harness package', async () => {
    const value = await fixture(['@deepseek-ai/cordis'])

    await expect(linkDesktopHarnessDevelopmentDependencies({
      ...value,
      packages: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-agent'],
    })).rejects.toThrow('DSH Desktop dependency @deepseek-ai/dsh-agent is not installed')
  })

  it('rejects a Desktop installation that does not provide a declared executable', async () => {
    const value = await fixture()
    await rm(resolve(value.desktopSource, 'node_modules/@deepseek-ai/dsh/lib/bin.js'))

    await expect(linkDesktopHarnessDevelopmentDependencies(value))
      .rejects.toThrow('DSH Desktop executable dsh is not installed')
  })
})
