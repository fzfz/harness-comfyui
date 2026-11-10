import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkbenchEnvironment } from '../../workbench-remote.ts'
import type { AgentModel, FunctionBinding, FunctionBindingEditable, TaskKind } from '../../workbench/contract.ts'
import { WORKBENCH_FUNCTIONS } from '../../workbench/functions.ts'
import { agentModelProblem } from '../../workbench/agent-model.ts'
import { functionNameProblem } from '../../workbench/function-name.ts'
import { buildPromptRequest, DEFAULT_PROMPT_REQUEST_PARTS, PROMPT_BLOCKS, PROMPT_REFERENCES, requestTemplateProblem, type PromptBlockName, type PromptReferenceName, type PromptRequestInput } from '../../workbench/request-template.ts'
import { ExperimentTemplateEditor } from './experiment-template-editor.tsx'
import type { ExperimentRemote } from './experiment-contract.ts'
import { Button, Modal } from './experiment-controls.tsx'
import presentation from './experiment-function-presentation.json' with { type: 'json' }

type FunctionChange =
  | { readonly type: 'function-edit'; readonly id: string; readonly value: FunctionBindingEditable }
  | { readonly type: 'function-preset'; readonly id: string; readonly value: string }
  | { readonly type: 'function-remove'; readonly id: string }
  | { readonly type: 'function-add'; readonly value: FunctionBindingEditable }
type ModelGroups = WorkbenchEnvironment['models']['groups']

const reasoningEffortLabels: Readonly<Record<string, string>> = { off: '关闭（off）', low: '低', medium: '中', high: '高', xhigh: '更高', max: '最高' }
const reasoningEffortLabel = (id: string, fallback: string = id) => reasoningEffortLabels[id] ?? fallback

export function formatExperimentAgentModel(selection: AgentModel | undefined, groups: ModelGroups) {
  if (!selection) return '未配置'
  const provider = groups.find(item => item.id === selection.provider)
  const model = provider?.models.find(item => item.id === selection.model)
  const effort = model?.reasoning?.efforts.find(item => item.id === selection.reasoningEffort)
  return [provider?.name ?? selection.provider, model?.name ?? selection.model, selection.reasoningEffort ? reasoningEffortLabel(selection.reasoningEffort, effort?.name) : undefined].filter(Boolean).join(' · ')
}

export { agentModelProblem } from '../../workbench/agent-model.ts'

function FunctionRemoval({ binding, onRemove, onClose }: {
  readonly binding: FunctionBinding
  readonly onRemove: () => Promise<void>
  readonly onClose: () => void
}) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  return <Modal title={presentation.remove} onClose={onClose}>
    <form id="modal-form" onSubmit={async event => {
      event.preventDefault()
      if (pending.current) return
      pending.current = true
      setSaving(true)
      setError('')
      try {
        await onRemove()
        if (active.current) onClose()
      } catch (failure) {
        if (active.current) setError(failure instanceof Error ? failure.message : presentation.removeError)
      } finally {
        pending.current = false
        if (active.current) setSaving(false)
      }
    }}>
      <p>{presentation.removeDescription.replace('{name}', binding.name)}</p>
      {error && <p className="binding-problem" role="alert">{error}</p>}
      <div className="modal-actions">
        <Button kind="quiet" onClick={onClose}>{presentation.cancel}</Button>
        <button className="btn primary" type="submit" disabled={saving}>{presentation.remove}</button>
      </div>
    </form>
  </Modal>
}

function FunctionEditor({ binding, create = false, functions, loadEnvironment, onSave, onClose, onToast, previewRequest, resolvePreview }: {
  readonly previewRequest?: import('../../workbench/prompt-edit.ts').PromptStartRequest
  readonly resolvePreview: ExperimentRemote['promptPreview']
  readonly binding: FunctionBinding
  readonly create?: boolean
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
        setDraft(before => ({ ...before, requested_skill: before.kind !== 'translate' && value.skills.some(skill => skill.name === before.requested_skill) ? before.requested_skill : null }))
        setLoading(false)
      })
      .catch(failure => {
        if (!current) return
        setEnvironmentError(failure instanceof Error ? failure.message : presentation.loadError)
        setLoading(false)
      })
    return () => { current = false }
  }, [loadEnvironment, draft.preset_id])
  const [resolvedPreview, setResolvedPreview] = useState<PromptRequestInput | undefined>()
  const [previewError, setPreviewError] = useState('')
  const previewKey = JSON.stringify(previewRequest)
  useEffect(() => {
    let current = true
    setResolvedPreview(undefined); setPreviewError('')
    if (draft.kind !== 'prompt' || !previewRequest || !previewRequest.input.base_model_id) return
    void resolvePreview({ ...previewRequest, function_id: binding.kind === 'prompt' && binding.function_id ? binding.function_id : 'prompt' })
      .then(input => { if (current) setResolvedPreview(input) })
      .catch(failure => { if (current) setPreviewError(failure instanceof Error ? failure.message : '请求预览失败，请关闭并重新打开功能编辑窗口。') })
    return () => { current = false }
  }, [previewKey, draft.kind, resolvePreview])
  const descriptor = WORKBENCH_FUNCTIONS.find(item => item.kind === draft.kind)!
  const skills = draft.kind === 'translate' ? [] : environment?.skills ?? []
  const groups = environment?.models.groups ?? []
  const provider = groups.find(item => item.id === draft.agent_model.provider)
  const model = provider?.models.find(item => item.id === draft.agent_model.model)
  const efforts = model?.reasoning?.efforts ?? []
  const presets = environment?.presets.filter(item => !item.broken) ?? []
  const preset = presets.find(item => item.id === draft.preset_id)
  const parts = draft.request_parts ?? DEFAULT_PROMPT_REQUEST_PARTS
  const problem = requestTemplateProblem(draft.request_template, draft.kind) || (draft.kind === 'prompt'
    ? Object.entries(parts.block_templates).map(([name, template]) => requestTemplateProblem(template, 'prompt', name as PromptBlockName)).find(Boolean) : '') || (environment
    ? !preset ? presentation.selectAvailablePreset : agentModelProblem(draft.agent_model, groups, environment.models.routableProviders) : '')
  const update = (value: Partial<FunctionBinding>) => { setDraft(before => ({ ...before, ...value })); setError('') }
  const selectModel = (providerId: string, modelId?: string) => {
    const selectedProvider = groups.find(item => item.id === providerId)
    const selected = modelId === undefined ? selectedProvider?.models[0] : selectedProvider?.models.find(item => item.id === modelId)
    const available = selected?.reasoning?.efforts ?? []
    const effort = available.find(item => item.id === draft.agent_model.reasoningEffort)?.id ?? selected?.reasoning?.defaultEffort ?? available[0]?.id
    update({ agent_model: { provider: providerId, model: selected?.id ?? '', ...(effort ? { reasoningEffort: effort } : {}) } })
  }
  return (
    <Modal title={create ? presentation.add : presentation.edit} kind="function-modal" onClose={onClose}>
      <form id="modal-form" onSubmit={async event => {
        event.preventDefault()
        if (pending.current || loading || environmentError || problem || !preset) return
        const nameProblem = functionNameProblem(draft, functions)
        if (nameProblem) { onToast(nameProblem); return }
        pending.current = true
        setSaving(true)
        setError('')
        try {
          const { kind, agent_model, requested_skill, request_template } = draft
          const value: FunctionBindingEditable = { name: draft.name.trim(), kind, preset_id: preset.id,
            agent_model, requested_skill: kind === 'translate' ? null : requested_skill, request_template,
            ...(kind === 'prompt' ? { request_parts: parts } : {}) }
          await onSave(create ? { type: 'function-add', value } : { type: 'function-edit', id: binding.function_id, value })
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
          }}>{WORKBENCH_FUNCTIONS.filter(item => item.kind !== 'translate' || draft.kind === 'translate').map(item => <option key={item.kind} value={item.kind}>{item.name}</option>)}</select></label>
          <label className="field"><span>Agent 预设</span><select id="function-preset" aria-label="Agent 预设" required value={draft.preset_id} disabled={saving} onChange={event => update({ preset_id: event.target.value })}>
            {!preset && <option value={draft.preset_id}>{presentation.unavailablePreset}</option>}
            {presets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label className="field"><span>指定 Skill</span><select id="function-skill" aria-label="指定 Skill" value={draft.requested_skill ?? ''} disabled={loading || saving || !skills.length} onChange={event => { if (draft.kind !== 'translate') update({ requested_skill: event.target.value || null }) }}>
            <option value="">{skills.length ? 'Agent 自选' : '无'}</option>{skills.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
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
            {efforts.map(item => <option key={item.id} value={item.id}>{reasoningEffortLabel(item.id, item.name)}</option>)}
          </select></label>
        </div>
        <p className="preset-capabilities" id="preset-capabilities">{draft.preset_id === 'harness-comfyui-translation' ? '工具：无 · MCP：无 · Skill：无' : ''}</p>
        <div className="row between template-context"><span>功能位置：<output id="function-location">{descriptor.ui_location}</output></span><span>结果显示：<output id="function-result">{descriptor.ui_result}</output></span></div>
        <section className="template-edit">
          <div className="row between"><span>执行要求</span><Button kind="small quiet" disabled={saving} onClick={() => update({ request_template: descriptor.default_request_template, ...(draft.kind === 'prompt' ? { request_parts: DEFAULT_PROMPT_REQUEST_PARTS } : {}) })}>恢复默认要求</Button></div>
          <ExperimentTemplateEditor label="执行要求" kind={draft.kind} value={draft.request_template} disabled={saving} onChange={request_template => update({ request_template })} />
          {draft.kind === 'prompt' && <>
            {(Object.entries(PROMPT_BLOCKS) as [PromptBlockName, typeof PROMPT_BLOCKS[PromptBlockName]][]).map(([name, block]) => <details key={name} className="request-block-editor"><summary>{block.label} · {block.conditionLabel}</summary>
              <ExperimentTemplateEditor label={block.label} kind="prompt" block={name} value={parts.block_templates[name]} disabled={saving}
                onChange={value => update({ request_parts: { ...parts, block_templates: { ...parts.block_templates, [name]: value } } })} />
            </details>)}
            <details className="request-reference-editor"><summary>参考资料用途</summary>
              {(Object.entries(PROMPT_REFERENCES) as [PromptReferenceName, typeof PROMPT_REFERENCES[PromptReferenceName]][]).map(([name, reference]) => <label className="field" key={name}><span>{reference.label}</span>
                <textarea aria-label={reference.label + '用途'} value={parts.reference_descriptions[name]} readOnly={saving}
                  onChange={event => update({ request_parts: { ...parts, reference_descriptions: { ...parts.reference_descriptions, [name]: event.target.value } } })} /></label>)}
            </details>
            <details className="request-preview" open><summary>请求预览</summary>{resolvedPreview
              ? <pre>{problem ? '' : buildPromptRequest(draft.request_template, { ...resolvedPreview, reference_context: { ...resolvedPreview.reference_context, requested_skill: draft.requested_skill } }, parts)}</pre>
              : <p>{previewError || (previewRequest ? previewRequest.input.base_model_id ? '正在加载请求预览…' : '选择底模后可预览当前输入。' : '选择分支后可预览当前输入。')}</p>}</details>
          </>}
          <p id="template-error" className="binding-problem" role="alert">{error || environmentError || problem}</p>
        </section>
        <div className="modal-actions"><Button kind="quiet" onClick={onClose}>取消</Button><button className="btn primary" type="submit" disabled={saving || loading || !!environmentError || !!problem || !preset}>保存功能</button></div>
      </form>
    </Modal>
  )
}

export function ExperimentFunctionSettings({ workspaceId, workspaceName, functions, presets: initialPresets, models: initialModels, remote, onChange, onBack, onToast, previewRequest }: {
  readonly previewRequest?: import('../../workbench/prompt-edit.ts').PromptStartRequest
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
  const [editor, setEditor] = useState<{ binding: FunctionBinding; create: boolean } | null>(null)
  const editorSequence = useRef(0)
  const [removal, setRemoval] = useState<FunctionBinding | null>(null)
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
  const close = useCallback(() => { editorSequence.current++; setEditor(null); refreshEnvironment() }, [refreshEnvironment])
  const add = async () => {
    const sequence = ++editorSequence.current
    try {
      const defaults = await loadEnvironment()
      if (!active.current || sequence !== editorSequence.current) return
      const descriptor = WORKBENCH_FUNCTIONS.find(item => item.kind === presentation.defaultKind)!
      setEditor({ create: true, binding: { workspace_id: workspaceId, function_id: '', builtin: false,
        name: '', kind: descriptor.kind, preset_id: defaults.defaultPresetId, agent_model: defaults.models.default,
        requested_skill: null, request_template: descriptor.default_request_template } })
    } catch (failure) {
      if (active.current && sequence === editorSequence.current)
        onToast(failure instanceof Error ? failure.message : presentation.loadError)
    }
  }
  const displayedFunctions = [...functions.filter(item => item.kind === presentation.leadingKind), ...functions.filter(item => item.kind !== presentation.leadingKind)]
  const presets = environment?.presets ?? initialPresets
  const models = environment?.models.groups ?? initialModels
  const change = async (value: FunctionChange) => {
    try { await onChange(value); refreshEnvironment() }
    catch (failure) { onToast(failure instanceof Error ? failure.message : '功能保存失败，请重试。') }
  }
  return (
    <>
      <main className="settings-page">
        <div className="settings-head"><div><h1>配置中心</h1><p>{workspaceName} · 功能默认配置</p></div><div className="row"><Button kind="primary" icon="plus" onClick={() => { void add() }}>{presentation.add}</Button><Button onClick={onBack}>返回工作台</Button></div></div>
        <div className="settings-table-wrap"><table className="settings-table">
          <thead><tr>{['功能', '功能位置', '默认 Agent 预设', 'Agent 模型', '指定 Skill', '配置'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{displayedFunctions.map(item => {
            const unavailable = !presets.some(preset => preset.id === item.preset_id && !preset.broken)
            return <tr key={item.function_id} data-function={item.function_id}>
            <td><strong>{item.name}</strong><small>{item.builtin ? '内置功能' : '自定义功能'}</small></td>
            <td>{WORKBENCH_FUNCTIONS.find(descriptor => descriptor.kind === item.kind)?.ui_location}</td>
            <td><select aria-label={`${item.name}的默认预设`} data-function-preset={item.function_id} value={item.preset_id} onChange={event => void change({ type: 'function-preset', id: item.function_id, value: event.target.value })}>
              {unavailable && <option value={item.preset_id}>{presentation.unavailablePreset}</option>}
              {presets.filter(preset => !preset.broken).map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            </select>{unavailable && <p className="binding-problem">{presentation.rowPresetUnavailable}</p>}</td>
            <td className="agent-model-summary">{formatExperimentAgentModel(item.agent_model, models)}</td><td>{item.kind === 'translate' ? '无' : item.requested_skill || (item.preset_id === 'harness-comfyui-translation' ? '无' : 'Agent 自选')}</td>
            <td><Button kind="small" label={`编辑${item.name}`} onClick={() => { editorSequence.current++; setEditor({ binding: item, create: false }) }}>编辑</Button>{!item.builtin && <Button kind="small quiet" label={`移除${item.name}`} onClick={() => { editorSequence.current++; setRemoval(item) }}>移除</Button>}</td>
          </tr>})}</tbody>
        </table></div>
      </main>
      {removal && <FunctionRemoval key={`${workspaceId}:${removal.function_id}`} binding={removal}
        onClose={() => setRemoval(null)} onRemove={() => onChange({ type: 'function-remove', id: removal.function_id })} />}
      {editor && <FunctionEditor key={`${workspaceId}:${editor.binding.function_id}`} binding={editor.binding} create={editor.create} previewRequest={previewRequest} resolvePreview={remote.promptPreview} functions={functions} loadEnvironment={loadEnvironment} onSave={onChange} onClose={close} onToast={onToast} />}
    </>
  )
}
