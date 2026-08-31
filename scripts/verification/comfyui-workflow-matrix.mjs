import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import { CatalogCli } from '../../src/host/catalog/catalog-cli.ts'
import { ChromeComfyFrontend } from '../../src/host/generation/comfy-frontend-browser.ts'
import { OfficialApiWorkflowCompiler } from '../../src/host/generation/official-api-workflow.ts'
import {
  RUNTIME_PARAMETER_INPUT_ALIASES,
  STANDARD_RUNTIME_PARAMETER_KINDS,
} from '../../src/host/generation/runtime-parameters.ts'
import { GenerationSourceCli } from '../../src/host/generation/source-cli.ts'
import { ComfyWorkflowCompiler } from '../../src/host/generation/workflow-compiler.ts'
import { loadSourceWorktreeContext } from '../worktree/runtime.mjs'

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PARAMETER_SUPPORT_BASELINE_PATH = resolve(
  REPOSITORY_ROOT,
  'config/verification/comfyui-workflow-parameter-support.json',
)
const CATALOG_PAGE_SIZE = 9
const EXPECTED_NOT_FOUND = 'GENERATION_PARAMETER_TARGET_NOT_FOUND'
const EXPECTED_INVALID = 'GENERATION_PARAMETER_INVALID'

export const MATRIX_PARAMETER_VALUES = Object.freeze({
  positive_prompt: 'matrix positive prompt',
  negative_prompt: 'matrix negative prompt',
  width: 832,
  height: 1216,
  seed: 123456,
  cfg: 6.5,
  steps: 24,
  sampler_name: 'euler',
  scheduler: 'normal',
  denoise: 0.8,
  batch_size: 1,
  resolution_preset: '1024x1024',
  reference_image: 'matrix-input.png',
  aspect_ratio: '1:1',
  megapixels: 1,
})

export function parseArguments(arguments_) {
  let instanceId
  let outputPath
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === '--' && index === 0) continue
    if (argument === '--instance-id') {
      instanceId = arguments_[index + 1]
      index += 1
      continue
    }
    if (argument === '--output') {
      outputPath = arguments_[index + 1]
      index += 1
      continue
    }
    throw new TypeError(`Unknown argument "${argument}".`)
  }
  if (typeof instanceId !== 'string' || !/^[1-9][0-9]*$/u.test(instanceId)) {
    throw new TypeError('--instance-id must identify one Source ComfyUI instance.')
  }
  if (outputPath !== undefined && (typeof outputPath !== 'string' || outputPath.trim().length === 0)) {
    throw new TypeError('--output must identify a result JSON file.')
  }
  return Object.freeze({ instanceId, ...(outputPath === undefined ? {} : { outputPath: resolve(outputPath) }) })
}

function errorDetails(error) {
  return {
    code: typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR',
    message: error instanceof Error ? error.message : String(error),
  }
}

export function classifyParameterResult(error) {
  if (error === undefined) return Object.freeze({ status: 'passed' })
  const details = errorDetails(error)
  return details.code === EXPECTED_NOT_FOUND
    ? Object.freeze({ status: 'not_found', ...details })
    : Object.freeze({ status: 'failed', ...details })
}

export function matrixParameterCandidates(parameterId, workflow, objectInfo) {
  const inputNames = [parameterId, ...(RUNTIME_PARAMETER_INPUT_ALIASES[parameterId] ?? [])]
  const candidates = []
  for (const node of Array.isArray(workflow?.nodes) ? workflow.nodes : []) {
    if (node === null || typeof node !== 'object' || Array.isArray(node) || typeof node.type !== 'string') continue
    const definition = objectInfo?.[node.type]
    if (definition === null || typeof definition !== 'object' || Array.isArray(definition)) continue
    const input = definition.input
    if (input === null || typeof input !== 'object' || Array.isArray(input)) continue
    for (const groupName of ['required', 'optional']) {
      const group = input[groupName]
      if (group === null || typeof group !== 'object' || Array.isArray(group)) continue
      for (const inputName of inputNames) {
        const descriptor = group[inputName]
        const values = Array.isArray(descriptor) ? descriptor[0] : undefined
        if (Array.isArray(values) && typeof values[0] === 'string') candidates.push(values[0])
      }
    }
  }
  candidates.push(MATRIX_PARAMETER_VALUES[parameterId])
  return candidates.filter((value, index) => (
    candidates.findIndex(candidate => JSON.stringify(candidate) === JSON.stringify(value)) === index
  ))
}

export function compareParameterSupport(expectedSupportedParameters, parameters) {
  const expectedSupported = new Set(expectedSupportedParameters)
  const mismatches = STANDARD_RUNTIME_PARAMETER_KINDS.flatMap(parameterId => {
    const expectedStatus = expectedSupported.has(parameterId) ? 'passed' : 'not_found'
    const actualStatus = parameters[parameterId]?.status ?? 'missing'
    return expectedStatus === actualStatus
      ? []
      : [{ parameterId, expectedStatus, actualStatus }]
  })
  return Object.freeze({
    status: mismatches.length === 0 ? 'passed' : 'failed',
    expectedSupportedParameters: Object.freeze([...expectedSupportedParameters]),
    actualSupportedParameters: Object.freeze(STANDARD_RUNTIME_PARAMETER_KINDS.filter(
      parameterId => parameters[parameterId]?.status === 'passed',
    )),
    ...(mismatches.length === 0 ? {} : { mismatches: Object.freeze(mismatches) }),
  })
}

export function parseParameterSupportBaseline(value, catalogTemplateIds) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || value.schemaVersion !== 1 || !Array.isArray(value.templates)) {
    throw new TypeError('ComfyUI Workflow parameter support baseline must use schemaVersion 1 with a templates array.')
  }
  const standardParameters = new Set(STANDARD_RUNTIME_PARAMETER_KINDS)
  const baseline = new Map()
  for (const entry of value.templates) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)
      || typeof entry.id !== 'string' || !/^[1-9][0-9]*$/u.test(entry.id)
      || !Array.isArray(entry.supportedParameters)) {
      throw new TypeError('Each ComfyUI Workflow parameter support baseline entry must contain a positive template id and supportedParameters array.')
    }
    if (baseline.has(entry.id)) {
      throw new TypeError(`ComfyUI Workflow parameter support baseline contains duplicate template id ${entry.id}.`)
    }
    const supportedParameters = []
    const seenParameters = new Set()
    for (const parameterId of entry.supportedParameters) {
      if (typeof parameterId !== 'string' || !standardParameters.has(parameterId)) {
        throw new TypeError(`ComfyUI Workflow parameter support baseline template ${entry.id} contains unknown parameter ${String(parameterId)}.`)
      }
      if (seenParameters.has(parameterId)) {
        throw new TypeError(`ComfyUI Workflow parameter support baseline template ${entry.id} contains duplicate parameter ${parameterId}.`)
      }
      seenParameters.add(parameterId)
      supportedParameters.push(parameterId)
    }
    if (supportedParameters.length === 0) {
      throw new TypeError(`ComfyUI Workflow parameter support baseline template ${entry.id} must declare at least one supported parameter.`)
    }
    baseline.set(entry.id, Object.freeze(supportedParameters))
  }
  const currentIds = [...catalogTemplateIds].sort((left, right) => Number(left) - Number(right))
  const baselineIds = [...baseline.keys()].sort((left, right) => Number(left) - Number(right))
  if (JSON.stringify(currentIds) !== JSON.stringify(baselineIds)) {
    throw new Error(`ComfyUI Workflow parameter support baseline does not match current Catalog template ids; baseline=${baselineIds.join(',')}, catalog=${currentIds.join(',')}.`)
  }
  return baseline
}

async function loadParameterSupportBaseline(catalogTemplateIds) {
  const text = await readFile(PARAMETER_SUPPORT_BASELINE_PATH, 'utf8')
  return parseParameterSupportBaseline(JSON.parse(text), catalogTemplateIds)
}

export function reportHasFailures(report) {
  return report.templates.some(template => (
    Object.values(template.parameters).some(result => result.status === 'failed')
    || template.supportBaseline.status !== 'passed'
    || template.combined.status !== 'passed'
    || template.official.status !== 'passed'
  ))
}

async function discoverTemplates(catalog, signal) {
  const templates = []
  let totalCount
  for (let page = 1; totalCount === undefined || templates.length < totalCount; page += 1) {
    const result = await catalog.search({
      kind: 'comfyui-template',
      query: '',
      page,
      baseModelId: null,
    }, signal)
    totalCount = result.totalCount
    templates.push(...result.items.map(item => ({ id: item.context.id, title: item.context.title })))
    if (result.items.length === 0 || page * CATALOG_PAGE_SIZE >= totalCount) break
  }
  const unique = new Map(templates.map(template => [template.id, template]))
  if (unique.size !== totalCount) {
    throw new Error(`Catalog returned ${unique.size} unique Workflow templates but declared ${totalCount}.`)
  }
  return [...unique.values()]
}

async function readObjectInfo(connection, signal) {
  const response = await fetch(`${connection.url.replace(/\/$/u, '')}/object_info`, {
    signal,
    headers: {
      accept: 'application/json',
      ...(connection.authorization === null ? {} : { authorization: connection.authorization }),
    },
  })
  if (!response.ok) throw new Error(`ComfyUI returned HTTP ${response.status} for /object_info.`)
  const text = await response.text()
  const parsed = JSON.parse(text)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('ComfyUI /object_info did not return an object.')
  }
  return text
}

function matrixCompiler(objectInfoText) {
  return new ComfyWorkflowCompiler({
    fetchImplementation: async () => new Response(objectInfoText, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
    officialApiWorkflowCompiler: {
      compile: async input => ({
        apiWorkflow: input.runtimeProjection,
        cacheKey: 'matrix-runtime-projection',
        cacheStatus: 'miss',
      }),
    },
  })
}

async function compileTemplateMatrix({ compiler, bundle, connection, instanceId, objectInfo }) {
  const parameters = {}
  const supported = {}
  for (const parameterId of STANDARD_RUNTIME_PARAMETER_KINDS) {
    let error
    let selectedValue
    for (const value of matrixParameterCandidates(parameterId, bundle.workflow, objectInfo)) {
      try {
        await compiler.compile({
          instanceId,
          workflow: bundle.workflow,
          connection,
          runtimeParameters: { [parameterId]: value },
          loras: [],
        })
        selectedValue = value
        error = undefined
        break
      } catch (caught) {
        error = caught
        if (caught?.code !== EXPECTED_INVALID) break
      }
    }
    const result = classifyParameterResult(error)
    parameters[parameterId] = result
    if (result.status === 'passed') supported[parameterId] = selectedValue
  }

  try {
    const compiled = await compiler.compile({
      instanceId,
      workflow: bundle.workflow,
      connection,
      runtimeParameters: supported,
      loras: [],
    })
    return {
      parameters,
      supported,
      compiled,
      combined: Object.freeze({ status: 'passed', parameterCount: Object.keys(supported).length }),
    }
  } catch (error) {
    return {
      parameters,
      supported,
      combined: Object.freeze({ status: 'failed', parameterCount: Object.keys(supported).length, ...errorDetails(error) }),
    }
  }
}

async function verifyOfficialCache({
  officialCompiler,
  bundle,
  connection,
  instanceId,
  compiled,
  exportCountBefore,
  exportCount,
}) {
  if (compiled === undefined) return Object.freeze({ status: 'blocked', message: 'Combined compilation failed.' })
  try {
    const input = {
      instanceId,
      connection,
      templateWorkflow: bundle.workflow,
      actualWorkflow: compiled.actualWorkflow,
      runtimeProjection: compiled.apiWorkflow,
    }
    const miss = await officialCompiler.compile(input)
    const hit = await officialCompiler.compile(input)
    const exportsForTemplate = exportCount() - exportCountBefore
    if (miss.cacheStatus !== 'miss'
      || hit.cacheStatus !== 'hit'
      || exportsForTemplate !== 1
      || JSON.stringify(miss.apiWorkflow) !== JSON.stringify(hit.apiWorkflow)) {
      return Object.freeze({
        status: 'failed',
        code: 'OFFICIAL_CACHE_MISMATCH',
        message: `Expected miss, hit, one frontend export, and equal API Workflows; received ${miss.cacheStatus}, ${hit.cacheStatus}, ${exportsForTemplate}.`,
      })
    }
    return Object.freeze({
      status: 'passed',
      miss: miss.cacheStatus,
      hit: hit.cacheStatus,
      frontendExports: exportsForTemplate,
      cacheKey: miss.cacheKey,
    })
  } catch (error) {
    return Object.freeze({ status: 'failed', ...errorDetails(error) })
  }
}

export async function runMatrix(options) {
  const context = await loadSourceWorktreeContext({ repositoryRoot: REPOSITORY_ROOT })
  process.env.DSH_HOME = context.dshHome
  const signal = new AbortController().signal
  const source = new GenerationSourceCli({
    executable: context.runtime.source.sourceCliPath,
    port: context.runtime.source.catalogPort,
  })
  const catalog = new CatalogCli({
    executable: context.runtime.source.catalogCliPath,
    port: context.runtime.source.catalogPort,
  })
  const [instance, templates] = await Promise.all([
    source.readInstance(options.instanceId, signal),
    discoverTemplates(catalog, signal),
  ])
  const supportBaselineByTemplate = await loadParameterSupportBaseline(templates.map(template => template.id))
  const connection = Object.freeze({
    url: instance.url,
    origin: new URL(instance.url).origin,
    authorization: instance.authorization,
  })
  const objectInfoText = await readObjectInfo(connection, signal)
  const objectInfo = JSON.parse(objectInfoText)
  const compiler = matrixCompiler(objectInfoText)
  const cacheDirectory = await mkdtemp(resolve(tmpdir(), 'harness-comfyui-real-matrix-'))
  let frontendExportCount = 0
  const frontend = new ChromeComfyFrontend({
    browserExecutablePath: context.runtime.comfyui.frontendCompiler.browserExecutablePath,
    timeoutMs: context.runtime.comfyui.frontendCompiler.timeoutMs,
  })
  const results = []
  try {
    for (const [index, template] of templates.entries()) {
      process.stderr.write(`[${index + 1}/${templates.length}] Workflow template ${template.id}: ${template.title}\n`)
      const bundle = await source.readTemplate(template.id, signal)
      const matrix = await compileTemplateMatrix({
        compiler,
        bundle,
        connection,
        instanceId: instance.id,
        objectInfo,
      })
      const exportCountBefore = frontendExportCount
      const officialCompiler = new OfficialApiWorkflowCompiler({
        cacheDirectory: resolve(cacheDirectory, template.id),
        instanceCacheEpoch: context.runtime.comfyui.frontendCompiler.instanceCacheEpoch,
        frontend: {
          exportWorkflow: async input => {
            frontendExportCount += 1
            return frontend.exportWorkflow(input)
          },
        },
      })
      const official = await verifyOfficialCache({
        officialCompiler,
        bundle,
        connection,
        instanceId: instance.id,
        compiled: matrix.compiled,
        exportCountBefore,
        exportCount: () => frontendExportCount,
      })
      results.push(Object.freeze({
        id: template.id,
        title: template.title,
        parameters: matrix.parameters,
        supportBaseline: compareParameterSupport(
          supportBaselineByTemplate.get(template.id),
          matrix.parameters,
        ),
        combined: matrix.combined,
        official,
      }))
    }
  } finally {
    await rm(cacheDirectory, { recursive: true, force: true })
  }
  const report = Object.freeze({
    schemaVersion: 2,
    instance: Object.freeze({ id: instance.id, title: instance.title, origin: connection.origin }),
    standardParameters: STANDARD_RUNTIME_PARAMETER_KINDS,
    templateCount: results.length,
    templates: Object.freeze(results),
  })
  if (options.outputPath !== undefined) {
    await mkdir(dirname(options.outputPath), { recursive: true })
    await writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }
  return report
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const report = await runMatrix(options)
  const failed = reportHasFailures(report)
  process.stdout.write(`${JSON.stringify(options.outputPath === undefined ? report : {
    templateCount: report.templateCount,
    failed,
    outputPath: options.outputPath,
  }, null, 2)}\n`)
  if (failed) process.exitCode = 1
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    process.exitCode = 1
  })
}
