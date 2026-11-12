import type { JsonValue } from '#contracts'
import React, { useSyncExternalStore } from 'react'
import type { RemoteFailure } from '@deepseek-ai/dsh-typert-protocol'

import type { WorkflowRuntimeParameterInspectionParameter } from '../../generation/inspection-contract.ts'
import type { ExperimentSizeOption } from './experiment-input.ts'
import { AutosaveField, type FieldEditor, type FieldOptions } from './experiment-fields.tsx'
import inputOptions from './experiment-input-options.json' with { type: 'json' }

function parameterErrorMessage(failure: unknown, parameterIds: readonly string[], fallback: string): string {
  const remote = failure as RemoteFailure | null
  if (remote?.code === 'workbench/operation-failed') {
    const paths = parameterIds.map(id => `generation_input.parameters.${id}`)
    const issue = remote.details.issues.find(item => paths.includes(item.path))
    if (issue) return issue.message
  }
  return failure instanceof Error ? failure.message : fallback
}

export function RuntimeParameterField({ label, id, parameter, value, editor, locked, save }: {
  readonly label: string
  readonly id: string
  readonly value: JsonValue | undefined
  readonly editor: FieldEditor
  readonly locked: boolean
} & ({ readonly parameter: WorkflowRuntimeParameterInspectionParameter; readonly save: (value: JsonValue) => Promise<void> } | { readonly parameter?: undefined; readonly save?: never })) {
  const error = useSyncExternalStore(editor.subscribe, editor.getErrorSnapshot, editor.getErrorSnapshot)
  if (!parameter) return <label className="field"><span>{label}</span><input id={id} aria-label={label} value={value === undefined || value === null ? '' : String(value)} disabled readOnly /></label>
  const values = parameter.kind === 'reference_image' ? undefined
    : parameter.allowed_values ?? (parameter.value_type === 'boolean' ? [true, false] : undefined)
  const numeric = parameter.value_type === 'integer' || parameter.value_type === 'number'
  const options: FieldOptions = {
    saveOnChange: true,
    ...(values ? { choices: values.map(item => ({
      value: JSON.stringify(item),
      label: typeof item === 'boolean' ? inputOptions.booleanLabels[item ? 'true' : 'false'] : typeof item === 'string' ? item : JSON.stringify(item),
    })) } : numeric ? { type: 'number', min: parameter.minimum, max: parameter.maximum, step: parameter.value_type === 'integer' ? 1 : 'any' } : {}),
  }
  return <AutosaveField label={label} className="field" id={id}
    value={values ? JSON.stringify(value ?? null) : value === undefined || value === null ? '' : String(value)}
    options={options} editor={editor} locked={locked} error={error}
    save={async next => {
      try {
        await save(values ? JSON.parse(next) as JsonValue : numeric ? next === '' ? null : Number(next) : next)
        editor.setError('')
        return true
      } catch (failure) {
        editor.setError(parameterErrorMessage(failure, [parameter.parameter_id], '参数保存失败，请重试。'))
        return false
      }
    }} />
}

export function RuntimeSizeField({ sizes, value, editor, locked, save }: {
  readonly sizes: readonly ExperimentSizeOption[]
  readonly value: string
  readonly editor: FieldEditor
  readonly locked: boolean
  readonly save: (size: ExperimentSizeOption) => Promise<void>
}) {
  const error = useSyncExternalStore(editor.subscribe, editor.getErrorSnapshot, editor.getErrorSnapshot)
  return <AutosaveField label="画面尺寸" className="field" id={error ? 'size' : undefined}
    value={value} options={{ disabled: !sizes.length, saveOnChange: true,
      choices: [...(!value ? [{ value: '', label: '请选择' }] : []), ...sizes] }}
    editor={editor} locked={locked} error={error}
    save={async next => {
      const size = sizes.find(option => option.value === next)
      if (!size) return false
      try {
        await save(size)
        editor.setError('')
        return true
      } catch (failure) {
        editor.setError(parameterErrorMessage(failure, Object.keys(size.parameters), '画面尺寸保存失败，请重试。'))
        return false
      }
    }} />
}
