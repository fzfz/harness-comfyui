import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

import { afterEach, describe, expect, it } from 'vitest'

import {
  assertOfficialCandidateClientSource,
  buildOfficialCandidateClientFragment,
  readOfficialCandidateClientSourceMap,
  compareOfficialCandidateFiles,
  isOfficialCandidateClientScriptUrl,
  writeOfficialCandidateSourceIdentity,
} from '../desktop/fixtures/official-candidate-identity.mjs'
import {
  OFFICIAL_CANDIDATE_RUNTIME_PATHS,
  parseOfficialCandidateClientSourceEvidence,
  parseOfficialCandidateClientSourceResult,
  parseOfficialCandidateSourceIdentity,
} from '../desktop/fixtures/official-candidate-identity-schema.mjs'

const execFileAsync = promisify(execFile)
const temporaryRoots = new Set()

afterEach(async () => {
  await Promise.all([...temporaryRoots].map(root => rm(root, { recursive: true, force: true })))
  temporaryRoots.clear()
})

describe('official Desktop candidate source identity', () => {
  it('validates the complete candidate Client result returned to lifecycle evidence', () => {
    const sourceIdentity = {
      schemaVersion: 1,
      packageName: 'harness-comfyui',
      packageVersion: '0.45.0',
      archivePath: '/tmp/candidate.tgz',
      sourceCommit: '0'.repeat(40),
      dirty: false,
      runtimeFiles: [...OFFICIAL_CANDIDATE_RUNTIME_PATHS],
    }
    const result = {
      scriptId: 'client66',
      scriptUrl: 'dsh-app://app/plugins/??harness-comfyui/client.js&rev=66fdfd55bb7d',
      sourceMapUrl: '??harness-comfyui/client.js.map&rev=66fdfd55bb7d',
      moduleRoutes: ['harness-comfyui/client.js'],
      candidateModuleIndex: 0,
      sectionOffsetLine: 0,
      sectionOffsetColumn: 0,
      matchesCandidate: true,
    }

    expect(parseOfficialCandidateClientSourceResult(result, sourceIdentity)).toEqual(result)
    expect(() => parseOfficialCandidateClientSourceResult({ ...result, sourceMapUrl: '??harness-comfyui/client.js.map&rev=abcdefabcdef' }, sourceIdentity))
      .toThrow(/sourceMapUrl must match/u)
    expect(() => parseOfficialCandidateClientSourceResult({ ...result, candidateModuleIndex: 1 }, sourceIdentity))
      .toThrow(/combo route identity/u)
    expect(() => parseOfficialCandidateClientSourceResult({ ...result, sectionOffsetColumn: 1 }, sourceIdentity))
      .toThrow(/sectionOffsetColumn must be zero/u)
    expect(() => parseOfficialCandidateClientSourceResult({ ...result, matchesCandidate: false }, sourceIdentity))
      .toThrow(/must match the fixed candidate bytes/u)
    expect(() => parseOfficialCandidateClientSourceResult({ ...result, extra: true }, sourceIdentity))
      .toThrow(/unexpected extra/u)
  })

  it('records the exact archive, current commit, and dirty source state as ordinary JSON', async () => {
    const root = await mkdtemp(join(tmpdir(), 'official-candidate-identity-'))
    temporaryRoots.add(root)
    execFileSync('git', ['init', '-q'], { cwd: root })
    execFileSync('git', ['-c', 'user.name=Candidate Test', '-c', 'user.email=candidate@example.test', 'commit', '--allow-empty', '-m', 'candidate baseline'], { cwd: root })
    const archivePath = join(root, 'harness-comfyui.tgz')
    await createCandidateArchive(root, archivePath, OFFICIAL_CANDIDATE_RUNTIME_PATHS)
    await writeFile(join(root, 'dirty-source.ts'), 'uncommitted source')
    const identityPath = join(root, '.local', 'desktop-e2e', 'candidate-source-identity.json')

    const identity = await writeOfficialCandidateSourceIdentity({
      repositoryRoot: root,
      archivePath,
      identityPath,
      packageName: 'harness-comfyui',
      packageVersion: '0.45.0',
    })

    expect(identity).toMatchObject({
      schemaVersion: 1,
      archivePath,
      packageName: 'harness-comfyui',
      packageVersion: '0.45.0',
      dirty: true,
      sourceCommit: expect.stringMatching(/^[0-9a-f]{40,64}$/u),
    })
    expect(JSON.parse(await readFile(identityPath, 'utf8'))).toEqual(identity)
    expect(() => parseOfficialCandidateSourceIdentity({ ...identity, dirty: 'true' })).toThrow(/dirty must be boolean/u)
    expect(() => parseOfficialCandidateSourceIdentity({ ...identity, archivePath: '/another/candidate.tgz' }, { archivePath })).toThrow(/archivePath does not match/u)
    expect(() => parseOfficialCandidateSourceIdentity({ ...identity, sourceCommit: 'deadbeef' })).toThrow(/sourceCommit must be a full Git commit/u)
  })

  it('compares every configured runtime artifact byte and rejects same-version stale installed bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'official-candidate-bytes-'))
    temporaryRoots.add(root)
    const candidateRoot = join(root, 'candidate', 'package')
    const installedRoot = join(root, 'installed')
    const archivePath = join(root, 'candidate.tgz')
    await mkdir(candidateRoot, { recursive: true })
    await mkdir(installedRoot, { recursive: true })

    const paths = [
      ...OFFICIAL_CANDIDATE_RUNTIME_PATHS,
      '.local/source-host/review-runtime-chunk.js',
      'agent-presets/project-installed-presets.mjs',
      '.agents/skills/comfyui-generate/SKILL.md',
      'scripts/source-client/imagegen-semantic-query.mjs',
      'scripts/cli/help.mjs',
    ].sort()
    for (const [index, relativePath] of paths.entries()) {
      const bytes = Buffer.from(`candidate-runtime-bytes-${index}`)
      const candidatePath = join(candidateRoot, relativePath)
      const installedPath = join(installedRoot, relativePath)
      await mkdir(dirname(candidatePath), { recursive: true })
      await mkdir(dirname(installedPath), { recursive: true })
      await writeFile(candidatePath, bytes)
      await writeFile(installedPath, bytes)
    }
    await writeFile(join(candidateRoot, 'package.json'), JSON.stringify({ name: 'harness-comfyui', version: '0.45.0' }))
    await writeFile(join(installedRoot, 'package.json'), JSON.stringify({ name: 'harness-comfyui', version: '0.45.0' }))
    await execFileAsync('tar', ['-czf', archivePath, 'package'], { cwd: join(root, 'candidate') })

    const sourceIdentity = {
      schemaVersion: 1,
      packageName: 'harness-comfyui',
      packageVersion: '0.45.0',
      archivePath,
      sourceCommit: '0'.repeat(40),
      dirty: true,
      runtimeFiles: paths.slice().sort(),
    }
    const comparisons = await compareOfficialCandidateFiles({ sourceIdentity, installedPackageRoot: installedRoot })
    expect(comparisons).toHaveLength(paths.length)
    expect(comparisons.every(comparison => comparison.matchesCandidate)).toBe(true)
    expect(comparisons.map(comparison => comparison.relativePath)).toContain('.local/source-host/review-runtime-chunk.js')

    const stalePackageResource = '.agents/skills/comfyui-generate/SKILL.md'
    await writeFile(join(installedRoot, stalePackageResource), 'old bytes from the same package version')
    await expect(compareOfficialCandidateFiles({ sourceIdentity, installedPackageRoot: installedRoot }))
      .rejects.toThrow(`Installed ${stalePackageResource} bytes differ from the fixed candidate`)
  })

  it('matches the candidate fragment inside the verified official combo response and records complete evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'official-candidate-client-'))
    temporaryRoots.add(root)
    const evidenceDirectory = join(root, 'evidence')
    await mkdir(evidenceDirectory)
    const archivePath = join(root, 'candidate.tgz')
    await createCandidateArchive(root, archivePath, OFFICIAL_CANDIDATE_RUNTIME_PATHS)
    const sourceIdentity = {
      schemaVersion: 1,
      packageName: 'harness-comfyui',
      packageVersion: '0.45.0',
      archivePath,
      sourceCommit: '0'.repeat(40),
      dirty: false,
      runtimeFiles: [...OFFICIAL_CANDIDATE_RUNTIME_PATHS],
    }
    const moduleRoutes = ['@deepseek-ai/dsh-client-ui-layout/client.js', 'harness-comfyui/client.js']
    const scriptUrl = `dsh-app://app/plugins/??${moduleRoutes.join(',')}&rev=66fdfd55bb7d`
    const sourceMapUrl = `??${moduleRoutes.map(route => route.replace('/client.js', '/client.js.map')).join(',')}&rev=66fdfd55bb7d`
    const expected = await buildOfficialCandidateClientFragment({ sourceIdentity, scriptUrl, sourceMapUrl })
    const scriptPrefix = Buffer.from('officialModule();\n;\n')
    const trailer = Buffer.from(`//# sourceMappingURL=${sourceMapUrl}\n`)
    const comboScript = Buffer.concat([scriptPrefix, expected.fragment, trailer])
    const sourceMapText = JSON.stringify({ version: 3, sections: [
      { offset: { line: 0, column: 0 }, map: { version: 3, sources: ['layout.ts'], names: [], mappings: '' } },
      { offset: { line: 2, column: 0 }, map: { version: 3, sources: ['client.ts'], names: [], mappings: '' } },
    ] })

    expect(isOfficialCandidateClientScriptUrl(scriptUrl, sourceIdentity)).toBe(true)
    expect(isOfficialCandidateClientScriptUrl('dsh-app://app/plugins/??other-plugin/client.js&rev=66fdfd55bb7d', sourceIdentity)).toBe(false)
    expect(isOfficialCandidateClientScriptUrl('dsh-app://app/plugins/??@deepseek-ai/dsh-client-ui-layout/client.js,harness-comfyui/client.js,@deepseek-ai/dsh-client-ui-layout/client.js&rev=66fdfd55bb7d', sourceIdentity)).toBe(false)
    expect(isOfficialCandidateClientScriptUrl('dsh-app://app/plugins/??harness-comfyui/client.js,@deepseek-ai/dsh-client-ui-layout/client.js&rev=66fdfd55bb7d', sourceIdentity)).toBe(false)
    expect(isOfficialCandidateClientScriptUrl('file:///candidate/client.js', sourceIdentity)).toBe(false)

    const page = { evaluate: async expression => {
      expect(expression).toContain("redirect: 'error'")
      return { url: `dsh-app://app/plugins/${sourceMapUrl}`, sourceMapText }
    } }
    await expect(readOfficialCandidateClientSourceMap({ page, sourceIdentity, scriptUrl, sourceMapUrl }))
      .resolves.toBe(sourceMapText)
    await expect(readOfficialCandidateClientSourceMap({
      page: { evaluate: async () => ({ url: 'dsh-app://app/redirected-map', sourceMapText }) },
      sourceIdentity, scriptUrl, sourceMapUrl,
    })).rejects.toThrow(/invalid response record/u)
    let mismatchedMapFetchCalls = 0
    await expect(readOfficialCandidateClientSourceMap({
      page: { evaluate: async () => { mismatchedMapFetchCalls += 1; return { url: '', sourceMapText } } },
      sourceIdentity,
      scriptUrl,
      sourceMapUrl: sourceMapUrl.replace('66fdfd55bb7d', 'abcdefabcdef'),
    })).rejects.toThrow(/does not match the exact candidate combo route/u)
    expect(mismatchedMapFetchCalls).toBe(0)
    await expect(assertOfficialCandidateClientSource({
      sourceIdentity, scriptId: 'client-script', scriptUrl, sourceMapUrl,
      scriptSource: comboScript.toString('utf8'), sourceMapText, evidenceDirectory,
    })).resolves.toMatchObject({
      scriptId: 'client-script', scriptUrl, candidateModuleIndex: 1, sectionOffsetLine: 2, matchesCandidate: true,
    })

    const expectedPath = join(evidenceDirectory, 'official-client-source-client-script-expected.js')
    const actualPath = join(evidenceDirectory, 'official-client-source-client-script-actual.js')
    const comboPath = join(evidenceDirectory, 'official-client-source-client-script-combo.js')
    const mapPath = join(evidenceDirectory, 'official-client-source-client-script-combo-map.json')
    const evidencePath = join(evidenceDirectory, 'official-client-source-client-script.json')
    expect(await readFile(expectedPath)).toEqual(expected.fragment)
    expect(await readFile(actualPath)).toEqual(expected.fragment)
    expect(await readFile(comboPath)).toEqual(comboScript)
    expect(await readFile(mapPath, 'utf8')).toBe(sourceMapText)
    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))
    expect(evidence).toMatchObject({
      scriptId: 'client-script', scriptUrl, revision: '66fdfd55bb7d', sourceMapUrl,
      expectedSourceMapUrl: sourceMapUrl, moduleRoutes, candidateModuleIndex: 1,
      sourceMapSectionCount: 2, sectionOffsetLine: 2, sectionOffsetColumn: 0, matchesCandidate: true,
    })
    expect(parseOfficialCandidateClientSourceEvidence(evidence)).toEqual(evidence)
    expect(() => parseOfficialCandidateClientSourceEvidence({ ...evidence, revision: 'wrong' }))
      .toThrow(/combo route identity/u)

    const mismatchScript = Buffer.concat([scriptPrefix, Buffer.from('stale candidate fragment;\n'), trailer])
    await expect(assertOfficialCandidateClientSource({
      sourceIdentity, scriptId: 'stale-client-script', scriptUrl, sourceMapUrl,
      scriptSource: mismatchScript.toString('utf8'), sourceMapText, evidenceDirectory,
    })).rejects.toThrow(/candidate fragment bytes differ from the exact fixed candidate/u)
    expect(await readFile(join(evidenceDirectory, 'official-client-source-stale-client-script-expected.js')))
      .toEqual(expected.fragment)
    expect(await readFile(join(evidenceDirectory, 'official-client-source-stale-client-script-actual.js'), 'utf8'))
      .toBe('stale candidate fragment;\n')
    expect(await readFile(join(evidenceDirectory, 'official-client-source-stale-client-script-combo.js')))
      .toEqual(mismatchScript)
    expect(await readFile(join(evidenceDirectory, 'official-client-source-stale-client-script-combo-map.json'), 'utf8'))
      .toBe(sourceMapText)
    const wrongRouteMapUrl = sourceMapUrl.replace('66fdfd55bb7d', 'abcdefabcdef')
    await expect(assertOfficialCandidateClientSource({
      sourceIdentity, scriptId: 'wrong-map-url', scriptUrl, sourceMapUrl: wrongRouteMapUrl,
      scriptSource: comboScript.toString('utf8'), sourceMapText, evidenceDirectory,
    })).rejects.toThrow(/source-map URL does not match the exact combo modules and revision/u)
    expect(await readFile(join(evidenceDirectory, 'official-client-source-wrong-map-url-combo.js')))
      .toEqual(comboScript)
    expect(await readFile(join(evidenceDirectory, 'official-client-source-wrong-map-url-combo-map.json'), 'utf8'))
      .toBe(sourceMapText)
    expect(JSON.parse(await readFile(join(evidenceDirectory, 'official-client-source-wrong-map-url.json'), 'utf8')))
      .toMatchObject({ sourceMapUrl: wrongRouteMapUrl, expectedSourceMapUrl: sourceMapUrl, matchesCandidate: false })
  })

  it('locates the candidate fragment by its same-revision official combo source-map section and compares exact bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'official-candidate-combo-client-'))
    temporaryRoots.add(root)
    const evidenceDirectory = join(root, 'evidence')
    await mkdir(evidenceDirectory)
    const archivePath = join(root, 'candidate.tgz')
    await createCandidateArchive(root, archivePath, OFFICIAL_CANDIDATE_RUNTIME_PATHS)
    const sourceIdentity = {
      schemaVersion: 1,
      packageName: 'harness-comfyui',
      packageVersion: '0.45.0',
      archivePath,
      sourceCommit: '0'.repeat(40),
      dirty: false,
      runtimeFiles: [...OFFICIAL_CANDIDATE_RUNTIME_PATHS],
    }
    const modules = [
      '@deepseek-ai/dsh-client-ui-layout/client.js',
      '@deepseek-ai/dsh-client-ui-plugin-manager/client.js',
      'harness-comfyui/client.js',
    ]
    const scriptUrl = `dsh-app://app/plugins/??${modules.join(',')}&rev=66fdfd55bb7d`
    const sourceMapModules = modules.map(moduleRoute => moduleRoute.replace('/client.js', '/client.js.map'))
    const sourceMapUrl = `??${sourceMapModules.join(',')}&rev=66fdfd55bb7d`
    const expected = await buildOfficialCandidateClientFragment({ sourceIdentity, scriptUrl, sourceMapUrl })
    const precedingModules = Buffer.from('firstOfficialModule();\n;\nsecondOfficialModule();\n;\n')
    const sourceMapTrailer = Buffer.from(`//# sourceMappingURL=${sourceMapUrl}\n`)
    const scriptSource = Buffer.concat([precedingModules, expected.fragment, sourceMapTrailer])
    const sourceMapText = JSON.stringify({
      version: 3,
      sections: [0, 2, 4].map(line => ({
        offset: { line, column: 0 },
        map: { version: 3, sources: ['client.ts'], names: [], mappings: '' },
      })),
    })

    const result = await assertOfficialCandidateClientSource({
      sourceIdentity,
      scriptId: 'combo-client-42',
      scriptUrl,
      sourceMapUrl,
      scriptSource: scriptSource.toString('utf8'),
      sourceMapText,
      evidenceDirectory,
    })

    expect(result).toMatchObject({ matchesCandidate: true, candidateModuleIndex: 2, sectionOffsetLine: 4 })
    expect(await readFile(join(evidenceDirectory, 'official-client-source-combo-client-42-combo.js'))).toEqual(scriptSource)
    expect(await readFile(join(evidenceDirectory, 'official-client-source-combo-client-42-combo-map.json'), 'utf8')).toBe(sourceMapText)
    expect(await readFile(join(evidenceDirectory, 'official-client-source-combo-client-42-expected.js'))).toEqual(expected.fragment)
    expect(await readFile(join(evidenceDirectory, 'official-client-source-combo-client-42-actual.js'))).toEqual(expected.fragment)
    const record = JSON.parse(await readFile(join(evidenceDirectory, 'official-client-source-combo-client-42.json'), 'utf8'))
    expect(record).toMatchObject({
      scriptUrl,
      sourceMapUrl,
      revision: '66fdfd55bb7d',
      moduleRoutes: modules,
      candidateModuleIndex: 2,
      sectionOffsetLine: 4,
      sectionOffsetColumn: 0,
      matchesCandidate: true,
    })
    expect(parseOfficialCandidateClientSourceEvidence(record)).toEqual(record)
  })

  it('uses the same indexed-map algorithm when the official combo contains only the candidate module', async () => {
    const root = await mkdtemp(join(tmpdir(), 'official-candidate-single-client-'))
    temporaryRoots.add(root)
    const evidenceDirectory = join(root, 'evidence')
    await mkdir(evidenceDirectory)
    const archivePath = join(root, 'candidate.tgz')
    await createCandidateArchive(root, archivePath, OFFICIAL_CANDIDATE_RUNTIME_PATHS)
    const sourceIdentity = {
      schemaVersion: 1,
      packageName: 'harness-comfyui',
      packageVersion: '0.45.0',
      archivePath,
      sourceCommit: '0'.repeat(40),
      dirty: false,
      runtimeFiles: [...OFFICIAL_CANDIDATE_RUNTIME_PATHS],
    }
    const scriptUrl = 'dsh-app://app/plugins/??harness-comfyui/client.js&rev=35de464b09a3'
    const sourceMapUrl = '??harness-comfyui/client.js.map&rev=35de464b09a3'
    const expected = await buildOfficialCandidateClientFragment({ sourceIdentity, scriptUrl, sourceMapUrl })
    const scriptSource = Buffer.concat([
      expected.fragment,
      Buffer.from(`//# sourceMappingURL=${sourceMapUrl}\n`),
    ])
    const sourceMapText = JSON.stringify({ version: 3, sections: [
      { offset: { line: 0, column: 0 }, map: { version: 3, sources: ['client.ts'], names: [], mappings: '' } },
    ] })

    expect(isOfficialCandidateClientScriptUrl(scriptUrl, sourceIdentity)).toBe(true)
    await expect(assertOfficialCandidateClientSource({
      sourceIdentity,
      scriptId: 'single-client-66',
      scriptUrl,
      sourceMapUrl,
      scriptSource: scriptSource.toString('utf8'),
      sourceMapText,
      evidenceDirectory,
    })).resolves.toMatchObject({
      matchesCandidate: true,
      moduleRoutes: ['harness-comfyui/client.js'],
      candidateModuleIndex: 0,
      sectionOffsetLine: 0,
      sectionOffsetColumn: 0,
    })

    const record = JSON.parse(await readFile(join(evidenceDirectory, 'official-client-source-single-client-66.json'), 'utf8'))
    expect(record).toMatchObject({
      scriptUrl,
      sourceMapUrl,
      revision: '35de464b09a3',
      moduleRoutes: ['harness-comfyui/client.js'],
      sourceMapSectionCount: 1,
      modulePositions: [{ moduleRoute: 'harness-comfyui/client.js', offsetLine: 0, offsetColumn: 0 }],
      candidateModuleIndex: 0,
      sectionOffsetLine: 0,
      sectionOffsetColumn: 0,
      matchesCandidate: true,
    })
    expect(await readFile(join(evidenceDirectory, 'official-client-source-single-client-66-expected.js'))).toEqual(expected.fragment)
    expect(await readFile(join(evidenceDirectory, 'official-client-source-single-client-66-actual.js'))).toEqual(expected.fragment)
    expect(await readFile(join(evidenceDirectory, 'official-client-source-single-client-66-combo.js'))).toEqual(scriptSource)
    expect(await readFile(join(evidenceDirectory, 'official-client-source-single-client-66-combo-map.json'), 'utf8')).toBe(sourceMapText)
    expect(parseOfficialCandidateClientSourceEvidence(record)).toEqual(record)
  })

  it('rejects unobserved candidate module orders, duplicate modules, and mismatched source-map revisions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'official-candidate-combo-route-'))
    temporaryRoots.add(root)
    const archivePath = join(root, 'candidate.tgz')
    await createCandidateArchive(root, archivePath, OFFICIAL_CANDIDATE_RUNTIME_PATHS)
    const sourceIdentity = {
      schemaVersion: 1,
      packageName: 'harness-comfyui',
      packageVersion: '0.45.0',
      archivePath,
      sourceCommit: '0'.repeat(40),
      dirty: false,
      runtimeFiles: [...OFFICIAL_CANDIDATE_RUNTIME_PATHS],
    }
    const prefix = 'dsh-app://app/plugins/??'
    const suffix = '&rev=66fdfd55bb7d'

    expect(isOfficialCandidateClientScriptUrl(`${prefix}harness-comfyui/client.js,@deepseek-ai/dsh-client-ui-layout/client.js${suffix}`, sourceIdentity)).toBe(false)
    expect(isOfficialCandidateClientScriptUrl(`${prefix}@deepseek-ai/dsh-client-ui-layout/client.js,harness-comfyui/client.js,harness-comfyui/client.js${suffix}`, sourceIdentity)).toBe(false)
    expect(isOfficialCandidateClientScriptUrl(`${prefix}@deepseek-ai/dsh-client-ui-layout/client.js,harness-comfyui/client.js&rev=wrong`, sourceIdentity)).toBe(false)
    expect(isOfficialCandidateClientScriptUrl(`${prefix}@deepseek-ai/dsh-client-ui-layout/client.js,harness-comfyui/client.js${suffix}`, sourceIdentity)).toBe(true)
    await expect(buildOfficialCandidateClientFragment({
      sourceIdentity,
      scriptUrl: `${prefix}@deepseek-ai/dsh-client-ui-layout/client.js,harness-comfyui/client.js${suffix}`,
      sourceMapUrl: '??@deepseek-ai/dsh-client-ui-layout/client.js.map,harness-comfyui/client.js.map&rev=abcdefabcdef',
    })).rejects.toThrow(/source-map URL must identify the same combo modules and revision/u)
  })

  it('rejects ambiguous and nonzero-column indexed source-map locations while retaining source evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'official-candidate-combo-map-boundary-'))
    temporaryRoots.add(root)
    const evidenceDirectory = join(root, 'evidence')
    await mkdir(evidenceDirectory)
    const archivePath = join(root, 'candidate.tgz')
    await createCandidateArchive(root, archivePath, OFFICIAL_CANDIDATE_RUNTIME_PATHS)
    const sourceIdentity = {
      schemaVersion: 1,
      packageName: 'harness-comfyui',
      packageVersion: '0.45.0',
      archivePath,
      sourceCommit: '0'.repeat(40),
      dirty: false,
      runtimeFiles: [...OFFICIAL_CANDIDATE_RUNTIME_PATHS],
    }
    const modules = ['@deepseek-ai/dsh-client-ui-layout/client.js', 'harness-comfyui/client.js']
    const scriptUrl = `dsh-app://app/plugins/??${modules.join(',')}&rev=66fdfd55bb7d`
    const sourceMapUrl = `??${modules.map(moduleRoute => moduleRoute.replace('/client.js', '/client.js.map')).join(',')}&rev=66fdfd55bb7d`
    const expected = await buildOfficialCandidateClientFragment({ sourceIdentity, scriptUrl, sourceMapUrl })
    const scriptSource = Buffer.concat([Buffer.from('officialModule();\n;\n'), expected.fragment, Buffer.from(`//# sourceMappingURL=${sourceMapUrl}\n`)]).toString('utf8')
    const mapWithWrongCount = JSON.stringify({ version: 3, sections: [{ offset: { line: 0, column: 0 }, map: { version: 3, sources: [], names: [], mappings: '' } }] })

    await expect(assertOfficialCandidateClientSource({
      sourceIdentity, scriptId: 'wrong-count', scriptUrl, sourceMapUrl, scriptSource,
      sourceMapText: mapWithWrongCount, evidenceDirectory,
    })).rejects.toThrow(/source-map section count/u)
    expect(await readFile(join(evidenceDirectory, 'official-client-source-wrong-count-combo.js'), 'utf8')).toBe(scriptSource)
    expect(await readFile(join(evidenceDirectory, 'official-client-source-wrong-count-combo-map.json'), 'utf8')).toBe(mapWithWrongCount)
    expect(JSON.parse(await readFile(join(evidenceDirectory, 'official-client-source-wrong-count.json'), 'utf8')))
      .toMatchObject({ matchesCandidate: false, candidateModuleIndex: 1, sectionOffsetLine: null })

    const mapWithNonzeroColumn = JSON.stringify({ version: 3, sections: [
      { offset: { line: 0, column: 0 }, map: { version: 3, sources: [], names: [], mappings: '' } },
      { offset: { line: 2, column: 1 }, map: { version: 3, sources: [], names: [], mappings: '' } },
    ] })
    await expect(assertOfficialCandidateClientSource({
      sourceIdentity, scriptId: 'wrong-column', scriptUrl, sourceMapUrl, scriptSource,
      sourceMapText: mapWithNonzeroColumn, evidenceDirectory,
    })).rejects.toThrow(/column 0/u)
  })

  it('builds only the candidate module fragment for the exact observed combo route', async () => {
    const root = await mkdtemp(join(tmpdir(), 'official-candidate-client-response-'))
    temporaryRoots.add(root)
    const archivePath = join(root, 'candidate.tgz')
    const clientPath = OFFICIAL_CANDIDATE_RUNTIME_PATHS.find(path => path.endsWith('/client.js'))
    const clientIndex = OFFICIAL_CANDIDATE_RUNTIME_PATHS.indexOf(clientPath)
    const candidateSource = 'candidate-runtime-' + clientIndex
    await createCandidateArchive(root, archivePath, OFFICIAL_CANDIDATE_RUNTIME_PATHS)
    const sourceIdentity = {
      schemaVersion: 1,
      packageName: 'harness-comfyui',
      packageVersion: '0.45.0',
      archivePath,
      sourceCommit: '0'.repeat(40),
      dirty: false,
      runtimeFiles: [...OFFICIAL_CANDIDATE_RUNTIME_PATHS],
    }
    const modules = ['@deepseek-ai/dsh-client-ui-layout/client.js', 'harness-comfyui/client.js']
    const scriptUrl = `dsh-app://app/plugins/??${modules.join(',')}&rev=0123456789ab`
    const sourceMapUrl = `??${modules.map(route => route.replace('/client.js', '/client.js.map')).join(',')}&rev=0123456789ab`

    const result = await buildOfficialCandidateClientFragment({ sourceIdentity, scriptUrl, sourceMapUrl })

    expect(result).toMatchObject({
      revision: '0123456789ab',
      sourceMapUrl,
      moduleRoutes: modules,
      candidateModuleIndex: 1,
      fragment: Buffer.from(candidateSource + '\n;\n'),
    })
  })

  it('removes only trailing official debug directives before wrapping the candidate Client', async () => {
    const root = await mkdtemp(join(tmpdir(), 'official-candidate-client-debug-trailers-'))
    temporaryRoots.add(root)
    const archivePath = join(root, 'candidate.tgz')
    await createCandidateArchive(root, archivePath, OFFICIAL_CANDIDATE_RUNTIME_PATHS)
    const clientPath = OFFICIAL_CANDIDATE_RUNTIME_PATHS.find(path => path.endsWith('/client.js'))
    const candidateSource = 'window.__candidateClient = true;\n//# sourceMappingURL=old-client.js.map\n//# sourceURL=old-client.js'
    await writeFile(join(root, 'package', clientPath), candidateSource)
    await execFileAsync('tar', ['-czf', archivePath, 'package'], { cwd: root })
    const sourceIdentity = {
      schemaVersion: 1,
      packageName: 'harness-comfyui',
      packageVersion: '0.45.0',
      archivePath,
      sourceCommit: '0'.repeat(40),
      dirty: false,
      runtimeFiles: [...OFFICIAL_CANDIDATE_RUNTIME_PATHS],
    }
    const modules = ['@deepseek-ai/dsh-client-ui-layout/client.js', 'harness-comfyui/client.js']
    const scriptUrl = `dsh-app://app/plugins/??${modules.join(',')}&rev=abcdef123456`
    const sourceMapUrl = `??${modules.map(route => route.replace('/client.js', '/client.js.map')).join(',')}&rev=abcdef123456`

    const result = await buildOfficialCandidateClientFragment({ sourceIdentity, scriptUrl, sourceMapUrl })

    expect(result.fragment).toEqual(Buffer.from('window.__candidateClient = true;\n;\n'))
    expect(result.fragment.toString('utf8').endsWith('\n')).toBe(true)
  })
})

async function createCandidateArchive(root, archivePath, runtimePaths) {
  const packageRoot = join(root, 'package')
  await mkdir(packageRoot, { recursive: true })
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: 'harness-comfyui', version: '0.45.0' }))
  for (const [index, relativePath] of runtimePaths.entries()) {
    const path = join(packageRoot, relativePath)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, Buffer.from(`candidate-runtime-${index}`))
  }
  await execFileAsync('tar', ['-czf', archivePath, 'package'], { cwd: root })
}
