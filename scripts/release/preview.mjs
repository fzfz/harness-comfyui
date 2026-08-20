import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  assertExpectedIdentity,
  formatReleasePreview,
  parseArguments,
  validatePackage,
} from './validate-package.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export { formatReleasePreview }

export function createReleasePreview(root = repositoryRoot, options = {}) {
  const expectedIdentity = assertExpectedIdentity(options)
  if (expectedIdentity.expectedVersion === undefined || expectedIdentity.expectedCommit === undefined) {
    throw new Error('release preview requires --expected-version and --expected-commit')
  }
  const { artifact } = validatePackage(root, {
    expectedVersion: expectedIdentity.expectedVersion,
    expectedCommit: expectedIdentity.expectedCommit,
    quiet: true,
  })
  return formatReleasePreview(artifact)
}

export function main(argv = process.argv.slice(2)) {
  const argumentsValue = parseArguments(argv)
  process.stdout.write(createReleasePreview(argumentsValue.root, argumentsValue))
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main()
  } catch (error) {
    process.stderr.write(`release:preview: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
