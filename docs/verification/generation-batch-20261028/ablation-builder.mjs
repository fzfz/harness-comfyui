import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, readlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const baselineRef = 'c23129b'
const paths = {
  persona: 'agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml',
  skill: '.agents/skills/comfyui-generate/SKILL.md',
  contract: '.agents/skills/comfyui-generate/references/prompt-result-contract.md',
  schema: '.agents/skills/comfyui-generate/references/prompt-result-schema.json',
  limits: 'config/managed-cli-limits.json',
  cli: '.local/source-cli/harness-comfyui.mjs',
}

function replaceOnce(text, before, after) {
  assert.equal(text.split(before).length, 2, `Expected exactly one occurrence: ${before.slice(0, 100)}`)
  return text.replace(before, after)
}

async function files(directory, prefix = '') {
  const result = new Map()
  for (const name of (await readdir(join(directory, prefix))).sort()) {
    const path = join(prefix, name)
    const stat = await lstat(join(directory, path))
    if (stat.isDirectory()) {
      for (const [key, value] of await files(directory, path)) result.set(key, value)
    } else {
      assert.ok(stat.isFile() || stat.isSymbolicLink(), `Unsupported package member: ${path}`)
      result.set(path, {
        mode: stat.mode & 0o777,
        bytes: stat.isSymbolicLink() ? Buffer.from(`symlink:${await readlink(join(directory, path))}`) : await readFile(join(directory, path)),
      })
    }
  }
  return result
}

async function differences(beforeDirectory, afterDirectory) {
  const before = await files(beforeDirectory)
  const after = await files(afterDirectory)
  const changes = []
  for (const path of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const first = before.get(path)
    const second = after.get(path)
    if (first && second && first.mode === second.mode && first.bytes.equals(second.bytes)) continue
    changes.push({ path, operation: !first ? 'added' : !second ? 'removed' : 'modified' })
  }
  return changes
}

async function write(directory, path, text) {
  await mkdir(dirname(join(directory, path)), { recursive: true })
  await writeFile(join(directory, path), text)
}

function queryProjection(text) {
  const start = text.indexOf('\tasync readGenerationRunMedia(input, signal) {')
  const end = text.indexOf('\n\tasync advance(signal) {', start)
  assert.ok(start >= 0 && end > start, 'Expected complete compiled Runtime media method.')
  let method = text.slice(start, end)
  method = replaceOnce(method,
    'const parameters = input.includeParameters === true ? runInputArguments(historicalGenerationRequest(row.request_json)).parameters : void 0;',
    'const argumentsValue = runInputArguments(historicalGenerationRequest(row.request_json));')
  const first = method.indexOf('\t\t\t\t\trun_id: row.run_id,')
  const last = method.indexOf('\t\t\t\t\timages: Object.freeze(', first)
  assert.ok(first >= 0 && last > first)
  const candidateProjection = method.slice(first, last)
  assert.equal(candidateProjection.split('\n').filter(Boolean).length, 11)
  const legacyProjection = [
    '\t\t\t\t\trun_id: row.run_id,',
    '\t\t\t\t\tlookup_status: "available",',
    '\t\t\t\t\ttitle: argumentsValue.title,',
    '\t\t\t\t\tparameters: argumentsValue.parameters,',
    '',
  ].join('\n')
  method = replaceOnce(method, candidateProjection, legacyProjection)
  return text.slice(0, start) + method + text.slice(end)
}

function fileAdmission(candidate, baseline) {
  const gate = baseline.match(/### 1\. 校验 Prompt Builder 结果并确定待创建图片\n\n([\s\S]*?)\n### 2\./)?.[1].trim().replace('1. Skill 执行者', '1. 创建图片时，Skill 执行者')
  const oldPrompt = baseline.match(/### 2\. 构造 Prompt 并分配生成模型和 LoRA\n\n1\. ([^\n]+)/)?.[1]
  const firstSection = candidate.match(/## 1\. 确定任务与输入\n\n([\s\S]*?)\n## 2\./)?.[1]
  assert.ok(gate && oldPrompt && firstSection, 'Expected original admission contract and candidate input section.')
  const tail = firstSection.split('\n').filter(line => /^[345]\. /.test(line)).map(line => line.replace(/^([345])\./, (_, number) => `${Number(number) + 2}.`)).join('\n')
  assert.equal(tail.split('\n').length, 3)
  let result = replaceOnce(candidate, firstSection, `${gate}\n\n${tail}\n`)
  const currentPrompt = result.split('\n').find(line => line.startsWith('4. 执行者将提示词内容对应到 Workflow 的文本参数。'))
  assert.ok(currentPrompt, 'Expected file input mapping rule.')
  result = replaceOnce(result, currentPrompt, `4. ${oldPrompt}`)
  return result
}

export async function buildAblations({
  candidateTarball = join(repositoryRoot, '.local/generation-model-candidate-final.tgz'),
  outputDirectory = join(repositoryRoot, '.local/generation-ablation'),
} = {}) {
  candidateTarball = resolve(candidateTarball)
  outputDirectory = resolve(outputDirectory)
  const allowedDirectory = join(repositoryRoot, '.local/generation-ablation')
  assert.ok(outputDirectory === allowedDirectory || outputDirectory.startsWith(`${allowedDirectory}${sep}`), 'Output must stay under .local/generation-ablation.')
  await mkdir(outputDirectory, { recursive: true })
  const buildDirectory = await mkdtemp(join(outputDirectory, 'build-'))
  const sourceTarball = join(buildDirectory, 'candidate.tgz')
  await cp(candidateTarball, sourceTarball)
  const members = execFileSync('tar', ['-tzf', sourceTarball], { encoding: 'utf8' }).trim().split('\n')
  for (const member of members) assert.ok(member.startsWith('package/') && !member.split('/').includes('..'), `Unsafe archive member: ${member}`)
  const sourceDirectory = join(buildDirectory, 'source')
  await mkdir(sourceDirectory)
  execFileSync('tar', ['-xzf', sourceTarball, '-C', sourceDirectory])
  const sourcePackageDirectory = join(sourceDirectory, 'package')
  const runtimeFiles = (await readdir(join(sourcePackageDirectory, '.local/source-host'))).filter(name => /^generation-runtime-.*\.js$/.test(name))
  assert.equal(runtimeFiles.length, 1)
  const packagePaths = { ...paths, runtime: `.local/source-host/${runtimeFiles[0]}` }
  const baselineSha = execFileSync('git', ['rev-parse', `${baselineRef}^{commit}`], { cwd: repositoryRoot, encoding: 'utf8' }).trim()
  const evidenceDirectory = join(buildDirectory, 'evidence')
  const originals = {}
  for (const path of [paths.persona, paths.skill, paths.contract, paths.schema, 'src/host/generation/generation-runtime.ts']) {
    const content = execFileSync('git', ['show', `${baselineSha}:${path}`], { cwd: repositoryRoot, encoding: 'utf8' })
    originals[path] = content
    await write(join(evidenceDirectory, 'baseline'), path, content)
  }
  const sourceText = async path => readFile(join(sourcePackageDirectory, path), 'utf8')
  const persona = await sourceText(paths.persona)
  const previousEntry = originals[paths.persona].split('\n').find(line => line.startsWith('      你根据任务和当前 Skill 摘要选择适用的 Skill，'))
  const candidateEntry = persona.split('\n').find(line => line.startsWith('      设计提示词时，你根据任务与当前 Skill 摘要读取适用的 Prompt Builder。'))
  assert.ok(previousEntry && candidateEntry)
  const limitInline = '//#region config/managed-cli-limits.json\nvar maxSubmissionItems = 20;'
  const variants = [
    { id: 'entry', factor: 'persona Skill entry paragraph', expected: [paths.persona], edits: {
      [paths.persona]: replaceOnce(persona, candidateEntry, previousEntry),
    } },
    { id: 'file-admission', factor: 'Prompt Builder ten-field admission contract', expected: [paths.skill, paths.contract, paths.schema], edits: {
      [paths.skill]: fileAdmission(await sourceText(paths.skill), originals[paths.skill]),
      [paths.contract]: originals[paths.contract]
        .replace('`../SKILL.md` 的“创建图片”流程交给本文件校验', '`../SKILL.md` 第 1 节“确定任务与输入”交给本文件校验')
        .replace('## 返回“创建图片”流程', '## 返回输入处理步骤')
        .replace('`../SKILL.md` 的“创建图片”流程。', '`../SKILL.md` 第 1 节“确定任务与输入”。'),
      [paths.schema]: originals[paths.schema],
    } },
    { id: 'query', factor: 'Runtime readGenerationRunMedia successful result projection', expected: [packagePaths.runtime], edits: {
      [packagePaths.runtime]: queryProjection(await sourceText(packagePaths.runtime)),
    } },
    { id: 'batch-limit', factor: 'maxSubmissionItems configuration and two compiled derivatives', expected: [paths.limits, packagePaths.runtime, paths.cli], edits: {
      [paths.limits]: replaceOnce(await sourceText(paths.limits), '"maxSubmissionItems": 20', '"maxSubmissionItems": 1'),
      [packagePaths.runtime]: replaceOnce(await sourceText(packagePaths.runtime), limitInline, limitInline.replace('= 20;', '= 1;')),
      [paths.cli]: replaceOnce(await sourceText(paths.cli), limitInline, limitInline.replace('= 20;', '= 1;')),
    } },
  ]
  const results = []
  for (const variant of variants) {
    const directory = join(buildDirectory, variant.id)
    const packageDirectory = join(directory, 'package')
    await cp(sourcePackageDirectory, packageDirectory, { recursive: true })
    for (const [path, text] of Object.entries(variant.edits)) await write(packageDirectory, path, text)
    const changes = await differences(sourcePackageDirectory, packageDirectory)
    assert.deepEqual(changes.map(change => change.path), variant.expected.toSorted())
    for (const path of [packagePaths.runtime, paths.cli].filter(path => Object.hasOwn(variant.edits, path))) {
      execFileSync(process.execPath, ['--check', join(packageDirectory, path)])
    }
    const diff = join(evidenceDirectory, `${variant.id}.diff`)
    const comparison = spawnSync('git', ['diff', '--no-index', '--no-ext-diff', '--', sourcePackageDirectory, packageDirectory], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    assert.equal(comparison.status, 1, comparison.stderr)
    await writeFile(diff, comparison.stdout)
    const tarball = join(buildDirectory, `generation-ablation-${variant.id}.tgz`)
    execFileSync('tar', ['-czf', tarball, '-C', directory, 'package'])
    const roundTrip = join(buildDirectory, 'round-trip', variant.id)
    await mkdir(roundTrip, { recursive: true })
    execFileSync('tar', ['-xzf', tarball, '-C', roundTrip])
    assert.deepEqual(await differences(packageDirectory, join(roundTrip, 'package')), [])
    results.push({ id: variant.id, factor: variant.factor, tarball, packageDirectory, changes, diff,
      packageMetadataUnchanged: true, archiveRoundTripVerified: true })
  }
  const report = {
    baselineSha, candidateTarball, sourceTarball, buildDirectory, sourcePackageDirectory, paths: packagePaths,
    packageVersion: JSON.parse(await sourceText('package.json')).version,
    entryReplacement: { before: candidateEntry.trim(), after: previousEntry.trim(), paragraph: 'persona.prefix Skill selection paragraph immediately before local reference reading' },
    queryTask: '工作目录：{{workspace}}。生成 Skill：{{skill}}。请核对已有 Run {{failedRunId}} 的当前执行情况，交付已经保存的图片路径，说明需要处理的问题及判断依据。本轮只核对已有任务。',
    queryFixture: { sameBothArms: true, discloseStatusInTask: false, reuseMatrixKnownFailureFixture: true,
      note: 'Use actual Workspace/session identity, the same original request and failure code/message, and a fresh isolated database for each session.' },
    fileAdmissionBaselineAdaptations: ['Restore the creation-only scope previously supplied by the original section heading.', 'Update three original contract section references to current SKILL.md section 1; validation rules and JSON schema retain baseline text.'],
    batchLimitDerivatives: [paths.limits, packagePaths.runtime, paths.cli],
    variants: results,
  }
  const manifest = join(buildDirectory, 'manifest.json')
  await writeFile(manifest, `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(join(outputDirectory, 'latest.json'), `${JSON.stringify({ manifest }, null, 2)}\n`)
  return { manifest, ...report }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log((await buildAblations()).manifest) }
  catch (error) { console.error(error.stack ?? String(error)); process.exitCode = 1 }
}
