import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { ArtifactManifest } from '../../../src/testing/profile-fixture.ts'

export type CandidateFailureMode = 'none' | 'start' | 'health'

export interface CandidateArtifact {
  readonly tarballPath: string
  readonly version: string
  readonly mode: CandidateFailureMode
}

interface CommandResult {
  code: number | null
  signal: NodeJS.Signals | null
  stderr: string
}

function runTar(args: string[]): Promise<CommandResult> {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn('tar', args, { stdio: ['ignore', 'ignore', 'pipe'], shell: false })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', rejectResult)
    child.once('close', (code, signal) => resolveResult({ code, signal, stderr }))
  })
}

function candidateStartFailurePrelude(): string {
  return `import { appendFileSync } from 'node:fs'

const candidateEvidencePath = process.env.HARNESS_TEST_CANDIDATE_EVIDENCE
function recordCandidateEvidence(event) {
  if (candidateEvidencePath === undefined) return
  appendFileSync(candidateEvidencePath, JSON.stringify({ event, pid: process.pid }) + '\\n', 'utf8')
}
`
}

function candidateHostEvidencePrelude(): string {
  return `import { appendFileSync } from 'node:fs'

const candidateEvidencePath = process.env.HARNESS_TEST_CANDIDATE_EVIDENCE
function recordCandidateEvidence(event, pid) {
  if (candidateEvidencePath === undefined) return
  appendFileSync(candidateEvidencePath, JSON.stringify({ event, pid }) + '\\n', 'utf8')
}
`
}

function candidateHealthFailurePrelude(): string {
  return `import { appendFileSync } from 'node:fs'

const candidateFailureMode = process.env.HARNESS_TEST_CANDIDATE_MODE
const candidateEvidencePath = process.env.HARNESS_TEST_CANDIDATE_EVIDENCE
function recordCandidateEvidence(event) {
  if (candidateEvidencePath === undefined) return
  appendFileSync(candidateEvidencePath, JSON.stringify({ event, pid: process.pid }) + '\\n', 'utf8')
}
`
}

async function patchStartModule(packageRoot: string, prelude: string, replacement: string): Promise<void> {
  const startPath = join(packageRoot, 'scripts/profile/start.mjs')
  let startSource = await readFile(startPath, 'utf8')
  const spawnAnchor = '  return spawn(command, dshArguments, {'
  const spawnAnchorCount = startSource.split(spawnAnchor).length - 1
  if (spawnAnchorCount !== 1) {
    throw new Error(`candidate fixture profile start spawn anchor must occur exactly once; found ${spawnAnchorCount}`)
  }
  const returnAnchor = '  })\n}\n\nexport function runForeground'
  const returnAnchorCount = startSource.split(returnAnchor).length - 1
  if (returnAnchorCount !== 1) {
    throw new Error(`candidate fixture profile start return anchor must occur exactly once; found ${returnAnchorCount}`)
  }
  startSource = `${prelude}${startSource.replace(spawnAnchor, '  const child = spawn(command, dshArguments, {').replace(
    returnAnchor,
    replacement,
  )}`
  await writeFile(startPath, startSource, 'utf8')
}

async function patchStartFailureModule(packageRoot: string): Promise<void> {
  const startPath = join(packageRoot, 'scripts/profile/start.mjs')
  const startSource = await readFile(startPath, 'utf8')
  const spawnForegroundAnchor = 'export function spawnForeground(options) {\n'
  const anchorCount = startSource.split(spawnForegroundAnchor).length - 1
  if (anchorCount !== 1) {
    throw new Error(`candidate fixture profile start function anchor must occur exactly once; found ${anchorCount}`)
  }
  const injectedFunction = `${spawnForegroundAnchor}  if (process.env.HARNESS_TEST_CANDIDATE_MODE === 'start') {
    recordCandidateEvidence('candidate-start-failure')
    throw new Error('candidate-only start failure')
  }
`
  await writeFile(
    startPath,
    `${candidateStartFailurePrelude()}${startSource.replace(spawnForegroundAnchor, injectedFunction)}`,
    'utf8',
  )
}

async function patchHealthModule(packageRoot: string): Promise<void> {
  const healthPath = join(packageRoot, 'scripts/deploy/health.mjs')
  let healthSource = await readFile(healthPath, 'utf8')
  const healthAnchor = 'export async function runProductHealth(input) {\n  const evidence = initialProductHealthEvidence();'
  if (!healthSource.includes(healthAnchor)) throw new Error('candidate fixture could not locate product health anchor')
  healthSource = `${candidateHealthFailurePrelude()}${healthSource.replace(
    healthAnchor,
    "export async function runProductHealth(input) {\n  if (candidateFailureMode === 'health') {\n    recordCandidateEvidence('candidate-health-failure')\n    return { stage: 'health', status: 'failed' }\n  }\n  const evidence = initialProductHealthEvidence();",
  )}`
  await writeFile(healthPath, healthSource, 'utf8')
}

async function patchCandidatePackage(packageRoot: string, mode: CandidateFailureMode): Promise<void> {
  if (mode === 'none') return
  if (mode === 'start') {
    await patchStartFailureModule(packageRoot)
    return
  }
  await patchStartModule(
    packageRoot,
    candidateHostEvidencePrelude(),
    "  })\n  if (child.pid !== undefined) recordCandidateEvidence('candidate-host-started', child.pid)\n  return child\n}\n\nexport function runForeground",
  )
  await patchHealthModule(packageRoot)
}

export async function deriveCandidateArtifact(
  artifact: ArtifactManifest,
  outputRoot: string,
  options: { mode: CandidateFailureMode; versionSuffix: string },
): Promise<CandidateArtifact> {
  if (options.versionSuffix.length === 0 || options.versionSuffix.includes('/') || options.versionSuffix.includes('\\')) {
    throw new TypeError('candidate versionSuffix must be a non-empty release-safe string')
  }
  const version = `${artifact.version}-${options.versionSuffix}`
  if (version === artifact.version) throw new Error('candidate version must differ from the verified artifact version')
  await mkdir(outputRoot, { recursive: true })
  const extractionRoot = await mkdtemp(join(outputRoot, '.candidate-package-'))
  const tarballPath = join(outputRoot, `harness-comfyui-${version}.tgz`)
  try {
    const extraction = await runTar(['-xzf', artifact.tarballPath, '-C', extractionRoot])
    if (extraction.code !== 0) throw new Error(`candidate artifact extraction failed: ${extraction.stderr || String(extraction.code ?? extraction.signal)}`)
    const packageRoot = join(extractionRoot, 'package')
    const manifestPath = join(packageRoot, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
    const originalVersion = manifest.version
    if (typeof originalVersion !== 'string' || originalVersion.length === 0) {
      throw new Error('candidate artifact source package version must be a non-empty string')
    }
    if (originalVersion !== artifact.version) {
      throw new Error(`candidate artifact source package version does not match verified artifact: ${originalVersion}`)
    }
    manifest.version = version
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    const packageIndexPath = join(packageRoot, 'lib/index.js')
    const packageIndex = await readFile(packageIndexPath, 'utf8')
    const originalVersionMarker = `var version = ${JSON.stringify(originalVersion)};`
    const markerCount = packageIndex.split(originalVersionMarker).length - 1
    if (markerCount !== 1) {
      throw new Error(`candidate artifact package version marker must occur exactly once; found ${markerCount}`)
    }
    await writeFile(
      packageIndexPath,
      packageIndex.replace(originalVersionMarker, `var version = ${JSON.stringify(version)};`),
      'utf8',
    )
    await patchCandidatePackage(packageRoot, options.mode)
    const packed = await runTar(['-czf', tarballPath, '-C', extractionRoot, 'package'])
    if (packed.code !== 0) throw new Error(`candidate artifact packing failed: ${packed.stderr || String(packed.code ?? packed.signal)}`)
    return { tarballPath, version, mode: options.mode }
  } finally {
    await rm(extractionRoot, { recursive: true, force: true })
  }
}
