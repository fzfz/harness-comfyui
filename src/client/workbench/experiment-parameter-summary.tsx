import React from 'react'
import type { JsonValue } from '../../workbench/contract.ts'
import { flattenWorkflowRuntimeParameters, type WorkflowRuntimeParameterInspection } from '../../generation/inspection-contract.ts'
import { experimentSizeOptions } from './experiment-input.ts'
import options from './experiment-input-options.json' with { type: 'json' }

export function RuntimeParameterSummary({ parameters, description }: {
  readonly parameters: Readonly<Record<string, JsonValue>>
  readonly description: WorkflowRuntimeParameterInspection | null | undefined
}) {
  const described = description ? flattenWorkflowRuntimeParameters(description) : []
  const sizeIds = new Set(description?.size_candidates.flatMap(candidate => candidate.representation === 'width_height'
    ? [candidate.width.parameter_id, candidate.height.parameter_id]
    : candidate.representation === 'aspect_ratio_megapixels'
      ? [candidate.aspect_ratio.parameter_id, candidate.megapixels.parameter_id]
      : [candidate.parameter.parameter_id]) ?? [])
  const currentSize = experimentSizeOptions(description, parameters).find(item => item.current)
  return <dl className="input-facts numeric-facts">
    {Object.entries(parameters).filter(([id]) => !sizeIds.has(id) && !described.some(item => item.parameter_id === id && ['positive_prompt', 'negative_prompt', 'reference_image'].includes(item.kind))).map(([id, value]) => {
      const parameter = described.find(item => item.parameter_id === id)
      return <div key={id}><dt>{parameter ? options.parameterLabels[parameter.kind] : id}</dt><dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd></div>
    })}
    {currentSize && <div><dt>画面尺寸</dt><dd>{currentSize.label}</dd></div>}
  </dl>
}
