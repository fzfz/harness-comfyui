import { spawn } from 'node:child_process'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function invoke(path: string, args: string[], input?: string, cwd?: string) {
  return new Promise<{ code: number | null; out: string; err: string }>((done, reject) => {
    const child = spawn(process.execPath, [resolve(path), ...args], { cwd, env: { PATH: process.env.PATH }, stdio: 'pipe' })
    let out = ''; let err = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Help waited for stdin or runtime: ${path} ${args.join(' ')}`)) }, 5000)
    child.stdout.on('data', chunk => { out += chunk })
    child.stderr.on('data', chunk => { err += chunk })
    child.on('error', reject)
    child.on('close', code => { clearTimeout(timer); done({ code, out, err }) })
    if (input !== undefined) child.stdin.end(input)
  })
}

function jsonLineAfter(output: string, heading: string) {
  return JSON.parse(output.split(heading + '\n')[1].split('\n')[0])
}

describe('public CLI progressive help', () => {
  it.each(['anima', 'krea2-anime', 'wai-sdxl'])('%s validator explains input before reading stdin', async name => {
    const result = await invoke(`.agents/skills/${name}-prompt-builder/scripts/validate-output.mjs`, ['--help'])
    expect(result.code).toBe(0)
    expect(result.err).toBe('')
    expect(result.out).toContain('下一步')
    expect(result.out).toContain('--generation-output --help')
    expect(result.out).not.toContain('最多重试')
    expect(result.out).toContain('退出码 0')
    expect(result.out).toContain('退出码 2')
  })
  it.each(['anima', 'krea2-anime', 'wai-sdxl'])('%s help and error hints use a Skill-relative path from a directory with spaces', async name => {
    const source = resolve(`.agents/skills/${name}-prompt-builder`)
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'harness skill cli help '))
    const copiedSkill = join(temporaryRoot, "copied skill's files")
    try {
      await cp(source, copiedSkill, { recursive: true })
      const script = resolve(copiedSkill, 'scripts/validate-output.mjs')
      const cli = `ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals 'scripts/validate-output.mjs'`
      const help = await invoke(script, ['--help'], undefined, copiedSkill)
      expect(help.code).toBe(0)
      expect(help.out).toContain(`用法: ${cli} [mode] [--quiet] < input.json`)
      expect(help.out).toContain(`${cli} < input.json`)
      expect(help.out).toContain('从本 Skill 目录')
      expect(help.out).not.toContain(script)

      const definition = JSON.parse(await readFile(join(copiedSkill, 'scripts/cli-help.json'), 'utf8'))
      const invalid = await invoke(script, ['--quiet'], '{}', copiedSkill)
      expect(invalid.code).toBe(2)
      expect(invalid.err).toContain(`NEXT: ${definition.failure.replaceAll('{cli}', cli)}\n`)
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  })
  it('ANIMA template usage matches the empty-stdin command', async () => {
    const script = '.agents/skills/anima-prompt-builder/scripts/validate-output.mjs'
    const help = await invoke(script, ['--print-input-template', '--help'])
    const usage = help.out.split('\n').find(line => line.startsWith('用法:'))
    expect(usage).toContain('--print-input-template [--quiet] < /dev/null > input.json')
    expect(help.out).toContain('最多重试 0 次')
    const result = await invoke(script, ['--print-input-template', '--quiet'], '')
    expect(result.code).toBe(0)
    expect(result.err).toBe('')
    expect(JSON.parse(result.out)).toEqual(jsonLineAfter(help.out, '输出 JSON 示例:'))
  })
  it.each(['anima', 'wai-sdxl'])('%s generation example uses the format result and model profile', async name => {
    const root = `.agents/skills/${name}-prompt-builder/`
    const generation = await invoke(root + 'scripts/validate-output.mjs', ['--generation-output', '--help'])
    const format = await invoke(root + 'scripts/validate-output.mjs', ['--prompt-format', '--help'])
    const example = jsonLineAfter(generation.out, '输入及成功输出 JSON 示例:')
    const formatted = jsonLineAfter(format.out, '成功 JSON 示例:')
    const profiles = JSON.parse(await readFile(root + 'references/generation-profiles.json', 'utf8'))
    expect(example.positive_prompt).toBe(formatted.prompt_text)
    const route = profiles.model_routes[example.model_route]
    expect(example.negative_mode).toBe(route.negative_mode)
    expect(example.negative_prompt).toBe(route.base_negative_items.join(', '))
  })
  it.each(['anima', 'krea2-anime', 'wai-sdxl'])('%s help examples pass the public validator', async name => {
    const root = `.agents/skills/${name}-prompt-builder/scripts/`
    const data = JSON.parse(await readFile(root + 'cli-help.json', 'utf8'))
    for (const mode of Object.keys(data.modes)) {
      const help = await invoke(root + 'validate-output.mjs', [...(mode ? [mode] : []), '--help'])
      expect(help.code).toBe(0)
      expect(help.err).toBe('')
      expect(help.out).toContain('下一步')
      const usage = help.out.split('\n').find(line => line.startsWith('用法:'))!
      if (mode) {
        expect(usage).toContain(`'scripts/validate-output.mjs' ${mode} [--quiet]`)
        expect(usage).not.toContain('[mode]')
        const rootEntrance = help.out.indexOf('调用前读取根帮助:')
        expect(rootEntrance).toBeGreaterThanOrEqual(0)
        expect(rootEntrance).toBeLessThan(help.out.indexOf(usage))
        expect(help.out).not.toContain('退出码 2：')
        expect(help.out).not.toContain('结果复用:')
        expect(help.out).not.toContain('输入校验失败时，按 path')
      } else {
        expect(help.out.indexOf('从本 Skill 目录执行。')).toBeLessThan(help.out.indexOf(usage))
        expect(help.out).not.toContain('根帮助:')
      }
      expect([...help.out].length).toBeLessThanOrEqual(8192)
    }
    const rejectedArguments = [['--unknown'], ['--unknown', '--help']]
    if (name === 'krea2-anime') {
      for (const mode of ['--prompt-format', '--print-input-template']) rejectedArguments.push([mode], [mode, '--help'])
    }
    if (name === 'wai-sdxl') rejectedArguments.push(['--print-input-template'], ['--print-input-template', '--help'])
    for (const args of rejectedArguments) {
      const rejected = await invoke(root + 'validate-output.mjs', args, '')
      expect(rejected.code).not.toBe(0)
      expect(rejected.err).toContain('--help')
    }
    const generation = await invoke(root + 'validate-output.mjs', ['--generation-output', '--help'])
    const example = jsonLineAfter(generation.out, '输入及成功输出 JSON 示例:')
    const result = await invoke(root + 'validate-output.mjs', ['--quiet'], JSON.stringify(example))
    expect(result.code).toBe(0)
    expect(result.err).toBe('')
    expect(JSON.parse(result.out)).toEqual(example)
    if (name !== 'krea2-anime') {
      const formatted = await invoke(root + 'validate-output.mjs', ['--prompt-format', '--quiet'], JSON.stringify(data.formatExample))
      expect(formatted.code).toBe(0)
      expect(formatted.err).toBe('')
      expect(JSON.parse(formatted.out).result).toBe('success')
    }
    const invalid = await invoke(root + 'validate-output.mjs', ['--quiet'], '{}')
    expect(invalid.code).not.toBe(0)
    expect(invalid.err).toContain('model_route')
    expect(invalid.err).toContain('NEXT:')
  })

  it.each(['anima', 'krea2-anime', 'wai-sdxl'])('%s root owns common protocol and mode help owns its structure and retry count', async name => {
    const root = `.agents/skills/${name}-prompt-builder/scripts/`
    const result = await invoke(root + 'validate-output.mjs', ['--help'])
    expect(result.code).toBe(0)
    expect(result.err).toBe('')
    expect(result.out).not.toContain('输入 JSON Schema:')
    expect(result.out).toContain('--generation-output --help')
    const generation = await invoke(root + 'validate-output.mjs', ['--generation-output', '--help'])
    expect(generation.out).toContain('最多重试 1 次')
    expect(result.out).toContain('退出码 0')
    expect(result.out).toContain('退出码 2')
    expect(result.out).toContain('退出码 1')
    expect(result.out).toContain('violations')
    expect(result.out).toContain('path')
    expect(result.out).toContain('message')
    expect(result.out).toContain('结果复用:')
    expect(generation.out).not.toContain('退出码 2：')
    expect(generation.out).not.toContain('结果复用:')
    expect(generation.out).toContain('输入与成功输出 JSON Schema:')
    expect(generation.out.match(/JSON Schema:/g)).toHaveLength(1)
    expect(generation.out).toContain('--generation-output < input.json')
    expect(generation.out).not.toContain('下方 JSON 示例')
    const example = jsonLineAfter(generation.out, '输入及成功输出 JSON 示例:')
    const explicit = await invoke(root + 'validate-output.mjs', ['--generation-output', '--quiet'], JSON.stringify(example))
    expect(explicit.code).toBe(0)
    expect(JSON.parse(explicit.out)).toEqual(example)
    const defaultResult = await invoke(root + 'validate-output.mjs', [], JSON.stringify(example))
    const explicitResult = await invoke(root + 'validate-output.mjs', ['--generation-output'], JSON.stringify(example))
    expect(defaultResult).toEqual(explicitResult)
    const defaultFailure = await invoke(root + 'validate-output.mjs', [], '{}')
    const explicitFailure = await invoke(root + 'validate-output.mjs', ['--generation-output'], '{}')
    expect(defaultFailure).toEqual(explicitFailure)
    expect(result.out).not.toContain('格式说明（相对 Skill 目录）')
    if (name !== 'krea2-anime') {
      const format = await invoke(root + 'validate-output.mjs', ['--prompt-format', '--help'])
      const inputSchema = JSON.parse(format.out.split('输入 JSON Schema:' + String.fromCharCode(10))[1].split(String.fromCharCode(10) + '输出 JSON Schema:')[0])
      const outputSchema = JSON.parse(format.out.split('输出 JSON Schema:' + String.fromCharCode(10))[1].split(String.fromCharCode(10) + '权重语法:')[0])
      expect(inputSchema.required).toEqual([name === 'anima' ? 'slots' : 'positions', 'display_text'])
      expect(inputSchema.additionalProperties).toBe(false)
      expect(Object.keys(outputSchema.properties)).toEqual(['kind', 'result', 'contract_version', 'prompt_text', 'display_text'])
      expect(outputSchema.properties.kind.const).toBe('noobai_assistant_prompt')
      expect(outputSchema.properties.contract_version.const).toBe('1.0.0')
      expect(format.out).not.toContain('references/')
    }
  })
})
