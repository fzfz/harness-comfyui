import { parseHelpDefinition } from './help-schema.mjs'

export function presentationArguments(argv, valueOptions = []) {
  const args = []
  let quiet = false
  let helpRequested = false
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]
    if (valueOptions.includes(value)) {
      args.push(value)
      if (index + 1 < argv.length) args.push(argv[++index])
    } else if (value === '--quiet') {
      if (quiet) throw new TypeError('--quiet may appear only once; use --help for usage')
      quiet = true
    } else {
      args.push(value)
      if (value === '--help') helpRequested = true
    }
  }
  return { args, quiet, helpRequested }
}

export function renderHelp(definition, argv) {
  const help = parseHelpDefinition(definition)
  if (!presentationArguments(argv, help.valueOptions).helpRequested) return undefined
  const key = argv.slice(0, -1).join(' ')
  if (argv.at(-1) !== '--help' || !Object.hasOwn(help.nodes, key)) throw new TypeError(`Unknown help command. Next: ${help.invocation} --help`)
  const node = help.nodes[key]
  const children = Object.entries(help.nodes).filter(([name]) => name && name.split(' ').slice(0, -1).join(' ') === key)
  return [node.summary, '', `用法: ${help.invocation}${key ? ` ${key}` : ''} --help`, ...(help.commonDetails ?? []).concat(node.details).map(line => line.replaceAll('{cli}', help.invocation)),
    ...children.map(([name, child]) => `\n${name}: ${child.summary}\n  ${help.invocation} ${name} --help`),
    '', '下一步:', ...node.next.map(line => line.replaceAll('{cli}', help.invocation)), ''].join('\n')
}

export function helpHint(definition, argv) {
  const help = parseHelpDefinition(definition)
  let key = ''
  for (let count = 1; count <= argv.length; count++) {
    const candidate = argv.slice(0, count).join(' ')
    if (Object.hasOwn(help.nodes, candidate)) key = candidate
    else break
  }
  return `Next: ${help.invocation}${key ? ` ${key}` : ''} --help`
}

export function nextSteps(definition, key, quiet = false, values = {}) {
  if (quiet) return
  const help = parseHelpDefinition(definition)
  const node = help.nodes[key]
  if (!node) throw new TypeError(`CLI result guidance is missing for ${key}`)
  const lines = node.after.map(line => line.replaceAll('{cli}', help.invocation).replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? values[name] : match))
  process.stderr.write(`NEXT: ${lines.join('\nNEXT: ')}\n`)
}

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}
