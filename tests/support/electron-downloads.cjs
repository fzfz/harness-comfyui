const { basename, resolve } = require('node:path')

function installElectronTestDownloads({ app, session }, directory) {
  const attached = new WeakSet()
  const attach = current => {
    if (attached.has(current)) return
    attached.add(current)
    current.on('will-download', (_event, item) => {
      item.setSavePath(resolve(directory, basename(item.getFilename())))
    })
  }
  app.on('session-created', attach)
  app.whenReady().then(() => attach(session.defaultSession))
}

module.exports = { installElectronTestDownloads }
