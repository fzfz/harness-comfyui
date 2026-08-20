import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import { packPackage } from '../../scripts/release/pack.mjs'
import { validatePackage } from '../../scripts/release/validate-package.mjs'

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-package-'))
  mkdirSync(join(root, 'lib/types'), { recursive: true })
  mkdirSync(join(root, 'config'), { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify(
      {
        name: 'harness-comfyui',
        version: '0.1.0-test.1',
        files: ['lib/index.js', 'lib/types/index.d.ts', 'config/base.json'],
        exports: {
          '.': {
            types: './lib/types/index.d.ts',
            default: './lib/index.js',
          },
          './package.json': './package.json',
        },
      },
      null,
      2,
    )}\n`,
  )
  writeFileSync(join(root, 'lib/index.js'), 'export const fixture = true\n')
  writeFileSync(join(root, 'lib/types/index.d.ts'), 'export declare const fixture: true\n')
  writeFileSync(join(root, 'config/base.json'), '{}\n')
  return root
}

function createArtifact(
  root: string,
  options: { extraPackageFiles?: Record<string, string>; omitPackageFiles?: string[] } = {},
) {
  const packageRoot = join(root, 'package')
  cpSync(join(root, 'lib'), join(packageRoot, 'lib'), { recursive: true })
  cpSync(join(root, 'config'), join(packageRoot, 'config'), { recursive: true })
  cpSync(join(root, 'package.json'), join(packageRoot, 'package.json'))
  for (const [relativePath, content] of Object.entries(options.extraPackageFiles ?? {})) {
    const path = join(packageRoot, relativePath)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  for (const relativePath of options.omitPackageFiles ?? []) rmSync(join(packageRoot, relativePath), { force: true })

  const destination = join(root, '.release/quality')
  const tarball = join(destination, 'harness-comfyui-0.1.0-test.1.tgz')
  mkdirSync(destination, { recursive: true })
  const result = spawnSync('tar', ['-czf', tarball, '-C', root, 'package'], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
  const bytes = readFileSync(tarball)
  const artifact = {
    tarballPath: resolve(tarball),
    filename: 'harness-comfyui-0.1.0-test.1.tgz',
    version: '0.1.0-test.1',
    commit: '0123456789abcdef0123456789abcdef01234567',
    byteLength: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
  writeFileSync(join(destination, 'artifact.json'), `${JSON.stringify(artifact)}\n`)
  return artifact
}

describe('release package scripts', () => {
  it('cleans the quality directory, runs pack exactly once, and records artifact identity', () => {
    const root = createFixture()
    const destination = join(root, '.release/quality')
    mkdirSync(destination, { recursive: true })
    writeFileSync(join(destination, 'stale.tgz'), 'stale')
    writeFileSync(join(destination, 'stale.json'), '{}')
    const tarball = join(destination, 'harness-comfyui-0.1.0-test.1.tgz')
    let packCalls = 0

    const artifact = packPackage(root, {
      gitCommit: () => '0123456789abcdef0123456789abcdef01234567',
      runPack: ({ destination: packDestination }) => {
        packCalls += 1
        expect(packDestination).toBe(resolve(destination))
        writeFileSync(tarball, 'packed bytes')
      },
    })

    expect(packCalls).toBe(1)
    expect(artifact).toEqual({
      tarballPath: resolve(tarball),
      filename: 'harness-comfyui-0.1.0-test.1.tgz',
      version: '0.1.0-test.1',
      commit: '0123456789abcdef0123456789abcdef01234567',
      byteLength: 12,
      sha256: createHash('sha256').update('packed bytes').digest('hex'),
    })
    expect(JSON.parse(readFileSync(join(destination, 'artifact.json'), 'utf8'))).toEqual(artifact)
  })

  it('validates the manifest, tarball identity, and every package export', () => {
    const root = createFixture()
    const artifact = createArtifact(root)

    const result = validatePackage(root, { gitCommit: () => artifact.commit })
    expect(result.entries).toEqual(['package/config/base.json', 'package/lib/index.js', 'package/lib/types/index.d.ts', 'package/package.json'])
    expect(result.packedManifest.version).toBe(artifact.version)
  })

  it('rejects a tarball with source content outside the structured allowlist', () => {
    const paths = [
      ['src/internal.ts', /package\/src\/internal\.ts/i],
      ['tests/fixture/input.json', /package\/tests\/fixture\/input\.json/i],
      ['prototype/demo.txt', /package\/prototype\/demo\.txt/i],
      ['.local/runtime.sqlite', /package\/.local\/runtime\.sqlite/i],
      ['run-repository/runs.json', /package\/run-repository\/runs\.json/i],
      ['logs/application.log', /package\/logs\/application\.log/i],
      ['.env', /package\/.env/i],
      ['credentials/api-key.json', /package\/credentials\/api-key\.json/i],
      ['node_modules/@deepseek-ai/dsh/index.js', /package\/node_modules\/@deepseek-ai\/dsh\/index\.js/i],
    ] as const

    for (const [path, message] of paths) {
      const root = createFixture()
      const artifact = createArtifact(root, { extraPackageFiles: { [path]: 'forbidden\n' } })
      expect(() => validatePackage(root, { gitCommit: () => artifact.commit })).toThrow(message)
    }
  })

  it.each([
    ['version', (artifact: Record<string, unknown>) => ({ ...artifact, version: '0.1.0-test.2' }), /artifact version/i],
    ['commit', (artifact: Record<string, unknown>) => ({ ...artifact, commit: 'fedcba9876543210fedcba9876543210fedcba98' }), /artifact commit/i],
    ['sha256', (artifact: Record<string, unknown>) => ({ ...artifact, sha256: '0'.repeat(64) }), /artifact sha256/i],
  ])('rejects a manifest %s mismatch', (_field, mutate, message) => {
    const root = createFixture()
    const artifact = createArtifact(root)
    writeFileSync(join(root, '.release/quality/artifact.json'), `${JSON.stringify(mutate(artifact))}\n`)
    expect(() => validatePackage(root, { gitCommit: () => artifact.commit })).toThrow(message)
  })

  it('rejects a manifest with a missing identity field', () => {
    const root = createFixture()
    const artifact = createArtifact(root)
    const { sha256: _sha256, ...missingSha } = artifact
    writeFileSync(join(root, '.release/quality/artifact.json'), `${JSON.stringify(missingSha)}\n`)
    expect(() => validatePackage(root, { gitCommit: () => artifact.commit })).toThrow(/must contain exactly/i)
  })

  it('rejects an export target that is absent from the tarball', () => {
    const root = createFixture()
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    manifest.exports['./missing'] = './lib/missing.js'
    writeFileSync(join(root, 'package.json'), `${JSON.stringify(manifest)}\n`)
    const artifact = createArtifact(root)
    expect(() => validatePackage(root, { gitCommit: () => artifact.commit })).toThrow(/export target is missing/i)
  })

  it('rejects a tarball that omits a required public declaration', () => {
    const root = createFixture()
    const artifact = createArtifact(root, { omitPackageFiles: ['lib/types/index.d.ts'] })
    expect(() => validatePackage(root, { gitCommit: () => artifact.commit })).toThrow(
      /missing: package\/lib\/types\/index\.d\.ts/i,
    )
  })

  it.each([
    ['glob', ['lib/*.js'], /must be an exact path/i],
    ['directory', ['config'], /must name a file|repository file/i],
    ['absolute', ['/tmp/private.json'], /must be relative/i],
    ['parent traversal', ['../private.json'], /must be relative|invalid path segment|escapes/i],
    ['duplicate', ['lib/index.js', 'lib/index.js'], /duplicate entry/i],
  ])('rejects a package.json files %s entry', (_kind, files, message) => {
    const root = createFixture()
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    manifest.files = files
    writeFileSync(join(root, 'package.json'), `${JSON.stringify(manifest)}\n`)
    const artifact = createArtifact(root)
    expect(() => validatePackage(root, { gitCommit: () => artifact.commit })).toThrow(message)
  })

  it('fails closed when pack produces more than one tarball', () => {
    const root = createFixture()
    expect(() =>
      packPackage(root, {
        gitCommit: () => '0123456789abcdef0123456789abcdef01234567',
        runPack: ({ destination }) => {
          writeFileSync(join(destination, 'first.tgz'), 'one')
          writeFileSync(join(destination, 'second.tgz'), 'two')
        },
      }),
    ).toThrow(/exactly one \.tgz/i)
  })

  it('fails closed when pack produces no tarball or fails', () => {
    const root = createFixture()
    expect(() =>
      packPackage(root, {
        gitCommit: () => '0123456789abcdef0123456789abcdef01234567',
        runPack: () => {},
      }),
    ).toThrow(/exactly one \.tgz/i)

    expect(() =>
      packPackage(root, {
        runPack: () => {
          throw new Error('pack command failed')
        },
      }),
    ).toThrow(/pack command failed/i)
  })
})
