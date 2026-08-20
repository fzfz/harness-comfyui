import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename, dirname, isAbsolute, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const artifactDirectoryName = '.release/quality'

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`cannot read JSON ${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function currentGitCommit(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  })
  if (result.error) throw new Error(`cannot read current git commit: ${result.error.message}`, { cause: result.error })
  if (result.status !== 0) {
    throw new Error(`cannot read current git commit (git status ${result.status}): ${(result.stderr ?? '').trim()}`)
  }
  const commit = result.stdout.trim()
  if (!/^[0-9a-f]{40}$/u.test(commit)) throw new Error(`git rev-parse HEAD returned an invalid commit: ${commit}`)
  return commit
}

function parseArguments(argv) {
  let root = repositoryRoot
  let seenRoot = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument !== '--root') throw new Error(`unknown argument ${argument}`)
    if (seenRoot) throw new Error('duplicate argument --root')
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error('--root requires a non-empty value')
    root = resolve(value)
    seenRoot = true
    index += 1
  }
  return root
}

function runTar(args, root, description) {
  const result = spawnSync('tar', args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error) throw new Error(`${description} could not execute system tar: ${result.error.message}`, { cause: result.error })
  if (result.status !== 0) {
    throw new Error(`${description} failed with system tar status ${result.status}: ${(result.stderr ?? '').trim()}`)
  }
  return result.stdout
}

function listTarEntries(tarballPath, root) {
  let output
  try {
    output = runTar(['-tzf', tarballPath], root, 'tarball listing')
  } catch (error) {
    throw new Error(`tarball cannot be parsed with system tar: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
  const entries = new Set()
  for (const rawEntry of output.split(/\r?\n/u)) {
    const entry = rawEntry.trim()
    if (!entry || entry === 'package/' || entry.endsWith('/')) continue
    if (entry.includes('\0') || entry.startsWith('/') || !entry.startsWith('package/')) {
      throw new Error(`tarball contains an unsafe path: ${entry}`)
    }
    const segments = entry.split('/')
    if (segments.includes('.') || segments.includes('..')) throw new Error(`tarball contains an unsafe path: ${entry}`)
    if (entries.has(entry)) throw new Error(`tarball contains a duplicate entry: ${entry}`)
    entries.add(entry)
  }
  return entries
}

function readTarEntry(tarballPath, entry, root) {
  return runTar(['-xOf', tarballPath, entry], root, `tarball entry ${entry}`)
}

function collectExportTargets(value, path = 'exports') {
  if (typeof value === 'string') return [value]
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must contain only strings or condition objects`)
  }
  return Object.entries(value).flatMap(([key, nested]) => collectExportTargets(nested, `${path}.${key}`))
}

function validateExportTargets(packedManifest, entries) {
  if (!packedManifest.exports || typeof packedManifest.exports !== 'object' || Array.isArray(packedManifest.exports)) {
    throw new Error('packed package.json must declare an exports object')
  }
  const targets = collectExportTargets(packedManifest.exports)
  for (const target of targets) {
    if (!target.startsWith('./')) throw new Error(`packed export target must be package-relative: ${target}`)
    const relativeTarget = posix.normalize(target.slice(2))
    if (!relativeTarget || relativeTarget === '.' || relativeTarget.startsWith('../') || relativeTarget.includes('/../')) {
      throw new Error(`packed export target escapes the package: ${target}`)
    }
    const entry = `package/${relativeTarget}`
    if (!entries.has(entry)) throw new Error(`packed export target is missing from tarball: ${target}`)
  }
}

function readArtifact(root) {
  const destination = resolve(root, artifactDirectoryName)
  const artifactPath = join(destination, 'artifact.json')
  const artifact = readJson(artifactPath)
  const expectedKeys = ['byteLength', 'commit', 'filename', 'sha256', 'tarballPath', 'version']
  const actualKeys = Object.keys(artifact).sort()
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`artifact.json must contain exactly: ${expectedKeys.join(', ')}`)
  }
  if (typeof artifact.tarballPath !== 'string' || !isAbsolute(artifact.tarballPath)) throw new Error('artifact tarballPath must be absolute')
  if (resolve(artifact.tarballPath) !== artifact.tarballPath) throw new Error('artifact tarballPath must be normalized')
  if (relative(destination, artifact.tarballPath).startsWith('..') || isAbsolute(relative(destination, artifact.tarballPath))) {
    throw new Error('artifact tarballPath must point inside .release/quality')
  }
  if (typeof artifact.filename !== 'string' || artifact.filename !== basename(artifact.tarballPath) || !artifact.filename.endsWith('.tgz')) {
    throw new Error('artifact filename must match the tarball basename')
  }
  if (typeof artifact.version !== 'string' || artifact.version.length === 0) throw new Error('artifact version must be a non-empty string')
  if (typeof artifact.commit !== 'string' || !/^[0-9a-f]{40}$/u.test(artifact.commit)) throw new Error('artifact commit must be an exact git commit')
  if (!Number.isInteger(artifact.byteLength) || artifact.byteLength < 0) throw new Error('artifact byteLength must be a non-negative integer')
  if (typeof artifact.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(artifact.sha256)) throw new Error('artifact sha256 must be a lowercase SHA-256')
  return { artifact, destination }
}

function validatePackageFiles(files, root) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('package.json files must be a non-empty array')
  const seen = new Set()
  for (const file of files) {
    if (typeof file !== 'string' || file.length === 0) throw new Error('package.json files entries must be non-empty strings')
    if (file.startsWith('/') || file.startsWith('\\') || /^[A-Za-z]:[\\/]/u.test(file)) {
      throw new Error(`package.json files entry must be relative: ${file}`)
    }
    if (file.includes('\\') || /[*?\[\]{}]/u.test(file)) throw new Error(`package.json files entry must be an exact path: ${file}`)
    if (file.endsWith('/')) throw new Error(`package.json files entry must name a file: ${file}`)
    if (file.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
      throw new Error(`package.json files entry contains an invalid path segment: ${file}`)
    }
    if (posix.normalize(file) !== file) throw new Error(`package.json files entry must be normalized: ${file}`)
    if (seen.has(file)) throw new Error(`package.json files contains a duplicate entry: ${file}`)
    seen.add(file)
    const sourcePath = resolve(root, file)
    if (relative(root, sourcePath).startsWith('..') || isAbsolute(relative(root, sourcePath))) {
      throw new Error(`package.json files entry escapes the repository: ${file}`)
    }
    try {
      const sourceStat = lstatSync(sourcePath)
      if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error('not a regular file')
    } catch (error) {
      throw new Error(`package.json files entry does not identify a repository file: ${file}`, { cause: error })
    }
  }
  return [...seen].map((file) => `package/${file}`)
}

function validateTarEntries(entries, expectedEntries) {
  const expected = new Set(expectedEntries)
  const missing = [...expected].filter((entry) => !entries.has(entry)).sort()
  const unexpected = [...entries].filter((entry) => !expected.has(entry)).sort()
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `tarball content does not match package.json files; missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}`,
    )
  }
}

export function validatePackage(root = repositoryRoot, options = {}) {
  const resolvedRoot = resolve(root)
  const { artifact, destination } = readArtifact(resolvedRoot)
  const sourceManifest = readJson(join(resolvedRoot, 'package.json'))
  const expectedEntries = ['package/package.json', ...validatePackageFiles(sourceManifest.files, resolvedRoot)]
  if (sourceManifest.version !== artifact.version) throw new Error(`artifact version ${artifact.version} differs from package.json ${sourceManifest.version}`)
  const actualCommit = (options.gitCommit ?? currentGitCommit)(resolvedRoot)
  if (actualCommit !== artifact.commit) throw new Error(`artifact commit ${artifact.commit} differs from current git commit ${actualCommit}`)

  const tarballPath = artifact.tarballPath
  const stats = (() => {
    try {
      return readFileSync(tarballPath).byteLength
    } catch (error) {
      throw new Error(`cannot read artifact tarball ${tarballPath}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
  })()
  if (stats !== artifact.byteLength) throw new Error(`artifact byteLength ${artifact.byteLength} differs from tarball ${stats}`)
  const actualSha = sha256(tarballPath)
  if (actualSha !== artifact.sha256) throw new Error(`artifact sha256 ${artifact.sha256} differs from tarball ${actualSha}`)

  const entries = listTarEntries(tarballPath, resolvedRoot)
  validateTarEntries(entries, expectedEntries)
  const packedManifest = (() => {
    try {
      return JSON.parse(readTarEntry(tarballPath, 'package/package.json', resolvedRoot))
    } catch (error) {
      throw new Error(`packed package.json is invalid: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
  })()
  if (packedManifest.name !== sourceManifest.name) throw new Error(`packed package name ${packedManifest.name} differs from package.json ${sourceManifest.name}`)
  if (packedManifest.version !== artifact.version) throw new Error(`packed package version ${packedManifest.version} differs from artifact ${artifact.version}`)
  if (JSON.stringify(packedManifest.files) !== JSON.stringify(sourceManifest.files)) {
    throw new Error('packed package.json files differs from the source package.json files')
  }
  validateExportTargets(packedManifest, entries)

  const result = { artifact, entries: [...entries].sort(), packedManifest }
  process.stdout.write(`package validated: ${artifact.filename} (${artifact.sha256})\n`)
  return result
}

export function main(argv = process.argv.slice(2)) {
  validatePackage(parseArguments(argv))
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main()
  } catch (error) {
    process.stderr.write(`package:validate: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
