import { createServer } from 'node:http'

import { describe, expect, it } from 'vitest'

import { runRealBrowserProbe } from '../../src/testing/browser-cdp.ts'

describe('real browser probe failure boundary', () => {
  it('rejects a visible AppFrame-shaped document whose render script throws', async () => {
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
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
    }
  }, 15000)
})
