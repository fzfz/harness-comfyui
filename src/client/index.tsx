import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'

export const name = 'harness-comfyui'
export const inject = ['remote'] as const

type ClientContextWithRemote = ClientContext & {
  readonly remote: {
    $mount(contribution: TypertRemoteContribution): Promise<() => Promise<void>>
  }
}

/** Keep the public Client package seam available without occupying native UI slots. */
export function apply(_ctx: ClientContext): void {}

/** Mount this package's generated Remote contribution around the Client plugin. */
export async function applyWithRemote(
  ctx: ClientContext,
  contribution: TypertRemoteContribution,
): Promise<() => Promise<void>> {
  const remote = (ctx as ClientContextWithRemote).remote
  const unmount = await remote.$mount(contribution)
  try {
    apply(ctx)
    let disposed = false
    return async () => {
      if (disposed) return
      disposed = true
      await unmount()
    }
  } catch (error) {
    await unmount()
    throw error
  }
}
