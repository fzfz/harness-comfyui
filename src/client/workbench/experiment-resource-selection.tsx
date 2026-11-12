import React from 'react'
import { CATALOG_KIND_DEFINITIONS, catalogDefinition, type CatalogKind } from '../../catalog/contract.ts'
import { CATALOG_FIELDS } from '../../catalog/details-schema.ts'
import { isPromptResourceKind } from '../../workbench/resources.ts'
import type { PromptResourceRef, ResourceSnapshot } from '../../workbench/contract.ts'
import { Button } from './experiment-controls.tsx'
import { useCatalogDetails, type CatalogApi } from './catalog-browser.tsx'

function PromptResourceRow({ resource, load, onDetail, onRemove }: {
  readonly resource: PromptResourceRef
  readonly load?: CatalogApi['details']
  readonly onDetail: () => void
  readonly onRemove?: () => void
}) {
  const { details, error, retry } = useCatalogDetails(resource, load)
  const name = details?.kind === resource.kind && details.id === resource.id ? details.item.label : `${catalogDefinition(resource.kind).label} ${resource.id}`
  return <div className="selected-resource-row" data-resource-id={resource.id}>
    <b>{name}</b>
    <div className="row">
      <Button kind="small quiet" label={`查看详情 ${name}`} onClick={onDetail}>查看详情</Button>
      {onRemove && <Button kind="small quiet" label={`移除 ${name}`} onClick={onRemove}>移除</Button>}
    </div>
    {error && <div className="selected-resource-error" role="alert"><span>{name}：{error}</span><Button kind="small quiet" onClick={retry}>重试</Button></div>}
  </div>
}

type PromptResourceGroupsProps = {
  readonly refs: readonly PromptResourceRef[]
  readonly load?: CatalogApi['details']
  readonly onOpen: (kind: CatalogKind, id?: string) => void
} & ({ readonly editable: true; readonly onRemove: (resource: PromptResourceRef) => void } | { readonly editable: false })

export function PromptResourceGroups(props: PromptResourceGroupsProps) {
  const { refs, load, editable, onOpen } = props
  const onRemove = props.editable ? props.onRemove : undefined
  return <>{CATALOG_KIND_DEFINITIONS.filter(item => isPromptResourceKind(item.kind)).map(kind => {
    const resources = refs.filter(item => item.kind === kind.kind)
    return <details className="selected-resource-group" data-resource-group={kind.kind} key={kind.kind} open>
      <summary>{kind.label}<span className="count">{resources.length}</span></summary>
      {editable && <div className="resource-group-actions"><Button kind="small quiet" icon="plus" label={`添加 ${kind.label}`} onClick={() => onOpen(kind.kind)}>添加</Button></div>}
      {resources.map(resource => <PromptResourceRow key={resource.id} resource={resource} load={load} onDetail={() => onOpen(resource.kind, resource.id)}
        {...(onRemove ? { onRemove: () => onRemove(resource) } : {})} />)}
      {!resources.length && <p className="muted">未选择</p>}
    </details>
  })}</>
}

export function ResourceSnapshotGroups({ snapshots }: { readonly snapshots: readonly ResourceSnapshot[] }) {
  return <section className="selected-resources" aria-label="已选资源">
    <div className="row between"><h3>已选资源</h3><small>{snapshots.length} 项</small></div>
    {CATALOG_KIND_DEFINITIONS.map(kind => {
      const resources = snapshots.filter(item => item.kind === kind.kind)
      return <details className="selected-resource-group" data-resource-group={kind.kind} key={kind.kind} open>
        <summary>{kind.label}<span className="count">{resources.length}</span></summary>
        {resources.map(resource => <details className="selected-resource-snapshot" key={resource.id}>
          <summary>{resource.name}{resource.selected_weight !== undefined && <span> · {resource.selected_weight}</span>}</summary>
          <dl>{Object.entries(resource.fields).map(([key, value]) => <div key={key}><dt>{CATALOG_FIELDS[key]?.label ?? key}</dt><dd>{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</dd></div>)}</dl>
        </details>)}
        {!resources.length && <p className="muted">未选择</p>}
      </details>
    })}
  </section>
}
