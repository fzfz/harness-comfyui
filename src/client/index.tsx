/// <reference path="./remote.d.ts" />

import type { ClientContext, ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type { InputTriggerServiceContract } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'

import harnessComfyuiRemote from 'harness-comfyui/remote'

import { LayoutController } from './workbench/layout-contract.ts'
import { createWorkbenchRoot } from './workbench/root.tsx'
import { createSessionSidebar } from './workbench/session-sidebar.tsx'
import { createSessionHeader } from './workbench/session-header.tsx'
import { createConversationView } from './workbench/conversation-view.tsx'
import { createComposerBar } from './workbench/composer-bar.tsx'
import { createResultsPanel } from './workbench/results-panel.tsx'
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

  let disposeDetails: () => void
  try {
    disposeDetails = ctx.slots.register(
      { name: 'details', priority: -10 },
      createResultsPanel() as never,
    )
  } catch (error) {
    disposeRoot()
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
    disposeDetails()
    disposeRoot()
    await remoteUnmount()
    throw error
  }

  let disposeSessionHeader: () => void
  try {
    disposeSessionHeader = ctx.slots.inject(
      'conversation.session.header' as never,
      () => ctx.slots.register(
        { name: 'conversation.session.header', priority: -10 } as never,
        createSessionHeader() as never,
      ),
    )
  } catch (error) {
    disposeSidebar()
    disposeDetails()
    disposeRoot()
    await remoteUnmount()
    throw error
  }

  let disposeService: () => Promise<void>
  let disposeConversationView: () => void
  try {
    disposeConversationView = ctx.slots.inject(
      'conversation.view' as never,
      () => ctx.slots.register(
        { name: 'conversation.view', id: 'chat', order: 0, priority: -10 } as never,
        createConversationView() as never,
      ),
    )
  } catch (error) {
    disposeSessionHeader()
    disposeSidebar()
    disposeDetails()
    disposeRoot()
    await remoteUnmount()
    throw error
  }

  let disposeComposerBar: () => void
  try {
    disposeComposerBar = ctx.slots.inject(
      'conversation.composer.bar' as never,
      () => ctx.slots.register(
        { name: 'conversation.composer.bar', priority: -10 } as never,
        createComposerBar({
          sessions: ctx.sessions as unknown as Pick<ISessions, 'scope'>,
          inputTriggers: ctx.inputTriggers as InputTriggerServiceContract,
        }) as never,
      ),
    )
  } catch (error) {
    disposeConversationView()
    disposeSessionHeader()
    disposeSidebar()
    disposeDetails()
    disposeRoot()
    await remoteUnmount()
    throw error
  }

  try {
    disposeService = ctx.reflect.provide('layout', layoutService)
  } catch (error) {
    disposeComposerBar()
    disposeConversationView()
    disposeSessionHeader()
    disposeSidebar()
    disposeDetails()
    disposeRoot()
    await remoteUnmount()
    throw error
  }

  let disposeTheme: () => void
  try {
    disposeTheme = installThemeProjection(ctx)
  } catch (error) {
    await disposeService()
    disposeComposerBar()
    disposeConversationView()
    disposeSessionHeader()
    disposeSidebar()
    disposeDetails()
    disposeRoot()
    await remoteUnmount()
    throw error
  }

  return async () => {
    disposeTheme()
    await disposeService()
    disposeComposerBar()
    disposeConversationView()
    disposeSessionHeader()
    disposeSidebar()
    disposeDetails()
    disposeRoot()
    await remoteUnmount()
  }
}
