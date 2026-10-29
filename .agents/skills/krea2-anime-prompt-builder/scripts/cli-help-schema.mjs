export function parseHelp(value) {
  for (const name of ['name', 'input', 'failure', 'next', 'retryInstructions']) {
    if (typeof value?.[name] !== 'string' || !value[name]) throw new TypeError(`CLI help ${name} must be a non-empty string`)
  }
  if (!value.modes || !Object.hasOwn(value.modes, '') || Object.values(value.modes).some(text => typeof text !== 'string')) throw new TypeError('CLI help modes must define the default mode')
  const modes = Object.keys(value.modes).filter(Boolean)
  if (!value.example || typeof value.example !== 'object') throw new TypeError('CLI help requires an example object')
  if (!value.after || modes.some(mode => typeof value.after[mode] !== 'string' || !value.after[mode])) throw new TypeError('CLI help requires next steps for each mode')
  if (!Array.isArray(value.protocol) || value.protocol.some(line => typeof line !== 'string')) throw new TypeError('CLI help requires protocol explanations')
  if (!value.retries || modes.some(mode => !Number.isInteger(value.retries[mode]) || value.retries[mode] < 0)) throw new TypeError('CLI help requires retry limits for each mode')
  return value
}
