import { resolve } from 'node:path'

import { loadDesktopWorktreeContext } from '../../scripts/desktop/worktree.mjs'

export async function loadTestDesktopContext() {
  const context = await loadDesktopWorktreeContext()
  const source = process.env.DSH_DESKTOP_TEST_SOURCE
  return source === undefined ? context : { ...context, desktopSource: resolve(source) }
}
