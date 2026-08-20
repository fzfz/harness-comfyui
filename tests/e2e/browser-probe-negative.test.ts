import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

import { runRealBrowserProbe } from '../../src/testing/browser-cdp.ts'

const execFileAsync = promisify(execFile)

async function browserResourceSnapshot(): Promise<{ processLines: string[]; profileDirectories: string[] }> {
  const [{ stdout }, entries] = await Promise.all([
    execFileAsync('/bin/ps', ['-axo', 'pid=,pgid=,command=']),
    readdir(tmpdir()),
  ])
  return {
    processLines: stdout.split('\n').map(line => line.trim()).filter(line => line.includes('harness-comfyui-chrome-')).sort(),
    profileDirectories: entries.filter(entry => entry.startsWith('harness-comfyui-chrome-')).sort(),
  }
}

describe('real browser probe failure boundary', () => {
  it('rejects a visible AppFrame-shaped document whose render script throws', async () => {
    const resourcesBefore = await browserResourceSnapshot()
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(`<!doctype html>
        <div id="root"><div class="_frame_fixture"><button>New</button><textarea></textarea></div></div>
        <script>
          window.__ModuleLoader__ = { load() {} };
          throw new Error('synthetic render failure');
        </script>`)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('fixture server did not expose a TCP port')

    try {
      await expect(runRealBrowserProbe(
        `http://127.0.0.1:${address.port}/`,
        { readinessTimeoutMs: 1000 },
      )).rejects.toThrow('synthetic render failure')
      await delay(200)
      expect(await browserResourceSnapshot()).toEqual(resourcesBefore)
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
    }
  }, 15000)

  it('rejects a visible button-rich document without the AppFrame shell overlay marker', async () => {
    const resourcesBefore = await browserResourceSnapshot()
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(`<!doctype html>
        <main><button>New</button><button>Open</button><button>Details</button><p>Visible shell lookalike</p></main>
        <script>window.__ModuleLoader__ = { load() {} };</script>`)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('fixture server did not expose a TCP port')

    try {
      await expect(runRealBrowserProbe(
        `http://127.0.0.1:${address.port}/`,
        { readinessTimeoutMs: 500 },
      )).rejects.toThrow('data-shell-overlay')
      await delay(200)
      expect(await browserResourceSnapshot()).toEqual(resourcesBefore)
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
    }
  }, 15000)
})
