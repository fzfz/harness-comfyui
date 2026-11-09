import { dirname, isAbsolute, resolve } from 'node:path'
import { readUtf8File, assertRequestSize } from './generation-manifest.mjs'
import { parseCliArguments } from '../../src/cli/contract.ts'

export async function loadWorkbenchRequest(argv, stdin) {
  const fromFile = argv.length === 5 && argv[3] === '--file' && argv[4].length > 0
  if (!fromFile && !(argv.length === 4 && argv[3] === '--stdin')) {
    throw new TypeError('Use workbench task get --stdin, workbench task publish --file <artifact.json>, or workbench experiment end --stdin. Read workbench --help.')
  }
  const path = fromFile ? resolve(argv[4]) : undefined
  const content = path === undefined ? stdin : await readUtf8File(path)
  const value = JSON.parse(content)
  if (value?.artifact?.source_files) {
    value.artifact.source_files = value.artifact.source_files.map(file => {
      if (typeof file !== 'string' || (!path && !isAbsolute(file))) throw new TypeError('source_files supplied through stdin must contain absolute paths.')
      return path ? resolve(dirname(path), file) : file
    })
  }
  const request = parseCliArguments([...argv.slice(0, 3), '--stdin'], JSON.stringify(value))
  assertRequestSize(request)
  return request
}
