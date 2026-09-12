export function parseHelpDefinition(value) {
  if (!value || typeof value !== 'object' || typeof value.invocation !== 'string' || !value.invocation || !value.nodes || typeof value.nodes !== 'object') throw new TypeError('CLI help requires invocation and nodes')
  for (const [name, node] of Object.entries(value.nodes)) {
    if (!node || typeof node !== 'object' || typeof node.summary !== 'string' || !node.summary || !Array.isArray(node.details) || !node.details.every(line => typeof line === 'string') || !Array.isArray(node.next) || !node.next.length || !node.next.every(line => typeof line === 'string' && line.length)) throw new TypeError(`CLI help node ${name} requires summary, details and next`)
    if (!Array.isArray(node.after) || !node.after.every(line => typeof line === 'string' && line.length)) throw new TypeError(`CLI help node ${name} requires after`)
    if (name && !Object.hasOwn(value.nodes, name.split(' ').slice(0, -1).join(' '))) throw new TypeError(`CLI help node ${name} requires its parent`)
  }
  if (!Object.hasOwn(value.nodes, '')) throw new TypeError('CLI help requires a root node')
  if (value.messages !== undefined && (!value.messages || Object.values(value.messages).some(message => typeof message !== 'string'))) throw new TypeError('CLI help messages must be strings')
  for (const key of ['valueOptions', 'commonDetails', 'providerErrorCodes']) {
    if (value[key] !== undefined && (!Array.isArray(value[key]) || !value[key].every(item => typeof item === 'string' && item.length))) throw new TypeError(`CLI help ${key} must be a string array`)
  }
  return value
}

export function parseManagedHelpDefinition(value) {
  const help = parseHelpDefinition(value)
  for (const key of ['splitCommand', 'invalidCommand', 'invalidProperties', 'invalidOption', 'emptyResults', 'availableResults', 'providerFailure']) {
    if (typeof help.messages?.[key] !== 'string' || !help.messages[key]) throw new TypeError(`Managed CLI help requires message ${key}`)
  }
  if (!Array.isArray(help.providerErrorCodes) || help.providerErrorCodes.length === 0) throw new TypeError('Managed CLI help requires providerErrorCodes')
  return help
}
