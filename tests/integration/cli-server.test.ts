import { describe, expect, it } from 'vitest'
import { startCliServer } from '../../src/host/cli/server.ts'

describe('managed CLI listener', () => {
  it('isolates parallel instances and releases their endpoints on disposal', async () => {
    const servers = await Promise.all(['first', 'second'].map(text => startCliServer(() => (_request, response) => { response.end(text) })))
    try {
      expect(servers[0]!.origin).not.toBe(servers[1]!.origin)
      for (const [index, server] of servers.entries()) {
        expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
        expect(await (await fetch(server.origin)).text()).toBe(['first', 'second'][index])
      }
    } finally { await Promise.all(servers.map(server => server.close())) }
    for (const server of servers) await expect(fetch(server.origin)).rejects.toThrow()
  })

  it('releases the listener when handler construction fails', async () => {
    let origin = ''
    await expect(startCliServer(address => { origin = address; throw new Error('construction failed') })).rejects.toThrow('construction failed')
    await expect(fetch(origin)).rejects.toThrow()
  })

  it('closes a failed request without stopping subsequent requests', async () => {
    let calls = 0
    const server = await startCliServer(() => (_request, response) => {
      if (calls++ === 0) throw new Error('request failed')
      response.end('healthy')
    })
    try {
      await expect(fetch(server.origin)).rejects.toThrow()
      expect(await (await fetch(server.origin)).text()).toBe('healthy')
    } finally { await server.close() }
  })

  it('closes active connections and waits for the request to unwind', async () => {
    const started = deferred()
    let finished = false
    const server = await startCliServer(() => async (_request, response) => {
      started.resolve()
      await new Promise<void>(resolve => response.once('close', resolve))
      finished = true
    })
    const request = fetch(server.origin).catch(() => undefined)
    await started.promise
    await server.close()
    expect(finished).toBe(true)
    await request
  })

  it('reports handlers that exceed the configured shutdown deadline', async () => {
    const started = deferred()
    const release = deferred()
    const server = await startCliServer(() => async () => { started.resolve(); await release.promise }, { host: '127.0.0.1', port: 0, shutdownTimeoutMs: 1 })
    const request = fetch(server.origin).catch(() => undefined)
    await started.promise
    try { await expect(server.close()).rejects.toThrow('cliServer.shutdownTimeoutMs') }
    finally { release.resolve(); await request }
  })
})

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
