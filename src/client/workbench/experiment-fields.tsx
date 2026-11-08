import React, { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import inputOptions from './experiment-input-options.json' with { type: 'json' }

const fieldPlaceholders: Readonly<Record<string, string>> = inputOptions.fieldPlaceholders

export interface FieldOptions {
  multiline?: boolean
  saveOnChange?: boolean
  short?: boolean
  type?: string
  min?: number
  max?: number
  step?: number | 'any'
  choices?: readonly { value: string; label: string }[]
  maxLength?: number
  branch?: boolean
  disabled?: boolean
}

export type SaveField = (value: string, expectedValue: string) => Promise<boolean>

function createFieldEditor(isCurrent = () => true) {
  let edit: { value: string; expected: string } | undefined
  let queued: { value: string; original: string; save: SaveField } | undefined
  let saving = false
  let error = ''
  const listeners = new Set<() => void>()
  const update = (next: typeof edit) => {
    edit = next
    for (const listener of listeners) listener()
  }
  const hasNewerQueuedValue = (value: string) => queued !== undefined && queued.value !== value
  const flush = async () => {
    if (saving) return
    saving = true
    while (queued) {
      const submission = queued
      queued = undefined
      if (!isCurrent()) break
      const expected = edit?.expected ?? submission.original
      if (submission.value !== expected) {
        const saved = await submission.save(submission.value, expected)
        if (!isCurrent()) { queued = undefined; break }
        if (!saved) {
          if (hasNewerQueuedValue(submission.value)) continue
          queued = undefined
          break
        }
        if (edit) update({ ...edit, expected: submission.value })
      }
      if (error) { error = ''; update(edit) }
      if (edit?.value === submission.value && !queued) update(undefined)
    }
    saving = false
  }
  return {
    getSnapshot: () => edit?.value,
    getErrorSnapshot: () => error,
    setError: (next: string) => {
      error = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    change: (value: string, original: string) =>
      update({ value, expected: edit?.expected ?? original }),
    commit: (value: string, original: string, save: SaveField) => {
      queued = { value, original, save }
      void flush()
    },
  }
}

export function useBranchFieldEdits(workspaceId: string | null, workId: string | null, branchId: string | null, inputScope?: string) {
  type FieldGroup = { inputScope: string | undefined; fields: Map<string, ReturnType<typeof createFieldEditor>> }
  const branches = useRef(new Map<string, FieldGroup>())
  const mounted = useRef(true)
  useLayoutEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const key = JSON.stringify([workspaceId, workId, branchId])
  const group = useMemo(() => {
    const current = branches.current.get(key)
    if (current && current.inputScope === inputScope) return current
    return { inputScope, fields: new Map<string, ReturnType<typeof createFieldEditor>>() }
  }, [key, inputScope])
  useLayoutEffect(() => { branches.current.set(key, group) }, [key, group])
  return (id: string) => {
    let editor = group.fields.get(id)
    if (!editor) {
      editor = createFieldEditor(inputScope === undefined ? undefined : () => mounted.current && branches.current.get(key) === group)
      group.fields.set(id, editor)
    }
    return editor
  }
}

export function AutosaveField({ label, inputLabel = label, className, id, value, options, save, editor, locked, error }: {
  readonly label: string
  readonly inputLabel?: string
  readonly className?: string
  readonly id?: string
  readonly value: string
  readonly options: FieldOptions
  readonly save: SaveField
  readonly editor: ReturnType<typeof createFieldEditor>
  readonly locked: boolean
  readonly error?: string
}) {
  const edited = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot)
  const common = {
    id,
    'aria-label': inputLabel,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error && id ? `${id}-error` : undefined,
    value: (!locked ? edited : undefined) ?? value,
    disabled: options.disabled,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      if (options.disabled) return
      editor.change(event.target.value, value)
      if (options.saveOnChange) editor.commit(event.target.value, value, save)
    },
    onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      if (!options.disabled) editor.commit(event.target.value, value, save)
    },
  }
  return <label className={className}>
    <span>{label}</span>
    {options.choices ? (
      <select {...common}>{options.choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>
    ) : options.multiline ? (
      <textarea {...common} className={options.short ? id === 'original_request' ? 'short branch-goal' : 'short' : ''} />
    ) : (
      <input {...common} placeholder={id ? fieldPlaceholders[id] : undefined} type={options.type ?? 'text'} min={options.min} max={options.max} step={options.step} maxLength={options.maxLength} />
    )}
    {error && <p id={id ? `${id}-error` : undefined} className="binding-problem" role="alert">{error}</p>}
  </label>
}

export type FieldEditor = ReturnType<typeof createFieldEditor>
