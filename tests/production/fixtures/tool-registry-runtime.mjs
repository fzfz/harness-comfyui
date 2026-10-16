import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const localRequire = createRequire(import.meta.url)
const toolsEntry = localRequire.resolve('@deepseek-ai/dsh-tools')
const sdkRequire = createRequire(toolsEntry)
const [{ Context }, { createScope }, toolsModule] = await Promise.all([
  import(pathToFileURL(sdkRequire.resolve('@deepseek-ai/cordis')).href),
  import(pathToFileURL(sdkRequire.resolve('@deepseek-ai/dsh-scope')).href),
  import(pathToFileURL(toolsEntry).href),
])

export const { renderToolsSdk } = toolsModule

export function fixtureTool(name) {
  return {
    name,
    description: name,
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: { type: 'object' }, render: () => [] },
    execute: async () => ({}),
  }
}

export function toolRegistry(services = {}) {
  const root = new Context()
  root.provide('systemPrompt', {
    tools: () => () => {},
    section: () => () => {},
    getSectionOrder: () => 0,
  })
  for (const [name, service] of Object.entries(services)) root.provide(name, service)
  new toolsModule.ToolRuntime(root)
  const scopes = []
  return {
    root,
    scope(agent, parent) {
      const scope = createScope(root, agent, parent === undefined ? undefined : { parent })
      scopes.push(scope)
      return scope
    },
    async dispose() {
      for (const scope of scopes.reverse()) await scope.dispose()
      await root.fiber.dispose()
    },
  }
}
