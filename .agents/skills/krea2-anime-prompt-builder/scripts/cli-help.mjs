import { readFileSync } from 'node:fs'
import definition from './cli-help.json' with { type: 'json' }
import { parseHelp } from './cli-help-schema.mjs'
const help = parseHelp(definition)
export const EXIT_CODES = Object.freeze({ success: 0, validation: 2, execution: 1 })
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
    const protocol = help.protocol.map(line => line
      .replaceAll('{success}', String(EXIT_CODES.success))
      .replaceAll('{validation}', String(EXIT_CODES.validation))
      .replaceAll('{execution}', String(EXIT_CODES.execution)))
    const retry = mode ? help.retryInstructions.replaceAll('{retries}', String(help.retries[mode])) : ''
    const lines = [help.name]
    if (mode) lines.push('调用前读取根帮助: ' + cli() + ' --help')
    else lines.push('从本 Skill 目录执行。')
    lines.push('用法: ' + cli() + ' ' + (mode || '[mode]') + ' [--quiet] < input.json')
    if (mode) lines.push(help.modes[mode])
    else lines.push(...protocol)
    if (mode === '') {
      lines.push(...Object.entries(help.modes).map(([key, text]) => (key || '(默认)') + ': ' + text + (key ? '\n  ' + cli() + ' ' + key + ' --help' : '')),
        '默认调用: ' + cli() + ' < input.json', '下一步: 选择当前操作对应的模式帮助。')
    } else {
      const input = help.input
        .replaceAll('{megapixelsDivisor}', String(profiles.validation.megapixels_divisor))
        .replaceAll('{megapixelsTolerancePercent}', String(profiles.validation.maximum_megapixels_relative_difference * 100))
      lines.push('重试次数:', retry, '输入规则:', input, '输入与成功输出 JSON Schema:', JSON.stringify(schema),
        '校验成功后，stdout 返回输入 JSON 对象。',
        '模型路由:', JSON.stringify(profiles.model_routes),
        '输入及成功输出 JSON 示例:', JSON.stringify(help.example),
        '下一步:', help.next.replaceAll('{cli}', cli()))
    }
    process.stdout.write([...lines, ''].join('\n'))
    return
  }
  if (args.includes('--generation-output') && (args.length !== 1 || args[0] !== '--generation-output')) throw new TypeError('--generation-output cannot be combined with another mode')
  await run(args[0] === '--generation-output' ? [] : args)
  if (!process.exitCode && !argv.includes('--quiet')) process.stderr.write('NEXT: ' + help.after[args[0] || '--generation-output'].replaceAll('{cli}', cli()) + '\n')
}