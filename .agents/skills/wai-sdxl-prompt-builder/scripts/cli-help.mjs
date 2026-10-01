import { readFileSync } from 'node:fs'
import definition from './cli-help.json' with { type: 'json' }
import { parseHelp } from './cli-help-schema.mjs'
const help = parseHelp(definition)
const cli = () => `ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals 'scripts/validate-output.mjs'`
export function errorGuide() {
  if (process.exitCode) process.stderr.write(`NEXT: ${help.failure.replaceAll('{cli}', cli())}\n`)
}
export async function runWithHelp(run) {
  const argv = process.argv.slice(2)
  if (argv.filter(arg => arg === '--quiet').length > 1) throw new TypeError('--quiet may appear only once')
  const args = argv.filter(arg => arg !== '--quiet')
  if (args.includes('--help')) {
    const mode = args.slice(0, -1).join(' ')
    if (args.at(-1) !== '--help' || !Object.hasOwn(help.modes, mode)) throw new TypeError('Unknown help mode; use --help')
    const schema = JSON.parse(readFileSync(new URL('../references/generation-output-schema.json', import.meta.url), 'utf8'))
    const profiles = JSON.parse(readFileSync(new URL('../references/generation-profiles.json', import.meta.url), 'utf8'))
    const lines = [help.name, help.output, '用法: ' + cli() + ' [mode] [--quiet] < input.json']
    if (mode === '--prompt-format') {
      lines.push(help.modes[mode], help.format, 'JSON 示例:', JSON.stringify(help.formatExample, null, 2),
        '格式说明（相对 Skill 目录）: ' + help.formatReference,
        '下一步:', cli() + ' --prompt-format < input.json')
    } else if (mode === '--print-input-template') {
      lines.push(help.modes[mode], '下一步:', cli() + ' --print-input-template < /dev/null > input.json',
        cli() + ' --prompt-format --help')
    } else {
      lines.push(...Object.entries(help.modes).map(([key, text]) => `${key || '(默认)'}: ${text}${key ? '\n  ' + cli() + ' ' + key + ' --help' : ''}`),
        help.input, JSON.stringify(schema, null, 2), '模型路由: ' + JSON.stringify(profiles.model_routes),
        'JSON 示例:', JSON.stringify(help.example, null, 2), '下一步:', help.next.replaceAll('{cli}', cli()))
    }
    process.stdout.write([...lines, ''].join('\n'))
    return
  }
  await run(args)
  if (!process.exitCode && !argv.includes('--quiet')) process.stderr.write(`NEXT: ${help.after[args[0] || ''].replaceAll('{cli}', cli())}\n`)
}
