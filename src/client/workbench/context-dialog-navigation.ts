import {
  CATALOG_KIND_DEFINITIONS,
  parseCatalogPageNumber,
  parseCatalogQueryText,
  parseCatalogStableId,
  type CatalogKind,
} from '../../catalog/contract.ts'

export const CONTEXT_DIALOG_NAVIGATION_STORAGE_ERROR_CODE = 'CONTEXT_DIALOG_NAVIGATION_STORAGE_FAILED'

const STORAGE_KEY_PREFIX = 'harness-comfyui.context-dialog-navigation.v1:'

export interface ContextDialogNavigationState {
  readonly selectedBaseModelId: string | null
  readonly selectedKind: CatalogKind
  readonly queryText: string
  readonly submittedQuery: string
  readonly currentPage: number
}

export interface ContextDialogNavigationSnapshot {
  readonly state: ContextDialogNavigationState
  readonly persistenceErrorCode: typeof CONTEXT_DIALOG_NAVIGATION_STORAGE_ERROR_CODE | null
}

export interface ContextDialogNavigation {
  readonly getSnapshot: () => ContextDialogNavigationSnapshot
  readonly subscribe: (listener: () => void) => () => void
  readonly update: (
    updater: (current: ContextDialogNavigationState) => ContextDialogNavigationState,
  ) => void
}

type NavigationStorage = Pick<Storage, 'getItem' | 'setItem'>
type NavigationStorageResolver = () => NavigationStorage

interface SessionRecord {
  readonly listeners: Set<() => void>
  readonly navigation: ContextDialogNavigation
}

const INITIAL_STATE: ContextDialogNavigationState = Object.freeze({
  selectedBaseModelId: null,
  selectedKind: 'comfyui-template',
  queryText: '',
  submittedQuery: '',
  currentPage: 1,
})

const CATALOG_KINDS = new Set<CatalogKind>(CATALOG_KIND_DEFINITIONS.map(definition => definition.kind))
const NAVIGATION_STATE_KEYS = Object.freeze([
  'selectedBaseModelId',
  'selectedKind',
  'queryText',
  'submittedQuery',
  'currentPage',
] as const)

function storageKey(sessionId: string): string {
  return `${STORAGE_KEY_PREFIX}${sessionId}`
}

function snapshot(
  state: ContextDialogNavigationState,
  persistenceErrorCode: ContextDialogNavigationSnapshot['persistenceErrorCode'],
): ContextDialogNavigationSnapshot {
  return Object.freeze({ state: Object.freeze({ ...state }), persistenceErrorCode })
}

function parseNavigationState(value: unknown): ContextDialogNavigationState {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('context dialog navigation state must be an object')
  }
  const input = value as Record<string, unknown>
  const actualKeys = Object.keys(input).sort()
  const expectedKeys = [...NAVIGATION_STATE_KEYS].sort()
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new TypeError('context dialog navigation state has invalid properties')
  }
  if (typeof input.selectedKind !== 'string' || !CATALOG_KINDS.has(input.selectedKind as CatalogKind)) {
    throw new TypeError('context dialog navigation kind is invalid')
  }
  return Object.freeze({
    selectedBaseModelId: input.selectedBaseModelId === null
      ? null
      : parseCatalogStableId(input.selectedBaseModelId),
    selectedKind: input.selectedKind as CatalogKind,
    queryText: parseCatalogQueryText(input.queryText),
    submittedQuery: parseCatalogQueryText(input.submittedQuery),
    currentPage: parseCatalogPageNumber(input.currentPage),
  })
}

function initialSnapshot(
  resolveStorage: NavigationStorageResolver,
  sessionId: string,
): ContextDialogNavigationSnapshot {
  try {
    const raw = resolveStorage().getItem(storageKey(sessionId))
    return raw === null
      ? snapshot(INITIAL_STATE, null)
      : snapshot(parseNavigationState(JSON.parse(raw)), null)
  } catch {
    return snapshot(INITIAL_STATE, CONTEXT_DIALOG_NAVIGATION_STORAGE_ERROR_CODE)
  }
}

export class ContextDialogNavigationStore {
  private readonly records = new Map<string, SessionRecord>()

  constructor(private readonly resolveStorage: NavigationStorageResolver) {}

  for(sessionId: string): ContextDialogNavigation {
    const current = this.records.get(sessionId)
    if (current !== undefined) return current.navigation

    let currentSnapshot = initialSnapshot(this.resolveStorage, sessionId)
    const listeners = new Set<() => void>()
    const navigation: ContextDialogNavigation = {
      getSnapshot: () => currentSnapshot,
      subscribe: listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      update: updater => {
        const next = parseNavigationState(updater(currentSnapshot.state))
        try {
          this.resolveStorage().setItem(storageKey(sessionId), JSON.stringify(next))
          currentSnapshot = snapshot(next, null)
        } catch {
          currentSnapshot = snapshot(
            currentSnapshot.state,
            CONTEXT_DIALOG_NAVIGATION_STORAGE_ERROR_CODE,
          )
        }
        for (const listener of listeners) listener()
      },
    }
    this.records.set(sessionId, { listeners, navigation })
    return navigation
  }

  dispose(): void {
    for (const record of this.records.values()) record.listeners.clear()
    this.records.clear()
  }
}
