import nodeScriptRuntimeConfig from '../../config/node-script-runtime.json' with { type: 'json' }
import { parseNodeScriptRuntime } from '../../config/node-script-runtime-schema.ts'

const nodeScriptRuntime = parseNodeScriptRuntime(nodeScriptRuntimeConfig)

export function nodeScriptEnvironment(executable: string): NodeJS.ProcessEnv {
  return (executable.endsWith('.mjs') || executable === process.execPath)
    && process.versions.electron !== undefined
    ? { ...process.env, ...nodeScriptRuntime.electronNodeEnvironment }
    : process.env
}
