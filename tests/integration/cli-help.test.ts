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

describe('public CLI progressive help', () => {
  it.each(['anima', 'krea2-anime', 'wai-sdxl'])('%s validator explains input before reading stdin', async name => {
    const result = await invoke(`.agents/skills/${name}-prompt-builder/scripts/validate-output.mjs`, ['--help'])
    expect(result.code).toBe(0)
    expect(result.err).toBe('')
    expect(result.out).toContain('下一步')
    expect(result.out).toContain('EOF')
    expect(result.out).toContain('positive_prompt')
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
  it.each(['anima', 'krea2-anime', 'wai-sdxl'])('%s help examples pass the public validator', async name => {
    const root = `.agents/skills/${name}-prompt-builder/scripts/`
    const data = JSON.parse(await readFile(root + 'cli-help.json', 'utf8'))
    for (const mode of Object.keys(data.modes)) {
      const help = await invoke(root + 'validate-output.mjs', [...(mode ? [mode] : []), '--help'])
      expect(help.code).toBe(0)
      expect(help.err).toBe('')
      expect(help.out).toContain('下一步')
    }
    for (const args of [['--unknown'], ['--unknown', '--help']]) {
      const rejected = await invoke(root + 'validate-output.mjs', args, '')
      expect(rejected.code).not.toBe(0)
      expect(rejected.err).toContain('--help')
    }
    const result = await invoke(root + 'validate-output.mjs', ['--quiet'], JSON.stringify(data.example))
    expect(result.code).toBe(0)
    expect(result.err).toBe('')
    expect(JSON.parse(result.out)).toEqual(data.example)
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

})
