import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { SlotRegistry as SlotRegistryType } from '@deepseek-ai/dsh-client-runtime/client'

import { buildClientBundle } from '../../scripts/build/tsdown-client-bundle.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const temporaryDirectories: string[] = []
type RuntimeClientExports = {
  SlotRegistry: typeof SlotRegistryType
  defineStore: typeof import('@deepseek-ai/dsh-client-runtime/client').defineStore
}
type ClientPlugin = {
  name: string
  inject: string[]
  apply(ctx: Context): void
}

async function loadSlotRegistry() {
  const require = createRequire(import.meta.url)
  const clientModules = new Map<string, RuntimeClientExports>()
  const hadWindow = Object.hasOwn(globalThis, 'window')
  const previousWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
    __ModuleLoader__: {
      load({ id, factory }: { id: string; factory: (require: (specifier: string) => unknown) => RuntimeClientExports }) {
        clientModules.set(id, factory(require))
      },
    },
    },
  })
  try {
    await import('@deepseek-ai/dsh-client-runtime/client')
    const runtimeExports = clientModules.get('@deepseek-ai/dsh-client-runtime')
    if (!runtimeExports) throw new Error('runtime client did not register with ModuleLoader')
    return runtimeExports
  } finally {
    if (hadWindow) {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow })
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  }
}

describe('built Client bundle boundary', () => {
  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
  })

  it('loads through ModuleLoader and keeps the details replacement unloadable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'harness-comfyui-built-client-'))
    temporaryDirectories.push(directory)
    const output = join(directory, 'lib', 'client.js')
    await buildClientBundle({
      entry: join(root, 'src/client/index.tsx'),
      css: join(root, 'src/client/styles.css'),
      output,
    })

    const styleElements: Array<{ dataset: Record<string, string>; textContent: string }> = []
    const document = {
      head: {
        appendChild(element: (typeof styleElements)[number]) {
          styleElements.push(element)
        },
      },
      createElement() {
        return { dataset: {}, textContent: '' }
      },
      querySelector(selector: string) {
        return selector === 'style[data-plugin="harness-comfyui"]' ? styleElements[0] : undefined
      },
    }
    let handoff: { id: string; factory: (require: (specifier: string) => unknown) => ClientPlugin } | undefined
    const window = {
      __ModuleLoader__: {
        load(value: typeof handoff) {
          handoff = value
        },
      },
    }
    vm.runInNewContext(await readFile(output, 'utf8'), { document, window })

    expect(handoff?.id).toBe('harness-comfyui')
    expect(handoff?.factory).toBeTypeOf('function')
    const runtimeExports = await loadSlotRegistry()
    const requireExternal = (specifier: string): unknown => {
      if (specifier === '@deepseek-ai/dsh-client-runtime/client') return runtimeExports
      throw new Error(`built bundle unexpectedly required ${specifier}`)
    }
    if (!handoff) throw new Error('Client bundle did not register with ModuleLoader')
    const plugin = handoff.factory(requireExternal)
    handoff.factory(requireExternal)
    expect(styleElements).toHaveLength(1)
    expect(styleElements[0]?.dataset.plugin).toBe('harness-comfyui')
    expect(styleElements[0]?.textContent).toBe(await readFile(join(root, 'src/client/styles.css'), 'utf8'))
    expect(plugin).toMatchObject({ name: 'harness-comfyui', inject: ['slots', 'remote'] })
    expect(plugin?.apply).toBeTypeOf('function')

    const SlotRegistry = runtimeExports.SlotRegistry
    const ctx = new Context()
    await ctx.plugin(SlotRegistry)
    const remoteDisposer = ctx.provide('remote', {})
    const rootDisposer = ctx.slots.register(
      {
        name: 'root',
        children: {
          sidebar: { kind: 'single', scope: 'root' },
          conversation: { kind: 'single', scope: 'session-maybe' },
          details: { kind: 'single', scope: 'session' },
        },
        inject: () => ({}),
      },
      (_props: PropsRenderSlots<'sidebar' | 'conversation' | 'details'>) => null,
    )
    const nativeDetailsDisposer = ctx.slots.register({ name: 'details', priority: 0 }, () => null)
    const clientFiber = ctx.plugin(plugin)
    await clientFiber

    expect(ctx.slots.entries('details').map(entry => entry.options.priority)).toEqual([-10, 0])
    expect(ctx.slots.entriesOfSlot('details')[0]?.options.priority).toBe(-10)
    expect(ctx.slots.entries('root')).toHaveLength(1)
    expect(ctx.slots.entries('sidebar')).toHaveLength(0)
    expect(ctx.slots.entries('conversation')).toHaveLength(0)

    await clientFiber.dispose()
    expect(ctx.slots.entries('details')).toHaveLength(1)
    expect(ctx.slots.entriesOfSlot('details')[0]?.options.priority).toBe(0)
    nativeDetailsDisposer()
    rootDisposer()
    await remoteDisposer()
    await ctx.fiber.dispose()
  })
})
