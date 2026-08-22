import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  createComposerBar,
  type ComposerBarProps,
} from '../../src/client/workbench/composer-bar.tsx'

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup(node: ReactNode): string
}

type InputState = {
  draft: string
  draftRev: number
  imageIds: readonly never[]
  phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting'
  occurrences: readonly never[]
  queue: readonly never[]
}

type InputActions = {
  setDraft: (draft: string) => void
  addImages: () => boolean
  removeImage: () => void
  pruneImages: () => void
  submit: () => void
}

function inputState(draft: string, draftRev: number): InputState {
  return {
    draft,
    draftRev,
    imageIds: [],
    phase: 'plain',
    occurrences: [],
    queue: [],
  } as InputState
}

function inputActions(setDraft: (draft: string) => void): InputActions {
  return {
    setDraft,
    addImages: () => true,
    removeImage: () => undefined,
    pruneImages: () => undefined,
    submit: vi.fn(),
  }
}

function composerElement(
  render: (state: InputState) => ReactNode,
): { root: ReactElement; textarea: ReactElement; box: ReactElement } {
  const root = render(inputState('', 0)) as ReactElement
  const box = root.props.children as ReactElement
  const children = (Array.isArray(box.props.children) ? box.props.children : [box.props.children]) as ReactNode[]
  const textarea = children.find((child: ReactNode): child is ReactElement => (
    child !== null && typeof child === 'object' && 'type' in child && child.type === 'textarea'
  ))
  if (textarea === undefined) throw new Error('composer did not render a textarea')
  return { root, textarea, box }
}

describe('native composer bar', () => {
  it('renders the prototype composer and keeps the owner overlay inside the card', () => {
    const state = inputState('当前草稿', 4)
    const overlay = createElement('div', { 'data-native-menu-view': true }, 'native slash menu')
    const ComposerBar = createComposerBar({
      sessions: { scope: vi.fn(() => ({ sessionId: 'portrait' })) },
      inputTriggers: {
        sessionOf: vi.fn(() => ({
          track: vi.fn(),
          arbitrate: vi.fn(() => 'pass'),
          onSpace: vi.fn(() => false),
        })),
      },
    } as never)

    const markup = renderToStaticMarkup(createElement(ComposerBar, {
      sessionId: 'portrait',
      variant: 'composer',
      overlay,
      useInput: <S,>(selector: (snapshot: InputState | undefined) => S) => selector(state),
      inputActions: inputActions(vi.fn()),
    } as unknown as ComposerBarProps))

    expect(markup).toContain('class="composer-wrap"')
    expect(markup).toContain('class="composer-box"')
    expect(markup).toContain('id="message-input"')
    expect(markup).toContain('name="message"')
    expect(markup).toContain('rows="3"')
    expect(markup).toContain('aria-label="本次发送给图像生成 Agent 的消息"')
    expect(markup).toContain('placeholder="向图像生成 Agent 描述本次任务……"')
    expect(markup).toContain('Enter 发送 · Shift + Enter 换行')
    expect(markup).toContain('id="send-message"')
    expect(markup).toContain('data-native-menu-view="true"')
    expect(markup.indexOf('data-native-menu-view')).toBeGreaterThan(markup.indexOf('class="composer-box"'))
  })

  it('writes the current Session draft through public input actions and tracks native triggers', () => {
    let state = inputState('', 0)
    const setDraft = vi.fn((draft: string) => {
      state = inputState(draft, state.draftRev + 1)
    })
    const track = vi.fn()
    const scope = vi.fn((sessionId: string) => ({ sessionId }))
    const sessionOf = vi.fn(() => ({ track, arbitrate: vi.fn(), onSpace: vi.fn() }))
    const ComposerBar = createComposerBar({
      sessions: { scope },
      inputTriggers: { sessionOf },
    } as never)
    const render = (sessionId: 'portrait' | 'video', current: InputState) => ComposerBar({
      sessionId,
      variant: 'composer',
      useInput: <S,>(selector: (snapshot: InputState | undefined) => S) => selector(current),
      inputActions: inputActions(setDraft),
    } as unknown as ComposerBarProps) as ReactElement

    const { textarea } = composerElement(state => render('portrait', state))
    textarea.props.onChange({
      currentTarget: { value: '/', selectionStart: 1 },
    })

    expect(scope).toHaveBeenCalledWith('portrait')
    expect(sessionOf).toHaveBeenCalledWith({ sessionId: 'portrait' })
    expect(setDraft).toHaveBeenCalledWith('/')
    expect(track).toHaveBeenCalledWith('/', 1, { tier: 'plain' }, 1)

    const first = render('portrait', state)
    const firstBox = first.props.children as ReactElement
    const firstChildren = (Array.isArray(firstBox.props.children) ? firstBox.props.children : [firstBox.props.children]) as ReactNode[]
    const firstTextarea = firstChildren
      .find((child: ReactNode): child is ReactElement => child !== null && typeof child === 'object' && 'type' in child && child.type === 'textarea')
    expect(firstTextarea?.props.value).toBe('/')
    const second = render('video', inputState('/character ', 2))
    const secondBox = second.props.children as ReactElement
    const secondChildren = (Array.isArray(secondBox.props.children) ? secondBox.props.children : [secondBox.props.children]) as ReactNode[]
    const secondTextarea = secondChildren
      .find((child: ReactNode): child is ReactElement => child !== null && typeof child === 'object' && 'type' in child && child.type === 'textarea')
    expect(secondTextarea?.props.value).toBe('/character ')
    expect(secondTextarea?.props.value).not.toBe('/')
  })

  it('prevents Enter from becoming an unscoped submission while Shift+Enter remains a newline', () => {
    const ComposerBar = createComposerBar({
      sessions: { scope: vi.fn(() => ({ sessionId: 'portrait' })) },
      inputTriggers: {
        sessionOf: vi.fn(() => ({
          track: vi.fn(),
          arbitrate: vi.fn(() => 'pass'),
          onSpace: vi.fn(() => false),
        })),
      },
    } as never)
    const { textarea } = composerElement(state => ComposerBar({
      sessionId: 'portrait',
      variant: 'composer',
      useInput: <S,>(selector: (snapshot: InputState | undefined) => S) => selector(state),
      inputActions: inputActions(vi.fn()),
    } as unknown as ComposerBarProps) as ReactElement)

    let prevented = false
    textarea.props.onKeyDown({
      key: 'Enter',
      shiftKey: false,
      nativeEvent: { isComposing: false, keyCode: 0 },
      preventDefault: () => { prevented = true },
    })
    expect(prevented).toBe(true)
  })

  it('delegates native menu keyboard gestures and respects consumed, pass, and IME outcomes', () => {
    const arbitrate = vi.fn((key: 'up' | 'down' | 'escape' | 'enter') => (
      key === 'up' || key === 'escape' ? 'consumed' : 'pass'
    ))
    const onSpace = vi.fn(() => true)
    const controller = { track: vi.fn(), arbitrate, onSpace }
    const ComposerBar = createComposerBar({
      sessions: { scope: vi.fn(() => ({ sessionId: 'portrait' })) },
      inputTriggers: { sessionOf: vi.fn(() => controller) },
    } as never)
    const { textarea } = composerElement(state => ComposerBar({
      sessionId: 'portrait',
      variant: 'composer',
      useInput: <S,>(selector: (snapshot: InputState | undefined) => S) => selector(state),
      inputActions: inputActions(vi.fn()),
    } as unknown as ComposerBarProps) as ReactElement)

    const keydown = (key: string, options: { shiftKey?: boolean; composing?: boolean } = {}) => {
      let prevented = false
      textarea.props.onKeyDown({
        key,
        shiftKey: options.shiftKey ?? false,
        nativeEvent: {
          isComposing: options.composing ?? false,
          keyCode: options.composing ? 229 : 0,
        },
        preventDefault: () => { prevented = true },
      })
      return prevented
    }

    expect(keydown('ArrowUp')).toBe(true)
    expect(arbitrate).toHaveBeenCalledWith('up', false)
    expect(keydown('ArrowDown')).toBe(false)
    expect(arbitrate).toHaveBeenCalledWith('down', false)
    expect(keydown('Escape')).toBe(true)
    expect(arbitrate).toHaveBeenCalledWith('escape', false)
    expect(keydown(' ')).toBe(true)
    expect(onSpace).toHaveBeenCalledOnce()
    expect(keydown('Enter')).toBe(true)
    expect(arbitrate).toHaveBeenCalledWith('enter', false)

    const callsBeforeShiftEnter = arbitrate.mock.calls.length
    expect(keydown('Enter', { shiftKey: true })).toBe(false)
    expect(arbitrate.mock.calls.length).toBe(callsBeforeShiftEnter)

    const callsBeforeComposition = arbitrate.mock.calls.length
    expect(keydown('ArrowDown', { composing: true })).toBe(false)
    expect(keydown(' ', { composing: true })).toBe(false)
    expect(keydown('Enter', { composing: true })).toBe(false)
    expect(arbitrate.mock.calls.length).toBe(callsBeforeComposition)
    expect(onSpace).toHaveBeenCalledOnce()
  })

  it('keeps the owned composer CSS at prototype desktop values', () => {
    const stylesheet = readFileSync(new URL('../../src/client/styles.css', import.meta.url), 'utf8')

    expect(stylesheet).toContain('padding: 12px clamp(16px, 3vw, 34px) 16px;')
    expect(stylesheet).toContain('padding: 8px 9px 7px;')
    expect(stylesheet).toContain('box-shadow: 0 7px 22px color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);')
    expect(stylesheet).toContain('max-height: 132px;')
    expect(stylesheet).toContain('min-height: 42px;')
    expect(stylesheet).toContain('padding: 2px 3px;')
    expect(stylesheet).toContain('margin: 0 0 0 3px;')
    expect(stylesheet).toContain('height: 14px;')
    expect(stylesheet).toContain('width: 14px;')
  })

  it('renders the supplied native overlay without creating a second menu implementation', () => {
    const source = readFileSync(new URL('../../src/client/workbench/composer-bar.tsx', import.meta.url), 'utf8')

    expect(source).not.toContain('SkillsApi')
    expect(source).not.toContain('MenuView')
    expect(source).not.toContain('registerSource')
  })
})
