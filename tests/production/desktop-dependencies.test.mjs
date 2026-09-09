import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadDesktopHarnessDevelopmentDependencies } from '../../scripts/desktop/dependencies.mjs'

const roots = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture() {
  const repositoryRoot = await mkdtemp(resolve(tmpdir(), 'desktop-dependencies-adapter-'))
  roots.push(repositoryRoot)
  const mainCheckoutRoot = resolve(repositoryRoot, '../main-checkout')
  const desktopWorkspace = resolve(repositoryRoot, '../desktop-repository/dsh-plugin-desktop')
  await mkdir(resolve(repositoryRoot, 'config'), { recursive: true })
  await Promise.all([
    writeFile(resolve(repositoryRoot, 'package.json'), '{"name":"fixture"}\n'),
    writeFile(resolve(repositoryRoot, 'config/desktop-harness-development.json'), '{"schemaVersion":1}\n'),
    writeFile(resolve(repositoryRoot, 'config/desktop-worktree.json'), `${JSON.stringify({ mainCheckoutPath: mainCheckoutRoot })}\n`),
  ])
  return { repositoryRoot, mainCheckoutRoot, desktopWorkspace }
}

describe('Desktop dependency preparation adapter', () => {
  it('normalizes explicitly injected checkout and candidate workspace paths', async () => {
    const value = await fixture()

    const definition = await loadDesktopHarnessDevelopmentDependencies(value)

    expect(definition).toMatchObject({
      repositoryRoot: value.repositoryRoot,
      mainCheckoutRoot: value.mainCheckoutRoot,
      desktopWorkspace: value.desktopWorkspace,
      definitionPath: resolve(value.repositoryRoot, 'config/desktop-harness-development.json'),
      rootManifestPath: resolve(value.repositoryRoot, 'package.json'),
    })
  })

  it('reads the main checkout path and accepts a validated baseline workspace', async () => {
    const value = await fixture()

    const definition = await loadDesktopHarnessDevelopmentDependencies({
      repositoryRoot: value.repositoryRoot,
      baseline: { desktopWorkspace: value.desktopWorkspace },
    })

    expect(definition.mainCheckoutRoot).toBe(value.mainCheckoutRoot)
    expect(definition.desktopWorkspace).toBe(value.desktopWorkspace)
  })
})
