import React, { useEffect, useRef, useState } from 'react'
import type { ExperimentRemote } from './experiment-contract.ts'
import type { PromptEditingController, PromptEditingSnapshot } from './experiment-prompt-editor.ts'
import type { PromptTurn } from '../../workbench/prompt-edit.ts'
import { Button, Modal } from './experiment-controls.tsx'

type TranslationRemote = Pick<ExperimentRemote, 'translateStart' | 'translateGet' | 'translateCancel'>
function PromptTranslation({ workspaceId, source, remote, pollIntervalMs }: { readonly workspaceId: string; readonly source: string; readonly remote: TranslationRemote; readonly pollIntervalMs: number }) {
  const [result, setResult] = useState<{ source: string; status: 'running' | 'succeeded' | 'failed'; text?: string; error?: string } | null>(null)
  const currentSource = useRef(source), requestId = useRef<string | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null), active = useRef(true)
  currentSource.current = source
  const start = () => {
    if (!source.trim()) return
    if (requestId.current) void remote.translateCancel({ request_id: requestId.current }).catch(() => {})
    const request_id = crypto.randomUUID(), original = source
    requestId.current = request_id
    setResult({ source: original, status: 'running' })
    const valid = () => active.current && requestId.current === request_id && currentSource.current === original
    const fail = (error: unknown) => { if (valid()) setResult({ source: original, status: 'failed', error: error instanceof Error ? error.message : '翻译失败，请重试。' }) }
    const receive = (reply: Awaited<ReturnType<TranslationRemote['translateGet']>>) => {
      if (!valid()) return
      setResult({ source: original, ...reply })
      if (reply.status === 'running' && pollIntervalMs > 0) timer.current = setTimeout(() => { void remote.translateGet({ request_id }).then(receive).catch(fail) }, pollIntervalMs)
    }
    void remote.translateStart({ request_id, workspace_id: workspaceId, source_text: original }).then(receive).catch(fail)
  }
  useEffect(() => {
    active.current = true
    start()
    return () => { active.current = false; if (timer.current) clearTimeout(timer.current); if (requestId.current) void remote.translateCancel({ request_id: requestId.current }).catch(() => {}) }
  }, [])
  const visible = result?.source === source ? result : null
  return !source.trim() ? null : <div className="prompt-translation" aria-live="polite" aria-busy={visible?.status === 'running'}>
    {visible?.status === 'running' ? <span>正在翻译…</span> : visible?.status === 'succeeded' ? <p>{visible.text}</p>
      : <>{visible?.error && <p role="alert">{visible.error}</p>}<Button kind="small quiet" onClick={start}>{visible?.status === 'failed' ? '重试翻译' : '翻译'}</Button></>}
  </div>
}

export function ExperimentPromptDialog({ controller, state, workspaceId, originalRequest, baseModelName, remote, pollIntervalMs }: {
  readonly pollIntervalMs: number
  readonly controller: PromptEditingController
  readonly state: PromptEditingSnapshot
  readonly workspaceId: string
  readonly originalRequest: string
  readonly baseModelName: string
  readonly remote: TranslationRemote
}) {
  const result = state.result
  const revision = !!(state.before.positive_prompt.trim() || state.before.negative_prompt.trim())
  return <Modal title="对比提示词" kind="prompt-comparison-modal" onClose={controller.close}>
    <div className="prompt-edit-context"><h3>原始需求</h3><p>{originalRequest}</p><p>图像底模：{baseModelName}</p></div>
    {(['positive_prompt', 'negative_prompt'] as const).map(field => <section className="prompt-comparison-field" key={field}>
      <h3>{field === 'positive_prompt' ? '正向提示词' : '负向提示词'}</h3><div className="prompt-comparison-columns">
        <section><h4>改写前</h4><div className="prompt-comparison-source">{state.before[field] || '未填写'}</div>
          <PromptTranslation key={`before:${field}:${state.turn?.request_id ?? 'initial'}`} workspaceId={workspaceId} source={state.before[field]} remote={remote} pollIntervalMs={pollIntervalMs} /></section>
        <section><h4>生成结果</h4><textarea aria-label={`生成的${field === 'positive_prompt' ? '正向' : '负向'}提示词`} value={result?.[field] ?? ''} readOnly={state.busy || !result}
          onChange={event => { if (result) controller.editResult({ ...result, [field]: event.target.value }) }} />
          <PromptTranslation key={`after:${field}:${state.turn?.request_id ?? 'initial'}:${!!result}`} workspaceId={workspaceId} source={result?.[field] ?? ''} remote={remote} pollIntervalMs={pollIntervalMs} /></section>
      </div>
    </section>)}
    <label className="field"><span>改动意见</span><textarea aria-label="改动意见" className="short" value={state.changeRequest} readOnly={state.busy} onChange={event => controller.setChangeRequest(event.target.value)} /></label>
    {state.error && <p className="binding-problem" role="alert">{state.error}</p>}
    <div className="prompt-request-state" aria-live="polite">{state.busy ? revision ? '正在改写提示词…' : '正在生成提示词…' : state.turn?.status === 'interrupted' ? '提示词请求已停止。' : ''}</div>
    <footer className="modal-actions"><Button kind="quiet" onClick={controller.close}>关闭</Button>
      {state.busy ? <Button onClick={() => { void controller.cancel() }}>停止</Button> : <Button onClick={() => { void controller.start() }}>改写提示词</Button>}
      <Button kind="primary" disabled={!result || state.busy} onClick={() => { void controller.adopt() }}>采用生成结果</Button></footer>
  </Modal>
}

export function PromptTaskTurns({ workspaceId, taskId, remote, onEdit, pollIntervalMs }: { readonly workspaceId: string; readonly taskId: string; readonly pollIntervalMs: number; readonly remote: Pick<ExperimentRemote, 'promptList' | 'promptCancel'>; readonly onEdit?: () => void }) {
  const [turns, setTurns] = useState<readonly PromptTurn[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const values = await remote.promptList({ workspace_id: workspaceId, task_id: taskId })
        if (!active) return
        setTurns(values); setError('')
        if (pollIntervalMs > 0 && values.some(turn => turn.status === 'queued' || turn.status === 'running')) timer = setTimeout(() => { void load() }, pollIntervalMs)
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : '提示词记录读取失败，请刷新。') }
    }
    void load()
    return () => { active = false; if (timer) clearTimeout(timer) }
  }, [workspaceId, taskId, remote, pollIntervalMs])
  const current = turns.at(-1)
  return <div className="prompt-task-turns">{turns.length > 0 && onEdit && <Button kind="small" onClick={onEdit}>编辑提示词</Button>}{current && (current.status === 'running' || current.status === 'queued') && <Button kind="small" onClick={() => {
    void remote.promptCancel({ workspace_id: workspaceId, request_id: current.request_id }).then(stopped => setTurns(before => before.map(turn => turn.request_id === stopped.request_id ? stopped : turn)))
      .catch(failure => setError(failure instanceof Error ? failure.message : '停止失败，请重试。'))
  }}>停止</Button>}{error && <p role="alert">{error}</p>}{turns.map(turn => <details key={turn.request_id} open>
    <summary>第 {turn.turn_index} 轮 · {{ queued: '等待执行', running: '正在执行', succeeded: '已完成', failed: '执行失败', interrupted: '已停止' }[turn.status]}</summary>
    <p>Agent 预设：{turn.preset_id}</p><p>Agent 模型：{[turn.agent_model.provider, turn.agent_model.model, turn.agent_model.reasoningEffort].filter(Boolean).join(' · ')}</p>
    <p>会话：{turn.session_id}</p><p>请求：{turn.request_id}</p>
    <h3>原始需求</h3><p>{turn.input.original_request}</p>{turn.input.change_request && <><h3>改动意见</h3><p>{turn.input.change_request}</p></>}
    <details><summary>输入提示词</summary><h4>正向提示词</h4><pre>{turn.input.positive_prompt || '未填写'}</pre><h4>负向提示词</h4><pre>{turn.input.negative_prompt || '未填写'}</pre></details>
    {turn.result && <><h3>Agent 回复</h3><h4>正向提示词</h4><pre>{turn.result.positive_prompt || '未填写'}</pre><h4>负向提示词</h4><pre>{turn.result.negative_prompt || '未填写'}</pre></>}
    {turn.adopted && <><h3>实际采用内容</h3><h4>正向提示词</h4><pre>{turn.adopted.positive_prompt || '未填写'}</pre><h4>负向提示词</h4><pre>{turn.adopted.negative_prompt || '未填写'}</pre></>}
    {turn.error && <p role="alert">{turn.error.message}</p>}
  </details>)}</div>
}
