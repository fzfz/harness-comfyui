import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function help(...args: string[]) {
  return new Promise<string>((done, reject) => {
    const child = spawn(process.execPath, [resolve('scripts/cli/harness-comfyui.mjs'), ...args, '--help'], { env: { PATH: process.env.PATH }, stdio: 'pipe' })
    let output = ''; let error = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('CLI help waited for input or Host')) }, 5000)
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { error += chunk })
    child.on('error', reject)
    child.on('close', code => { clearTimeout(timer); code === 0 ? done(output) : reject(new Error(error)) })
  })
}

describe('managed CLI help discovery', () => {
  it('keeps the public file protocol at the root and links child help to it', async () => {
    const root = await help()
    expect(root).toContain('stdout 只返回该文件的绝对路径和换行')
    expect(root).not.toContain('request_id:')
    expect(root.match(/^JSON value:/gmu)).toHaveLength(1)
    for (const command of [['generation'], ['image'], ['generation', 'submit'], ['generation', 'inspect-template-parameters'], ['generation', 'random-seeds'], ['generation', 'run-inputs'], ['generation', 'resolve-media'], ['image', 'inspect']]) {
      const child = await help(...command)
      expect(child).not.toContain('stdout 只返回该文件的绝对路径和换行')
      expect(child).not.toMatch(/^JSON value:/mu)
      expect(child).toContain('公共文件协议')
      expect(child).toContain('$DSH_HARNESS_COMFYUI_CLI" --help')
    }
  })
  it('labels array counts, numeric values and UTF-16 string lengths with production bounds', async () => {
    const inputs = await help('generation', 'run-inputs')
    expect(inputs).toContain('run_ids: string[]；必填，元素数量为 1 至 20 项')
    const template = await help('generation', 'inspect-template-parameters')
    expect(template).toContain('template_id: string；必填，长度为 1 至 500 个 UTF-16 码元')
    expect(template).toContain('mapped_options[].width: integer；必填，数值至少 1')
    const random = await help('generation', 'random-seeds')
    expect(random).toContain('count: integer；必填，数值为 1 至 20')
    expect(random).toContain('seeds[]: integer；数值为 0 至 2147483647')
    const submit = await help('generation', 'submit')
    expect(submit).toContain('items[].request.loras: object[]；必填，元素数量最多 100 项')
  })
  it('explains nested historical inputs and the media state contract from command help', async () => {
    const inputs = await help('generation', 'run-inputs')
    expect(inputs).toContain('arguments.parameters')
    expect(inputs).toContain('workflow_error.code')
    expect(inputs).toContain('lookup_status: "error"')
    const media = await help('generation', 'resolve-media')
    expect(media).toContain('images[].output_index')
    expect(media).toContain('submission_unknown')
    expect(media).toContain('run_error.code')
  })
  it('provides template value constraints and submit replay decisions at the operation layer', async () => {
    const template = await help('generation', 'inspect-template-parameters')
    expect(template).toContain('allowed_values')
    expect(template).toContain('mapped_options[].width')
    const submit = await help('generation', 'submit')
    expect(submit).toContain('RUN_REQUEST_CONFLICT')
    expect(submit).toContain('submission_unknown')
    expect(submit).toContain('首次提交前')
    expect(submit).toContain('parameter_files')
    expect(submit).toContain('items[].request.parameters 各层对象键: string')
    expect(submit).toContain('最大嵌套 64 层')
  })
})
