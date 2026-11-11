import React, { useContext, useEffect, useState } from 'react'
import { WorkbenchDeliveryContext } from './experiment-delivery.tsx'
import { usePromptTranslation, type TranslationRemote } from './experiment-translation-state.ts'
import type { ExperimentRemote } from './experiment-contract.ts'
import { promptResultStatus, type PromptEditingController, type PromptEditingSnapshot } from './experiment-prompt-editor.ts'
import type { PromptTurn } from '../../workbench/prompt-edit.ts'
import { Button, Modal } from './experiment-controls.tsx'

function PromptTranslation({ workspaceId, workId, branchId, field, source, remote }: { readonly workspaceId: string; readonly workId: string; readonly branchId: string; readonly field: 'positive_prompt' | 'negative_prompt'; readonly source: string; readonly remote: TranslationRemote }) {
  const translation = usePromptTranslation({ workspace_id: workspaceId, work_id: workId, branch_id: branchId, field, source_text: source }, remote)
  useEffect(() => { if (!translation.current && !translation.records.length) translation.request() }, [])
  const result = translation.current
  return !source.trim() && !result ? null : <div className="prompt-translation" aria-live="polite" aria-busy={result?.status === 'running'}>
    {!!translation.records.length && <label>翻译记录<select aria-label="翻译记录" value={result?.request_id ?? ''} onChange={event => translation.select(event.target.value)}>
      {result && !translation.records.some(record => record.request_id === result.request_id) && <option value={result.request_id}>本次翻译</option>}
      {translation.records.map((record, index) => <option key={record.request_id} value={record.request_id}>第 {index + 1} 次翻译</option>)}
    </select></label>}
    {result && result.source_text !== source && <div><span>记录原文</span><pre>{result.source_text}</pre></div>}
    {result?.status === 'running' ? <span>正在翻译…</span> : result?.status === 'succeeded' ? <p>{result.text}</p>
      : result?.error && <><p role="alert">{result.error}</p><Button kind="small quiet" onClick={() => translation.request(result.source_text)}>重试翻译</Button></>}
    <Button kind="small quiet" disabled={!source.trim() || (result?.status === 'running' && result.source_text === source)} onClick={() => translation.request()}>翻译当前提示词</Button>
  </div>
}

export function ExperimentPromptDialog({ controller, state, workspaceId, workId, branchId, originalRequest, baseModelName, remote }: {
  readonly controller: PromptEditingController
  readonly state: PromptEditingSnapshot
  readonly workspaceId: string
  readonly workId: string
  readonly branchId: string
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
          <PromptTranslation key={`before:${field}:${state.turn?.request_id ?? 'initial'}`} workspaceId={workspaceId} workId={workId} branchId={branchId} field={field} source={state.before[field]} remote={remote} /></section>
        <section><h4>生成结果</h4><textarea aria-label={`生成的${field === 'positive_prompt' ? '正向' : '负向'}提示词`} value={result?.[field] ?? ''} readOnly={state.busy || !result}
          onChange={event => { if (result) controller.editResult({ ...result, [field]: event.target.value }) }} />
          <PromptTranslation key={`after:${field}:${state.turn?.request_id ?? 'initial'}:${!!result}`} workspaceId={workspaceId} workId={workId} branchId={branchId} field={field} source={result?.[field] ?? ''} remote={remote} /></section>
      </div>
    </section>)}
    <label className="field"><span>改动意见</span><textarea aria-label="改动意见" className="short" value={state.changeRequest} readOnly={state.busy} onChange={event => controller.setChangeRequest(event.target.value)} /></label>
    {state.confirmClose && <div role="alertdialog" aria-label="保存生成结果">
      <p>生成结果的修改尚未保存。</p>
      <Button onClick={() => { void controller.saveAndClose() }}>保存生成结果</Button>
      <Button onClick={controller.discardResult}>放弃修改</Button>
      <Button onClick={controller.continueEditing}>继续编辑</Button>
    </div>}
    {state.error && <p className="binding-problem" role="alert">{state.error}</p>}
    <div className="prompt-request-state" aria-live="polite">{state.busy ? revision ? '正在改写提示词…' : '正在生成提示词…' : state.turn?.status === 'interrupted' ? '提示词请求已停止。' : ''}</div>
    <footer className="modal-actions"><Button kind="quiet" onClick={controller.close}>关闭</Button>
      {state.busy ? <Button onClick={() => { void controller.cancel() }}>停止</Button> : <Button disabled={state.resultDirty || state.resultSaving} onClick={() => { void controller.start() }}>改写提示词</Button>}
      <Button kind="primary" disabled={!result || state.busy || state.resultSaving || state.resultDirty || promptResultStatus(state.turn) !== 'pending'} onClick={() => { void controller.adopt() }}>采用生成结果</Button></footer>
  </Modal>
}

export function PromptTaskTurns({ workspaceId, taskId, remote, onEdit }: { readonly workspaceId: string; readonly taskId: string; readonly remote: Pick<ExperimentRemote, 'promptList' | 'promptCancel'>; readonly onEdit?: () => void }) {
  const delivery = useContext(WorkbenchDeliveryContext)
  const [history, setTurns] = useState<readonly PromptTurn[]>([])
  const records = delivery.promptTurns.filter(turn => turn.task_id === taskId)
  const turns = records.length ? records : history
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const values = await remote.promptList({ workspace_id: workspaceId, task_id: taskId })
        if (!active) return
        setTurns(values); setError('')
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : '提示词记录读取失败，请刷新。') }
    }
    void load()
    return () => { active = false }
  }, [workspaceId, taskId, remote])
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
