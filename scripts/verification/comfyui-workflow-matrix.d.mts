export interface MatrixParameterResult {
  readonly status: 'passed' | 'not_found' | 'failed'
  readonly code?: string
  readonly message?: string
}

export interface MatrixTemplateReport {
  readonly parameters: Readonly<Record<string, MatrixParameterResult>>
  readonly supportBaseline: {
    readonly status: 'passed' | 'failed'
    readonly mismatches?: readonly {
      readonly parameterId: string
      readonly expectedStatus: 'passed' | 'not_found'
      readonly actualStatus: string
    }[]
  }
  readonly combined: { readonly status: string }
  readonly official: { readonly status: string }
}

export const MATRIX_PARAMETER_VALUES: Readonly<Record<string, string | number>>

export function parseArguments(arguments_: readonly string[]): {
  readonly instanceId: string
  readonly outputPath?: string
}

export function classifyParameterResult(error: unknown): MatrixParameterResult

export function compareParameterSupport(
  expectedSupportedParameters: readonly string[],
  parameters: Readonly<Record<string, MatrixParameterResult>>,
): MatrixTemplateReport['supportBaseline']

export function parseParameterSupportBaseline(
  value: unknown,
  catalogTemplateIds: readonly string[],
): Map<string, readonly string[]>

export function reportHasFailures(report: {
  readonly templates: readonly MatrixTemplateReport[]
}): boolean

export function runMatrix(options: {
  readonly instanceId: string
  readonly outputPath?: string
}): Promise<unknown>
