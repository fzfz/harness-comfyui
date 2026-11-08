import type { WorkbenchInputDescriptionRequest } from '../../workbench-remote.ts'
import type { GenerationInput, JsonValue } from '../../workbench/contract.ts'
import type {
  StandardRuntimeParameterKind,
  WorkflowRuntimeParameterInspection,
  WorkflowRuntimeParameterInspectionParameter,
} from '../../generation/inspection-contract.ts'
import options from './experiment-input-options.json' with { type: 'json' }

export function findExperimentParameter(
  description: WorkflowRuntimeParameterInspection | null | undefined,
  kind: StandardRuntimeParameterKind,
) {
  const parameters = description?.parameters.filter(parameter => parameter.kind === kind)
  return parameters?.length === 1 ? parameters[0] : undefined
}

export function readExperimentParameter(
  description: WorkflowRuntimeParameterInspection | null | undefined,
  parameters: Readonly<Record<string, JsonValue>>,
  kind: StandardRuntimeParameterKind,
): JsonValue | undefined {
  const parameter = findExperimentParameter(description, kind)
  return parameter
    ? Object.hasOwn(parameters, parameter.parameter_id)
      ? parameters[parameter.parameter_id]
      : parameter.current_value
    : undefined
}
export interface ExperimentSizeOption {
  readonly value: string
  readonly label: string
  readonly candidate_id: string
  readonly parameters: Record<string, JsonValue>
  readonly current: boolean
}
export function readExperimentParameterValue(
  parameter: WorkflowRuntimeParameterInspectionParameter,
  parameters: Readonly<Record<string, JsonValue>>,
): JsonValue {
  return Object.hasOwn(parameters, parameter.parameter_id)
    ? parameters[parameter.parameter_id]!
    : parameter.current_value
}
function accepts(
  parameter: WorkflowRuntimeParameterInspectionParameter,
  value: number,
): boolean {
  return (
    Number.isFinite(value) &&
    (parameter.value_type !== 'integer' || Number.isInteger(value)) &&
    (parameter.minimum === undefined || value >= parameter.minimum) &&
    (parameter.maximum === undefined || value <= parameter.maximum) &&
    (!parameter.allowed_values || parameter.allowed_values.includes(value))
  )
}
export function experimentSizeOptions(
  description: WorkflowRuntimeParameterInspection | null | undefined,
  parameters: Readonly<Record<string, JsonValue>>,
): readonly ExperimentSizeOption[] {
  const result: ExperimentSizeOption[] = []
  const add = (
    candidate_id: string,
    values: Record<string, JsonValue>,
    label: string,
    current: boolean,
  ) => {
    const value = JSON.stringify([candidate_id, values])
    if (!result.some((option) => option.value === value))
      result.push({ value, label, candidate_id, parameters: values, current })
  }
  for (const candidate of description?.size_candidates ?? []) {
    if (candidate.representation === 'width_height') {
      const width = readExperimentParameterValue(candidate.width, parameters),
        height = readExperimentParameterValue(candidate.height, parameters)
      if (typeof width === 'number' && typeof height === 'number')
        add(
          candidate.candidate_id,
          {
            [candidate.width.parameter_id]: width,
            [candidate.height.parameter_id]: height,
          },
          `${width} × ${height}`,
          true,
        )
      for (const size of options.commonSizes)
        if (
          accepts(candidate.width, size.width) &&
          accepts(candidate.height, size.height)
        )
          add(
            candidate.candidate_id,
            {
              [candidate.width.parameter_id]: size.width,
              [candidate.height.parameter_id]: size.height,
            },
            `${size.width} × ${size.height}`,
            false,
          )
    } else if (candidate.representation === 'resolution_preset') {
      const current = readExperimentParameterValue(candidate.parameter, parameters)
      const mappings = [...candidate.mapped_options].sort(
        (left, right) =>
          Number(JSON.stringify(right.value) === JSON.stringify(current)) -
          Number(JSON.stringify(left.value) === JSON.stringify(current)),
      )
      for (const mapping of mappings)
        add(
          candidate.candidate_id,
          { [candidate.parameter.parameter_id]: mapping.value },
          `${mapping.width} × ${mapping.height}`,
          JSON.stringify(mapping.value) === JSON.stringify(current),
        )
      if (
        !mappings.some(
          (mapping) =>
            JSON.stringify(mapping.value) === JSON.stringify(current),
        )
      )
        add(
          candidate.candidate_id,
          { [candidate.parameter.parameter_id]: current },
          typeof current === 'string' ? current : JSON.stringify(current),
          true,
        )
    } else {
      const ratio = readExperimentParameterValue(candidate.aspect_ratio, parameters),
        megapixels = readExperimentParameterValue(candidate.megapixels, parameters)
      add(
        candidate.candidate_id,
        {
          [candidate.aspect_ratio.parameter_id]: ratio,
          [candidate.megapixels.parameter_id]: megapixels,
        },
        `${String(ratio)} · ${String(megapixels)} MP`,
        true,
      )
    }
  }
  return result
}
export class ExperimentInputDescriptionCache {
  private readonly requests = new Map<
    string,
    Promise<WorkflowRuntimeParameterInspection | null>
  >()
  constructor(
    private readonly describe: (
      scope: WorkbenchInputDescriptionRequest,
    ) => Promise<WorkflowRuntimeParameterInspection | null>,
  ) {}
  key(workspaceId: string, input: GenerationInput): string {
    return JSON.stringify([workspaceId, input.instance_id, input.template_id])
  }
  load(
    scope: WorkbenchInputDescriptionRequest,
    input: GenerationInput,
  ): Promise<WorkflowRuntimeParameterInspection | null> {
    if (!input.instance_id || !input.template_id) return Promise.resolve(null)
    const key = this.key(scope.workspaceId, input),
      existing = this.requests.get(key)
    if (existing) return existing
    const request = this.describe(scope).catch((error) => {
      this.requests.delete(key)
      throw error
    })
    this.requests.set(key, request)
    return request
  }
}
