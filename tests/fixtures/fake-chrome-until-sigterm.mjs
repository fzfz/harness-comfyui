#!/usr/bin/env node

import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixtureDirectory = dirname(fileURLToPath(import.meta.url))
const profileArgument = process.argv.find(argument => argument.startsWith('--user-data-dir='))
if (profileArgument === undefined) process.exit(2)

await Promise.all([
  writeFile(join(fixtureDirectory, 'fake-chrome.pid'), String(process.pid)),
  writeFile(join(fixtureDirectory, 'fake-chrome.profile'), profileArgument.slice('--user-data-dir='.length)),
])

let closing = false
const close = async () => {
  if (closing) return
  closing = true
  await writeFile(join(fixtureDirectory, 'fake-chrome.closed'), 'SIGTERM')
  process.exit(0)
}

process.once('SIGTERM', () => { void close() })
setInterval(() => {}, 60_000)
await new Promise(() => {})
