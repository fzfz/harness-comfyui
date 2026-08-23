import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'

const COLOR_SCHEME_PROPERTY = 'color-scheme'
const DARK_THEME_ATTRIBUTE = 'data-ds-dark-theme'

type OwnedStyleProperty = {
  previousPriority: string
  previousValue: string
  appliedPriority: string
  appliedValue: string
}

type OwnedAttribute = {
  previousPresent: boolean
  previousValue: string | null
  appliedPresent: boolean
  appliedValue: string | null
}

class ThemeProjector {
  readonly #document: Document
  readonly #colorScheme: OwnedStyleProperty
  readonly #darkThemeAttribute: OwnedAttribute
  readonly #tokens = new Map<string, OwnedStyleProperty>()
  #disposed = false

  constructor(document: Document) {
    this.#document = document
    this.#colorScheme = this.#captureStyleProperty(document.documentElement.style, COLOR_SCHEME_PROPERTY)
    this.#darkThemeAttribute = {
      previousPresent: document.body.hasAttribute(DARK_THEME_ATTRIBUTE),
      previousValue: document.body.getAttribute(DARK_THEME_ATTRIBUTE),
      appliedPresent: false,
      appliedValue: null,
    }
  }

  project(snapshot: ThemeSnapshot): void {
    if (this.#disposed) throw new Error('theme projection is disposed')

    this.#projectColorScheme(snapshot.active.colorScheme)
    this.#projectDarkThemeAttribute(snapshot.active.colorScheme)

    const nextTokenNames = new Set(Object.keys(snapshot.active.tokens))
    for (const [name, owned] of this.#tokens) {
      if (nextTokenNames.has(name)) continue
      this.#restoreStyleProperty(this.#document.body.style, name, owned)
      this.#tokens.delete(name)
    }

    for (const [name, value] of Object.entries(snapshot.active.tokens)) {
      const owned = this.#tokens.get(name) ?? this.#captureStyleProperty(this.#document.body.style, name)
      owned.appliedValue = value
      owned.appliedPriority = ''
      this.#tokens.set(name, owned)
      this.#document.body.style.setProperty(name, value)
    }
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true

    this.#restoreStyleProperty(
      this.#document.documentElement.style,
      COLOR_SCHEME_PROPERTY,
      this.#colorScheme,
    )
    this.#restoreAttribute()
    for (const [name, owned] of this.#tokens) {
      this.#restoreStyleProperty(this.#document.body.style, name, owned)
    }
    this.#tokens.clear()
  }

  #captureStyleProperty(style: CSSStyleDeclaration, name: string): OwnedStyleProperty {
    return {
      previousValue: style.getPropertyValue(name),
      previousPriority: style.getPropertyPriority(name),
      appliedValue: '',
      appliedPriority: '',
    }
  }

  #projectColorScheme(colorScheme: ThemeSnapshot['active']['colorScheme']): void {
    const style = this.#document.documentElement.style
    style.setProperty(COLOR_SCHEME_PROPERTY, colorScheme)
    this.#colorScheme.appliedValue = colorScheme
    this.#colorScheme.appliedPriority = ''
  }

  #projectDarkThemeAttribute(colorScheme: ThemeSnapshot['active']['colorScheme']): void {
    if (colorScheme === 'dark') {
      this.#document.body.setAttribute(DARK_THEME_ATTRIBUTE, '')
      this.#darkThemeAttribute.appliedPresent = true
      this.#darkThemeAttribute.appliedValue = ''
    } else {
      this.#document.body.removeAttribute(DARK_THEME_ATTRIBUTE)
      this.#darkThemeAttribute.appliedPresent = false
      this.#darkThemeAttribute.appliedValue = null
    }
  }

  #restoreStyleProperty(style: CSSStyleDeclaration, name: string, owned: OwnedStyleProperty): void {
    if (
      style.getPropertyValue(name) !== owned.appliedValue
      || style.getPropertyPriority(name) !== owned.appliedPriority
    ) return

    if (owned.previousValue === '') style.removeProperty(name)
    else style.setProperty(name, owned.previousValue, owned.previousPriority)
  }

  #restoreAttribute(): void {
    const body = this.#document.body
    const currentPresent = body.hasAttribute(DARK_THEME_ATTRIBUTE)
    const currentValue = body.getAttribute(DARK_THEME_ATTRIBUTE)
    if (
      currentPresent !== this.#darkThemeAttribute.appliedPresent
      || currentValue !== this.#darkThemeAttribute.appliedValue
    ) return

    if (this.#darkThemeAttribute.previousPresent) {
      body.setAttribute(DARK_THEME_ATTRIBUTE, this.#darkThemeAttribute.previousValue ?? '')
    } else {
      body.removeAttribute(DARK_THEME_ATTRIBUTE)
    }
  }
}

/** Project the public rc.8 ThemeSnapshot onto the workbench document. */
export function installThemeProjection(ctx: ClientContext): () => void {
  const projector = new ThemeProjector(document)
  let offThemeChange: (() => void) | undefined

  try {
    projector.project(ctx.theme.getTheme())
    offThemeChange = ctx.on('theme/change', snapshot => projector.project(snapshot))
  } catch (error) {
    projector.dispose()
    throw error
  }

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    offThemeChange?.()
    projector.dispose()
  }
}
