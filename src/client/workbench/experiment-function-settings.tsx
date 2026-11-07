import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkbenchEnvironment } from '../../workbench-remote.ts'
import type { AgentModel, FunctionBinding, TaskKind } from '../../workbench/contract.ts'
import { WORKBENCH_FUNCTIONS } from '../../workbench/functions.ts'
import { functionNameProblem } from '../../workbench/function-name.ts'
import { requestTemplateProblem } from '../../workbench/request-template.ts'
import type { ExperimentRemote } from './experiment-contract.ts'
import { Button, Modal } from './experiment-controls.tsx'

type FunctionChange =
  | { readonly type: 'function-edit'; readonly id: string; readonly value: FunctionBinding }
  | { readonly type: 'function-preset'; readonly id: string; readonly value: string }
  | { readonly type: 'function-remove'; readonly id: string }
  | { readonly type: 'function-add' }
type ModelGroups = WorkbenchEnvironment['models']['groups']

export function formatExperimentAgentModel(selection: AgentModel | undefined, groups: ModelGroups) {
  if (!selection) return '未配置'
  const provider = groups.find(item => item.id === selection.provider)
  const model = provider?.models.find(item => item.id === selection.model)
  const effort = model?.reasoning?.efforts.find(item => item.id === selection.reasoningEffort)
  return [provider?.name ?? selection.provider, model?.name ?? selection.model, effort?.name ?? selection.reasoningEffort].filter(Boolean).join(' · ')
}

function agentModelProblem(selection: AgentModel, groups: ModelGroups) {
  const provider = groups.find(item => item.id === selection.provider)
  if (!provider) return '请选择可用的 Agent 提供商。'
  const model = provider.models.find(item => item.id === selection.model)
  if (!model) return '请选择该提供商下的 Agent 模型。'
  const efforts = model.reasoning?.efforts ?? []
  if (efforts.length && !efforts.some(item => item.id === selection.reasoningEffort)) return '请选择该模型支持的推理等级。'
  if (!efforts.length && selection.reasoningEffort !== undefined) return '该模型未提供推理等级，请重新选择模型。'
  return ''
}

function FunctionEditor({ binding, functions, loadEnvironment, onSave, onClose, onToast }: {
  readonly binding: FunctionBinding
  readonly functions: readonly FunctionBinding[]
  readonly onToast: (message: string) => void
  readonly loadEnvironment: (presetId?: string) => Promise<WorkbenchEnvironment>
  readonly onSave: (change: FunctionChange) => Promise<void>
  readonly onClose: () => void
}) {
  const [draft, setDraft] = useState<FunctionBinding>(() => ({ ...binding, agent_model: { ...binding.agent_model } }))
  const [environment, setEnvironment] = useState<WorkbenchEnvironment | null>(null)
  const [loading, setLoading] = useState(true)
  const [environmentError, setEnvironmentError] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  useEffect(() => {
    let current = true
    setLoading(true)
    setEnvironmentError('')
    void loadEnvironment(draft.preset_id)
      .then(value => {
        if (!current) return
        setEnvironment(value)
        setDraft(before => ({ ...before, requested_skill: value.skills.some(skill => skill.name === before.requested_skill) ? before.requested_skill : null }))
        setLoading(false)
      })
      .catch(failure => {
        if (!current) return
        setEnvironmentError(failure instanceof Error ? failure.message : '功能配置加载失败，请重新打开“编辑功能”窗口。')
        setLoading(false)
      })
    return () => { current = false }
  }, [loadEnvironment, draft.preset_id])
  const descriptor = WORKBENCH_FUNCTIONS.find(item => item.kind === draft.kind)!
  const groups = environment?.models.groups ?? []
  const provider = groups.find(item => item.id === draft.agent_model.provider)
  const model = provider?.models.find(item => item.id === draft.agent_model.model)
  const efforts = model?.reasoning?.efforts ?? []
  const presets = environment?.presets.filter(item => !item.broken) ?? []
  const preset = presets.find(item => item.id === draft.preset_id) ?? presets[0]
  const problem = requestTemplateProblem(draft.request_template) || (environment ? agentModelProblem(draft.agent_model, groups) : '')
  const update = (value: Partial<FunctionBinding>) => { setDraft(before => ({ ...before, ...value })); setError('') }
  const selectModel = (providerId: string, modelId?: string) => {
    const selectedProvider = groups.find(item => item.id === providerId)
    const selected = modelId === undefined ? selectedProvider?.models[0] : selectedProvider?.models.find(item => item.id === modelId)
    const available = selected?.reasoning?.efforts ?? []
    const effort = available.find(item => item.id === draft.agent_model.reasoningEffort)?.id ?? selected?.reasoning?.defaultEffort ?? available[0]?.id
    update({ agent_model: { provider: providerId, model: selected?.id ?? '', ...(effort ? { reasoningEffort: effort } : {}) } })
  }
  return (
    <Modal title="编辑功能" kind="function-modal" onClose={onClose}>
      <form id="modal-form" onSubmit={async event => {
        event.preventDefault()
        if (pending.current || loading || environmentError || problem || !preset) return
        const nameProblem = functionNameProblem(draft, functions)
        if (nameProblem) { onToast(nameProblem); return }
        pending.current = true
        setSaving(true)
        setError('')
        try {
          await onSave({ type: 'function-edit', id: binding.function_id, value: { ...draft, name: draft.name.trim(), preset_id: preset.id } })
          if (active.current) onClose()
        } catch (failure) {
          const message = failure instanceof Error ? failure.message : '功能保存失败，请重试。'
          if (active.current) setError(message)
          else onToast(message)
        } finally {
          pending.current = false
          if (active.current) setSaving(false)
        }
      }}>
        <div className="function-config">
          <label className="field"><span>功能名称</span><input id="function-name" aria-label="功能名称" maxLength={30} required value={draft.name} readOnly={draft.builtin || saving} onChange={event => update({ name: event.target.value })} /></label>
          <label className="field"><span>任务类型</span><select id="function-kind" aria-label="任务类型" value={draft.kind} disabled={draft.builtin || saving} onChange={event => {
            const kind = event.target.value as TaskKind
            const next = WORKBENCH_FUNCTIONS.find(item => item.kind === kind)!
            update({ kind, request_template: draft.request_template === descriptor.default_request_template ? next.default_request_template : draft.request_template })
          }}>{WORKBENCH_FUNCTIONS.map(item => <option key={item.kind} value={item.kind}>{item.name}</option>)}</select></label>
          <label className="field"><span>Agent 预设</span><select id="function-preset" aria-label="Agent 预设" required value={preset?.id ?? ''} disabled={saving} onChange={event => update({ preset_id: event.target.value })}>
            {presets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label className="field"><span>指定 Skill</span><select id="function-skill" aria-label="指定 Skill" value={draft.requested_skill ?? ''} disabled={loading || saving} onChange={event => update({ requested_skill: event.target.value || null })}>
            <option value="">Agent 自选</option>{environment?.skills.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select></label>
        </div>
        <div className="agent-model-fields">
          <label className="field"><span>Agent 提供商</span><select id="function-provider" aria-label="Agent 提供商" required value={draft.agent_model.provider} disabled={saving} onChange={event => selectModel(event.target.value)}>
            {!provider && <option value={draft.agent_model.provider}>请选择提供商</option>}{groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label className="field"><span>Agent 模型</span><select id="function-model" aria-label="Agent 模型" required value={draft.agent_model.model} disabled={!provider || saving} onChange={event => selectModel(draft.agent_model.provider, event.target.value)}>
            {!model && <option value={draft.agent_model.model}>请选择模型</option>}{provider?.models.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label className="field"><span>推理等级</span><select id="function-effort" aria-label="推理等级" value={draft.agent_model.reasoningEffort ?? ''} disabled={!efforts.length || saving} onChange={event => update({ agent_model: { provider: draft.agent_model.provider, model: draft.agent_model.model, ...(event.target.value ? { reasoningEffort: event.target.value } : {}) } })}>
            {!efforts.length ? <option value="">该模型未提供推理等级</option> : !efforts.some(item => item.id === draft.agent_model.reasoningEffort) ? <option value={draft.agent_model.reasoningEffort ?? ''}>请选择推理等级</option> : null}
            {efforts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
        </div>
        <div className="row between template-context"><span>功能位置：<output id="function-location">{descriptor.ui_location}</output></span><span>结果显示：<output id="function-result">{descriptor.ui_result}</output></span></div>
        <section className="template-edit">
          <div className="row between"><label htmlFor="function-template">执行要求</label><Button kind="small quiet" disabled={saving} onClick={() => update({ request_template: descriptor.default_request_template })}>恢复默认要求</Button></div>
          <div className="field"><textarea id="function-template" aria-label="执行要求" spellCheck={false} data-kind={draft.kind} style={{ height: 420 }} value={draft.request_template} readOnly={saving} onChange={event => update({ request_template: event.target.value })} /></div>
          <p id="template-error" className="binding-problem" role="alert">{error || environmentError || problem}</p>
        </section>
        <div className="modal-actions"><Button kind="quiet" onClick={onClose}>取消</Button><button className="btn primary" type="submit" disabled={saving || loading || !!environmentError || !!problem || !preset}>保存功能</button></div>
      </form>
    </Modal>
  )
}

export function ExperimentFunctionSettings({ workspaceId, workspaceName, functions, presets: initialPresets, models: initialModels, remote, onChange, onBack, onToast }: {
  readonly workspaceId: string
  readonly workspaceName?: string
  readonly functions: readonly FunctionBinding[]
  readonly presets: ReadonlyArray<WorkbenchEnvironment['presets'][number]>
  readonly models: ModelGroups
  readonly remote: ExperimentRemote
  readonly onChange: (change: FunctionChange) => Promise<void>
  readonly onBack: () => void
  readonly onToast: (message: string) => void
}) {
  const [editor, setEditor] = useState<FunctionBinding | null>(null)
  const [environment, setEnvironment] = useState<WorkbenchEnvironment | null>(null)
  const active = useRef(true)
  const environmentRequest = useRef(0)
  const loadEnvironment = useCallback(async (presetId?: string) => {
    const request = ++environmentRequest.current
    const value = await remote.getEnvironment({ workspaceId, ...(presetId !== undefined ? { presetId } : {}) })
    if (active.current && request === environmentRequest.current) setEnvironment(value)
    return value
  }, [remote, workspaceId])
  const refreshEnvironment = useCallback(() => {
    const pending = loadEnvironment()
    const request = environmentRequest.current
    void pending.catch(failure => {
      if (active.current && request === environmentRequest.current)
        onToast(failure instanceof Error ? failure.message : '功能配置加载失败，请重新进入配置中心。')
    })
  }, [loadEnvironment, onToast])
  useEffect(() => {
    active.current = true
    refreshEnvironment()
    return () => { active.current = false; environmentRequest.current++ }
  }, [refreshEnvironment])
  const close = useCallback(() => { setEditor(null); refreshEnvironment() }, [refreshEnvironment])
  const presets = environment?.presets ?? initialPresets
  const models = environment?.models.groups ?? initialModels
  const change = async (value: FunctionChange) => {
    try { await onChange(value); refreshEnvironment() }
    catch (failure) { onToast(failure instanceof Error ? failure.message : '功能保存失败，请重试。') }
  }
  return (
    <>
      <main className="settings-page">
        <div className="settings-head"><div><h1>配置中心</h1><p>{workspaceName} · 功能默认配置</p></div><div className="row"><Button kind="primary" icon="plus" onClick={() => void change({ type: 'function-add' })}>添加功能</Button><Button onClick={onBack}>返回工作台</Button></div></div>
        <div className="settings-table-wrap"><table className="settings-table">
          <thead><tr>{['功能', '功能位置', '默认 Agent 预设', 'Agent 模型', '指定 Skill', '配置'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{functions.map(item => {
            const unavailable = !presets.some(preset => preset.id === item.preset_id && !preset.broken)
            return <tr key={item.function_id} data-function={item.function_id}>
            <td><strong>{item.name}</strong><small>{item.builtin ? '内置功能' : '自定义功能'}</small></td>
            <td>{WORKBENCH_FUNCTIONS.find(descriptor => descriptor.kind === item.kind)?.ui_location}</td>
            <td><select aria-label={`${item.name}的默认预设`} data-function-preset={item.function_id} value={item.preset_id} onChange={event => void change({ type: 'function-preset', id: item.function_id, value: event.target.value })}>
              {unavailable && <option value={item.preset_id}>预设不可用</option>}
              {presets.filter(preset => !preset.broken).map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            </select>{unavailable && <p className="binding-problem">该功能的 Agent 预设已不可用，请到配置中心重新选择。</p>}</td>
            <td className="agent-model-summary">{formatExperimentAgentModel(item.agent_model, models)}</td><td>{item.requested_skill || 'Agent 自选'}</td>
            <td><Button kind="small" label={`编辑${item.name}`} onClick={() => setEditor(item)}>编辑</Button>{!item.builtin && <Button kind="small quiet" label={`移除${item.name}`} onClick={() => void change({ type: 'function-remove', id: item.function_id })}>移除</Button>}</td>
          </tr>})}</tbody>
        </table></div>
      </main>
      {editor && <FunctionEditor key={`${workspaceId}:${editor.function_id}`} binding={editor} functions={functions} loadEnvironment={loadEnvironment} onSave={onChange} onClose={close} onToast={onToast} />}
    </>
  )
}
