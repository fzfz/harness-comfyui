import React, { useEffect, useRef, useState } from 'react'
import { requestTemplateVariables, type PromptBlockName } from '../../workbench/request-template.ts'
import { Button } from './experiment-controls.tsx'

export function ExperimentTemplateEditor({ label, value, kind, block, disabled, onChange }: {
  readonly label: string
  readonly value: string
  readonly kind: string
  readonly block?: PromptBlockName
  readonly disabled?: boolean
  readonly onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const selection = useRef<{ start: number; end: number } | null>(null)
  const variables = requestTemplateVariables(kind, block)
  useEffect(() => { setOpen(false); setHighlighted(0) }, [kind, block])
  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (container.current && !event.composedPath().includes(container.current)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const insert = (name: string) => {
    const token = `{{${name}}}`, range = selection.current ?? { start: value.length, end: value.length }
    const start = Math.min(range.start, value.length), end = Math.min(range.end, value.length)
    onChange(value.slice(0, start) + token + value.slice(end))
    selection.current = { start: start + token.length, end: start + token.length }
    setOpen(false)
    queueMicrotask(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(start + token.length, start + token.length) })
  }
  return <div className="template-variable-editor" ref={container}>
    <div className="row between"><label htmlFor={`template-${block ?? 'main'}`}>{label}</label>
      <button className="btn small quiet" type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open}
        aria-label={`在${label}中插入变量`} onClick={() => { setOpen(!open); setHighlighted(0) }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setHighlighted(index => open ? (index + (event.key === 'ArrowDown' ? 1 : variables.length - 1)) % variables.length : event.key === 'ArrowDown' ? 0 : variables.length - 1) }
          else if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) }
          else if (open && event.key === 'Enter') { event.preventDefault(); insert(variables[highlighted].name) }
        }}>插入变量</button>
    </div>
    {open && <div role="listbox" aria-label={`${label}的可用变量`} className="template-variable-list" onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); textarea.current?.focus() }
    }}>{variables.map((variable, index) => <button type="button" role="option" aria-selected={index === highlighted}
      key={variable.name} onMouseDown={event => event.preventDefault()} onClick={() => insert(variable.name)}>
      {variable.label} <code>{`{{${variable.name}}}`}</code>
    </button>)}</div>}
    <textarea ref={textarea} id={`template-${block ?? 'main'}`} aria-label={label} spellCheck={false} value={value} readOnly={disabled}
      onSelect={event => { selection.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd } }}
      onChange={event => onChange(event.target.value)} />
  </div>
}
