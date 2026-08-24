import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  GenerationSourceCli,
  runSourceCliProcess,
  type SourceCliProcess,
} from '../../src/host/generation/source-cli.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function success(result: unknown): string {
  return JSON.stringify({
    status: 'ok',
    message: null,
    results: [result],
    page: 1,
    page_size: 1,
    total_count: 1,
  })
}

const workflow = {
  version: 0.4,
  nodes: [{ id: 1, type: 'SaveImage', widgets_values: ['output'] }],
  links: [],
}

describe('GenerationSourceCli', () => {
  it('runs a local mjs Source CLI through Node when the script has no executable mode', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'harness-comfyui-source-cli-'))
    temporaryDirectories.push(directory)
    const script = join(directory, 'source-read.mjs')
    writeFileSync(script, 'process.stdout.write(JSON.stringify(process.argv.slice(2)))\n', { mode: 0o600 })

    const result = await runSourceCliProcess(script, ['instance', '--id', '2'], new AbortController().signal)

    expect(result).toEqual({
      exitCode: 0,
      stdout: '["instance","--id","2"]',
      stderr: '',
    })
  })

  it('aborts a running CLI and reports process, stderr and output-limit failures', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'harness-comfyui-source-cli-errors-'))
    temporaryDirectories.push(directory)
    const waiting = join(directory, 'waiting.mjs')
    const stderr = join(directory, 'stderr.mjs')
    const large = join(directory, 'large.mjs')
    writeFileSync(waiting, 'setInterval(() => undefined, 1000)\n', { mode: 0o600 })
    writeFileSync(stderr, 'process.stderr.write("source warning")\n', { mode: 0o600 })
    writeFileSync(large, 'process.stdout.write("x".repeat(33 * 1024 * 1024))\n', { mode: 0o600 })

    const preAborted = new AbortController()
    preAborted.abort()
    await expect(runSourceCliProcess(waiting, [], preAborted.signal)).rejects.toMatchObject({ name: 'AbortError' })

    const controller = new AbortController()
    const pending = runSourceCliProcess(waiting, [], controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })

    await expect(runSourceCliProcess(stderr, [], new AbortController().signal)).resolves.toMatchObject({
      exitCode: 0,
      stderr: 'source warning',
    })
    await expect(runSourceCliProcess(join(directory, 'missing-command'), [], new AbortController().signal))
      .rejects.toMatchObject({ code: 'SOURCE_QUERY_FAILED' })
    await expect(runSourceCliProcess(large, [], new AbortController().signal))
      .rejects.toMatchObject({ code: 'SOURCE_RESPONSE_TOO_LARGE' })
  })

  it('reads and validates an instance source without changing the CLI protocol', async () => {
    const process = vi.fn<SourceCliProcess>(async () => ({
      exitCode: 0,
      stdout: success({
        id: 2,
        title: 'win3080',
        url: 'http://192.168.110.122:8188/',
        credential_type: 'none',
      }),
      stderr: '',
    }))
    const source = new GenerationSourceCli({ executable: '/source-read.mjs', port: 18093, process })

    await expect(source.readInstance('2')).resolves.toEqual({
      id: '2',
      title: 'win3080',
      url: 'http://192.168.110.122:8188/',
      credentialType: 'none',
      authorization: null,
    })
    expect(process).toHaveBeenCalledWith(
      '/source-read.mjs',
      ['--port', '18093', '--timeout-ms', '120000', 'instance', '--id', '2'],
      expect.any(AbortSignal),
    )
  })

  it('projects a TemplateBundle and preserves the missing output-node declaration for the preparer gate', async () => {
    const process = vi.fn<SourceCliProcess>(async () => ({
      exitCode: 0,
      stdout: success({
        id: 34,
        title: 'Anima',
        revision_number: 7,
        workflow_sha256: 'a'.repeat(64),
        workflow_json: workflow,
        config_revision: 2,
        dimension_strategy: 'explicit',
        parameters_json: [{
          parameter_id: 'positive_prompt',
          kind: 'positive_prompt',
          value_type: 'string',
          default_value: '',
          required: false,
          visible: true,
        }],
        bindings_json: [{
          binding_id: 'binding:positive_prompt',
          parameter_id: 'positive_prompt',
          operation: 'replace_input',
          node_id: '1',
          input_name: 'filename_prefix',
          widget_index: 0,
        }],
        expected_output_node_ids_json: null,
      }),
      stderr: '',
    }))
    const source = new GenerationSourceCli({ executable: '/source-read.mjs', port: 18093, process })

    const bundle = await source.readTemplate('34')

    expect(bundle).toMatchObject({
      id: '34',
      title: 'Anima',
      revisionNumber: 7,
      configRevision: 2,
      parameters: [{ parameterId: 'positive_prompt', defaultValue: '' }],
      bindings: [{ parameterId: 'positive_prompt', nodeId: '1', widgetIndex: 0 }],
      expectedOutputNodeIds: null,
    })
  })

  it('validates an explicit non-empty output-node filter', async () => {
    const process = vi.fn<SourceCliProcess>(async () => ({
      exitCode: 0,
      stdout: success({
        id: 34,
        title: 'Anima',
        revision_number: 7,
        workflow_sha256: 'a'.repeat(64),
        workflow_json: workflow,
        config_revision: 2,
        dimension_strategy: 'explicit',
        parameters_json: [],
        bindings_json: [],
        expected_output_node_ids_json: [1],
      }),
      stderr: '',
    }))
    const source = new GenerationSourceCli({ executable: '/source-read.mjs', port: 18093, process })
    await expect(source.readTemplate('34')).resolves.toMatchObject({ expectedOutputNodeIds: ['1'] })
  })

  it('rejects an invalid success envelope and a failed CLI process with stable error codes', async () => {
    const invalid = new GenerationSourceCli({
      executable: '/source-read.mjs',
      port: 18093,
      process: vi.fn(async () => ({ exitCode: 0, stdout: '{}', stderr: '' })),
    })
    await expect(invalid.readTemplate('34')).rejects.toMatchObject({ code: 'SOURCE_PROTOCOL_ERROR' })

    const failed = new GenerationSourceCli({
      executable: '/source-read.mjs',
      port: 18093,
      process: vi.fn(async () => ({ exitCode: 1, stdout: '', stderr: '{"message":"not found"}' })),
    })
    await expect(failed.readInstance('2')).rejects.toMatchObject({ code: 'SOURCE_QUERY_FAILED' })
  })
})
