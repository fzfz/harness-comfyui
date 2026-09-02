import { EventEmitter } from 'node:events'
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { reserveDevelopmentPort } from '../../scripts/development/port.mjs'

class FixedPortServer extends EventEmitter {
  listening = false
  constructor(port) {
    super()
    this.port = port
  }
  listen(_options, resolveListen) {
    this.listening = true
    resolveListen()
  }
  address() { return { address: '127.0.0.1', family: 'IPv4', port: this.port } }
  close(resolveClose) {
    this.listening = false
    resolveClose()
  }
}

async function bind(port, host) {
  const server = createServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen({ host, port }, resolveListen)
  })
  return server
}

describe('development port claims', () => {
  it('keeps a cross-process claim until the runtime takes ownership of the port', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'development-port-claims-'))
    try {
      const first = await reserveDevelopmentPort('127.0.0.1', root)
      const second = await reserveDevelopmentPort('127.0.0.1', root)
      expect(second.port).not.toBe(first.port)
      await expect(lstat(first.claimPath)).resolves.toBeDefined()
      await expect(lstat(second.claimPath)).resolves.toBeDefined()

      await expect(reserveDevelopmentPort('127.0.0.1', root, {
        createServer: () => new FixedPortServer(first.port),
        maximumAttempts: 1,
      })).rejects.toThrow('cannot claim a development port')

      await first.release()
      await first.release()
      const firstServer = await bind(first.port, '127.0.0.1')
      await new Promise((resolveClose, reject) => firstServer.close(error => error ? reject(error) : resolveClose()))
      await second.release()
      await expect(lstat(first.claimPath)).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(lstat(second.claimPath)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reclaims a claim whose owner process no longer exists', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'development-stale-port-claim-'))
    const port = 45191
    const claimPath = resolve(root, `${port}.json`)
    await writeFile(claimPath, `${JSON.stringify({
      schemaVersion: 1,
      claimId: 'stale-claim',
      ownerPid: 45190,
      host: '127.0.0.1',
      port,
    })}\n`)
    try {
      const reservation = await reserveDevelopmentPort('127.0.0.1', root, {
        createServer: () => new FixedPortServer(port),
        createClaimId: () => 'replacement-claim',
        maximumAttempts: 1,
        signalProcess: () => { throw Object.assign(new Error('missing'), { code: 'ESRCH' }) },
      })
      expect(reservation.port).toBe(port)
      expect(JSON.parse(await readFile(claimPath, 'utf8')).claimId).toBe('replacement-claim')
      await reservation.release()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('preserves and reports a malformed claim instead of deleting it', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'development-invalid-port-claim-'))
    const port = 45192
    const claimPath = resolve(root, `${port}.json`)
    await writeFile(claimPath, '{}\n')
    try {
      await expect(reserveDevelopmentPort('127.0.0.1', root, {
        createServer: () => new FixedPortServer(port),
        maximumAttempts: 1,
      })).rejects.toThrow('cannot validate development port claim')
      expect(await readFile(claimPath, 'utf8')).toBe('{}\n')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
