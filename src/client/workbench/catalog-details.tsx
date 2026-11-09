import { useEffect, useRef } from 'react'
import { CatalogDetailFields, useCatalogDetails } from './catalog-browser.tsx'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { CATALOG_PRESENTATION, type CatalogDetails, type CatalogDetailsRequest } from '../../catalog/details-schema.ts'
import { WORKBENCH_COPY } from './contract.ts'

export interface CatalogDetailsProps {
  readonly request: CatalogDetailsRequest
  readonly load: (request: CatalogDetailsRequest, signal: AbortSignal) => Promise<CatalogDetails>
  readonly preview: (() => void) | null
}
export function CatalogDetailsPanel({ request, load, preview }: CatalogDetailsProps) {
  const { details, error, retry } = useCatalogDetails(request, load)
  const focus = useRef<HTMLDivElement>(null)
  useEffect(() => { focus.current?.focus() }, [request.kind, request.id])
  return <div ref={focus} tabIndex={-1} className="harness-comfyui-catalog-detail" aria-label={CATALOG_PRESENTATION.copy.details}>
    {preview && <Button className="harness-comfyui-detail-preview" variant="outline" size="sm" onClick={preview}>{WORKBENCH_COPY.openGallery}</Button>}
    {error !== null ? <div role="status"><p>{error}</p><Button variant="outline" size="sm" onClick={() => { focus.current?.focus(); retry() }}>{CATALOG_PRESENTATION.copy.retry}</Button></div>
      : details === null ? <span role="status">{WORKBENCH_COPY.loading}</span>
        : <CatalogDetailFields details={details} presentation="chat" />}
  </div>
}
