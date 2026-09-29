import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import Schema from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import product from '../../../config/product-agent.json' with { type: 'json' }
export interface Config { readonly task: string; readonly preset: string }
export const Config = Schema.object({ task: Schema.string().required(), preset: Schema.string().min(1).default(product.preset.id) })
export interface CliRunnerServices {
  agentPresets: { mount(ctx: Context, id: string): Promise<{ readonly id: string }> }
  agentDefaultModel: { currentSelection(): ModelSelection }
  appExit(code: number): void
}
