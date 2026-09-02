#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const mode = process.argv[2]
const fixtureDirectory = process.argv[3]

if (fixtureDirectory === undefined) throw new Error('Fixture directory is required.')

process.on('SIGTERM', () => undefined)

if (mode === 'chrome') {
  writeFileSync(resolve(fixtureDirectory, 'fake-chrome.pid'), String(process.pid))
  setInterval(() => undefined, 1_000)
} else {
  writeFileSync(resolve(fixtureDirectory, 'worker.pid'), String(process.pid))
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'chrome', fixtureDirectory], {
    stdio: 'ignore',
  })
  child.unref()
  process.stdin.resume()
  setInterval(() => undefined, 1_000)
}
