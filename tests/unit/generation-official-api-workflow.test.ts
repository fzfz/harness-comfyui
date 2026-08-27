import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  OfficialApiWorkflowCompiler,
  createOfficialApiWorkflowCacheIdentity,
  overlayRuntimeApiWorkflow,
  type ComfyFrontendExporter,
} from '../../src/host/generation/official-api-workflow.ts'
import type { JsonValue } from '../../src/host/generation/generation-runtime.ts'
import type { UiWorkflow } from '../../src/host/generation/source-preparer.ts'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'harness-comfyui-official-api-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

const templateWorkflow: UiWorkflow = {
  version: 0.4,
  nodes: [{ id: 1, type: 'PromptNode', mode: 0, widgets_values: ['template prompt', 1] }],
  links: [],
}

const actualWorkflow: UiWorkflow = {
  version: 0.4,
  nodes: [{ id: 1, type: 'PromptNode', mode: 0, widgets_values: ['runtime prompt', 2] }],
  links: [],
}

const runtimeProjection: Readonly<Record<string, JsonValue>> = {
  '1': {
    class_type: 'PromptNode',
    inputs: {
      text: 'runtime prompt',
      seed: 2,
      model: ['50', 0],
      loras: [{ name: 'styles/example.safetensors', strength: 0.8, clipStrength: 0.7, active: true }],
    },
  },
}

const officialApiWorkflow: Readonly<Record<string, JsonValue>> = {
  '1': {
    class_type: 'PromptNode',
    inputs: {
      text: 'template prompt',
      seed: 1,
      model: ['900', 4],
      loras: { __value__: [{ name: 'template.safetensors', strength: 1, clipStrength: 1, active: true }] },
      official_only: 'preserved',
    },
  },
  '900': { class_type: 'OfficialVirtualNode', inputs: { source: ['50', 0] } },
}

function exporter(output: Readonly<Record<string, JsonValue>> = officialApiWorkflow): ComfyFrontendExporter & {
  exportWorkflow: ReturnType<typeof vi.fn>
} {
  return {
    exportWorkflow: vi.fn(async () => structuredClone(output)),
  }
}

function compileInput(projection: Readonly<Record<string, JsonValue>> = runtimeProjection) {
  return {
    instanceId: 'win3080',
    connection: {
      url: 'http://192.168.110.122:8188',
      origin: 'http://192.168.110.122:8188',
      authorization: 'Bearer secret',
    },
    templateWorkflow,
    actualWorkflow,
    runtimeProjection: projection,
  } as const
}

describe('official API Workflow cache', () => {
  it('exports once on a cache miss and reuses the persisted official base without invoking the browser', async () => {
    const cacheDirectory = await temporaryDirectory()
    const firstExporter = exporter()
    const first = new OfficialApiWorkflowCompiler({
      cacheDirectory,
      instanceCacheEpoch: '1',
      frontend: firstExporter,
    })

    const miss = await first.compile(compileInput())
    const secondExporter = exporter()
    const second = new OfficialApiWorkflowCompiler({
      cacheDirectory,
      instanceCacheEpoch: '1',
      frontend: secondExporter,
    })
    const hit = await second.compile(compileInput())

    expect(miss.cacheStatus).toBe('miss')
    expect(hit.cacheStatus).toBe('hit')
    expect(firstExporter.exportWorkflow).toHaveBeenCalledTimes(1)
    expect(secondExporter.exportWorkflow).not.toHaveBeenCalled()
    expect(hit.apiWorkflow).toEqual(miss.apiWorkflow)
  })

  it('coalesces concurrent misses for the same cache identity', async () => {
    const cacheDirectory = await temporaryDirectory()
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    const frontend = exporter()
    frontend.exportWorkflow.mockImplementation(async () => {
      await pending
      return structuredClone(officialApiWorkflow)
    })
    const compiler = new OfficialApiWorkflowCompiler({ cacheDirectory, instanceCacheEpoch: '1', frontend })

    const first = compiler.compile(compileInput())
    const second = compiler.compile(compileInput())
    release()

    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(frontend.exportWorkflow).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['first waiter', 0],
    ['second waiter', 1],
  ] as const)('cancels the %s without canceling the other waiter', async (_label, canceledIndex) => {
    const cacheDirectory = await temporaryDirectory()
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    const frontend = exporter()
    frontend.exportWorkflow.mockImplementation(async () => {
      await pending
      return structuredClone(officialApiWorkflow)
    })
    const compiler = new OfficialApiWorkflowCompiler({ cacheDirectory, instanceCacheEpoch: '1', frontend })
    const controllers = [new AbortController(), new AbortController()]
    const calls = controllers.map(controller => compiler.compile({ ...compileInput(), signal: controller.signal }))
    const outcomes = Promise.allSettled(calls)

    await vi.waitFor(() => expect(frontend.exportWorkflow).toHaveBeenCalledTimes(1))
    controllers[canceledIndex]!.abort()
    release()

    const results = await outcomes
    expect(results[canceledIndex]).toMatchObject({ status: 'rejected', reason: { code: 'COMFYUI_REQUEST_CANCELED' } })
    expect(results[1 - canceledIndex]).toMatchObject({ status: 'fulfilled', value: { cacheStatus: 'miss' } })
    expect(frontend.exportWorkflow).toHaveBeenCalledTimes(1)
  })

  it('aborts an export when all waiters cancel, writes no cache, and permits a clean retry', async () => {
    const cacheDirectory = await temporaryDirectory()
    const frontend = exporter()
    frontend.exportWorkflow.mockImplementationOnce(async input => new Promise((_resolve, reject) => {
      input.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    }))
    const compiler = new OfficialApiWorkflowCompiler({ cacheDirectory, instanceCacheEpoch: '1', frontend })
    const controllers = [new AbortController(), new AbortController()]
    const calls = controllers.map(controller => compiler.compile({ ...compileInput(), signal: controller.signal }))
    const outcomes = Promise.allSettled(calls)

    await vi.waitFor(() => expect(frontend.exportWorkflow).toHaveBeenCalledTimes(1))
    controllers.forEach(controller => controller.abort())
    const retry = compiler.compile(compileInput())

    expect(await outcomes).toEqual([
      expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ code: 'COMFYUI_REQUEST_CANCELED' }) }),
      expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ code: 'COMFYUI_REQUEST_CANCELED' }) }),
    ])
    await vi.waitFor(() => expect(frontend.exportWorkflow.mock.calls[0]?.[0].signal?.aborted).toBe(true))

    const address = createOfficialApiWorkflowCacheIdentity({
      instanceId: 'win3080',
      instanceOrigin: 'http://192.168.110.122:8188',
      instanceCacheEpoch: '1',
      templateWorkflow,
      runtimeProjection,
    })
    await expect(readFile(join(cacheDirectory, `${address.cacheKey}.json`), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(retry).resolves.toMatchObject({ cacheStatus: 'miss' })
    expect(frontend.exportWorkflow).toHaveBeenCalledTimes(2)
  })

  it('does not persist a failed frontend export', async () => {
    const cacheDirectory = await temporaryDirectory()
    const frontend = exporter()
    frontend.exportWorkflow.mockRejectedValueOnce(new Error('frontend failed'))
    const compiler = new OfficialApiWorkflowCompiler({ cacheDirectory, instanceCacheEpoch: '1', frontend })

    await expect(compiler.compile(compileInput())).rejects.toThrow('frontend failed')
    await expect(compiler.compile(compileInput())).resolves.toMatchObject({ cacheStatus: 'miss' })
    expect(frontend.exportWorkflow).toHaveBeenCalledTimes(2)
  })

  it('rejects a corrupted cache entry instead of silently exporting again', async () => {
    const cacheDirectory = await temporaryDirectory()
    const frontend = exporter()
    const compiler = new OfficialApiWorkflowCompiler({ cacheDirectory, instanceCacheEpoch: '1', frontend })
    const first = await compiler.compile(compileInput())
    await writeFile(join(cacheDirectory, `${first.cacheKey}.json`), '{broken', 'utf8')

    await expect(compiler.compile(compileInput())).rejects.toMatchObject({ code: 'COMFYUI_API_WORKFLOW_CACHE_INVALID' })
    expect(frontend.exportWorkflow).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['identity mismatch', (item: Record<string, unknown>) => {
      item.identity = { ...(item.identity as Record<string, unknown>), instanceId: 'wrong-instance' }
    }],
    ['invalid API Workflow structure', (item: Record<string, unknown>) => {
      item.apiWorkflow = { '1': { class_type: 'PromptNode', inputs: null } }
    }],
  ] as const)('rejects a cache entry with %s', async (_label, mutate) => {
    const cacheDirectory = await temporaryDirectory()
    const frontend = exporter()
    const compiler = new OfficialApiWorkflowCompiler({ cacheDirectory, instanceCacheEpoch: '1', frontend })
    const first = await compiler.compile(compileInput())
    const path = join(cacheDirectory, `${first.cacheKey}.json`)
    const item = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
    mutate(item)
    await writeFile(path, `${JSON.stringify(item)}\n`, 'utf8')

    await expect(compiler.compile(compileInput())).rejects.toMatchObject({ code: 'COMFYUI_API_WORKFLOW_CACHE_INVALID' })
    expect(frontend.exportWorkflow).toHaveBeenCalledTimes(1)
  })

  it('reports cache read, directory creation, temporary write, and rename failures', async () => {
    const address = createOfficialApiWorkflowCacheIdentity({
      instanceId: 'win3080',
      instanceOrigin: 'http://192.168.110.122:8188',
      instanceCacheEpoch: '1',
      templateWorkflow,
      runtimeProjection,
    })

    const readRoot = await temporaryDirectory()
    await mkdir(join(readRoot, `${address.cacheKey}.json`))
    await expect(new OfficialApiWorkflowCompiler({
      cacheDirectory: readRoot,
      instanceCacheEpoch: '1',
      frontend: exporter(),
    }).compile(compileInput())).rejects.toMatchObject({ code: 'COMFYUI_API_WORKFLOW_CACHE_IO_FAILED' })

    const createRoot = await temporaryDirectory()
    const blockedDirectory = join(createRoot, 'cache')
    const createFrontend = exporter()
    createFrontend.exportWorkflow.mockImplementationOnce(async () => {
      await writeFile(blockedDirectory, 'not a directory', 'utf8')
      return structuredClone(officialApiWorkflow)
    })
    await expect(new OfficialApiWorkflowCompiler({
      cacheDirectory: blockedDirectory,
      instanceCacheEpoch: '1',
      frontend: createFrontend,
    }).compile(compileInput())).rejects.toMatchObject({ code: 'COMFYUI_API_WORKFLOW_CACHE_IO_FAILED' })

    const writeRoot = await temporaryDirectory()
    const writeFrontend = exporter()
    let partialTemporaryPath: string | undefined
    await expect(new OfficialApiWorkflowCompiler({
      cacheDirectory: writeRoot,
      instanceCacheEpoch: '1',
      frontend: writeFrontend,
      writeCacheFile: async (path, contents) => {
        partialTemporaryPath = path
        await writeFile(path, contents.slice(0, 8), 'utf8')
        throw new Error('deterministic temporary write failure')
      },
    }).compile(compileInput())).rejects.toMatchObject({ code: 'COMFYUI_API_WORKFLOW_CACHE_IO_FAILED' })
    expect(partialTemporaryPath).toBeDefined()
    await expect(readFile(partialTemporaryPath!, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })

    const renameRoot = await temporaryDirectory()
    const renameFrontend = exporter()
    renameFrontend.exportWorkflow.mockImplementationOnce(async () => {
      const destination = join(renameRoot, `${address.cacheKey}.json`)
      await mkdir(destination)
      await writeFile(join(destination, 'marker'), 'occupied', 'utf8')
      return structuredClone(officialApiWorkflow)
    })
    await expect(new OfficialApiWorkflowCompiler({
      cacheDirectory: renameRoot,
      instanceCacheEpoch: '1',
      frontend: renameFrontend,
    }).compile(compileInput())).rejects.toMatchObject({ code: 'COMFYUI_API_WORKFLOW_CACHE_IO_FAILED' })
  })

  it('writes the declared cache identity and never writes authorization', async () => {
    const cacheDirectory = await temporaryDirectory()
    const frontend = exporter()
    const compiler = new OfficialApiWorkflowCompiler({ cacheDirectory, instanceCacheEpoch: 'epoch-7', frontend })

    const result = await compiler.compile(compileInput())
    const contents = await readFile(join(cacheDirectory, `${result.cacheKey}.json`), 'utf8')
    const parsed = JSON.parse(contents) as Record<string, unknown>

    expect(parsed).toMatchObject({
      schemaVersion: 1,
      cacheKey: result.cacheKey,
      identity: {
        instanceId: 'win3080',
        instanceOrigin: 'http://192.168.110.122:8188',
        instanceCacheEpoch: 'epoch-7',
        compilerSchemaVersion: 1,
      },
    })
    expect(contents).not.toContain('Bearer secret')
  })

  it('changes the cache key for instance, epoch, template, or execution structure changes but not scalar values', () => {
    const identitySource = {
      instanceId: 'a',
      instanceOrigin: 'http://127.0.0.1:8188',
      instanceCacheEpoch: '1',
      templateWorkflow,
      runtimeProjection,
    } as const
    const base = createOfficialApiWorkflowCacheIdentity(identitySource)
    const changedScalar = createOfficialApiWorkflowCacheIdentity({
      instanceId: 'a',
      instanceOrigin: 'http://127.0.0.1:8188',
      instanceCacheEpoch: '1',
      templateWorkflow,
      runtimeProjection: {
        ...runtimeProjection,
        '1': { class_type: 'PromptNode', inputs: { text: 'another prompt', seed: 999, model: ['50', 0], loras: [] } },
      },
    })
    const changedConnection = createOfficialApiWorkflowCacheIdentity({
      instanceId: 'a',
      instanceOrigin: 'http://127.0.0.1:8188',
      instanceCacheEpoch: '1',
      templateWorkflow,
      runtimeProjection: {
        ...runtimeProjection,
        '1': { class_type: 'PromptNode', inputs: { text: 'runtime prompt', seed: 2, model: ['51', 1], loras: [] } },
      },
    })

    expect(changedScalar.cacheKey).toBe(base.cacheKey)
    expect(changedConnection.cacheKey).not.toBe(base.cacheKey)
    expect(createOfficialApiWorkflowCacheIdentity({ ...identitySource, instanceId: 'b' }).cacheKey).not.toBe(base.cacheKey)
    expect(createOfficialApiWorkflowCacheIdentity({ ...identitySource, instanceCacheEpoch: '2' }).cacheKey).not.toBe(base.cacheKey)
    expect(createOfficialApiWorkflowCacheIdentity({
      ...identitySource,
      templateWorkflow: { ...templateWorkflow, version: 0.5 },
    }).cacheKey).not.toBe(base.cacheKey)
  })

  it.each([
    {
      route: 'ordinary runtime controls',
      firstInputs: {
        prompt: 'first prompt', seed: 1, width: 1024, height: 1536,
        tiled: false, sampler: 'euler', ckpt_name: 'models/first.safetensors', source: ['50', 0],
      },
      secondInputs: {
        prompt: 'second prompt', seed: 2, width: 832, height: 1216,
        tiled: true, sampler: 'dpmpp_2m', ckpt_name: 'models/second.safetensors', source: ['50', 0],
      },
    },
    {
      route: 'standard LoRA Loader',
      firstInputs: { lora_name: 'loras/first.safetensors', strength_model: 1, strength_clip: 1, source: ['50', 0] },
      secondInputs: { lora_name: 'loras/second.safetensors', strength_model: 0.7, strength_clip: 0.6, source: ['50', 0] },
    },
    {
      route: 'Power LoRA Loader',
      firstInputs: { lora_1: { on: true, lora: 'loras/first.safetensors', strength: 1 }, source: ['50', 0] },
      secondInputs: { lora_1: { on: true, lora: 'loras/second.safetensors', strength: 0.7 }, source: ['50', 0] },
    },
    {
      route: 'LoRA Text Loader',
      firstInputs: { lora_syntax: '<lora:loras/first.safetensors:1>', source: ['50', 0] },
      secondInputs: { lora_syntax: '<lora:loras/second.safetensors:0.7>', source: ['50', 0] },
    },
    {
      route: 'template 39 LoraManager',
      firstInputs: {
        text: '<lora:loras/first.safetensors:1>',
        loras: [{ name: 'loras/first.safetensors', strength: 1, clipStrength: 1, active: true }],
        source: ['50', 0],
      },
      secondInputs: {
        text: '<lora:loras/second.safetensors:0.7>',
        loras: [{ name: 'loras/second.safetensors', strength: 0.7, clipStrength: 0.6, active: true }],
        source: ['50', 0],
      },
    },
  ] as const)('makes a $route cache hit equivalent to a fresh official export', async ({ firstInputs, secondInputs }) => {
    const cacheDirectory = await temporaryDirectory()
    const firstRuntimeInputs = firstInputs as unknown as Readonly<Record<string, JsonValue>>
    const secondRuntimeInputs = secondInputs as unknown as Readonly<Record<string, JsonValue>>
    const projection = (inputs: Readonly<Record<string, JsonValue>>): Readonly<Record<string, JsonValue>> => ({
      '5': { class_type: 'RepresentativeNode', inputs },
    })
    const officialize = (runtime: Readonly<Record<string, JsonValue>>): Readonly<Record<string, JsonValue>> => {
      const result = structuredClone(runtime) as Record<string, JsonValue>
      const node = result['5'] as { inputs: Record<string, JsonValue> }
      node.inputs.source = ['official-virtual', 4]
      if (Array.isArray(node.inputs.loras)) node.inputs.loras = { __value__: node.inputs.loras }
      node.inputs.official_only = 'static extension state'
      result['official-virtual'] = { class_type: 'OfficialVirtualNode', inputs: { source: ['50', 0] } }
      return result
    }
    const frontend = exporter(officialize(projection(firstRuntimeInputs)))
    const compiler = new OfficialApiWorkflowCompiler({ cacheDirectory, instanceCacheEpoch: '1', frontend })

    await expect(compiler.compile(compileInput(projection(firstRuntimeInputs)))).resolves.toMatchObject({ cacheStatus: 'miss' })
    const hit = await compiler.compile(compileInput(projection(secondRuntimeInputs)))

    expect(hit.cacheStatus).toBe('hit')
    expect(hit.apiWorkflow).toEqual(officialize(projection(secondRuntimeInputs)))
    expect(frontend.exportWorkflow).toHaveBeenCalledTimes(1)
  })
})

describe('runtime API Workflow overlay', () => {
  it('overlays scalar and official __value__ inputs while preserving official links and extra nodes', () => {
    const result = overlayRuntimeApiWorkflow(officialApiWorkflow, runtimeProjection)

    expect(result).toEqual({
      '1': {
        class_type: 'PromptNode',
        inputs: {
          text: 'runtime prompt',
          seed: 2,
          model: ['900', 4],
          loras: { __value__: [{ name: 'styles/example.safetensors', strength: 0.8, clipStrength: 0.7, active: true }] },
          official_only: 'preserved',
        },
      },
      '900': { class_type: 'OfficialVirtualNode', inputs: { source: ['50', 0] } },
    })
    expect(officialApiWorkflow).toEqual({
      '1': {
        class_type: 'PromptNode',
        inputs: {
          text: 'template prompt',
          seed: 1,
          model: ['900', 4],
          loras: { __value__: [{ name: 'template.safetensors', strength: 1, clipStrength: 1, active: true }] },
          official_only: 'preserved',
        },
      },
      '900': { class_type: 'OfficialVirtualNode', inputs: { source: ['50', 0] } },
    })
  })

  it.each([
    [{ '2': { class_type: 'PromptNode', inputs: { text: 'changed' } } }, 'missing runtime node'],
    [{ '1': { class_type: 'WrongType', inputs: { text: 'changed' } } }, 'class type mismatch'],
    [{ '1': { class_type: 'PromptNode', inputs: { missing: 'changed' } } }, 'missing official input'],
  ] as const)('rejects incompatible overlay %s (%s)', (projection, _label) => {
    expect(() => overlayRuntimeApiWorkflow(officialApiWorkflow, projection)).toThrowError(expect.objectContaining({
      code: 'COMFYUI_API_WORKFLOW_OVERLAY_FAILED',
    }))
  })
})
