import { describe, expect, it, vi } from 'vitest'

import {
  ContextDialogNavigationStore,
  type ContextDialogNavigationState,
} from '../../src/client/workbench/context-dialog-navigation.ts'

class MemoryStorage {
  private readonly values = new Map<string, string>()
  failReads = false
  failWrites = false

  getItem(key: string): string | null {
    if (this.failReads) throw new DOMException('storage read denied', 'SecurityError')
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException('storage write denied', 'SecurityError')
    this.values.set(key, value)
  }

  replaceEveryValue(value: string): void {
    for (const key of this.values.keys()) this.values.set(key, value)
  }
}

const SAVED_STATE: ContextDialogNavigationState = Object.freeze({
  selectedBaseModelId: '2',
  selectedKind: 'lora',
  queryText: 'Age refined',
  submittedQuery: 'Age',
  currentPage: 2,
})

const INVALID_SAVED_STATES: readonly [string, unknown][] = [
  ['missing property', { ...SAVED_STATE, submittedQuery: undefined }],
  ['extra property', { ...SAVED_STATE, requestVersion: 1 }],
  ['unknown kind', { ...SAVED_STATE, selectedKind: 'checkpoint' }],
  ['control character in edited query', { ...SAVED_STATE, queryText: 'Age\u0000' }],
  ['control character in submitted query', { ...SAVED_STATE, submittedQuery: 'Age\u007f' }],
  ['page above the Catalog limit', { ...SAVED_STATE, currentPage: 100_001 }],
  ['non-numeric base-model id', { ...SAVED_STATE, selectedBaseModelId: 'model-2' }],
  ['base-model id above the Catalog length limit', { ...SAVED_STATE, selectedBaseModelId: '1'.repeat(21) }],
]

describe('ContextDialogNavigationStore', () => {
  it('restores one Session navigation state after the Client store restarts', () => {
    const storage = new MemoryStorage()
    const firstStore = new ContextDialogNavigationStore(() => storage)
    const firstSession = firstStore.for('session-a')

    expect(firstSession.getSnapshot()).toEqual({
      state: {
        selectedBaseModelId: null,
        selectedKind: 'comfyui-template',
        queryText: '',
        submittedQuery: '',
        currentPage: 1,
      },
      persistenceErrorCode: null,
    })

    firstSession.update(() => SAVED_STATE)
    firstStore.dispose()

    const restartedStore = new ContextDialogNavigationStore(() => storage)
    expect(restartedStore.for('session-a').getSnapshot()).toEqual({
      state: SAVED_STATE,
      persistenceErrorCode: null,
    })
  })

  it('publishes a persistence error and initial state when saved JSON cannot be parsed', () => {
    const storage = new MemoryStorage()
    const firstStore = new ContextDialogNavigationStore(() => storage)
    firstStore.for('session-a').update(() => SAVED_STATE)
    storage.replaceEveryValue('{invalid json')

    const restartedStore = new ContextDialogNavigationStore(() => storage)
    expect(restartedStore.for('session-a').getSnapshot()).toEqual({
      state: {
        selectedBaseModelId: null,
        selectedKind: 'comfyui-template',
        queryText: '',
        submittedQuery: '',
        currentPage: 1,
      },
      persistenceErrorCode: 'CONTEXT_DIALOG_NAVIGATION_STORAGE_FAILED',
    })
  })

  it.each(INVALID_SAVED_STATES)('rejects persisted navigation with %s', (_name, invalidState) => {
    const storage = new MemoryStorage()
    const firstStore = new ContextDialogNavigationStore(() => storage)
    firstStore.for('session-a').update(() => SAVED_STATE)
    storage.replaceEveryValue(JSON.stringify(invalidState))

    const restartedStore = new ContextDialogNavigationStore(() => storage)
    expect(restartedStore.for('session-a').getSnapshot()).toMatchObject({
      state: {
        selectedBaseModelId: null,
        selectedKind: 'comfyui-template',
        queryText: '',
        submittedQuery: '',
        currentPage: 1,
      },
      persistenceErrorCode: 'CONTEXT_DIALOG_NAVIGATION_STORAGE_FAILED',
    })
  })

  it('keeps the previous state on write failure and clears the error after a successful retry', () => {
    const storage = new MemoryStorage()
    const store = new ContextDialogNavigationStore(() => storage)
    const navigation = store.for('session-a')
    const listener = vi.fn()
    navigation.subscribe(listener)
    storage.failWrites = true

    navigation.update(() => SAVED_STATE)

    expect(navigation.getSnapshot()).toMatchObject({
      state: {
        selectedBaseModelId: null,
        selectedKind: 'comfyui-template',
        queryText: '',
        submittedQuery: '',
        currentPage: 1,
      },
      persistenceErrorCode: 'CONTEXT_DIALOG_NAVIGATION_STORAGE_FAILED',
    })
    expect(listener).toHaveBeenCalledOnce()

    storage.failWrites = false
    navigation.update(() => SAVED_STATE)
    expect(navigation.getSnapshot()).toEqual({ state: SAVED_STATE, persistenceErrorCode: null })
    expect(listener).toHaveBeenCalledTimes(2)

    const restartedStore = new ContextDialogNavigationStore(() => storage)
    expect(restartedStore.for('session-a').getSnapshot()).toEqual({
      state: SAVED_STATE,
      persistenceErrorCode: null,
    })
  })

  it('recovers when the browser Storage resolver becomes available after the initial read', () => {
    const storage = new MemoryStorage()
    let storageAvailable = false
    const store = new ContextDialogNavigationStore(() => {
      if (!storageAvailable) throw new DOMException('storage unavailable', 'SecurityError')
      return storage
    })
    const navigation = store.for('session-a')
    const firstSnapshot = navigation.getSnapshot()

    expect(firstSnapshot.persistenceErrorCode).toBe('CONTEXT_DIALOG_NAVIGATION_STORAGE_FAILED')
    expect(navigation.getSnapshot()).toBe(firstSnapshot)

    storageAvailable = true
    navigation.update(() => SAVED_STATE)
    expect(navigation.getSnapshot()).toEqual({ state: SAVED_STATE, persistenceErrorCode: null })

    const restartedStore = new ContextDialogNavigationStore(() => storage)
    expect(restartedStore.for('session-a').getSnapshot().state).toEqual(SAVED_STATE)
  })

  it('uses the same error seam when Storage getItem fails', () => {
    const storage = new MemoryStorage()
    storage.failReads = true
    const store = new ContextDialogNavigationStore(() => storage)
    const navigation = store.for('session-a')

    expect(navigation.getSnapshot().persistenceErrorCode)
      .toBe('CONTEXT_DIALOG_NAVIGATION_STORAGE_FAILED')

    storage.failReads = false
    navigation.update(() => SAVED_STATE)
    expect(navigation.getSnapshot()).toEqual({ state: SAVED_STATE, persistenceErrorCode: null })
  })

  it('keeps Session interfaces, snapshots, persisted values, and subscribers isolated', () => {
    const storage = new MemoryStorage()
    const store = new ContextDialogNavigationStore(() => storage)
    const sessionA = store.for('session-a')
    const sessionB = store.for('session-b')
    const initialB = sessionB.getSnapshot()
    const listenerA = vi.fn()
    const listenerB = vi.fn()
    sessionA.subscribe(listenerA)
    sessionB.subscribe(listenerB)

    expect(store.for('session-a')).toBe(sessionA)
    sessionA.update(() => SAVED_STATE)

    expect(sessionA.getSnapshot().state).toEqual(SAVED_STATE)
    expect(sessionB.getSnapshot()).toBe(initialB)
    expect(listenerA).toHaveBeenCalledOnce()
    expect(listenerB).not.toHaveBeenCalled()

    const sessionBState: ContextDialogNavigationState = {
      selectedBaseModelId: '1',
      selectedKind: 'model',
      queryText: 'portrait refined',
      submittedQuery: 'portrait',
      currentPage: 3,
    }
    sessionB.update(() => sessionBState)

    const restartedStore = new ContextDialogNavigationStore(() => storage)
    expect(restartedStore.for('session-a').getSnapshot().state).toEqual(SAVED_STATE)
    expect(restartedStore.for('session-b').getSnapshot().state).toEqual(sessionBState)
  })

  it('disposes subscribers and memory without deleting persisted Session state', () => {
    const storage = new MemoryStorage()
    const store = new ContextDialogNavigationStore(() => storage)
    const navigation = store.for('session-a')
    const listener = vi.fn()
    navigation.subscribe(listener)
    navigation.update(() => SAVED_STATE)
    expect(listener).toHaveBeenCalledOnce()

    store.dispose()

    const restartedStore = new ContextDialogNavigationStore(() => storage)
    expect(restartedStore.for('session-a').getSnapshot().state).toEqual(SAVED_STATE)
  })
})
