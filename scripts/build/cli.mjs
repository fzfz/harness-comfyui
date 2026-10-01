#!/usr/bin/env node
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildPlugin, packPlugin } from './index.mjs'

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))

function parseOptions(args) {
  const options = { repositoryRoot }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--repository-root' || argument === '--output-root' || argument === '--artifact-root' || argument === '--out') {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) throw new TypeError(`${argument} requires a path`)
      index += 1
      if (argument === '--repository-root') options.repositoryRoot = resolve(value)
      else if (argument === '--output-root') options.outputRoot = resolve(value)
      else if (argument === '--artifact-root') options.artifactRoot = resolve(value)
      else options.outputFile = resolve(value)
    } else {
      throw new TypeError(`Unknown build option ${argument}`)
    }
  }
  return options
}

async function main(argv) {
  const [command, ...args] = argv
  if (command === '--help' || command === 'help' || command === undefined) {
    process.stdout.write('Usage: node scripts/build/cli.mjs <build|pack> [--repository-root PATH] [--output-root PATH] [--artifact-root PATH] [--out FILE]\n')
    return
  }
  const options = parseOptions(args)
  if (command === 'build') {
    const result = await buildPlugin(options)
    process.stdout.write(`${result.files.join('\n')}\n`)
    return
  }
  if (command === 'pack') {
    const result = await packPlugin(options)
    process.stdout.write(`${result.archivePath}\n`)
    return
  }
  throw new TypeError(`Unknown build command ${command}; use build or pack`)
}

main(process.argv.slice(2)).catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
