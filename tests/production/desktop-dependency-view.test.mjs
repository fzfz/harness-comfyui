import { chmod, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

import { afterEach, describe, expect, it } from 'vitest'

import { createTestDesktopRequire, loadTestDesktopContext } from '../support/desktop-context.mjs'

import { prepareDesktopDependencyView } from '../../scripts/desktop/dependency-view.mjs'

const roots = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function writePackage(nodeModules, name, version, bin) {
  const directory = resolve(nodeModules, name)
  await mkdir(directory, { recursive: true })
  await writeFile(resolve(directory, 'package.json'), `${JSON.stringify({ name, version, main: 'index.js', ...(bin === undefined ? {} : { bin }) })}\n`)
  await writeFile(resolve(directory, 'index.js'), `module.exports = ${JSON.stringify(`${name}@${version}`)}\n`)
  return directory
}

function versionSatisfies(version, range) {
  if (range === version) return true
  if (range === '^2.0.0') return /^2\./u.test(version)
  if (range === '>=0.1.7-rc.2 <0.1.8') return version === '0.1.7-rc.2'
  return false
}

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'desktop-dependency-view-'))
  roots.push(root)
  const repositoryRoot = resolve(root, 'worktree')
  const mainCheckoutRoot = resolve(root, 'main')
  const desktopWorkspace = resolve(root, 'candidate/dsh-plugin-desktop')
  const mainNodeModules = resolve(mainCheckoutRoot, 'node_modules')
  const candidateNodeModules = resolve(desktopWorkspace, 'node_modules')
  await Promise.all([
    mkdir(resolve(repositoryRoot, 'config'), { recursive: true }),
    mkdir(resolve(mainNodeModules, '.bin'), { recursive: true }),
    mkdir(candidateNodeModules, { recursive: true }),
  ])
  const rootManifest = {
    name: 'fixture-harness',
    dependencies: { sharp: '0.35.4' },
    devDependencies: { typescript: '6.0.3' },
    peerDependencies: { 'fixture-host': '^2.0.0', react: '18.3.1' },
  }
  const candidateManifest = {
    name: 'dsh-plugin-desktop',
    version: '2.0.15',
    dependencies: {
      '@deepseek-ai/dsh': '0.1.7-rc.2',
      'fixture-host': '2.1.0',
      react: '18.3.1',
    },
  }
  await Promise.all([
    writeFile(resolve(repositoryRoot, 'package.json'), `${JSON.stringify(rootManifest)}\n`),
    writeFile(resolve(mainCheckoutRoot, 'package.json'), '{"name":"main-fixture"}\n'),
    writeFile(resolve(desktopWorkspace, 'package.json'), `${JSON.stringify(candidateManifest)}\n`),
    writeFile(resolve(repositoryRoot, 'config/desktop-harness-development.json'), `${JSON.stringify({
      schemaVersion: 1,
      mainManifestSections: ['dependencies', 'devDependencies'],
      candidateManifestSection: 'peerDependencies',
      candidateDevelopmentPackages: ['@deepseek-ai/dsh'],
      candidateExecutables: { dsh: { package: '@deepseek-ai/dsh', relativePath: 'lib/bin.js' } },
    })}\n`),
  ])
  await Promise.all([
    writePackage(mainNodeModules, 'sharp', '0.35.4'),
    writePackage(mainNodeModules, 'typescript', '6.0.3', { tsc: 'bin/tsc' }),
    writePackage(candidateNodeModules, 'fixture-host', '2.1.0'),
    writePackage(candidateNodeModules, 'react', '18.3.1'),
    writePackage(candidateNodeModules, '@deepseek-ai/dsh', '0.1.7-rc.2'),
  ])
  await mkdir(resolve(candidateNodeModules, '@deepseek-ai/dsh/lib'), { recursive: true })
  await writeFile(resolve(candidateNodeModules, '@deepseek-ai/dsh/lib/bin.js'), '#!/usr/bin/env node\nprocess.stdout.write("candidate-dsh")\n')
  await mkdir(resolve(mainNodeModules, 'typescript/bin'), { recursive: true })
  await writeFile(resolve(mainNodeModules, 'typescript/bin/tsc'), '#!/usr/bin/env node\nprocess.stdout.write("Version 6.0.3\\n")\n')
  await chmod(resolve(mainNodeModules, 'typescript/bin/tsc'), 0o755)
  await symlink(mainNodeModules, resolve(repositoryRoot, 'node_modules'), 'dir')
  return {
    repositoryRoot,
    mainCheckoutRoot,
    desktopWorkspace,
    mainNodeModules,
    candidateNodeModules,
    versionSatisfies,
  }
}

describe('Desktop dependency view', () => {
  it.each([
    ['0.1.7-rc.1', false],
    ['0.1.7-rc.2', true],
    ['0.1.7', true],
    ['0.1.8-alpha.1', false],
    ['0.1.8', false],
  ])('validates DSH %s against the declared peer range (accepted=%s)', async (version, accepted) => {
    const value = await fixture()
    const candidateRequire = createTestDesktopRequire(await loadTestDesktopContext())
    await symlink(dirname(candidateRequire.resolve('semver/package.json')), resolve(value.candidateNodeModules, 'semver'), 'dir')
    const manifestPath = resolve(value.repositoryRoot, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const projectManifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))
    const range = projectManifest.peerDependencies['@deepseek-ai/dsh-agent']
    manifest.peerDependencies['@deepseek-ai/dsh-agent'] = range
    await writeFile(manifestPath, JSON.stringify(manifest))
    await writePackage(value.candidateNodeModules, '@deepseek-ai/dsh-agent', version)

    const preparation = prepareDesktopDependencyView({ ...value, versionSatisfies: undefined })
    if (accepted) {
      await expect(preparation).resolves.toMatchObject({ changed: true })
    } else {
      await expect(preparation).rejects.toThrow(`Candidate Desktop peer dependency @deepseek-ai/dsh-agent version "${version}" does not satisfy ${range}`)
      expect(await readlink(resolve(value.repositoryRoot, 'node_modules'))).toBe(value.mainNodeModules)
    }
  })

  it('creates an isolated resolver view from main tools and candidate peer dependencies', async () => {
    const value = await fixture()

    const result = await prepareDesktopDependencyView(value)

    expect(result.changed).toBe(true)
    expect(resolve(value.repositoryRoot, 'node_modules/sharp', await readlink(resolve(value.repositoryRoot, 'node_modules/sharp'))))
      .toBe(resolve(value.mainNodeModules, 'sharp'))
    expect(resolve(value.repositoryRoot, 'node_modules/fixture-host', await readlink(resolve(value.repositoryRoot, 'node_modules/fixture-host'))))
      .toBe(resolve(value.candidateNodeModules, 'fixture-host'))
    expect(resolve(value.repositoryRoot, 'node_modules/react', await readlink(resolve(value.repositoryRoot, 'node_modules/react'))))
      .toBe(resolve(value.candidateNodeModules, 'react'))
    expect(resolve(value.repositoryRoot, 'node_modules/.bin/dsh', await readlink(resolve(value.repositoryRoot, 'node_modules/.bin/dsh'))))
      .toBe(resolve(value.candidateNodeModules, '@deepseek-ai/dsh/lib/bin.js'))
    const requireFromView = createRequire(resolve(value.repositoryRoot, 'package.json'))
    expect(requireFromView('sharp')).toBe('sharp@0.35.4')
    expect(requireFromView('fixture-host')).toBe('fixture-host@2.1.0')
    expect(requireFromView('@deepseek-ai/dsh')).toBe('@deepseek-ai/dsh@0.1.7-rc.2')
    expect(spawnSync(resolve(value.repositoryRoot, 'node_modules/.bin/tsc'), ['--version'], { encoding: 'utf8' })).toMatchObject({
      status: 0,
      stdout: 'Version 6.0.3\n',
    })
    expect(await readFile(resolve(value.mainCheckoutRoot, 'package.json'), 'utf8')).toBe('{"name":"main-fixture"}\n')
    await expect(readFile(resolve(value.mainNodeModules, '.desktop-dependency-view.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('keeps a complete dependency view unchanged when preparation repeats', async () => {
    const value = await fixture()
    await prepareDesktopDependencyView(value)
    const firstMarker = await readFile(resolve(value.repositoryRoot, 'node_modules/.desktop-dependency-view.json'), 'utf8')

    const second = await prepareDesktopDependencyView(value)

    expect(second.changed).toBe(false)
    expect(await readFile(resolve(value.repositoryRoot, 'node_modules/.desktop-dependency-view.json'), 'utf8')).toBe(firstMarker)
  })

  it('rejects a missing candidate peer without replacing the existing node_modules link', async () => {
    const value = await fixture()
    await rm(resolve(value.candidateNodeModules, 'fixture-host'), { recursive: true })

    await expect(prepareDesktopDependencyView(value)).rejects.toThrow('Candidate Desktop peer dependency fixture-host is not installed')
    expect(resolve(value.repositoryRoot, await readlink(resolve(value.repositoryRoot, 'node_modules')))).toBe(value.mainNodeModules)
  })

  it('rejects a candidate peer version outside the Harness manifest range', async () => {
    const value = await fixture()
    await writeFile(resolve(value.candidateNodeModules, 'fixture-host/package.json'),
      '{"name":"fixture-host","version":"3.0.0","main":"index.js"}\n')

    await expect(prepareDesktopDependencyView(value))
      .rejects.toThrow('Candidate Desktop peer dependency fixture-host version "3.0.0" does not satisfy ^2.0.0')
  })

  it('rejects a missing main dependency without changing either dependency source', async () => {
    const value = await fixture()
    await rm(resolve(value.mainNodeModules, 'sharp'), { recursive: true })

    await expect(prepareDesktopDependencyView(value)).rejects.toThrow('Main checkout dependency sharp is not installed')
    expect(resolve(value.repositoryRoot, await readlink(resolve(value.repositoryRoot, 'node_modules')))).toBe(value.mainNodeModules)
    expect(await readFile(resolve(value.desktopWorkspace, 'package.json'), 'utf8')).toContain('dsh-plugin-desktop')
  })

  it('does not replace an unowned node_modules directory', async () => {
    const value = await fixture()
    await rm(resolve(value.repositoryRoot, 'node_modules'))
    await mkdir(resolve(value.repositoryRoot, 'node_modules'))
    await writeFile(resolve(value.repositoryRoot, 'node_modules/user-file'), 'preserve\n')

    await expect(prepareDesktopDependencyView(value))
      .rejects.toThrow('Existing node_modules directory is not an owned Desktop dependency view')
    expect(await readFile(resolve(value.repositoryRoot, 'node_modules/user-file'), 'utf8')).toBe('preserve\n')
  })

  it('refuses every dependency view target inside the main checkout', async () => {
    const value = await fixture()

    await expect(prepareDesktopDependencyView({
      ...value,
      nodeModulesDir: resolve(value.mainCheckoutRoot, 'temporary-view'),
    })).rejects.toThrow('Desktop dependency view must stay outside the main checkout')
  })
})
