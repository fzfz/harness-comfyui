import { createRequire } from 'node:module'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

import { Context } from '@deepseek-ai/cordis'
import { typertPlugin } from '@deepseek-ai/dsh-typert-generator/tsdown'
import { build } from 'tsdown'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement, type ReactElement, type ReactNode } from 'react'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {
  AssistantChatData,
  ChatNode,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  ConversationSnapshot,
  SessionListState,
  SessionSummary,
  SlotRegistry as SlotRegistryType,
} from '@deepseek-ai/dsh-client-runtime/client'

import { buildClientBundle } from '../../scripts/build/tsdown-client-bundle.ts'
import { bundleGeneratedTypert } from '../../scripts/build/bundle-generated-typert.ts'
import { standaloneTypertWorkspacePlugin } from '../../scripts/build/standalone-typert-plugin.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const temporaryDirectories: string[] = []
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup(node: ReactNode): string
}
type RuntimeClientExports = {
  SlotRegistry: typeof SlotRegistryType
  defineStore: typeof import('@deepseek-ai/dsh-client-runtime/client').defineStore
}
type ClientPlugin = {
  name: string
  inject: string[]
  apply(ctx: Context): void
}

type IntegrationChatNode = ChatNode<'user' | 'assistant-step'>

type InputState = {
  draft: string
  draftRev: number
  imageIds: readonly never[]
  phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting'
  occurrences: readonly never[]
  queue: readonly never[]
}

function chatLocation(turn: number, step?: number): IntegrationChatNode['location'] {
  const turnLocation = {
    turn,
    start: undefined,
    end: undefined,
    status: step === undefined ? 'closed' : 'open',
    steps: [],
    data: { get: () => undefined },
  }
  if (step === undefined) return { kind: 'turn', turn: turnLocation } as IntegrationChatNode['location']
  return {
    kind: 'step',
    turn: turnLocation,
    step: {
      turn,
      step,
      start: undefined,
      end: undefined,
      status: 'open',
      data: { get: () => undefined },
    },
  } as IntegrationChatNode['location']
}

function conversationSnapshot(
  sessionId: SessionSummary['id'],
  agentText: string,
  status: AssistantChatData['status'] = 'settled',
): ConversationSnapshot {
  const userText = sessionId === 'video' ? '视频 Session 请求' : '角色 Session 请求'
  const chatNodes: IntegrationChatNode[] = [
    {
      key: 'user-1',
      kind: 'user',
      id: 'user-1',
      target: 'chat',
      anchorSeq: 1,
      location: chatLocation(1),
      visibility: 'visible',
      data: {
        kind: 'user',
        seq: 1,
        time: 1_723_300_320_000,
        content: [{ type: 'text', text: userText }],
        source: 'integration-test',
      },
    },
    {
      key: 'assistant-1',
      kind: 'assistant-step',
      id: 'assistant-1',
      target: 'chat',
      anchorSeq: 2,
      location: chatLocation(1, 1),
      visibility: 'visible',
      data: {
        status,
        turn: 1,
        step: 1,
        blocks: [{ kind: 'text', text: agentText }],
        time: 1_723_300_321_000,
      },
    },
  ]
  const byKey = new Map(chatNodes.map(node => [node.key, node]))
  return {
    sessionId,
    chat: {
      order: chatNodes.map(node => node.key),
      nodes: {
        get: (key: string) => byKey.get(key),
        values: () => [...byKey.values()],
      },
      locations: {
        getTurn: () => [],
        getStep: () => [],
      },
      timeline: {} as ConversationSnapshot['chat']['timeline'],
      legacy: {} as ConversationSnapshot['chat']['legacy'],
    },
    nodes: [],
    partial: null,
    openState: 'open',
    lastAgentError: null,
  } as unknown as ConversationSnapshot
}

async function generateIsolatedTypertWorkspace(directory: string): Promise<string> {
  const workspaceRoot = join(directory, 'typert-workspace')
  const packageRoot = join(workspaceRoot, 'packages', 'harness-comfyui')
  const bundles = await build({
    config: false,
    entry: { index: join(packageRoot, 'src/index.ts') },
    outDir: join(packageRoot, 'lib'),
    format: 'esm',
    platform: 'node',
    target: 'node22.19.0',
    fixedExtension: false,
    dts: false,
    clean: false,
    plugins: [
      typertPlugin({ mode: 'package', faces: ['host'] }),
      standaloneTypertWorkspacePlugin({
        workspaceRoot,
        outputDirectory: join(directory, 'generated-typert'),
        cleanupWorkspace: false,
      }),
    ],
  })
  try {
    await bundleGeneratedTypert({ directory: join(packageRoot, 'lib') })
    return packageRoot
  } finally {
    await Promise.all(bundles.map(bundle => bundle[Symbol.asyncDispose]()))
  }
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

  it('loads through ModuleLoader, mounts the generated Remote, and composes the project root', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'harness-comfyui-built-client-'))
    temporaryDirectories.push(directory)
    const packageRoot = await generateIsolatedTypertWorkspace(directory)
    const generatedRemote = join(packageRoot, 'lib', 'typert.remote-client.js')
    expect(await readFile(generatedRemote, 'utf8')).toMatch(
      /^\/\* Generated by @deepseek-ai\/dsh-typert-generator\b.*\*\//u,
    )
    const output = join(directory, 'lib', 'client.js')
    await buildClientBundle({
      entry: join(packageRoot, 'src/client/index.tsx'),
      css: join(packageRoot, 'src/client/styles.css'),
      output,
    })

    const clientSourceMap = JSON.parse(await readFile(`${output}.map`, 'utf8')) as {
      sourceRoot?: string
      sources: string[]
      sourcesContent: Array<string | null>
    }
    const resolvedSources = await Promise.all(clientSourceMap.sources.map(async source => {
      const sourcePath = resolve(dirname(output), clientSourceMap.sourceRoot ?? '', source)
      return realpath(sourcePath).catch(() => sourcePath)
    }))
    const generatedRemotePath = await realpath(generatedRemote)
    const generatedRemoteIndex = resolvedSources.indexOf(generatedRemotePath)
    expect(generatedRemoteIndex).toBeGreaterThanOrEqual(0)
    expect(clientSourceMap.sourcesContent[generatedRemoteIndex]).toMatch(
      /^\/\* Generated by @deepseek-ai\/dsh-typert-generator\b.*pluginStatus/su,
    )
    expect(resolvedSources).not.toContain(join(root, 'lib', 'typert.remote-client.js'))

    const createDomElement = () => {
      const values = new Map<string, string>()
      const attributes = new Map<string, string>()
      return {
        style: {
          getPropertyPriority: () => '',
          getPropertyValue: (name: string) => values.get(name) ?? '',
          removeProperty: (name: string) => values.delete(name),
          setProperty: (name: string, value: string) => {
            values.set(name, value)
          },
        },
        getAttribute: (name: string) => attributes.get(name) ?? null,
        hasAttribute: (name: string) => attributes.has(name),
        removeAttribute: (name: string) => attributes.delete(name),
        setAttribute: (name: string, value: string) => {
          attributes.set(name, value)
        },
      }
    }
    const styleElements: Array<{ dataset: Record<string, string>; textContent: string }> = []
    const document = {
      documentElement: createDomElement(),
      body: createDomElement(),
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
      if (specifier === 'react' || specifier === 'react/jsx-runtime') {
        return createRequire(import.meta.url)(specifier)
      }
      throw new Error(`built bundle unexpectedly required ${specifier}`)
    }
    if (!handoff) throw new Error('Client bundle did not register with ModuleLoader')
    const plugin = handoff.factory(requireExternal)
    handoff.factory(requireExternal)
    expect(styleElements).toHaveLength(1)
    expect(styleElements[0]?.dataset.plugin).toBe('harness-comfyui')
    expect(styleElements[0]?.textContent).toBe(await readFile(join(packageRoot, 'src/client/styles.css'), 'utf8'))
    expect(plugin).toMatchObject({
      name: 'harness-comfyui',
      inject: ['slots', 'sessions', 'remote', 'theme', 'inputTriggers', 'connection'],
    })
    expect(plugin?.apply).toBeTypeOf('function')

    const SlotRegistry = runtimeExports.SlotRegistry
    const ctx = new Context()
    await ctx.plugin(SlotRegistry)
    const mountedContributions: unknown[] = []
    let remoteUnmountCount = 0
    const remoteDisposer = ctx.provide('remote', {
      $mount: async (contribution: unknown) => {
        mountedContributions.push(contribution)
        return async () => {
          remoteUnmountCount += 1
        }
      },
    })
    const sessionsState: SessionListState = {
      ids: ['portrait', 'video', 'comparison'] as SessionListState['ids'],
      byId: {
        portrait: {
          id: 'portrait' as SessionSummary['id'],
          displayTitle: '角色立绘调整',
          title: '角色立绘调整',
          updatedAt: 1_723_300_320_000,
          running: false,
          blank: false,
        },
        video: {
          id: 'video' as SessionSummary['id'],
          displayTitle: '测试视频工作流',
          title: '测试视频工作流',
          updatedAt: 1_723_296_480_000,
          running: false,
          blank: false,
        },
        comparison: {
          id: 'comparison' as SessionSummary['id'],
          displayTitle: '画风参数对比',
          title: '画风参数对比',
          updatedAt: 1_721_088_000_000,
          running: false,
          blank: false,
        },
      } as SessionListState['byId'],
      current: 'portrait' as SessionListState['current'],
      phase: 'ready',
      subagentsByParent: {},
      jobsBySession: {},
      currentAddress: undefined,
    }
    const sessions = {
      list: {
        getSnapshot: () => sessionsState,
        subscribe: () => () => undefined,
      },
      open: () => undefined,
      scope: (id: SessionSummary['id']) => ({ sessionId: id }),
    }
    const sessionsDisposer = ctx.provide('sessions', sessions)
    const themeDisposer = ctx.provide('theme', {
      getTheme: () => ({ active: { colorScheme: 'light' as const, tokens: {} } }),
    })
    const triggerScopes: unknown[] = []
    const inputTriggersDisposer = ctx.provide('inputTriggers', {
      sessionOf: (scope: unknown) => {
        triggerScopes.push(scope)
        return {
          track: () => undefined,
          arbitrate: () => 'pass',
          onSpace: () => false,
        }
      },
    })
    const clientFiber = ctx.plugin(plugin)
    await clientFiber

    const upstreamConversationDisposer = ctx.slots.register(
      {
        name: 'conversation',
        children: {
          'conversation.session': { kind: 'single', scope: 'session' },
          'conversation.session.header': { kind: 'single', scope: 'session' },
          'conversation.composer.bar': { kind: 'single', scope: 'session-maybe' },
          'conversation.input.overlay': { kind: 'list', scope: 'session' },
        },
      } as never,
      (() => createElement('div', { 'data-upstream-conversation': true })) as never,
    )
    const upstreamHeaderDisposer = ctx.slots.register(
      {
        name: 'conversation.session.header',
        children: {
          'conversation.session.header.actions': { kind: 'list', scope: 'session' },
          'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
        },
      } as never,
      (() => createElement('div', { 'data-upstream-session-header': true })) as never,
    )
    const upstreamSessionDisposer = ctx.slots.register(
      {
        name: 'conversation.session',
        children: {
          'conversation.view': { kind: 'list', scope: 'session' },
        },
      } as never,
      (() => createElement('div', { 'data-upstream-conversation-session': true })) as never,
    )
    const upstreamViewDisposer = ctx.slots.register(
      { name: 'conversation.view', id: 'chat', order: 0 } as never,
      (() => createElement('div', { 'data-upstream-conversation-view': true })) as never,
    )
    const upstreamComposerDisposer = ctx.slots.register(
      { name: 'conversation.composer.bar', id: 'native-input-bar', order: 0 } as never,
      (() => createElement('div', { 'data-upstream-composer-bar': true })) as never,
    )
    const upstreamOverlayDisposer = ctx.slots.register(
      { name: 'conversation.input.overlay', id: 'native-slash-menu', order: 0 } as never,
      (() => createElement('div', { 'data-native-menu-view': true })) as never,
    )

    expect(mountedContributions).toHaveLength(1)
    expect(mountedContributions[0]).toMatchObject({ package: 'harness-comfyui' })
    expect((mountedContributions[0] as { descriptors: Array<{ service: string; method: string }> }).descriptors)
      .toContainEqual(expect.objectContaining({ service: 'pluginStatus', method: 'get' }))
    expect(ctx.slots.entries('root')).toHaveLength(1)
    expect(ctx.slots.entries('sidebar')).toHaveLength(1)
    expect(ctx.slots.entries('sidebar')[0]?.options.priority).toBe(-10)
    expect(ctx.slots.entries('conversation')).toHaveLength(1)
    expect(ctx.slots.entries('conversation.session.header' as never)).toHaveLength(2)
    expect(ctx.slots.entriesOfSlot('conversation.session.header' as never)[0]?.options.priority).toBe(-10)
    expect(ctx.slots.entries('conversation.view' as never)).toHaveLength(2)
    expect(ctx.slots.entriesOfSlot('conversation.view' as never)[0]?.options).toMatchObject({
      id: 'chat',
      priority: -10,
    })
    expect(ctx.slots.entries('conversation.composer.bar' as never)).toHaveLength(2)
    expect(ctx.slots.entriesOfSlot('conversation.composer.bar' as never)[0]?.options).toMatchObject({
      priority: -10,
    })
    expect(ctx.slots.entries('conversation.input.overlay' as never)).toHaveLength(1)
    expect(ctx.slots.entriesOfSlot('conversation.input.overlay' as never)[0]?.options).toMatchObject({
      id: 'native-slash-menu',
    })
    expect(ctx.slots.entries('details')).toHaveLength(1)
    expect(ctx.slots.entries('details')[0]?.options.priority).toBe(-10)
    expect(ctx.slots.entries('shell.overlay')).toHaveLength(0)

    const rootSnapshot = ctx.slots.snapshot('root')
    expect(rootSnapshot).toHaveLength(1)
    expect(rootSnapshot[0]?.children.map(child => child.name)).toEqual([
      'sidebar',
      'conversation',
      'details',
      'shell.overlay',
    ])

    const sidebarComponent = ctx.slots.entries('sidebar')[0]?.component as ((props: {
      collapsed: boolean
      width: number
      useSessions: <S>(selector: (snapshot: SessionListState) => S) => S
    }) => ReactNode) | undefined
    expect(sidebarComponent).toBeTypeOf('function')
    if (!sidebarComponent) throw new Error('project Session sidebar was not registered')
    const sidebarMarkup = renderToStaticMarkup(createElement(sidebarComponent, {
      collapsed: false,
      width: 294,
      useSessions: <S,>(selector: (snapshot: SessionListState) => S) => selector(sessionsState),
    }))
    expect(sidebarMarkup).toContain('data-session-id="portrait"')
    expect(sidebarMarkup).toContain('data-session-id="video"')
    expect(sidebarMarkup).toContain('data-session-id="comparison"')
    expect(sidebarMarkup).toContain('placeholder="搜索会话"')

    const layout = ctx.reflect.get('layout') as ILayout | undefined
    expect(layout).toBeDefined()
    if (!layout) throw new Error('project layout service was not provided')

    const rootEntry = ctx.slots.entriesOfSlot('root')[0]
    const rootComponent = rootEntry?.component as ((props: {
      renderSlot: (key: string, owner: object) => ReactNode
    }) => ReactNode) | undefined
    expect(rootComponent).toBeTypeOf('function')
    if (!rootComponent) throw new Error('project root component was not registered')

    const renderCalls: Array<{ key: string; owner: object }> = []
    const renderRoot = () => {
      renderCalls.length = 0
      return renderToStaticMarkup(createElement(rootComponent, {
        renderSlot(key, owner) {
          renderCalls.push({ key, owner })
          return createElement('span', { 'data-rendered-slot': key })
        },
      }))
    }

    const initialMarkup = renderRoot()
    expect(initialMarkup).toContain('294px minmax(0, 1fr) 432px')
    expect(renderCalls).toEqual([
      { key: 'sidebar', owner: { collapsed: false, width: 294 } },
      { key: 'conversation', owner: {} },
      { key: 'details', owner: {} },
      { key: 'shell.overlay', owner: {} },
    ])
    expect(initialMarkup.indexOf('data-layout-column="details"')).toBeLessThan(
      initialMarkup.indexOf('data-shell-overlay'),
    )

    const detailsEntry = ctx.slots.entries('details')[0]
    const detailsComponent = detailsEntry?.component as ((props: {
      sessionId: SessionSummary['id']
    }) => ReactNode) | undefined
    expect(detailsComponent).toBeTypeOf('function')
    if (!detailsComponent) throw new Error('project results panel was not registered')
    const detailsMarkup = renderToStaticMarkup(createElement(detailsComponent, {
      sessionId: 'portrait' as SessionSummary['id'],
    }))
    expect(detailsMarkup).toContain('OUTPUT')
    expect(detailsMarkup).toContain('生成结果')
    expect(detailsMarkup).toContain('当前轮次结果')
    expect(detailsMarkup).toContain('本会话结果')
    expect(detailsMarkup).toContain('此轮对话没有创建 ComfyUI 运行')
    expect(detailsMarkup).toContain('当前会话还没有生成运行')
    expect(detailsMarkup).toContain('id="panel-session" class="result-tab-panel" role="tabpanel" aria-labelledby="tab-session" hidden')

    const headerEntry = ctx.slots.entriesOfSlot('conversation.session.header' as never)[0]
    const headerComponent = headerEntry?.component as ((props: {
      sessionId: SessionSummary['id']
      useSessions: <S>(selector: (snapshot: SessionListState) => S) => S
    }) => ReactNode) | undefined
    expect(headerComponent).toBeTypeOf('function')
    if (!headerComponent) throw new Error('project Session header was not elected')
    let activeState = sessionsState
    const renderHeader = () => renderToStaticMarkup(createElement(headerComponent, {
      sessionId: activeState.current as SessionSummary['id'],
      useSessions: <S,>(selector: (snapshot: SessionListState) => S) => selector(activeState),
    }))
    const firstHeaderMarkup = renderHeader()
    expect(firstHeaderMarkup).toContain('<p class="section-kicker">CONVERSATION</p>')
    expect(firstHeaderMarkup).toContain('<h2 id="conversation-title">角色立绘调整</h2>')
    expect(firstHeaderMarkup).toContain('Agent 就绪')
    activeState = { ...sessionsState, current: 'video' as SessionListState['current'] }
    const secondHeaderMarkup = renderHeader()
    expect(secondHeaderMarkup).toContain('<h2 id="conversation-title">测试视频工作流</h2>')
    expect(secondHeaderMarkup).not.toContain('角色立绘调整')
    expect(secondHeaderMarkup).toContain('Agent 就绪')
    expect(secondHeaderMarkup).not.toContain('Agent 运行中')

    const viewEntry = ctx.slots.entriesOfSlot('conversation.view' as never)[0]
    const viewComponent = viewEntry?.component as ((props: {
      sessionId: SessionSummary['id']
      useSession: <S>(selector: (snapshot: ConversationSnapshot) => S) => S
    }) => ReactNode) | undefined
    expect(viewComponent).toBeTypeOf('function')
    if (!viewComponent) throw new Error('project ConversationSnapshot view was not elected')
    let activeConversation = conversationSnapshot(
      sessionsState.current as SessionSummary['id'],
      '初始 Session 回复',
    )
    const renderConversation = () => renderToStaticMarkup(createElement(viewComponent, {
      sessionId: activeConversation.sessionId,
      useSession: <S,>(selector: (snapshot: ConversationSnapshot) => S) => selector(activeConversation),
    }))
    const firstConversationMarkup = renderConversation()
    expect(firstConversationMarkup).toContain('初始 Session 回复')
    expect(firstConversationMarkup).toContain('查看本轮回复 · 无 ComfyUI 运行')

    activeConversation = conversationSnapshot(
      sessionsState.current as SessionSummary['id'],
      '第一段增量',
      'running',
    )
    const firstDeltaMarkup = renderConversation()
    expect(firstDeltaMarkup).toContain('第一段增量')
    expect(firstDeltaMarkup).toContain('正在输出')
    expect(firstDeltaMarkup).toContain('stream-caret')

    activeConversation = conversationSnapshot(
      sessionsState.current as SessionSummary['id'],
      '完成 Session 回复',
      'settled',
    )
    const settledConversationMarkup = renderConversation()
    expect(settledConversationMarkup).toContain('完成 Session 回复')
    expect(settledConversationMarkup).not.toContain('正在输出')
    expect(settledConversationMarkup).not.toContain('第一段增量')

    activeConversation = conversationSnapshot(
      'video' as SessionSummary['id'],
      '替换 Session 回复',
      'settled',
    )
    const replacementConversationMarkup = renderConversation()
    expect(replacementConversationMarkup).toContain('替换 Session 回复')
    expect(replacementConversationMarkup).not.toContain('完成 Session 回复')
    expect(replacementConversationMarkup).not.toContain('角色 Session 请求')

    const composerEntry = ctx.slots.entriesOfSlot('conversation.composer.bar' as never)[0]
    const composerComponent = composerEntry?.component as ((props: {
      sessionId: SessionSummary['id']
      variant: 'composer'
      useInput: <S>(selector: (snapshot: InputState | undefined) => S) => S
      inputActions: { setDraft: (draft: string) => void; submit: () => void }
      overlay: ReactNode
    }) => ReactNode) | undefined
    expect(composerComponent).toBeTypeOf('function')
    if (!composerComponent) throw new Error('project composer bar was not elected')
    let inputState: InputState = {
      draft: 'portrait draft',
      draftRev: 3,
      imageIds: [],
      phase: 'plain',
      occurrences: [],
      queue: [],
    } as InputState
    const submit = vi.fn()
    const composerMarkup = () => renderToStaticMarkup(createElement(composerComponent, {
      sessionId: 'portrait' as SessionSummary['id'],
      variant: 'composer',
      useInput: <S,>(selector: (snapshot: InputState | undefined) => S) => selector(inputState),
      inputActions: { setDraft: () => undefined, submit },
      overlay: createElement('div', { 'data-native-menu-view': true }, 'native slash menu'),
    }))
    const firstComposerMarkup = composerMarkup()
    expect(firstComposerMarkup).toContain('class="composer-wrap"')
    expect(firstComposerMarkup).toContain('class="composer-box"')
    expect(firstComposerMarkup).toContain('id="message-input"')
    expect(firstComposerMarkup).toContain('Enter 发送 · Shift + Enter 换行')
    expect(firstComposerMarkup).toContain('portrait draft</textarea>')
    expect(firstComposerMarkup).toContain('data-native-menu-view="true"')
    expect(triggerScopes).toContainEqual({ sessionId: 'portrait' })
    inputState = { ...inputState, draft: 'video draft', draftRev: 4 }
    const secondComposerMarkup = composerMarkup()
    expect(secondComposerMarkup).toContain('video draft</textarea>')
    expect(secondComposerMarkup).not.toContain('portrait draft')

    const composerElement = composerComponent({
      sessionId: 'portrait' as SessionSummary['id'],
      variant: 'composer',
      useInput: <S,>(selector: (snapshot: InputState | undefined) => S) => selector(inputState),
      inputActions: { setDraft: () => undefined, submit },
      overlay: createElement('div', { 'data-native-menu-view': true }, 'native slash menu'),
    }) as ReactElement
    const composerBox = composerElement.props.children as ReactElement
    const composerChildren = (Array.isArray(composerBox.props.children)
      ? composerBox.props.children
      : [composerBox.props.children]) as ReactNode[]
    const composerFooter = composerChildren.find((child: ReactNode): child is ReactElement => (
      child !== null && typeof child === 'object' && 'type' in child && child.type === 'div'
      && child.props.className === 'composer-footer'
    ))
    const composerFooterChildren = (Array.isArray(composerFooter?.props.children)
      ? composerFooter.props.children
      : [composerFooter?.props.children]) as ReactNode[]
    const composerButton = composerFooterChildren.find((child: ReactNode): child is ReactElement => (
      child !== null && typeof child === 'object' && 'type' in child && child.type === 'button'
    ))
    expect(composerButton).toBeDefined()
    composerButton?.props.onClick()
    expect(submit).toHaveBeenCalledOnce()

    layout.toggleSidebar()
    const collapsedMarkup = renderRoot()
    expect(collapsedMarkup).toContain('56px minmax(0, 1fr) 432px')
    expect(renderCalls[0]).toEqual({ key: 'sidebar', owner: { collapsed: true, width: 56 } })

    layout.toggleSidebar()
    expect(renderRoot()).toContain('294px minmax(0, 1fr) 432px')
    layout.closeDetails()
    expect(renderRoot()).toContain('294px minmax(0, 1fr) 0px')
    layout.openDetails()
    expect(renderRoot()).toContain('294px minmax(0, 1fr) 432px')

    await clientFiber.dispose()
    expect(ctx.slots.entries('root')).toHaveLength(0)
    expect(ctx.slots.entries('sidebar')).toHaveLength(0)
    expect(ctx.slots.entries('conversation.session.header' as never)).toHaveLength(0)
    expect(ctx.slots.entries('conversation.view' as never)).toHaveLength(0)
    expect(ctx.slots.entries('conversation.composer.bar' as never)).toHaveLength(0)
    expect(ctx.slots.entries('details')).toHaveLength(0)
    expect(ctx.slots.snapshot('root')[0]?.children).toEqual([])
    expect(ctx.reflect.get('layout')).toBeUndefined()
    expect(document.documentElement.style.getPropertyValue('color-scheme')).toBe('')
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(false)
    expect(remoteUnmountCount).toBe(1)
    inputTriggersDisposer()
    themeDisposer()
    sessionsDisposer()
    await remoteDisposer()
    upstreamHeaderDisposer()
    upstreamViewDisposer()
    upstreamComposerDisposer()
    upstreamOverlayDisposer()
    upstreamSessionDisposer()
    upstreamConversationDisposer()
    await ctx.fiber.dispose()
  })
})
