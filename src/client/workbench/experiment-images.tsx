import React, { useRef, useState } from 'react'
import type { ImageRef, TaskDraft } from '../../workbench/contract.ts'
import type { WorkflowRuntimeParameterInspectionParameter } from '../../generation/inspection-contract.ts'
import { Button, Modal } from './experiment-controls.tsx'

const purposes = { workflow: 'Workflow 输入图片', agent: 'Agent 参考图片' } as const
export function mergeImagePurpose(images: readonly ImageRef[], image: ImageRef, purpose: 'workflow' | 'agent'): ImageRef[] {
  const found = images.find(item => item.image_ref_id === image.image_ref_id || (item.source.kind === image.source.kind && (item.source.kind === 'run_media' && image.source.kind === 'run_media' ? item.source.media_id === image.source.media_id && item.source.run_id === image.source.run_id : item.source.kind === 'uploaded_file' && image.source.kind === 'uploaded_file' && item.source.file_id === image.source.file_id)))
  return found ? images.map(item => item === found ? { ...item, purpose: item.purpose === purpose ? purpose : 'both' } : item) : [...images, { ...image, purpose }]
}

type ImageInput = Pick<TaskDraft, 'image_refs' | 'workflow_image_bindings'>
export type ExperimentImagesProps = {
  readonly input: ImageInput
  readonly parameters: readonly WorkflowRuntimeParameterInspectionParameter[]
  readonly display?: (image: ImageRef) => { name: string; url?: string; source?: string }
} & ({
  readonly editable: true
  readonly onChange: (value: ImageInput) => void
  readonly onPick: (purpose: 'workflow' | 'agent') => void
  readonly onImport: (files: readonly File[], purpose: 'workflow' | 'agent') => Promise<void>
  readonly onError: (message: string) => void
} | {
  readonly editable: false
  readonly onChange?: never
  readonly onPick?: never
  readonly onImport?: never
  readonly onError?: never
})

export function ExperimentImages({ input, editable, parameters, onChange, onPick, onImport, onError, display }: ExperimentImagesProps) {
  const [preview, setPreview] = useState<ImageRef | null>(null)
  const fileInputs = useRef<Partial<Record<'workflow' | 'agent', HTMLInputElement>>>({})
  const details = (image: ImageRef) => display?.(image) ?? { name: image.source.kind === 'run_media' ? image.source.media_id : image.source.file_id, source: image.source.kind === 'run_media' ? image.source.run_id : '本机图片' }
  const remove = (image: ImageRef, purpose: 'workflow' | 'agent') => {
    if (!editable) return
    onChange({
      image_refs: image.purpose === 'both' ? input.image_refs.map(item => item === image ? { ...image, purpose: purpose === 'workflow' ? 'agent' : 'workflow' } : item) : input.image_refs.filter(item => item !== image),
      workflow_image_bindings: purpose === 'workflow' ? input.workflow_image_bindings.map(item => ({ ...item, image_ref_ids: item.image_ref_ids.filter(id => id !== image.image_ref_id) })).filter(item => item.image_ref_ids.length) : input.workflow_image_bindings,
    })
  }
  const bind = (image: ImageRef, parameter_id: string) => {
    if (!editable) return
    const bindings = input.workflow_image_bindings.map(item => ({ ...item, image_ref_ids: item.image_ref_ids.filter(id => id !== image.image_ref_id) })).filter(item => item.image_ref_ids.length)
    const parameter = parameters.find(item => item.parameter_id === parameter_id)
    if (!parameter_id) { onChange({ image_refs: input.image_refs, workflow_image_bindings: bindings }); return }
    const existing = bindings.find(item => item.parameter_id === parameter_id)
    if (parameter?.image_cardinality !== 'many' && existing?.image_ref_ids.length) { onError('该单图参数已指定图片。请选择其他图片参数。'); return }
    if (existing) existing.image_ref_ids.push(image.image_ref_id)
    else bindings.push({ parameter_id, image_ref_ids: [image.image_ref_id] })
    onChange({ image_refs: input.image_refs, workflow_image_bindings: bindings })
  }
  return <>{(Object.entries(purposes) as ['workflow' | 'agent', string][]).map(([purpose, label]) => {
    const other = purpose === 'workflow' ? 'agent' : 'workflow'
    const images = input.image_refs.filter(image => image.purpose === purpose || image.purpose === 'both')
    return <section key={purpose} className="image-inputs" data-image-section={purpose} aria-label={label}>
      <div className="row between"><h3>{label}</h3></div>
      {editable && <div className="row"><Button kind="small" onClick={() => onPick(purpose)}>从运行记录选择</Button>
        <Button kind="small" onClick={() => fileInputs.current[purpose]?.click()}>选择本机图片</Button><input ref={element => { if (element) fileInputs.current[purpose] = element }} id={`local-image-files-${purpose}`} className="screen-reader" type="file" accept="image/*" multiple aria-label={`选择本机 ${label}`} onChange={event => {
          const files = Array.from(event.target.files ?? [])
          if (files.length) void onImport(files, purpose).catch(error => onError(error instanceof Error ? error.message : '图片导入失败，请重新选择。'))
          event.target.value = ''
        }} /></div>}
      {images.map(image => {
        const info = details(image), binding = input.workflow_image_bindings.find(item => item.image_ref_ids.includes(image.image_ref_id))
        const parameter = parameters.find(item => item.parameter_id === binding?.parameter_id)
        return <article key={image.image_ref_id} className="image-input-card" data-image-ref={image.image_ref_id}>
          <div className="reference-preview"><button type="button" className="reference-thumbnail" aria-label={`预览 ${info.name}`} onClick={() => setPreview(image)}>{info.url ? <img src={info.url} alt={info.name} /> : <span>{info.name}</span>}</button>
            <div><b>{info.name}</b><small>{info.source}</small></div>{editable && <Button kind="small quiet" label={`移除 ${label} ${info.name}`} onClick={() => remove(image, purpose)}>移除</Button>}</div>
          {purpose === 'workflow' ? editable ? <><label className="field"><span>模板图片参数</span><select value={binding?.parameter_id ?? ''} aria-label={`${info.name} 模板图片参数`} onChange={event => bind(image, event.target.value)}>
            <option value="">未指定图片参数</option>{parameters.map(item => <option key={item.parameter_id} value={item.parameter_id}>{`${item.parameter_id} · ${item.image_cardinality === 'many' ? '多张' : '单张'}`}</option>)}
          </select></label>{!parameter && <p className="image-binding-note">{parameters.length ? '请选择图片参数。' : '当前模板未声明图片参数。可更换 Workflow 模板。'}</p>}</> : <p className="image-input-note">模板图片参数：{parameter?.parameter_id ?? '未指定图片参数'}</p>
            : editable ? <label className="field"><span>Agent 参考要求</span><textarea value={image.reference_requirement} aria-label={`${info.name} Agent 参考要求`} placeholder="例如：参考窗框结构，保留当前光线" onChange={event => onChange({ image_refs: input.image_refs.map(item => item === image ? { ...image, reference_requirement: event.target.value } : item), workflow_image_bindings: input.workflow_image_bindings })} /></label>
              : image.reference_requirement && <div className="input-readout"><span>Agent 参考要求</span><div>{image.reference_requirement}</div></div>}
          {image.purpose === 'both' ? <p className="image-input-note">同时用作 {purposes[other]}</p> : editable && <Button kind="small quiet" onClick={() => onChange({ ...input, image_refs: mergeImagePurpose(input.image_refs, image, other) })}>也用作 {purposes[other]}</Button>}
        </article>
      })}
      {!images.length && <p className="image-input-empty">未选择 {label}</p>}
    </section>
  })}{preview && <Modal title={details(preview).name} kind="image-modal" onClose={() => setPreview(null)}><div className="original-image">{details(preview).url && <img src={details(preview).url} alt={details(preview).name} />}</div></Modal>}</>
}
