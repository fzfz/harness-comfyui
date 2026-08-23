import { afterEach, describe, expect, it, vi } from 'vitest'

import { installThemeProjection } from '../../src/client/workbench/theme-projection.ts'

type StyleStub = {
  getPropertyPriority(name: string): string
  getPropertyValue(name: string): string
  removeProperty(name: string): string
  setProperty(name: string, value: string, priority?: string): void
}

type ElementStub = {
  style: StyleStub
  getAttribute(name: string): string | null
  hasAttribute(name: string): boolean
  removeAttribute(name: string): void
  setAttribute(name: string, value: string): void
}

type ThemeLike = {
  active: {
    colorScheme: 'light' | 'dark'
    tokens: Record<string, string>
  }
}

function createStyle(): StyleStub {
  const values = new Map<string, { value: string; priority: string }>()
  return {
    getPropertyPriority(name) {
      return values.get(name)?.priority ?? ''
    },
    getPropertyValue(name) {
      return values.get(name)?.value ?? ''
    },
    removeProperty(name) {
      const previous = values.get(name)?.value ?? ''
      values.delete(name)
      return previous
    },
    setProperty(name, value, priority = '') {
      values.set(name, { value, priority })
    },
  }
}

function createElement(): ElementStub {
  const attributes = new Map<string, string>()
  return {
    style: createStyle(),
    getAttribute(name) {
      return attributes.get(name) ?? null
    },
    hasAttribute(name) {
      return attributes.has(name)
    },
    removeAttribute(name) {
      attributes.delete(name)
    },
    setAttribute(name, value) {
      attributes.set(name, value)
    },
  }
}

function setDocument(document: unknown): void {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: document,
  })
}

describe('workbench theme projection', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'document')
    vi.restoreAllMocks()
  })

  it('projects initial and changed themes while preserving unrelated DOM state', () => {
    const documentElement = createElement()
    const body = createElement()
    documentElement.style.setProperty('color-scheme', 'pre-existing')
    body.setAttribute('data-ds-dark-theme', 'pre-existing')
    body.style.setProperty('--preserved-token', 'pre-existing')
    body.style.setProperty('--unrelated-token', 'unrelated')
    setDocument({ documentElement, body })

    const lightTheme: ThemeLike = {
      active: {
        colorScheme: 'light',
        tokens: {
          '--preserved-token': 'light',
          '--stale-token': 'remove-after-change',
        },
      },
    }
    const darkTheme: ThemeLike = {
      active: {
        colorScheme: 'dark',
        tokens: {
          '--preserved-token': 'dark',
          '--fresh-token': 'dark-only',
        },
      },
    }
    let onThemeChange: ((snapshot: ThemeLike) => void) | undefined
    const getTheme = vi.fn(() => lightTheme)
    const off = vi.fn(() => {
      onThemeChange = undefined
    })
    const on = vi.fn((_event: string, listener: (snapshot: ThemeLike) => void) => {
      onThemeChange = listener
      return off
    })

    const dispose = installThemeProjection({
      theme: { getTheme },
      on,
    } as never)

    expect(getTheme).toHaveBeenCalledOnce()
    expect(on).toHaveBeenCalledWith('theme/change', expect.any(Function))
    expect(documentElement.style.getPropertyValue('color-scheme')).toBe('light')
    expect(body.hasAttribute('data-ds-dark-theme')).toBe(false)
    expect(body.style.getPropertyValue('--preserved-token')).toBe('light')
    expect(body.style.getPropertyValue('--unrelated-token')).toBe('unrelated')

    onThemeChange?.(darkTheme)
    expect(documentElement.style.getPropertyValue('color-scheme')).toBe('dark')
    expect(body.getAttribute('data-ds-dark-theme')).toBe('')
    expect(body.style.getPropertyValue('--preserved-token')).toBe('dark')
    expect(body.style.getPropertyValue('--stale-token')).toBe('')
    expect(body.style.getPropertyValue('--fresh-token')).toBe('dark-only')
    expect(body.style.getPropertyValue('--unrelated-token')).toBe('unrelated')

    dispose()
    expect(off).toHaveBeenCalledOnce()
    expect(documentElement.style.getPropertyValue('color-scheme')).toBe('pre-existing')
    expect(body.getAttribute('data-ds-dark-theme')).toBe('pre-existing')
    expect(body.style.getPropertyValue('--preserved-token')).toBe('pre-existing')
    expect(body.style.getPropertyValue('--stale-token')).toBe('')
    expect(body.style.getPropertyValue('--fresh-token')).toBe('')
    expect(body.style.getPropertyValue('--unrelated-token')).toBe('unrelated')
  })
})
