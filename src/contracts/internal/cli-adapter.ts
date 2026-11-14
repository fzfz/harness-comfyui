import help from '../../../config/managed-cli-help.json' with { type: 'json' }
import { CLI_MAX_BODY_BYTES } from '../../cli/limits.ts'
import type { ContractValue } from '../index.ts'

type OperationParser = (operation: string, value: unknown) => unknown

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

export function normalizeCliRequest(value: unknown, parseOperation: OperationParser, operationNames: readonly string[]) {
  const source = record(value, 'CLI request')
  const { command, ...input } = source
  if (typeof command !== 'string' || !operationNames.includes(command.replaceAll('.', ' '))) {
    throw new TypeError('CLI request command is invalid')
  }
  const parsed = parseOperation(command.replaceAll('.', ' '), input) as Record<string, unknown>
  return { command, ...parsed }
}

function stdinLabel(operation: string): string {
  if (operation.startsWith('workbench ')) return 'Workbench stdin'
  if (operation === 'generation run-inputs' || operation === 'generation wait') return 'Generation Run stdin'
  if (operation === 'generation inspect-template-parameters') return 'Generation template parameter inspection stdin'
  if (operation === 'generation random-seeds') return 'Generation random Seed stdin'
  if (operation === 'generation resolve-media') return 'Generation media resolution stdin'
  return 'Image inspection stdin'
}

export function parseCliArguments(
  value: { readonly argv: readonly string[]; readonly stdin: string },
  parseRequest: (value: unknown) => unknown,
  operationNames: readonly string[],
) {
  const { argv, stdin } = value
  const operation = argv.slice(0, -1).join(' ')
  if (argv.at(-1) !== '--stdin' || !operationNames.includes(operation) || operation === 'generation submit') {
    throw new TypeError(help.messages.invalidCommand.replace('{argv}', JSON.stringify(argv)))
  }
  const label = stdinLabel(operation)
  let document: unknown
  try { document = JSON.parse(stdin) }
  catch { throw new TypeError(`${label} must contain one JSON object`) }
  const source = record(document, label)
  if (Object.hasOwn(source, 'command')) throw new TypeError('Select the CLI operation through its command-line arguments.')
  return parseRequest({ ...source, command: operation.replaceAll(' ', '.') })
}

export interface CliFileIo {
  readUtf8File(path: string, maxBytes?: number): Promise<string>
  resolvePath(...paths: string[]): string
  isAbsolute(path: string): boolean
  dirname(path: string): string
  byteLength(text: string): number
}

type FileContractId = 'cliGenerationManifest' | 'cliArguments' | 'cliRequest'
type FileParser = <Id extends FileContractId>(id: Id, value: unknown) => ContractValue<Id>

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
function errorCode(error: unknown): unknown { return error && typeof error === 'object' && 'code' in error ? error.code : undefined }

export function createCliFileLoader(io: CliFileIo, parse: FileParser) {
  async function generation(argv: readonly string[], stdin: string) {
    const fromFile = argv.length === 4 && argv[2] === '--file' && argv[3]!.length > 0
    if (!fromFile && !(argv.length === 3 && argv[2] === '--stdin')) {
      throw new TypeError('Use generation submit --file <manifest.json> or generation submit --stdin; choose exactly one input.')
    }
    const manifestPath = fromFile ? io.resolvePath(argv[3]!) : undefined
    let content: string
    try { content = manifestPath === undefined ? stdin : await io.readUtf8File(manifestPath) }
    catch (error) {
      throw Object.assign(new TypeError(`Cannot read Generation manifest ${manifestPath ?? 'stdin'} as UTF-8 text: ${errorMessage(error)}`), { code: errorCode(error) })
    }
    let value: unknown
    try { value = JSON.parse(content) }
    catch { throw new TypeError(`Generation manifest ${manifestPath ?? 'stdin'} must contain one JSON object. Correct the JSON syntax before retrying.`) }
    const source = parse('cliGenerationManifest', value)
    const items = []
    let remainingFileBytes = CLI_MAX_BODY_BYTES
    for (const [index, item] of source.entries()) {
      const parameters = Object.entries(item.request.parameters)
      for (const [parameter, path] of Object.entries(item.parameter_files ?? {})) {
        const label = `Generation items[${index}] parameter ${parameter} file ${path}`
        if (manifestPath === undefined && !io.isAbsolute(path)) {
          throw new TypeError(`${label}: stdin file references require an absolute path. Use --file <manifest.json> for relative references.`)
        }
        const absolute = manifestPath === undefined ? path : io.resolvePath(io.dirname(manifestPath), path)
        try {
          const text = await io.readUtf8File(absolute, remainingFileBytes)
          remainingFileBytes -= io.byteLength(text)
          parameters.push([parameter, text])
        } catch (error) {
          throw Object.assign(new TypeError(`${label}: ${errorMessage(error)}. Check the path and UTF-8 file content before retrying.`), { code: errorCode(error) === 'CLI_REQUEST_TOO_LARGE' ? 'CLI_REQUEST_TOO_LARGE' : 'CLI_REQUEST_INVALID' })
        }
      }
      items.push({ request_id: item.request_id, request: { ...item.request, parameters: Object.fromEntries(parameters) } })
    }
    const taskId = record(value, 'Generation manifest').workbench_task_id
    return parse('cliRequest', { command: 'generation.submit', items, ...(taskId === undefined ? {} : { workbench_task_id: taskId }) })
  }

  async function workbench(argv: readonly string[], stdin: string) {
    const fromFile = argv.length === 5 && argv[3] === '--file' && argv[4]!.length > 0
    if (!fromFile && !(argv.length === 4 && argv[3] === '--stdin')) {
      throw new TypeError('Use workbench task get --stdin, workbench task publish --file <artifact.json>, or workbench experiment end --stdin. Read workbench --help.')
    }
    const path = fromFile ? io.resolvePath(argv[4]!) : undefined
    const content = path === undefined ? stdin : await io.readUtf8File(path)
    const value: unknown = JSON.parse(content)
    const request = parse('cliArguments', { argv: [...argv.slice(0, 3), '--stdin'], stdin: JSON.stringify(value) })
    if (request.command !== 'workbench.task.publish' || !request.artifact.source_files) return request
    const files = request.artifact.source_files.map(file => {
      if (!path && !io.isAbsolute(file)) throw new TypeError('source_files supplied through stdin must contain absolute paths.')
      return path ? io.resolvePath(io.dirname(path), file) : file
    })
    return parse('cliRequest', { ...request, artifact: { ...request.artifact, source_files: files } })
  }

  return async (argv: readonly string[], stdin: string) => {
    const request = await (argv[0] === 'workbench' ? workbench(argv, stdin) : generation(argv, stdin))
    return request
  }
}
