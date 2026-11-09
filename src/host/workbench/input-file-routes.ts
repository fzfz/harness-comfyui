import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import type { WorkbenchInputFileService } from '../generation/input-file-service.ts'
import type { GenerationWebServer } from '../generation/media-routes.ts'
import configuration from '../../workbench/input-files.json' with { type: 'json' }

export function registerInputFileRoutes(webServer: GenerationWebServer, files: WorkbenchInputFileService): () => void {
  return webServer.register({ kind: 'prefix', path: configuration.url_prefix.replace(/\/$/u, ''), async handler(request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, { allow: 'GET, HEAD' }); response.end(); return }
    const controller = new AbortController()
    const abort = () => controller.abort()
    response.once('close', abort)
    try {
      const path = new URL(request.url ?? '', 'http://localhost').pathname
      const id = decodeURIComponent(path.slice(configuration.url_prefix.length))
      const file = await files.resolve(id, controller.signal)
      response.writeHead(200, { 'content-type': file.mediaType, 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' })
      if (request.method === 'HEAD') response.end()
      else await pipeline(createReadStream(file.filePath), response, { signal: controller.signal })
    } catch {
      if (!response.headersSent) { response.writeHead(404); response.end() }
      else response.destroy()
    } finally { response.off('close', abort) }
  } })
}
