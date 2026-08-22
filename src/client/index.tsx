/// <reference path="./remote.d.ts" />

import type { ClientContext, ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'

import harnessComfyuiRemote from 'harness-comfyui/remote'

import { LayoutController } from './workbench/layout-contract.ts'
import { createWorkbenchRoot } from './workbench/root.tsx'
import { createSessionSidebar } from './workbench/session-sidebar.tsx'
import { installThemeProjection } from './workbench/theme-projection.ts'

export const name = 'harness-comfyui'
export const inject = ['slots', 'sessions', 'remote', 'theme', 'inputTriggers'] as const

/** Mount the generated Remote contribution and compose the project-owned root shell. */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const remoteUnmount = await ctx.remote.$mount(harnessComfyuiRemote)
  const layoutService = new LayoutController()
  let disposeRoot: (() => void)

  try {
    disposeRoot = ctx.slots.register(
      {
        name: 'root',
        children: {
          sidebar: { kind: 'single', scope: 'root' },
          conversation: { kind: 'single', scope: 'session-maybe' },
          details: { kind: 'single', scope: 'session' },
          'shell.overlay': { kind: 'list', scope: 'root' },
        },
      },
      createWorkbenchRoot(layoutService),
    )
  } catch (error) {
    await remoteUnmount()
    throw error
  }

  let disposeSidebar: () => void
  try {
    disposeSidebar = ctx.slots.register(
      { name: 'sidebar', priority: -10 },
      createSessionSidebar(ctx.sessions as unknown as Pick<ISessions, 'open'>),
    )
  } catch (error) {
    disposeRoot()
    await remoteUnmount()
    throw error
  }

  let disposeService: () => Promise<void>
  try {
    disposeService = ctx.reflect.provide('layout', layoutService)
  } catch (error) {
    disposeSidebar()
    disposeRoot()
    await remoteUnmount()
    throw error
  }

  let disposeTheme: () => void
  try {
    disposeTheme = installThemeProjection(ctx)
  } catch (error) {
    await disposeService()
    disposeSidebar()
    disposeRoot()
    await remoteUnmount()
    throw error
  }

  return async () => {
    disposeTheme()
    await disposeService()
    disposeSidebar()
    disposeRoot()
    await remoteUnmount()
  }
}
