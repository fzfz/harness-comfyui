import { createRequire } from 'node:module'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { decodeImageReaderSettings, decodeImageReaderSettingsSection } from '../../src/image-reader/settings.ts'
import {
  ImageReaderSettingsPage,
  modelsForProvider,
  saveImageReaderSettings,
} from '../../src/client/image-reader/image-reader-settings.tsx'

const { act, create } = createRequire(import.meta.url)('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>
  create: (node: ReactNode) => {
    root: { findAllByType(type: string): Array<{ props: Record<string, unknown> }> }
    toJSON(): unknown
    unmount(): void
  }
}

const settingsValue = Object.freeze({
  provider: 'provider-a', model: 'vision-a', defaultPrompt: '描述图片', temperature: 0.2, maxTokens: 2048,
})

const modelCatalog = Object.freeze({
  groups: Object.freeze([Object.freeze({
    provider: 'provider-a', name: 'Provider A',
    models: Object.freeze([Object.freeze({ id: 'vision-a', name: 'Vision A', description: null })]),
  })]),
  failures: Object.freeze([]),
})

function settingsScope(set = vi.fn(async () => undefined)) {
  const snapshot = Object.freeze({
    status: 'ready' as const,
    writable: true,
    value: Object.freeze({ configuration: settingsValue }),
  })
  return {
    snapshot,
    subscribe() {
      if (this.snapshot !== snapshot) throw new Error('settings scope receiver was lost')
      return () => undefined
    },
    getSnapshot() {
      if (this.snapshot !== snapshot) throw new Error('settings scope receiver was lost')
      return this.snapshot
    },
    set,
  }
}

function buttonByText(renderer: ReturnType<typeof create>, text: string) {
  return renderer.root.findAllByType('button').find(button => button.props.children === text)!
}

describe('image reader settings page behavior', () => {
  it('decodes only a complete settings section', () => {
    expect(decodeImageReaderSettings({
      provider: 'provider-a',
      model: 'vision-a',
      defaultPrompt: '描述图片',
      temperature: 0.4,
      maxTokens: 4096,
    })).toEqual({
      provider: 'provider-a', model: 'vision-a', defaultPrompt: '描述图片', temperature: 0.4, maxTokens: 4096,
    })
    expect(decodeImageReaderSettings({ provider: 'provider-a' })).toBeUndefined()
    expect(decodeImageReaderSettings({
      provider: 'provider-a', model: 'vision-a', defaultPrompt: '', temperature: 0.4, maxTokens: 4096,
    })).toBeUndefined()
    expect(decodeImageReaderSettingsSection({ configuration: settingsValue })).toEqual({ configuration: settingsValue })
    expect(decodeImageReaderSettingsSection(settingsValue)).toBeUndefined()
    expect(decodeImageReaderSettings({
      provider: 'provider-a', model: 'vision-a', defaultPrompt: 'prompt', temperature: 3, maxTokens: 4096,
    })).toBeUndefined()
  })

  it('selects models only from the active runtime provider group', () => {
    const catalog = {
      groups: [
        { provider: 'provider-a', name: 'Provider A', models: [{ id: 'vision-a', name: 'Vision A', description: null }] },
        { provider: 'provider-b', name: 'Provider B', models: [{ id: 'vision-b', name: 'Vision B', description: null }] },
      ],
      failures: [],
    }
    expect(modelsForProvider(catalog, 'provider-b')).toEqual(catalog.groups[1]!.models)
    expect(modelsForProvider(catalog, 'missing')).toEqual([])
  })

  it('writes every editable field as one atomic settings value', async () => {
    const set = vi.fn(async () => undefined)
    await saveImageReaderSettings({ set } as never, {
      provider: 'provider-a', model: 'vision-a', defaultPrompt: '描述构图', temperature: 0.3, maxTokens: 3072,
    }, modelCatalog)
    expect(set).toHaveBeenCalledOnce()
    expect(set).toHaveBeenCalledWith('configuration', {
      provider: 'provider-a', model: 'vision-a', defaultPrompt: '描述构图', temperature: 0.3, maxTokens: 3072,
    })
  })

  it('rejects an invalid draft before writing settings', async () => {
    const set = vi.fn()
    await expect(saveImageReaderSettings({ set } as never, {
      provider: 'provider-a', model: '', defaultPrompt: 'prompt', temperature: 0.3, maxTokens: 3072,
    }, modelCatalog)).rejects.toMatchObject({ code: 'IMAGE_READER_SETTINGS_INVALID' })
    await expect(saveImageReaderSettings({ set } as never, {
      provider: 'provider-a', model: 'removed-model', defaultPrompt: 'prompt', temperature: 0.3, maxTokens: 3072,
    }, modelCatalog)).rejects.toMatchObject({ code: 'IMAGE_READER_SETTINGS_INVALID' })
    expect(set).not.toHaveBeenCalled()
  })

  it('surfaces an atomic settings write failure without a partial route write', async () => {
    const failure = new Error('write refused')
    const set = vi.fn().mockRejectedValueOnce(failure)
    await expect(saveImageReaderSettings({ set } as never, {
      provider: 'provider-a', model: 'vision-a', defaultPrompt: 'prompt', temperature: 0.3, maxTokens: 3072,
    }, modelCatalog)).rejects.toBe(failure)
    expect(set).toHaveBeenCalledOnce()
    expect(set.mock.calls[0]![0]).toBe('configuration')
  })

  it('renders runtime models and confirms a successful settings save', async () => {
    const scope = settingsScope()
    const catalog = {
      models: vi.fn(async () => ({
        groups: [{
          provider: 'provider-a', name: 'Provider A',
          models: [{ id: 'vision-a', name: 'Vision A', description: null }],
        }],
        failures: [{ provider: 'provider-b', message: '目录暂时不可用' }],
      })),
    }
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(createElement(ImageReaderSettingsPage, { scope, catalog } as never))
      await Promise.resolve()
    })

    expect(JSON.stringify(renderer.toJSON())).toContain('Provider A')
    expect(JSON.stringify(renderer.toJSON())).toContain('Vision A')
    expect(JSON.stringify(renderer.toJSON())).toContain('provider-b')
    expect(JSON.stringify(renderer.toJSON())).toContain('请点击“刷新模型”重试；其他已加载 Provider 仍可选择。')
    const selects = renderer.root.findAllByType('select')
    const textarea = renderer.root.findAllByType('textarea')[0]!
    const inputs = renderer.root.findAllByType('input')
    await act(async () => {
      ;(selects[0]!.props.onChange as (event: unknown) => void)({ target: { value: 'provider-a' } })
      ;(selects[1]!.props.onChange as (event: unknown) => void)({ target: { value: 'vision-a' } })
      ;(textarea.props.onChange as (event: unknown) => void)({ target: { value: '只描述构图' } })
      ;(inputs[0]!.props.onChange as (event: unknown) => void)({ target: { value: '0.4' } })
      ;(inputs[1]!.props.onChange as (event: unknown) => void)({ target: { value: '4096' } })
    })
    await act(async () => {
      ;(buttonByText(renderer, '刷新模型').props.onClick as () => void)()
      await Promise.resolve()
    })
    await act(async () => {
      ;(buttonByText(renderer, '保存图片读取设置').props.onClick as () => void)()
      await Promise.resolve()
    })
    expect(JSON.stringify(renderer.toJSON())).toContain('图片读取设置已保存。')
    expect(catalog.models).toHaveBeenCalledTimes(2)
    expect(scope.set).toHaveBeenCalledOnce()
    await act(async () => {
      ;(textarea.props.onChange as (event: unknown) => void)({ target: { value: '尚未保存的新提示词' } })
    })
    expect(JSON.stringify(renderer.toJSON())).not.toContain('图片读取设置已保存。')
    renderer.unmount()
  })

  it('renders model catalog and settings write failures as actionable messages', async () => {
    const catalogFailure = new Error('目录连接失败')
    let catalogRenderer!: ReturnType<typeof create>
    await act(async () => {
      catalogRenderer = create(createElement(ImageReaderSettingsPage, {
        scope: settingsScope(),
        catalog: { models: vi.fn(async () => { throw catalogFailure }) },
      } as never))
      await Promise.resolve()
    })
    expect(JSON.stringify(catalogRenderer.toJSON())).toContain('模型目录读取失败：')
    expect(JSON.stringify(catalogRenderer.toJSON())).toContain('目录连接失败')
    expect(JSON.stringify(catalogRenderer.toJSON())).toContain('请点击“刷新模型”重试。')
    catalogRenderer.unmount()

    const set = vi.fn(async () => { throw new Error('设置写入被拒绝') })
    let saveRenderer!: ReturnType<typeof create>
    await act(async () => {
      saveRenderer = create(createElement(ImageReaderSettingsPage, {
        scope: settingsScope(set),
        catalog: { models: vi.fn(async () => modelCatalog) },
      } as never))
      await Promise.resolve()
    })
    await act(async () => {
      ;(buttonByText(saveRenderer, '保存图片读取设置').props.onClick as () => void)()
      await Promise.resolve()
    })
    expect(JSON.stringify(saveRenderer.toJSON())).toContain('保存失败：')
    expect(JSON.stringify(saveRenderer.toJSON())).toContain('设置写入被拒绝')
    expect(JSON.stringify(saveRenderer.toJSON())).toContain('请检查 Provider、视觉模型、提示词、温度和最大输出 Token 数后重新保存。')
    saveRenderer.unmount()
  })
})
