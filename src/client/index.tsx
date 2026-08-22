/// <reference path="./remote.d.ts" />

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'

import harnessComfyuiRemote from 'harness-comfyui/remote'

export const name = 'harness-comfyui'
export const inject = ['remote'] as const

/** Mount this package's generated Remote contribution without occupying native UI slots. */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  return ctx.remote.$mount(harnessComfyuiRemote)
}
