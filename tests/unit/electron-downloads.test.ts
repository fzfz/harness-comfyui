import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'
import { expect, it, vi } from 'vitest'

const { installElectronTestDownloads } = createRequire(import.meta.url)('../support/electron-downloads.cjs')

it('sets the native save path for default and additional Electron sessions before downloads start', async () => {
  const app = Object.assign(new EventEmitter(), { whenReady: () => Promise.resolve() })
  const defaultSession = new EventEmitter()
  const additionalSession = new EventEmitter()
  installElectronTestDownloads({ app, session: { defaultSession } }, '/tmp/desktop-test-downloads')
  app.emit('session-created', defaultSession)
  app.emit('session-created', additionalSession)
  await Promise.resolve()
  expect(defaultSession.listenerCount('will-download')).toBe(1)
  for (const session of [defaultSession, additionalSession]) {
    const setSavePath = vi.fn()
    session.emit('will-download', {}, { getFilename: () => 'desktop-newer.gif', setSavePath })
    expect(setSavePath).toHaveBeenCalledExactlyOnceWith(resolve('/tmp/desktop-test-downloads', 'desktop-newer.gif'))
  }
})
