import nodeScriptRuntime from '../../config/node-script-runtime.json' with { type: 'json' }

export function nodeScriptEnvironment(executable: string): NodeJS.ProcessEnv {
  return executable.endsWith('.mjs') && process.versions.electron !== undefined
    ? { ...process.env, ...nodeScriptRuntime.electronNodeEnvironment }
    : process.env
}
