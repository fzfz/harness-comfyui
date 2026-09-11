import { useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { CATALOG_FIELDS, CATALOG_PRESENTATION, type CatalogDetails, type CatalogDetailsRequest } from '../../catalog/details-schema.ts'
import { catalogFailureText, WORKBENCH_COPY } from './contract.ts'

export interface CatalogDetailsProps {
  readonly request: CatalogDetailsRequest
  readonly load: (request: CatalogDetailsRequest, signal: AbortSignal) => Promise<CatalogDetails>
  readonly preview: (() => void) | null
}
export function CatalogDetailsPanel({ request, load, preview }: CatalogDetailsProps) {
  const [details, setDetails] = useState<CatalogDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const focus = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    setDetails(null)
    setError(null)
    focus.current?.focus()
    void load(request, controller.signal).then(value => {
      if (!controller.signal.aborted) setDetails(value)
    }).catch(reason => {
      if (!controller.signal.aborted) setError(catalogFailureText(reason))
    })
    return () => controller.abort()
  }, [request.kind, request.id, load, attempt])
  return <div ref={focus} tabIndex={-1} className="harness-comfyui-catalog-detail" aria-label={CATALOG_PRESENTATION.copy.details}>
    {preview && <Button className="harness-comfyui-detail-preview" variant="outline" size="sm" onClick={preview}>{WORKBENCH_COPY.openGallery}</Button>}
    {error !== null ? <div role="status"><p>{error}</p><Button variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>{CATALOG_PRESENTATION.copy.retry}</Button></div>
      : details === null ? <span role="status">{WORKBENCH_COPY.loading}</span>
        : <dl>{details.fields.map(field => <div key={field.key}>
          <dt>{CATALOG_FIELDS[field.key]!.label}</dt>
          <dd>{field.value === null || field.value === '' || (Array.isArray(field.value) && field.value.length === 0)
            ? CATALOG_PRESENTATION.copy.emptyValue
            : Array.isArray(field.value) ? field.value.join('、') : String(field.value)}</dd>
        </div>)}</dl>}
  </div>
}
