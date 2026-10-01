import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import errorCatalog from '../../config/error-catalog.json' with { type: 'json' }
import { BROWSER_SETTINGS, type BrowserExecutablePathResult, type BrowserSettingsView } from '../../src/browser-settings-schema.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, ...props }: Record<string, unknown>) => createElement('button', props, children as ReactNode),
  Input: (props: Record<string, unknown>) => createElement('input', props),
}))

import { BrowserSettingsPage, type BrowserSettingsApi } from '../../src/client/settings/browser-settings.tsx'

type TestInstance = { readonly props: Record<string, any>; readonly children: unknown[] }
type TestRenderer = {
  readonly root: {
    findAllByType(type: string): TestInstance[]
    findByType(type: string): TestInstance
  }
  toJSON(): unknown
  unmount(): void
}

const { act, create } = await vi.importActual('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>
  create: (node: ReactNode) => TestRenderer
}

type BrowserMutation = ConfigForm<BrowserSettingsView>['mutate']

function form(options: {
  value?: BrowserSettingsView
  writable?: boolean
  status?: ConfigFormSnapshot<BrowserSettingsView>['status']
  mutate?: BrowserMutation
} = {}) {
  const listeners = new Set<() => void>()
  let snapshot: ConfigFormSnapshot<BrowserSettingsView> = {
    status: options.status ?? 'ready', value: options.value ?? {}, base: {}, user: {},
    revision: 1, writable: options.writable ?? true, mode: 'host',
  }
  const publish = (update: Partial<ConfigFormSnapshot<BrowserSettingsView>>) => {
    snapshot = { ...snapshot, ...update }
    for (const listener of listeners) listener()
  }
  const defaultMutate: BrowserMutation = async operations => {
    const path = operations.find(operation => operation.op === 'set')
    if (path?.op !== 'set' || typeof path.value !== 'string') throw new Error('Expected browser path write')
    publish({
      value: { ...snapshot.value, browserExecutablePath: path.value },
      revision: (snapshot.revision ?? 0) + 1,
    })
    return true
  }
  const mutate = vi.fn(options.mutate ?? defaultMutate)
  const scope: ConfigForm<BrowserSettingsView> = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    mutate,
    set: vi.fn(), unset: vi.fn(),
  }
  return { scope, mutate, publish }
}

function api(
  configurationPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  validateImplementation: BrowserSettingsApi['validate'] = async request => ({ ok: true, value: request }),
) {
  return {
    configuration: vi.fn(async () => ({ browserExecutablePath: configurationPath })),
    validate: vi.fn(validateImplementation),
  }
}

async function mount(scope: ConfigForm<BrowserSettingsView>, settingsApi: ReturnType<typeof api>) {
  let renderer!: TestRenderer
  await act(async () => {
    renderer = create(createElement(BrowserSettingsPage, { scope, api: settingsApi }))
    await Promise.resolve()
  })
  return renderer
}

function button(renderer: TestRenderer, label: string) {
  return renderer.root.findAllByType('button').find(candidate => candidate.children.join('') === label)!
}

describe('browser settings page', () => {
  it('shows the effective Host path and saves a validated user path through ConfigForms', async () => {
    const { scope, mutate } = form()
    const settingsApi = api()
    const renderer = await mount(scope, settingsApi)
    const input = () => renderer!.root.findByType('input')
    expect(input().props.value).toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    await act(async () => { input().props.onChange({ target: { value: '/Applications/Other Browser/browser' } }) })
    await act(async () => { await renderer!.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() }) })
    expect(scope.getSnapshot().value?.browserExecutablePath).toBe('/Applications/Other Browser/browser')
    expect(input().props.value).toBe('/Applications/Other Browser/browser')
    expect(mutate).toHaveBeenCalledOnce()
    expect(settingsApi.configuration).toHaveBeenCalledOnce()
    expect(JSON.stringify(renderer!.toJSON())).toContain(BROWSER_SETTINGS.ui.savedMessage)
    await act(async () => renderer!.unmount())
  })

  it('uses configured paths across external revisions and keeps an edited draft', async () => {
    const state = form({ value: { browserExecutablePath: '/profile/configured-browser' } })
    const settingsApi = api('/host/effective-browser')
    const renderer = await mount(state.scope, settingsApi)
    const input = () => renderer.root.findByType('input')

    expect(input().props.value).toBe('/profile/configured-browser')
    expect(settingsApi.configuration).not.toHaveBeenCalled()
    await act(async () => {
      state.publish({ value: { browserExecutablePath: '/profile/external-revision-browser' }, revision: 2 })
      await Promise.resolve()
    })
    expect(input().props.value).toBe('/profile/external-revision-browser')

    await act(async () => { input().props.onChange({ target: { value: '/local/draft-browser' } }) })
    await act(async () => {
      state.publish({ value: { browserExecutablePath: '/profile/later-revision-browser' }, revision: 3 })
      await Promise.resolve()
    })
    expect(input().props.value).toBe('/local/draft-browser')
    expect(settingsApi.configuration).not.toHaveBeenCalled()
    expect(state.mutate).not.toHaveBeenCalled()
    await act(async () => renderer.unmount())
  })

  it('reports a local invalid path without sending validation or a Settings write', async () => {
    const state = form()
    const settingsApi = api()
    const renderer = await mount(state.scope, settingsApi)
    await act(async () => {
      renderer.root.findByType('input').props.onChange({ target: { value: 'relative/browser' } })
    })
    await act(async () => {
      await renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() })
    })

    const page = JSON.stringify(renderer.toJSON())
    expect(page).toContain(errorCatalog.BROWSER_EXECUTABLE_PATH_INVALID.reason)
    expect(page).toContain(errorCatalog.BROWSER_EXECUTABLE_PATH_INVALID.next_step)
    expect(settingsApi.validate).not.toHaveBeenCalled()
    expect(state.mutate).not.toHaveBeenCalled()
    await act(async () => renderer.unmount())
  })

  it('shows Host path-validation failures and leaves the form value unchanged', async () => {
    const state = form()
    const invalidPath = '/Applications/Unavailable Browser/browser'
    const settingsApi = api('/Applications/Configured Browser/browser', async request => ({
      ok: false,
      error: { code: 'BROWSER_EXECUTABLE_PATH_UNAVAILABLE', path: request.browserExecutablePath, reason: 'execute permission denied' },
    }))
    const renderer = await mount(state.scope, settingsApi)
    await act(async () => {
      renderer.root.findByType('input').props.onChange({ target: { value: invalidPath } })
    })
    await act(async () => {
      await renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() })
    })

    const page = JSON.stringify(renderer.toJSON())
    expect(page).toContain(errorCatalog.BROWSER_EXECUTABLE_PATH_UNAVAILABLE.reason)
    expect(page).toContain(errorCatalog.BROWSER_EXECUTABLE_PATH_UNAVAILABLE.next_step)
    expect(page).toContain(invalidPath)
    expect(page).toContain('execute permission denied')
    expect(state.mutate).not.toHaveBeenCalled()
    expect(renderer.root.findByType('input').props.value).toBe(invalidPath)
    await act(async () => renderer.unmount())
  })

  it('preserves literal replacement tokens in rejected paths and system reasons', async () => {
    const state = form()
    const submittedPath = "/tmp/$&/$`/$'/$$/{reason}/browser"
    const systemReason = "permission denied: $& $` $' $$ {path}"
    const settingsApi = api('/profile/browser', async request => ({
      ok: false,
      error: { code: 'BROWSER_EXECUTABLE_PATH_UNAVAILABLE', path: request.browserExecutablePath, reason: systemReason },
    }))
    const renderer = await mount(state.scope, settingsApi)
    await act(async () => { renderer.root.findByType('input').props.onChange({ target: { value: submittedPath } }) })
    await act(async () => { await renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() }) })
    const expectedDetail = BROWSER_SETTINGS.ui.pathDetailsTemplate
      .replace(/\{path\}|\{reason\}/gu, token => token === '{path}' ? submittedPath : systemReason)
    const paragraphs = renderer.root.findAllByType('p').map(paragraph => paragraph.children.join(''))
    expect(paragraphs).toContain(expectedDetail)
    expect(renderer.root.findByType('input').props.value).toBe(submittedPath)
    expect(state.mutate).not.toHaveBeenCalled()
    await act(async () => renderer.unmount())
  })

  it('offers retry when Host settings cannot load and shows the effective path after retry', async () => {
    const state = form()
    const settingsApi = api()
    settingsApi.configuration
      .mockRejectedValueOnce(new Error('Host settings unavailable'))
      .mockResolvedValueOnce({ browserExecutablePath: '/Applications/Recovered Browser/browser' })
    const renderer = await mount(state.scope, settingsApi)
    const firstPage = JSON.stringify(renderer.toJSON())
    expect(firstPage).toContain(errorCatalog.BROWSER_SETTINGS_REQUEST_FAILED.reason)
    expect(firstPage).toContain(errorCatalog.BROWSER_SETTINGS_REQUEST_FAILED.next_step)
    expect(button(renderer, BROWSER_SETTINGS.ui.retryButton)).toBeDefined()

    await act(async () => {
      button(renderer, BROWSER_SETTINGS.ui.retryButton).props.onClick()
      await Promise.resolve()
    })
    expect(renderer.root.findByType('input').props.value).toBe('/Applications/Recovered Browser/browser')
    expect(settingsApi.configuration).toHaveBeenCalledTimes(2)
    await act(async () => renderer.unmount())
  })

  it('keeps the Host validation rejection on the form and does not write settings', async () => {
    const state = form()
    const settingsApi = api('/Applications/Configured Browser/browser', async () => {
      throw new Error('Host validation unavailable')
    })
    const renderer = await mount(state.scope, settingsApi)
    await act(async () => {
      renderer.root.findByType('input').props.onChange({ target: { value: '/Applications/Other Browser/browser' } })
    })
    await act(async () => {
      await renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() })
    })

    const page = JSON.stringify(renderer.toJSON())
    expect(page).toContain(errorCatalog.BROWSER_SETTINGS_REQUEST_FAILED.reason)
    expect(page).toContain(errorCatalog.BROWSER_SETTINGS_REQUEST_FAILED.next_step)
    expect(button(renderer, BROWSER_SETTINGS.ui.retryButton)).toBeDefined()
    expect(state.mutate).not.toHaveBeenCalled()
    expect(renderer.root.findByType('input').props.value).toBe('/Applications/Other Browser/browser')
    await act(async () => renderer.unmount())
  })

  it('disables writes when the ConfigForm is read-only', async () => {
    const state = form({ writable: false, value: { browserExecutablePath: '/profile/browser' } })
    const renderer = await mount(state.scope, api())

    expect(JSON.stringify(renderer.toJSON())).toContain(BROWSER_SETTINGS.ui.readOnlyMessage)
    expect(renderer.root.findByType('input').props.disabled).toBe(true)
    expect(renderer.root.findAllByType('button').find(candidate => candidate.props.type === 'submit')?.props.disabled)
      .toBe(true)
    expect(state.mutate).not.toHaveBeenCalled()
    await act(async () => renderer.unmount())
  })

  it('explains that an unavailable ConfigForm cannot save after the effective path loads', async () => {
    const state = form({ status: 'unavailable' })
    const settingsApi = api('/profile/effective-browser')
    const renderer = await mount(state.scope, settingsApi)
    const page = JSON.stringify(renderer.toJSON())
    const unavailableMessage = BROWSER_SETTINGS.ui.unavailableMessage

    expect(settingsApi.configuration).toHaveBeenCalledOnce()
    expect(page).not.toContain(BROWSER_SETTINGS.ui.loadingMessage)
    expect(unavailableMessage).toBe('当前页面无法访问可保存的浏览器设置，路径无法编辑或保存。请关闭此页后重新打开插件设置；如果提示仍显示，请联系插件维护者。')
    expect(page).toContain(unavailableMessage)
    expect(renderer.root.findByType('input').props.disabled).toBe(true)
    expect(button(renderer, BROWSER_SETTINGS.ui.saveButton).props.disabled).toBe(true)
    expect(state.mutate).not.toHaveBeenCalled()
    expect(settingsApi.validate).not.toHaveBeenCalled()
    expect(button(renderer, BROWSER_SETTINGS.ui.retryButton)).toBeUndefined()
    await act(async () => renderer.unmount())
  })

  it.each([
    ['returns false', async () => false],
    ['throws', async () => { throw new Error('profile write failed') }],
  ])('preserves the selected path and reports a Settings write that %s', async (_case, mutation) => {
    const mutate = vi.fn(mutation)
    const state = form({ mutate })
    const renderer = await mount(state.scope, api())
    const submittedPath = '/Applications/Saved Browser/browser'
    await act(async () => {
      renderer.root.findByType('input').props.onChange({ target: { value: submittedPath } })
    })
    await act(async () => {
      await renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() })
    })

    const page = JSON.stringify(renderer.toJSON())
    expect(page).toContain(errorCatalog.BROWSER_SETTINGS_SAVE_FAILED.reason)
    expect(page).toContain(errorCatalog.BROWSER_SETTINGS_SAVE_FAILED.next_step)
    expect(page).toContain(submittedPath)
    expect(page).toContain(BROWSER_SETTINGS.fieldName)
    expect(renderer.root.findByType('input').props.value).toBe(submittedPath)
    expect(state.scope.getSnapshot().value?.browserExecutablePath).toBeUndefined()
    expect(mutate).toHaveBeenCalledOnce()
    await act(async () => renderer.unmount())
  })

  it('aborts a pending Host validation when the page closes and prevents the Settings write', async () => {
    const state = form()
    let resolveValidation!: (value: BrowserExecutablePathResult) => void
    let validationSignal!: AbortSignal
    const settingsApi = api('/Applications/Configured Browser/browser', (request, signal) => {
      validationSignal = signal
      return new Promise(resolve => { resolveValidation = resolve })
    })
    const renderer = await mount(state.scope, settingsApi)
    await act(async () => {
      renderer.root.findByType('input').props.onChange({ target: { value: '/Applications/Other Browser/browser' } })
    })
    let savePromise!: Promise<void>
    await act(async () => {
      savePromise = renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() })
      await Promise.resolve()
    })
    expect(settingsApi.validate).toHaveBeenCalledOnce()
    expect(validationSignal.aborted).toBe(false)

    await act(async () => renderer.unmount())
    expect(validationSignal.aborted).toBe(true)
    await act(async () => {
      resolveValidation({ ok: true, value: { browserExecutablePath: '/Applications/Other Browser/browser' } })
      await savePromise
    })
    expect(state.mutate).not.toHaveBeenCalled()
  })
})
