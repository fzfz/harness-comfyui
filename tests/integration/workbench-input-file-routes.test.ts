import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import { WorkbenchInputFileService } from '../../src/host/generation/input-file-service.ts'
import type { GenerationWebServer } from '../../src/host/generation/media-routes.ts'
import { registerInputFileRoutes } from '../../src/host/workbench/input-file-routes.ts'
import { resolveInputImages } from '../../src/host/workbench/input-images.ts'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'workbench-input-preview-'))
  const database = new DatabaseSync(':memory:')
  const files = new WorkbenchInputFileService({ database, directory: root, maxFileBytes: 1024 })
  const bytes = await sharp({ create: { width: 2, height: 3, channels: 3, background: '#ace' } }).png().toBuffer()
  const imported = await files.importFile({ name: 'reference.png', media_type: 'image/png', bytes })
  const routes: Parameters<GenerationWebServer['register']>[0][] = []
  const disposeRoute = registerInputFileRoutes({ register(route) {
    routes.push(route)
    return () => { routes.splice(routes.indexOf(route), 1) }
  } }, files)
  const server = createServer((request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname
    const route = routes.filter(route => path === route.path || path.startsWith(`${route.path}/`))
      .sort((left, right) => right.path.length - left.path.length)[0]
    if (route) void route.handler(request, response)
    else { response.writeHead(404); response.end() }
  })
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Input preview HTTP fixture did not listen.')
  const services: Parameters<typeof resolveInputImages>[0] = {
    images: {
      resolve: async () => files.resolve(imported.file_id),
      upload: async () => { throw new Error('Input previews do not upload image files.') },
    },
    runtime: {} as Parameters<typeof resolveInputImages>[0]['runtime'],
  }
  const [image] = await resolveInputImages(services, [{ image_ref_id: 'selected', purpose: 'both', reference_requirement: '', source: { kind: 'uploaded_file', file_id: imported.file_id } }], new AbortController().signal)
  return { bytes, previewUrl: new URL(image!.url!, `http://127.0.0.1:${address.port}`), async close() {
    disposeRoute()
    await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()) })
    database.close()
    await rm(root, { recursive: true, force: true })
  } }
}

it('serves the generated input preview URL through the official segment prefix matching contract', async () => {
  const test = await fixture()
  try {
    const response = await fetch(test.previewUrl)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(test.bytes)
    expect(test.previewUrl.pathname).toMatch(/^\/api\//u)
    const head = await fetch(test.previewUrl, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('content-type')).toBe('image/png')
    expect((await head.arrayBuffer()).byteLength).toBe(0)
  } finally { await test.close() }
})

it('returns actionable HTTP method support and missing-file status on the registered input route', async () => {
  const test = await fixture()
  try {
    const method = await fetch(test.previewUrl, { method: 'POST' })
    expect(method.status).toBe(405)
    expect(method.headers.get('allow')).toBe('GET, HEAD')
    await method.arrayBuffer()
    const missing = new URL(test.previewUrl)
    missing.pathname = missing.pathname.replace(/file_[^/]+$/u, 'file_missing')
    const response = await fetch(missing)
    expect(response.status).toBe(404)
    expect((await response.arrayBuffer()).byteLength).toBe(0)
  } finally { await test.close() }
})
