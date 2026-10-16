import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'

if (process.env.CLI_RESULT_FILE_TEST_FAULT === 'request') {
  globalThis.fetch = async () => { throw new Error(process.env.CLI_RESULT_FILE_TEST_REQUEST_ERROR) }
}

const open = fs.promises.open
fs.promises.open = async (...args) => {
  const handle = await open(...args)
  if (String(args[0]).endsWith('/result.json')) {
    if (process.env.CLI_RESULT_FILE_TEST_FAULT === 'write') {
      handle.writeFile = async () => { throw new Error('Injected disk write failure') }
    } else if (process.env.CLI_RESULT_FILE_TEST_FAULT === 'close') {
      const close = handle.close.bind(handle)
      let first = true
      handle.close = async () => {
        if (first) { first = false; throw new Error('Injected close failure') }
        await close()
      }
    }
  }
  return handle
}
syncBuiltinESMExports()
