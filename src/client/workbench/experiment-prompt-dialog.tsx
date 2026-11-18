import React, { useContext, useEffect, useRef, useState } from 'react'
import { WorkbenchDeliveryContext } from './experiment-delivery.tsx'
import { usePromptTranslation, promptFields, type PromptField, type TranslationRemote } from './experiment-translation-state.ts'
import { PromptTranslationContent } from './experiment-translation-content.tsx'
import type { ExperimentRemote } from './experiment-contract.ts'
import { type PromptEditingController, type PromptEditingSnapshot } from './experiment-prompt-editor.ts'
import type { PromptTurn } from '../../workbench/prompt-edit.ts'
import { Button, trapDialogFocus } from './experiment-controls.tsx'

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
  const [field, setField] = useState<PromptField>('positive_prompt')
  const [requirementOpen, setRequirementOpen] = useState(false)
  const scroll = useRef<Record<string, number>>({})
  const result = state.result
  const scope = { workspace_id: workspaceId, work_id: workId, branch_id: branchId }
  const revision = state.turn?.request_id ?? 'initial'
  const beforePositive = usePromptTranslation({ ...scope, target: 'before', field: 'positive_prompt', source_text: state.before.positive_prompt }, remote, { enabled: field === 'positive_prompt', revision })
  const beforeNegative = usePromptTranslation({ ...scope, target: 'before', field: 'negative_prompt', source_text: state.before.negative_prompt }, remote, { enabled: field === 'negative_prompt', revision })
  const resultRevision = revision + (result ? ':result' : ':empty')
  const resultPositive = usePromptTranslation({ ...scope, target: 'result', field: 'positive_prompt', source_text: result?.positive_prompt ?? '' }, remote, { enabled: field === 'positive_prompt', revision: resultRevision })
  const resultNegative = usePromptTranslation({ ...scope, target: 'result', field: 'negative_prompt', source_text: result?.negative_prompt ?? '' }, remote, { enabled: field === 'negative_prompt', revision: resultRevision })
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopImmediatePropagation(); state.confirmClose ? controller.continueEditing() : controller.close() } }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [controller, state.confirmClose])
  const copy = (text: string) => { void navigator.clipboard.writeText(text) }
  const column = (generated: boolean) => {
    const title = generated ? '生成结果' : '改写前'
    const source = generated ? result?.[field] ?? '' : state.before[field]
    const translation = generated ? field === 'positive_prompt' ? resultPositive : resultNegative : field === 'positive_prompt' ? beforePositive : beforeNegative
    const key = (generated ? 'generated_' : 'current_') + field
    const editable = !state.busy && (generated ? !!result : !result)
    const preserveScroll = (pane: string) => ({
      ref: (element: HTMLElement | null) => { if (element) element.scrollTop = scroll.current[key + pane] ?? 0 },
      onScroll: (event: React.UIEvent<HTMLElement>) => { scroll.current[key + pane] = event.currentTarget.scrollTop },
    })
    return <section key={key} className={`pc-column ${generated ? 'pc-result' : ''}`} aria-label={title}>
      <header><div><h3>{title}</h3></div><div className="pc-column-tools">{source.trim() && <Button kind="small quiet" label={`复制原文：${title}的${promptFields[field]}`} onClick={() => copy(source)}>复制原文</Button>}</div></header>
      <div className="pc-column-body">{generated && !result ? <div className="pc-empty" role="status">{state.busy ? <><span className="prompt-spinner" />正在改写提示词</> : state.turn?.status === 'interrupted' ? '改写已停止' : '填写改动意见后生成提示词'}</div> : <div className="pc-dual">
        <section><div className="pc-pane-label">原文</div><textarea {...preserveScroll('-original')} aria-label={`${title}的${promptFields[field]}`} spellCheck={false} value={source} readOnly={!editable} onChange={event => {
          if (generated && result) controller.editResult({ ...result, [field]: event.target.value })
          else if (!generated) controller.editBefore({ ...state.before, [field]: event.target.value })
        }} /></section>
        <section><div className="pc-pane-label"><span>中文译文</span>{translation.current?.status === 'succeeded' && <Button kind="small quiet" onClick={() => { if (translation.current?.status === 'succeeded') copy(translation.current.text) }}>复制译文</Button>}</div>
          <PromptTranslationContent source={source} translation={translation} request={translation.request} scrollRef={preserveScroll('-translation').ref} onScroll={preserveScroll('-translation').onScroll} />
        </section>
      </div>}</div>
      <footer><span>{source.length.toLocaleString()} 字符</span>{generated && result && <span>可直接编辑原文</span>}</footer>
    </section>
  }
  const status = state.busy ? <><span className="prompt-spinner" />正在改写</> : state.error || (state.turn?.status === 'interrupted' ? '改写已停止' : result ? `第 ${state.turn?.turn_index ?? 1} 轮结果` : '')
  return <div className="modal-backdrop pc-backdrop"><section className="modal pc-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onKeyDown={state.confirmClose ? undefined : trapDialogFocus}>
    <header className="pc-header"><div><h2 id="modal-title">对比提示词</h2><span className="pc-model">{baseModelName}</span></div><Button kind="quiet pc-close" label="关闭对话框" autoFocus onClick={controller.close}>×</Button></header>
    <section className={`pc-requirement ${requirementOpen ? 'is-open' : ''}`}><strong>原始需求</strong><p>{originalRequest || '未填写'}</p><button type="button" className="btn small quiet" aria-expanded={requirementOpen} onClick={() => setRequirementOpen(!requirementOpen)}>{requirementOpen ? '收起' : '展开'}</button></section>
    <div className="pc-toolbar"><div className="pc-field-tabs" role="tablist" aria-label="提示词类型">{(Object.keys(promptFields) as PromptField[]).map(id => <button key={id} type="button" role="tab" aria-selected={field === id} onClick={() => setField(id)}>{promptFields[id]}</button>)}</div></div>
    <div className="pc-main"><div className="pc-columns">{column(false)}{column(true)}</div></div>
    <section className="pc-compose"><label htmlFor="rewrite-instruction">改动意见</label><div className="pc-compose-row"><textarea id="rewrite-instruction" aria-label="改动意见" placeholder="例如：保留人物外貌，改成平涂赛璐璐画风" readOnly={state.busy} value={state.changeRequest} onChange={event => controller.setChangeRequest(event.target.value)} />
      {state.busy ? <Button kind="pc-rewrite" onClick={() => { void controller.cancel() }}>停止改写</Button> : <Button kind="pc-rewrite" disabled={state.resultSaving} onClick={() => { void controller.start() }}>{result ? '继续改写' : '改写提示词'}</Button>}
    </div></section>
    <footer className="pc-footer"><div className={`pc-status ${state.error ? 'pc-error' : ''}`} role={state.error ? 'alert' : 'status'}>{status}</div><div><Button kind="quiet" onClick={controller.close}>关闭</Button><Button kind="primary" disabled={!result || state.busy || state.resultSaving} onClick={() => { void controller.adopt() }}>采用正负提示词</Button></div></footer>
    {state.confirmClose && <div className="pc-confirm"><section role="alertdialog" aria-label="保留编辑内容" onKeyDown={trapDialogFocus}><h3>生成结果有未保存的修改</h3><p>保存后可继续改写或采用。</p><div>
      <Button kind="quiet" autoFocus onClick={controller.continueEditing}>继续编辑</Button><Button disabled={state.resultSaving} onClick={() => { void controller.discardResult() }}>放弃修改</Button><Button kind="primary" disabled={state.resultSaving} onClick={() => { void controller.saveAndClose() }}>保存并关闭</Button>
    </div></section></div>}
  </section></div>
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
