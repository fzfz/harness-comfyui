import '@deepseek-ai/dsh-llm'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'harness-subagent-accepted': { readonly kind: 'harness-subagent-accepted' }
  }
}
