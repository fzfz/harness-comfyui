import { drainPendingRequests } from '../pending-requests.ts'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import defaults from '../../../config/base.json' with { type: 'json' }
import type { ConfigurationProfileValues } from '../../../config/schema.ts'
import type { CliHandler } from './schema.ts'

export async function startCliServer(createHandler: (origin: string) => CliHandler, configuration: ConfigurationProfileValues['cliServer'] = defaults.cliServer as ConfigurationProfileValues['cliServer']) {
  let handler: CliHandler
  const pending = new Set<Promise<unknown>>()
  const server = createServer((request, response) => {
    const call = Promise.resolve().then(() => handler(request, response))
    pending.add(call)
    void call.catch(() => response.destroy()).finally(() => pending.delete(call))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(configuration.port, configuration.host, () => { server.removeListener('error', reject); resolve() })
  })
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const close = async () => {
    const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    server.closeAllConnections()
    await closed
    await drainPendingRequests(pending, configuration.shutdownTimeoutMs, 'CLI requests did not stop within cliServer.shutdownTimeoutMs. Check the current DSH logs for CLI requests that are still running.')
  }
  try { handler = createHandler(origin) } catch (error) { await close(); throw error }
  return { origin, close }
}
