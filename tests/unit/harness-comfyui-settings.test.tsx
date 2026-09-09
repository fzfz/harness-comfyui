import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, ...props }: Record<string, unknown>) => createElement('button', props, children as ReactNode),
  Input: (props: Record<string, unknown>) => createElement('input', props),
}))

import {
  HarnessComfyuiSettingsPage,
  SOURCE_SETTINGS_COPY,
} from '../../src/client/settings/harness-comfyui-settings.tsx'
import { createImageReaderProfile } from '../../src/image-reader/settings.ts'

const { act, create } = await vi.importActual('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>
  create: (node: ReactNode) => {
    root: {
      findAllByType(type: string): Array<{ props: Record<string, any> }>
    }
    toJSON(): unknown
    unmount(): void
  }
}

function imageReaderScope() {
  const profile = Object.freeze({
    ...createImageReaderProfile('default'),
    provider: 'provider-a',
    model: 'vision-a',
  })
  const snapshot = Object.freeze({
    status: 'ready' as const,
    writable: true,
    value: Object.freeze({
      configuration: Object.freeze({ activeProfileId: profile.id, profiles: Object.freeze([profile]) }),
    }),
  })
  return {
    subscribe: () => () => undefined,
    getSnapshot: () => snapshot,
  }
}

function sourceScope(mutate: (...args: any[]) => Promise<unknown> = vi.fn(async () => undefined)) {
  const snapshot = Object.freeze({
    status: 'ready' as const,
    writable: true,
    value: Object.freeze({ configuration: Object.freeze({ url: 'http://127.0.0.1', port: 18093 }) }),
    base: Object.freeze({ configuration: Object.freeze({ url: 'http://127.0.0.1', port: 18093 }) }),
    user: undefined,
    revision: 7,
    mode: 'host' as const,
  })
  return {
    subscribe: () => () => undefined,
    getSnapshot: () => snapshot,
    mutate,
  }
}

function props(mutate?: (...args: any[]) => Promise<unknown>) {
  return {
    imageReaderScope: imageReaderScope(),
    imageReaderApi: {
      models: vi.fn(async () => ({
        groups: [{ provider: 'provider-a', name: 'Provider A', models: [{ id: 'vision-a', name: 'Vision A', description: null }] }],
        failures: [],
      })),
      saveProfile: vi.fn(),
      activateProfile: vi.fn(),
      deleteProfile: vi.fn(),
    },
    sourceScope: sourceScope(mutate),
  }
}

function button(renderer: ReturnType<typeof create>, text: string) {
  return renderer.root.findAllByType('button').find(candidate => candidate.props.children === text)!
}

function input(renderer: ReturnType<typeof create>, name: string) {
  return renderer.root.findAllByType('input').find(candidate => candidate.props.name === name)!
}

describe('Harness-ComfyUI unified settings page', () => {
  it('renders the existing image settings page unchanged inside the first tab and preserves its draft across tabs', async () => {
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(HarnessComfyuiSettingsPage, props() as never))
      await Promise.resolve()
    })

    expect(JSON.stringify(renderer.toJSON())).toContain('Harness-ComfyUI')
    expect(button(renderer, '图片读取').props['aria-selected']).toBe(true)
    expect(button(renderer, '数据源服务').props['aria-selected']).toBe(false)
    expect(JSON.stringify(renderer.toJSON())).toContain('保存多份独立读图配置')
    expect(renderer.root.findAllByType('form')[0]!.props.noValidate).toBe(true)

    const profileName = renderer.root.findAllByType('input').find(candidate => candidate.props.type === 'text')!
    await act(async () => {
      profileName.props.onChange({ target: { value: '未保存的图片配置' } })
    })
    await act(async () => {
      button(renderer, '数据源服务').props.onClick()
    })
    expect(button(renderer, '数据源服务').props['aria-selected']).toBe(true)
    await act(async () => {
      button(renderer, '图片读取').props.onClick()
    })
    expect(renderer.root.findAllByType('input').find(candidate => candidate.props.type === 'text')!.props.value)
      .toBe('未保存的图片配置')
    renderer.unmount()
  })

  it('switches and focuses tabs with the prototype keyboard controls', async () => {
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(HarnessComfyuiSettingsPage, props() as never))
      await Promise.resolve()
    })
    const focus = vi.fn()
    const preventDefault = vi.fn()
    const getElementById = vi.fn(() => ({ focus }))
    const currentTarget = { ownerDocument: { getElementById } }

    await act(async () => {
      button(renderer, '图片读取').props.onKeyDown({
        key: 'ArrowRight',
        preventDefault,
        currentTarget,
      })
    })

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(focus).toHaveBeenCalledOnce()
    expect(getElementById).toHaveBeenNthCalledWith(1, 'harness-comfyui-source-tab')
    expect(button(renderer, '数据源服务').props['aria-selected']).toBe(true)

    await act(async () => {
      button(renderer, '数据源服务').props.onKeyDown({
        key: 'ArrowLeft',
        preventDefault,
        currentTarget,
      })
    })
    expect(preventDefault).toHaveBeenCalledTimes(2)
    expect(focus).toHaveBeenCalledTimes(2)
    expect(getElementById).toHaveBeenNthCalledWith(2, 'harness-comfyui-image-reader-tab')
    expect(button(renderer, '图片读取').props['aria-selected']).toBe(true)

    await act(async () => {
      button(renderer, '图片读取').props.onKeyDown({ key: 'End', preventDefault, currentTarget })
    })
    expect(getElementById).toHaveBeenNthCalledWith(3, 'harness-comfyui-source-tab')
    expect(button(renderer, '数据源服务').props['aria-selected']).toBe(true)

    await act(async () => {
      button(renderer, '数据源服务').props.onKeyDown({ key: 'Home', preventDefault, currentTarget })
    })
    expect(getElementById).toHaveBeenNthCalledWith(4, 'harness-comfyui-image-reader-tab')
    expect(button(renderer, '图片读取').props['aria-selected']).toBe(true)

    await act(async () => {
      button(renderer, '图片读取').props.onKeyDown({ key: 'Enter', preventDefault, currentTarget })
    })
    expect(preventDefault).toHaveBeenCalledTimes(4)
    expect(focus).toHaveBeenCalledTimes(4)
    expect(getElementById).toHaveBeenCalledTimes(4)
    expect(button(renderer, '图片读取').props['aria-selected']).toBe(true)
    renderer.unmount()
  })

  it('shows a valid IPv6 connection address', async () => {
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(HarnessComfyuiSettingsPage, props() as never))
      await Promise.resolve()
      button(renderer, '数据源服务').props.onClick()
    })
    await act(async () => {
      input(renderer, 'source-url').props.onChange({ target: { value: 'http://[::1]' } })
    })
    expect(JSON.stringify(renderer.toJSON())).toContain('http://[::1]:18093')
    renderer.unmount()
  })

  it('keeps the source draft across tabs and saves URL and port in one Settings mutation', async () => {
    const mutate = vi.fn(async () => undefined)
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(HarnessComfyuiSettingsPage, props(mutate) as never))
      await Promise.resolve()
      button(renderer, '数据源服务').props.onClick()
    })

    await act(async () => {
      input(renderer, 'source-url').props.onChange({ target: { value: 'https://catalog.example.com' } })
      input(renderer, 'source-port').props.onChange({ target: { value: '443' } })
      button(renderer, '图片读取').props.onClick()
      button(renderer, '数据源服务').props.onClick()
    })
    expect(input(renderer, 'source-url').props.value).toBe('https://catalog.example.com')
    expect(input(renderer, 'source-port').props.value).toBe('443')

    await act(async () => {
      renderer.root.findAllByType('form')[0]!.props.onSubmit({ preventDefault: vi.fn() })
      await Promise.resolve()
    })
    expect(mutate).toHaveBeenCalledWith([
      { op: 'set', path: ['configuration', 'url'], value: 'https://catalog.example.com' },
      { op: 'set', path: ['configuration', 'port'], value: 443 },
    ], 7)
    expect(JSON.stringify(renderer.toJSON())).toContain(SOURCE_SETTINGS_COPY.saved)
    renderer.unmount()
  })

  it.each([
    ['source-url', 'catalog.example.com', SOURCE_SETTINGS_COPY.urlFormatInvalid],
    ['source-url', 'https://catalog.example.com:8443', SOURCE_SETTINGS_COPY.urlPortNotAllowed],
    ['source-url', 'https://catalog.example.com/api', SOURCE_SETTINGS_COPY.urlComponentNotAllowed],
    ['source-port', '65536', SOURCE_SETTINGS_COPY.portInvalid],
    ['source-port', '1.5', SOURCE_SETTINGS_COPY.portInvalid],
  ])('shows the exact field error and does not write for invalid %s', async (field, value, message) => {
    const mutate = vi.fn(async () => undefined)
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(HarnessComfyuiSettingsPage, props(mutate) as never))
      await Promise.resolve()
      button(renderer, '数据源服务').props.onClick()
    })
    await act(async () => {
      input(renderer, field).props.onChange({ target: { value } })
    })
    await act(async () => {
      renderer.root.findAllByType('form')[0]!.props.onSubmit({ preventDefault: vi.fn() })
      await Promise.resolve()
    })
    expect(JSON.stringify(renderer.toJSON())).toContain(message)
    expect(mutate).not.toHaveBeenCalled()
    renderer.unmount()
  })

  it('keeps the submitted draft and reports a failed Settings mutation', async () => {
    const mutate = vi.fn(async () => { throw new Error('settings offline') })
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(HarnessComfyuiSettingsPage, props(mutate) as never))
      await Promise.resolve()
      button(renderer, '数据源服务').props.onClick()
    })
    await act(async () => {
      input(renderer, 'source-url').props.onChange({ target: { value: 'https://catalog.example.com' } })
      input(renderer, 'source-port').props.onChange({ target: { value: '443' } })
    })
    await act(async () => {
      renderer.root.findAllByType('form')[0]!.props.onSubmit({ preventDefault: vi.fn() })
      await Promise.resolve()
    })
    expect(input(renderer, 'source-url').props.value).toBe('https://catalog.example.com')
    expect(input(renderer, 'source-port').props.value).toBe('443')
    expect(JSON.stringify(renderer.toJSON())).toContain(SOURCE_SETTINGS_COPY.saveFailed)
    renderer.unmount()
  })
})
