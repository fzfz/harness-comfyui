import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

import { afterEach, describe, expect, it } from 'vitest'

import { terminateChild } from '../../scripts/release/process-lifecycle.mjs'

const runningChildren: ReturnType<typeof spawn>[] = []

afterEach(async () => {
  await Promise.all(runningChildren.splice(0).map(child => terminateChild(child, {
    processGroup: true,
    gracefulTimeoutMs: 100,
    forceTimeoutMs: 2000,
  }).catch(() => undefined)))
})

describe('release process lifecycle', () => {
  it('escalates an uncooperative child process group to SIGKILL, closes its port, and waits for descendants', async () => {
    if (process.platform === 'win32') return
    const child = spawn(process.execPath, ['-e', `
      const { spawn } = require('node:child_process')
      const http = require('node:http')
      const descendant = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'], { stdio: 'ignore' })
      const server = http.createServer((_request, response) => response.end('ok'))
      server.listen(0, '127.0.0.1', () => console.log('ready:' + server.address().port + ':' + descendant.pid))
      process.on('SIGTERM', () => {})
      setInterval(() => {}, 1000)
    `], {
      detached: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    runningChildren.push(child)
    let readiness = ''
    child.stdout?.on('data', chunk => { readiness += String(chunk) })
    const deadline = Date.now() + 5_000
    while (!readiness.includes('ready:') && Date.now() < deadline) await delay(20)
    const match = readiness.match(/ready:(\d+):(\d+)/)
    expect(match).not.toBeNull()
    const port = Number(match?.[1])
    const descendantPid = Number(match?.[2])

    const result = await terminateChild(child, {
      processGroup: true,
      gracefulTimeoutMs: 100,
      forceTimeoutMs: 2000,
    })

    expect(result.forced).toBe(true)
    expect(result.signal).toBe('SIGKILL')
    expect(child.signalCode).toBe('SIGKILL')

    const portDeadline = Date.now() + 5_000
    let portReleased = false
    while (Date.now() < portDeadline) {
      const open = await new Promise<boolean>(resolveResult => {
        const socket = createConnection({ host: '127.0.0.1', port })
        const timer = setTimeout(() => {
          socket.destroy()
          resolveResult(false)
        }, 250)
        socket.once('connect', () => {
          clearTimeout(timer)
          socket.destroy()
          resolveResult(true)
        })
        socket.once('error', () => {
          clearTimeout(timer)
          resolveResult(false)
        })
      })
      if (!open) {
        portReleased = true
        break
      }
      await delay(20)
    }
    expect(portReleased).toBe(true)

    const descendantDeadline = Date.now() + 5_000
    let descendantExited = false
    while (Date.now() < descendantDeadline) {
      try {
        process.kill(descendantPid, 0)
      } catch {
        descendantExited = true
        break
      }
      await delay(20)
    }
    expect(descendantExited).toBe(true)
  })
})
