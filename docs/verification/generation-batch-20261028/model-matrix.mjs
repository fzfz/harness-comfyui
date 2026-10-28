import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'

import { createTraceEvidenceWriter, evidenceSecretsFromEnvironment } from '../../../tests/desktop/fixtures/official-trace-evidence.mjs'
const driver = await import(new URL('./real-model-driver.mjs', import.meta.url).href + new URL(import.meta.url).search)

const caseFile = fileURLToPath(new URL('./model-cases.json', import.meta.url))
const evidenceRoot = fileURLToPath(new URL('./model-traces/', import.meta.url))
const inputNames = Array.from({ length: 11 }, (_, index) => `prompt-${String(index + 1).padStart(2, '0')}.txt`)
const failure = Object.freeze({ code: 'COMFYUI_REMOTE_ERROR', message: 'The controlled prior generation failed before producing an image.' })

function render(text, values) {
  return text.replace(/\{\{([A-Za-z]+)\}\}/gu, (_match, key) => {
    if (!Object.hasOwn(values, key)) throw new Error(`Missing case template value: ${key}.`)
    return values[key]
  })
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}

function errorRecord(error, stage) {
  return { stage, name: error?.name ?? 'Error', code: error?.code ?? null,
    message: error instanceof Error ? error.message : String(error), terminal: error?.terminal ?? null }
}

async function runRepositoryPath(app) {
  const root = app.installation.installedPackageRoot
  const base = JSON.parse(await readFile(join(root, 'config/base.json'), 'utf8'))
  const profileRows = await app.adapter.parse(await readFile(join(app.record.directories.profile, app.config.paths.profilePatchFilename), 'utf8'))
  const find = rows => rows.flatMap(row => [...(row.id === 'harness-comfyui-core' ? [row] : []),
    ...(row.group && Array.isArray(row.config) ? find(row.config) : [])])
  const cores = find(profileRows)
  if (cores.length > 1) throw new Error('The isolated Profile contains duplicate ComfyUI core entries.')
  const core = cores[0]?.config ?? {}
  const profile = JSON.parse(await readFile(join(root, 'config/profiles', `${core.configurationProfile ?? 'production'}.json`), 'utf8'))
  const configured = { ...base.paths, ...profile.paths }
  const file = await realpath(core.dataDirectory
    ? resolve(core.dataDirectory, relative(base.paths.dataDir, base.paths.runRepositoryFile))
    : resolve(app.record.directories.dshHome, configured.runRepositoryFile))
  const home = await realpath(app.record.directories.dshHome)
  const child = relative(home, file)
  if (!child || child === '..' || child.startsWith('..' + sep) || isAbsolute(child)) throw new Error('Fixture insertion requires runs.sqlite inside the current isolated Harness home.')
  if (!(await stat(file)).isFile()) throw new Error('The isolated Run Repository must already exist.')
  return file
}

async function seedFailure(app, identity, inputDirectory, comfyOrigin) {
  if (!identity.workspaceId || !identity.sessionId) throw new Error('Failure fixture requires official Workspace and Session identities.')
  const repositoryPath = await runRepositoryPath(app)
  const database = new DatabaseSync(repositoryPath)
  try {
    const columns = database.prepare('PRAGMA table_info(generation_runs)').all().map(column => column.name)
    const required = ['run_id', 'workspace_id', 'session_id', 'turn', 'call_id', 'title', 'template_id', 'status', 'revision', 'request_json', 'error_code', 'error_message', 'created_at', 'updated_at']
    if (required.some(name => !columns.includes(name))) throw new Error('The installed generation_runs table does not satisfy the fixture schema.')
    const runId = `run_${randomUUID()}`
    const requestId = randomUUID()
    const request = { title: 'Controlled prior generation failure', instanceId: '1', templateId: '1', model: null, loras: [],
      parameters: { positive_prompt: await readFile(join(inputDirectory, inputNames[0]), 'utf8'), seed: 424242, width: 512, height: 512 } }
    const now = Date.now()
    const row = { run_id: runId, workspace_id: identity.workspaceId, session_id: identity.sessionId, turn: 0,
      call_id: `fixture_${requestId}`, title: request.title, instance_id: '1', instance_title: 'Controlled ComfyUI',
      instance_origin: comfyOrigin, template_id: request.templateId, template_title: 'Controlled Workflow',
      status: 'failed', revision: 1, prompt_id: null, request_json: JSON.stringify(canonical(request)),
      source_snapshot_path: null, actual_workflow_path: null, api_workflow_path: null,
      expected_output_node_ids_json: null, missing_observed_at: null,
      error_code: failure.code, error_message: failure.message, created_at: now, updated_at: now,
      ...(columns.includes('request_id') ? { request_id: requestId } : {}) }
    const names = Object.keys(row).filter(name => columns.includes(name))
    database.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; BEGIN IMMEDIATE')
    try {
      database.prepare(`INSERT INTO generation_runs (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
        .run(...names.map(name => row[name]))
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
    return { repositoryPath, columns, runId, requestId: columns.includes('request_id') ? requestId : null,
      workspaceId: identity.workspaceId, sessionId: identity.sessionId, request, status: 'failed', error: failure }
  } finally { database.close() }
}

async function observe(app, sessionId) {
  return app.page.evaluate(`(async () => {
    const context = window.__runPanelTestContext
    const session = await context.get('remote.session').projections(${JSON.stringify({ sessionId })})
    const sessions = await context.get('remote.session').list({})
    const goal = await context.get('remote.goals').get(${JSON.stringify(sessionId)})
    const generation = await context.get('remote.harnessComfyuiGeneration').list(${JSON.stringify({ sessionId, turn: null })})
    return { session, goal, generation, sessionRunning: sessions.ok
      ? sessions.value.items.find(item => item.sessionId === ${JSON.stringify(sessionId)})?.running ?? null : null }
  })()`)
}

export async function runMatrix(app, { label, inputDirectory, caseIds, repetitions, onProgress, specificationFile = caseFile } = {}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(label ?? '')) throw new TypeError('label must be a nonempty path component containing letters, digits, dots, hyphens, or underscores.')
  if (!app.page || !app.installation || !app.sourceIdentity) throw new Error('Start and install the candidate before running the matrix.')
  specificationFile = await realpath(resolve(specificationFile))
  const specification = JSON.parse(await readFile(specificationFile, 'utf8'))
  repetitions ??= specification.repetitions
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) throw new TypeError('repetitions must be a positive integer.')
  caseIds ??= specification.cases.map(item => item.id)
  if (!Array.isArray(caseIds) || caseIds.length === 0 || new Set(caseIds).size !== caseIds.length
    || caseIds.some(id => !specification.cases.some(item => item.id === id))) throw new TypeError('caseIds must select unique IDs from the specification file.')
  for (const scenario of specification.cases.filter(item => caseIds.includes(item.id))) {
    if (scenario.seedFailure !== undefined && typeof scenario.seedFailure !== 'boolean') throw new TypeError('Case seedFailure must be a boolean.')
    if (scenario.taskTemplate !== undefined) {
      if (typeof scenario.taskTemplate !== 'string' || scenario.taskTemplate.trim().length === 0) throw new TypeError('Case taskTemplate must be a nonempty string.')
    } else if (typeof scenario.prefix !== 'string' || typeof specification.sharedTask !== 'string') {
      throw new TypeError('Cases without taskTemplate must provide prefix and sharedTask strings.')
    }
  }
  inputDirectory = await realpath(resolve(inputDirectory))
  for (const name of inputNames) if (!(await stat(join(inputDirectory, name))).isFile()) throw new Error(`Missing input text: ${name}.`)
  const modelConfig = app.config.modes.development.initialProfilePatches.find(row => row.id === 'agent-default-model')?.config
  for (const key of ['provider', 'model', 'reasoningEffort']) if (modelConfig?.[key] !== specification.model[key]) throw new Error(`Matrix model configuration differs at ${key}.`)
  const configuration = app.config.modes.development.initialProfilePatches.find(row => row.id === 'harness-comfyui-core')?.config.configuration
  if (!configuration?.url || !configuration?.port) throw new Error('The matrix requires a configured controlled ComfyUI source address.')
  const origin = new URL(configuration.url)
  origin.port = String(configuration.port)
  const comfyOrigin = origin.origin
  const skill = join(app.installation.installedPackageRoot, '.agents/skills/comfyui-generate/SKILL.md')
  if (!(await stat(skill)).isFile()) throw new Error('The installed generation Skill is missing.')
  const matrixId = randomUUID()
  const outputDirectory = join(evidenceRoot, label, matrixId)
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'generation-model-matrix-'))
  const environment = parseEnv(await readFile(app.config.modes.development.environmentFilePath, 'utf8'))
  const secrets = evidenceSecretsFromEnvironment(Object.fromEntries(app.config.modes.development.credentialEnvironmentNames.map(name => [name, environment[name]])))
  const writer = createTraceEvidenceWriter({ directory: outputDirectory, secrets })
  const matrix = { schemaVersion: 1, matrixId, label, startedAt: new Date().toISOString(), specificationFile, inputDirectory, workspaceRoot,
    model: specification.model, repetitions, caseIds, sourceIdentity: app.sourceIdentity,
    installedPackageRoot: app.installation.installedPackageRoot, configPath: app.configPath,
    businessAssessment: 'pending-human-review', executionStatus: 'running', cases: [] }
  const indexPath = writer.writeJson('matrix.json', matrix).path
  const progress = async event => {
    writer.writeJson('matrix.json', matrix)
    if (onProgress) await onProgress({ matrixId, label, indexPath, ...event })
  }
  for (const caseId of caseIds) {
    const scenario = specification.cases.find(item => item.id === caseId)
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const entry = { caseId, repetition, startedAt: new Date().toISOString(), phases: [], errors: [], businessAssessment: 'pending-human-review' }
      matrix.cases.push(entry)
      let stage = 'prepare'
      let phase
      try {
        const workspacePath = join(workspaceRoot, caseId, String(repetition))
        const destination = join(workspacePath, 'input')
        await mkdir(destination, { recursive: true, mode: 0o700 })
        entry.inputs = []
        for (const name of inputNames) {
          const target = join(destination, name)
          await copyFile(join(inputDirectory, name), target)
          entry.inputs.push({ name, path: target, byteLength: (await stat(target)).size })
        }
        entry.identity = await driver.openSession(app, { workspacePath, title: `${label} ${caseId} ${repetition}` })
        if (caseId === 'known-failure' || scenario.seedFailure === true) entry.failureFixture = await seedFailure(app, entry.identity, destination, comfyOrigin)
        const values = { workspace: workspacePath, skill, comfyOrigin, failedRunId: entry.failureFixture?.runId ?? '' }
        const prompt = render(scenario.taskTemplate ?? scenario.prefix + specification.sharedTask, values)
        entry.initialObservation = await observe(app, entry.identity.sessionId)
        for (const [phaseId, task] of [['initial', prompt], ...(scenario.resume ? [['resume', scenario.resume]] : [])]) {
          stage = phaseId
          phase = { id: phaseId, runId: app.runId, startedAt: new Date().toISOString(), naturalCompletion: false }
          entry.phases.push(phase)
          if (phaseId === 'resume') {
            phase.restart = await driver.restart(app)
            await driver.openSession(app, entry.identity)
            phase.runId = app.runId
            phase.before = await observe(app, entry.identity.sessionId)
          }
          const relativeDirectory = join(caseId, String(repetition), phaseId)
          await mkdir(join(outputDirectory, relativeDirectory), { recursive: true, mode: 0o700 })
          if (phaseId === 'initial') {
            const promptPath = join(outputDirectory, relativeDirectory, 'task-input.txt')
            await writeFile(promptPath, task, { mode: 0o600 })
            phase.promptPath = promptPath
          } else {
            if (task?.action !== 'goal-bar') throw new Error('Goal resume cases must declare the fixed goal-bar user action.')
            phase.userAction = task
            writer.writeJson(join(relativeDirectory, 'user-action.json'), task)
          }
          await progress({ caseId, repetition, stage: `${phaseId}-starting`, sessionId: entry.identity.sessionId, runId: app.runId })
          const result = phaseId === 'initial' ? await driver.submit(app, { prompt: task }) : await driver.resumeGoal(app)
          phase.naturalCompletion = true
          phase.terminal = result.terminal
          if (result.action) phase.userActionResult = { action: result.action, beforeGoal: result.beforeGoal }
          phase.observation = await observe(app, entry.identity.sessionId)
          phase.trace = await driver.exportSession(app, { sessionId: entry.identity.sessionId,
            outputDirectory: join(outputDirectory, relativeDirectory, 'trace') })
          phase.completedAt = new Date().toISOString()
          writer.writeJson(join(relativeDirectory, 'result.json'), phase)
          await progress({ caseId, repetition, stage: `${phaseId}-naturally-ended`, sessionId: entry.identity.sessionId, traceIndexPath: phase.trace.indexPath })
        }
        entry.executionStatus = 'naturally-ended'
      } catch (error) {
        entry.executionStatus = 'execution-error'
        entry.errors.push(errorRecord(error, stage))
        if (phase && error?.terminal) phase.terminal = error.terminal
        if (entry.identity && app.page) {
          try { entry.lastObservation = await observe(app, entry.identity.sessionId) } catch (observationError) { entry.errors.push(errorRecord(observationError, 'error-observation')) }
          try {
            entry.errorTrace = await driver.exportSession(app, { sessionId: entry.identity.sessionId,
              outputDirectory: join(outputDirectory, caseId, String(repetition), 'error-trace'), timeoutMs: 1000 })
          } catch (exportError) { entry.errors.push(errorRecord(exportError, 'error-trace')) }
        }
        if (!app.page || entry.lastObservation?.sessionRunning !== false || entry.errors.some(item => item.code === 'SESSION_STILL_RUNNING')) {
          matrix.executionStatus = 'operator-attention-required'
        }
      }
      entry.completedAt = new Date().toISOString()
      writer.writeJson(join(caseId, String(repetition), 'result.json'), entry)
      await progress({ caseId, repetition, stage: entry.executionStatus, sessionId: entry.identity?.sessionId ?? null })
      if (matrix.executionStatus === 'operator-attention-required') break
    }
    if (matrix.executionStatus === 'operator-attention-required') break
  }
  if (matrix.executionStatus === 'running') matrix.executionStatus = 'recorded'
  matrix.completedAt = new Date().toISOString()
  writer.writeJson('matrix.json', matrix)
  return { indexPath, outputDirectory, workspaceRoot, executionStatus: matrix.executionStatus,
    recordedCases: matrix.cases.length, naturalCompletions: matrix.cases.flatMap(item => item.phases).filter(item => item.naturalCompletion).length,
    businessAssessment: matrix.businessAssessment }
}
