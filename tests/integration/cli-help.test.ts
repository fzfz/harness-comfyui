import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function invoke(path: string, args: string[], input?: string) {
  return new Promise<{ code: number | null; out: string; err: string }>((done, reject) => {
    const child = spawn(process.execPath, [resolve(path), ...args], { env: { PATH: process.env.PATH }, stdio: 'pipe' })
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

  it('offers local DSH launcher help before preparing a runtime', async () => {
    const result = await invoke('scripts/cli/run.mjs', ['--help'])
    expect(result.code).toBe(0)
    expect(result.out).toContain('下一步')
    expect(result.out).toContain('cli:run')
  })
  it.each(['scripts/desktop/cli.mjs', 'scripts/desktop/production-cli.mjs', 'scripts/worktree/cli.mjs', 'scripts/production/cli.mjs'])('%s describes lifecycle commands without running them', async path => {
    for (const args of [['--help'], ['start', '--help'], ['stop', '--help'], ['restart', '--help'], ['status', '--help'], ['logs', '--help'], ...(/worktree|production\/cli/.test(path) ? [['health', '--help']] : [])]) {
      const result = await invoke(path, args)
      expect(result.code).toBe(0)
      expect(result.err).toBe('')
      expect(result.out).toContain('下一步')
      expect(result.out).toContain('status')
    }
  })
})
