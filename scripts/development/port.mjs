import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { resolve } from 'node:path'

const DEVELOPMENT_PORT_CLAIM_SCHEMA_VERSION = 1
const DEVELOPMENT_PORT_CLAIM_KEYS = Object.freeze([
  'claimId',
  'host',
  'ownerPid',
  'port',
  'schemaVersion',
])

function parseDevelopmentPortClaim(value, path, expectedPort) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`development port claim must be an object: ${path}`)
  }
  const keys = Object.keys(value).sort()
  if (JSON.stringify(keys) !== JSON.stringify(DEVELOPMENT_PORT_CLAIM_KEYS)) {
    throw new Error(`development port claim has invalid properties: ${path}`)
  }
  if (value.schemaVersion !== DEVELOPMENT_PORT_CLAIM_SCHEMA_VERSION
    || typeof value.claimId !== 'string'
    || value.claimId.length === 0
    || !Number.isSafeInteger(value.ownerPid)
    || value.ownerPid < 1
    || typeof value.host !== 'string'
    || value.host.length === 0
    || value.port !== expectedPort) {
    throw new Error(`development port claim has invalid values: ${path}`)
  }
  return value
}

async function readDevelopmentPortClaim(path, expectedPort) {
  try {
    return parseDevelopmentPortClaim(JSON.parse(await readFile(path, 'utf8')), path, expectedPort)
  } catch (error) {
    if (error?.code === 'ENOENT') throw error
    throw new Error(`cannot validate development port claim ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function processIsRunning(pid, signalProcess) {
  try {
    signalProcess(pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') return false
    throw error
  }
}

async function removeStaleClaim(path, expectedClaim) {
  const currentClaim = await readDevelopmentPortClaim(path, expectedClaim.port)
  if (currentClaim.claimId !== expectedClaim.claimId) return false
  await rm(path)
  return true
}

async function closeServer(server) {
  if (!server.listening) return
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
}

async function bindAvailablePort(host, createPortServer) {
  const server = createPortServer()
  try {
    await new Promise((resolveListen, reject) => {
      server.once('error', reject)
      server.listen({ host, port: 0 }, resolveListen)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') {
      throw new Error(`cannot reserve a development port on ${host}`)
    }
    return { port: address.port, server }
  } catch (error) {
    await closeServer(server)
    throw error
  }
}

export async function reserveDevelopmentPort(host, claimRoot, options = {}) {
  const createPortServer = options.createServer ?? createServer
  const createClaimId = options.createClaimId ?? randomUUID
  const maximumAttempts = options.maximumAttempts ?? 128
  const signalProcess = options.signalProcess ?? process.kill
  await mkdir(claimRoot, { recursive: true })

  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const { port, server } = await bindAvailablePort(host, createPortServer)
    const claimId = createClaimId()
    const claimPath = resolve(claimRoot, `${port}.json`)
    try {
      await writeFile(claimPath, `${JSON.stringify({
        schemaVersion: DEVELOPMENT_PORT_CLAIM_SCHEMA_VERSION,
        claimId,
        ownerPid: process.pid,
        host,
        port,
      })}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    } catch (error) {
      await closeServer(server)
      if (error?.code === 'EEXIST') {
        const existingClaim = await readDevelopmentPortClaim(claimPath, port)
        if (processIsRunning(existingClaim.ownerPid, signalProcess)) continue
        if (await removeStaleClaim(claimPath, existingClaim)) attempt -= 1
        continue
      }
      throw error
    }
    await closeServer(server)

    let released = false
    return {
      port,
      claimPath,
      async release() {
        if (released) return
        let claim
        try {
          claim = await readDevelopmentPortClaim(claimPath, port)
        } catch (error) {
          if (error?.code === 'ENOENT') {
            released = true
            return
          }
          throw new Error(`cannot read development port claim ${claimPath}: ${error instanceof Error ? error.message : String(error)}`)
        }
        if (claim.claimId !== claimId) {
          throw new Error(`development port claim ownership changed before release: ${claimPath}`)
        }
        await rm(claimPath)
        released = true
      },
    }
  }

  throw new Error(`cannot claim a development port on ${host} after ${maximumAttempts} attempts`)
}
