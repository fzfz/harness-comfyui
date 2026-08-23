import type {
  ConversationSnapshot,
  ISessions,
  SessionId,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {
  InputTriggerServiceContract,
  TriggerGuard,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { ChangeEvent, KeyboardEvent, ReactNode } from 'react'

type PublicInputSnapshot = {
  readonly draft: string
  readonly draftRev: number
  readonly phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting'
}

type PublicInputActions = {
  readonly setDraft: (text: string) => void
  readonly submit: () => void
}

type PublicSessionSnapshot = Pick<ConversationSnapshot, 'promptError'>

export type ComposerBarProps = {
  readonly sessionId: SessionId | undefined
  readonly variant: 'hero' | 'composer'
  readonly disabled?: boolean
  readonly placeholder?: string
  readonly overlay?: ReactNode
  readonly useInput: <S>(selector: (snapshot: PublicInputSnapshot) => S) => S | undefined
  readonly inputActions: PublicInputActions | undefined
  readonly useSession?: <S>(selector: (snapshot: PublicSessionSnapshot) => S) => S | undefined
}

function triggerGuard(input: PublicInputSnapshot | undefined): TriggerGuard {
  return {
    tier: input?.phase === 'plain'
      ? 'plain'
      : input?.phase === 'claimed'
        ? 'claimed'
        : 'frozen',
  }
}

function nextDraftRevision(input: PublicInputSnapshot | undefined): number {
  return input === undefined ? 0 : input.draftRev + 1
}

/** Render the prototype composer through the public session input and trigger faces. */
export function createComposerBar(ctx: {
  readonly sessions: Pick<ISessions, 'scope'>
  readonly inputTriggers: Pick<InputTriggerServiceContract, 'sessionOf'>
}) {
  return function ComposerBar(props: ComposerBarProps): ReactNode {
    const input = props.useInput(snapshot => snapshot)
    const draft = input?.draft ?? ''
    const sessionScope = props.sessionId === undefined
      ? undefined
      : ctx.sessions.scope(props.sessionId)
    const triggerController = sessionScope === undefined
      ? undefined
      : ctx.inputTriggers.sessionOf(sessionScope)
    const disabled = props.disabled === true
      || props.sessionId === undefined
      || props.inputActions === undefined
    const promptError = props.useSession?.(snapshot => snapshot.promptError) ?? null
    const sendError = promptError?.op === 'send'
      ? `发送失败：${promptError.error.message}（${promptError.error.code}）`
      : undefined
    const machineBusy = input?.phase === 'adjudicating' || input?.phase === 'submitting'
    const canSubmit = !disabled
      && input !== undefined
      && input.draft.trim() !== ''
      && !machineBusy

    const submit = () => {
      if (!canSubmit) return
      props.inputActions?.submit()
    }

    const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
      if (disabled || props.inputActions === undefined) return
      const next = event.currentTarget.value
      props.inputActions.setDraft(next)
      if (triggerController !== undefined && input !== undefined) {
        triggerController.track(
          next,
          event.currentTarget.selectionStart ?? next.length,
          triggerGuard(input),
          nextDraftRevision(input),
        )
      }
    }

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && event.shiftKey) return
      const composing = event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
      if (composing) return

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const outcome = triggerController?.arbitrate(
          event.key === 'ArrowUp' ? 'up' : 'down',
          composing,
        )
        if (outcome === 'consumed') event.preventDefault()
        return
      }

      if (event.key === 'Escape') {
        if (triggerController?.arbitrate('escape', composing) === 'consumed') event.preventDefault()
        return
      }

      if (event.key === ' ') {
        if (triggerController?.onSpace() === true) event.preventDefault()
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        if (triggerController?.arbitrate('enter', composing) !== 'pass' || event.repeat) return
        submit()
      }
    }

    return (
      <footer className="composer-wrap">
        <div className={sendError === undefined ? 'composer-box' : 'composer-box is-error'} id="composer-box">
          {props.overlay === undefined ? null : (
            <div className="composer-overlay">{props.overlay}</div>
          )}
          <textarea
            id="message-input"
            name="message"
            rows={3}
            aria-label="本次发送给图像生成 Agent 的消息"
            autoComplete="off"
            placeholder={props.placeholder ?? '向图像生成 Agent 描述本次任务……'}
            value={draft}
            disabled={disabled}
            onChange={onChange}
            onKeyDown={onKeyDown}
          />
          <div className="composer-footer">
            <p id="composer-status" role={sendError === undefined ? undefined : 'alert'}>
              {sendError ?? 'Enter 发送 · Shift + Enter 换行'}
            </p>
            <button
              className="send-button"
              id="send-message"
              type="button"
              disabled={!canSubmit}
              onClick={submit}
            >
              <span>发送</span>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m4 10 12-6-4 12-2-5-6-1Z" />
              </svg>
            </button>
          </div>
        </div>
      </footer>
    )
  }
}
