export function parseHelp(value) {
  for (const name of ['name', 'input', 'output', 'failure', 'next', 'format', 'formatReference']) {
    if (typeof value?.[name] !== 'string' || !value[name]) throw new TypeError(`CLI help ${name} must be a non-empty string`)
  }
  if (!value.modes || !Object.hasOwn(value.modes, '') || Object.values(value.modes).some(text => typeof text !== 'string')) throw new TypeError('CLI help modes must define the default mode')
  if (!value.example || typeof value.example !== 'object') throw new TypeError('CLI help requires an example object')
  if (!value.after || Object.keys(value.modes).some(mode => typeof value.after[mode] !== 'string' || !value.after[mode])) throw new TypeError('CLI help requires next steps for each mode')
  return value
}
