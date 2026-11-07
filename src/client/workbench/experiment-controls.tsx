import React, { type ReactNode, useCallback, useEffect, useState } from 'react'

const icons = {
  branch: 'M5 3v12a3 3 0 0 0 3 3h8M5 7h6a4 4 0 0 0 4-4',
  run: 'm7 4 11 8-11 8Z',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9Z',
  plus: 'M12 5v14M5 12h14',
  history: 'M3 11a9 9 0 1 1 3 8M3 4v7h7M12 7v6l4 2',
  compare: 'M9 3v18M15 3v18M4 7h4M16 17h4',
  grid: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
}

export function useToastMessage() {
  const [message, setMessage] = useState<{ readonly text: string } | null>(null)
  const showMessage = useCallback((text: string | null) => setMessage(text ? { text } : null), [])
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 6000)
    return () => clearTimeout(timer)
  }, [message])
  return [message?.text ?? null, showMessage] as const
}

export function Icon({ name }: { readonly name: keyof typeof icons }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={icons[name]} />
    </svg>
  )
}

export function Button({ children, onClick, kind = '', icon, disabled, label, autoFocus }: {
  readonly children: ReactNode
  readonly onClick?: () => void
  readonly kind?: string
  readonly icon?: keyof typeof icons
  readonly disabled?: boolean
  readonly label?: string
  readonly autoFocus?: boolean
}) {
  return (
    <button type="button" className={`btn ${kind}`} onClick={onClick} disabled={disabled} aria-label={label} autoFocus={autoFocus}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
}

export function Modal({ title, children, onClose, kind = '' }: {
  readonly title: string
  readonly children: ReactNode
  readonly onClose: () => void
  readonly kind?: string
}) {
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [onClose])
  return (
    <div className="modal-backdrop">
      <section className={`modal ${kind}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return
          const elements = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,a,summary')]
            .filter(element => element.offsetParent !== null)
          const first = elements[0], last = elements.at(-1)
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        }}>
        <div className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <Button kind="quiet small" label="关闭对话框" autoFocus onClick={onClose}>×</Button>
        </div>
        {children}
      </section>
    </div>
  )
}
