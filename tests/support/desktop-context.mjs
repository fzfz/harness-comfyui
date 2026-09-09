import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadDesktopWorktreeContext } from '../../scripts/desktop/anywhere.mjs'
import { loadDesktopBaseline } from '../../scripts/desktop/baseline.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export async function loadTestDesktopContext() {
  const source = process.env.DSH_DESKTOP_TEST_SOURCE
  if (source === undefined) return loadDesktopWorktreeContext({ repositoryRoot })
  const baseline = await loadDesktopBaseline({ repositoryRoot, desktopRepository: resolve(source) })
  return loadDesktopWorktreeContext({ repositoryRoot, baseline })
}

export function createTestDesktopRequire(context) {
  if (context?.desktopWorkspace === undefined) throw new Error('Test Desktop context does not provide desktopWorkspace')
  return createRequire(resolve(context.desktopWorkspace, 'package.json'))
}
