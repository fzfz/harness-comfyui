import { contracts } from '#contracts'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'contracts-cli-files-'))
  roots.push(root)
  const readUtf8File = vi.fn((path: string, _maxBytes?: number) => readFile(path, 'utf8'))
  const load = contracts.bind('cliRequest', 'cli-files', {
    readUtf8File, resolvePath: resolve, isAbsolute, dirname, byteLength: text => Buffer.byteLength(text, 'utf8'),
  })
  return { root, readUtf8File, load }
}

const request = { title: 'scene', instance_id: '1', template_id: '2', model: null, parameters: { seed: 7 }, loras: [] }
const firstId = '01234567-89ab-4cde-8fab-0123456789ab'
const secondId = '11234567-89ab-4cde-8fab-0123456789ab'

describe('contract CLI file input', () => {
  it('expands relative and absolute parameter files while preserving ownership and exact UTF-8 text', async () => {
    const { root, load, readUtf8File } = await fixture()
    const prompt = '第一行\r\n第二行\n', layout = '{\n  "layout": "人物位于左侧"\n}\n'
    const promptPath = join(root, 'prompt.txt'), layoutPath = join(root, 'layout.json'), manifestPath = join(root, 'manifest.json')
    await Promise.all([writeFile(promptPath, prompt), writeFile(layoutPath, layout)])
    await writeFile(manifestPath, JSON.stringify({ workbench_task_id: 'task-source', items: [
      { request_id: firstId, request, parameter_files: { positive_prompt: 'prompt.txt' } },
      { request_id: secondId, request, parameter_files: { layout: layoutPath } },
    ] }))

    expect(await load(['generation', 'submit', '--file', manifestPath], '')).toEqual({
      command: 'generation.submit', workbench_task_id: 'task-source', items: [
        { request_id: firstId, request: { ...request, parameters: { seed: 7, positive_prompt: prompt } } },
        { request_id: secondId, request: { ...request, parameters: { seed: 7, layout } } },
      ],
    })
    expect(readUtf8File.mock.calls.map(([path]) => path)).toEqual([manifestPath, promptPath, layoutPath])
    const firstBudget = readUtf8File.mock.calls[1]![1]!
    expect(firstBudget).toBeGreaterThan(0)
    expect(readUtf8File.mock.calls[2]![1]).toBe(firstBudget - 21)
  })

  it('resolves artifact source paths relative to the publish file without reading attachment contents', async () => {
    const { root, load, readUtf8File } = await fixture()
    const directory = join(root, 'artifacts'), manifestPath = join(directory, 'publish.json'), absolute = join(root, 'absolute.txt')
    await mkdir(directory)
    await Promise.all([writeFile(join(root, 'prompt.txt'), 'prompt source'), writeFile(absolute, 'absolute source')])
    const artifact = { type: 'prompt', positive_prompt: 'warm light', negative_prompt: '', source_files: ['../prompt.txt', absolute] }
    await writeFile(manifestPath, JSON.stringify({ task_id: 'task-source', artifact }))

    expect(await load(['workbench', 'task', 'publish', '--file', manifestPath], '')).toEqual({
      command: 'workbench.task.publish', task_id: 'task-source', artifact: { ...artifact, source_files: [join(root, 'prompt.txt'), absolute] },
    })
    expect(readUtf8File).toHaveBeenCalledExactlyOnceWith(manifestPath)
  })

  it('requires absolute stdin file references and accepts absolute artifact attachments', async () => {
    const { root, load, readUtf8File } = await fixture()
    await expect(load(['generation', 'submit', '--stdin'], JSON.stringify({ items: [
      { request_id: firstId, request, parameter_files: { positive_prompt: 'relative.txt' } },
    ] }))).rejects.toThrow('stdin file references require an absolute path')
    const artifact = { type: 'prompt', positive_prompt: 'warm light', negative_prompt: '', source_files: ['relative.txt'] }
    await expect(load(['workbench', 'task', 'publish', '--stdin'], JSON.stringify({ task_id: 'task-source', artifact }))).rejects.toThrow('source_files supplied through stdin must contain absolute paths')
    const absolute = join(root, 'source.txt')
    expect(await load(['workbench', 'task', 'publish', '--stdin'], JSON.stringify({ task_id: 'task-source', artifact: { ...artifact, source_files: [absolute] } }))).toMatchObject({
      command: 'workbench.task.publish', artifact: { source_files: [absolute] },
    })
    expect(await load(['workbench', 'task', 'get', '--stdin'], JSON.stringify({ task_id: 'task-source' }))).toEqual({ command: 'workbench.task.get', task_id: 'task-source' })
    expect(readUtf8File).not.toHaveBeenCalled()
  })

  it('preserves the I/O error code and identifies an unreadable manifest', async () => {
    const { root, load } = await fixture()
    const path = join(root, 'missing.json')
    await expect(load(['generation', 'submit', '--file', path], '')).rejects.toMatchObject({
      code: 'ENOENT', message: expect.stringContaining(`Cannot read Generation manifest ${path} as UTF-8 text`),
    })
  })

  it.each([
    { failure: 'permission denied', code: 'CLI_REQUEST_INVALID', message: 'permission denied' },
    { failure: Object.assign(new Error('invalid UTF-8'), { code: 'INVALID_UTF8' }), code: 'CLI_REQUEST_INVALID', message: 'invalid UTF-8' },
    { failure: Object.assign(new Error('file exceeds remaining byte budget'), { code: 'CLI_REQUEST_TOO_LARGE' }), code: 'CLI_REQUEST_TOO_LARGE', message: 'file exceeds remaining byte budget' },
  ])('reports a parameter file failure as $code with its item and parameter location', async ({ failure, code, message }) => {
    const { root, load, readUtf8File } = await fixture()
    const path = join(root, 'prompt.txt')
    readUtf8File.mockRejectedValueOnce(failure)
    const error: unknown = await load(['generation', 'submit', '--stdin'], JSON.stringify({ items: [
      { request_id: firstId, request, parameter_files: { positive_prompt: path } },
    ] })).catch(error => error)
    expect(error).toMatchObject({ code, message: expect.stringContaining(`Generation items[0] parameter positive_prompt file ${path}: ${message}`) })
    expect(error).toHaveProperty('message', expect.stringContaining('Check the path and UTF-8 file content before retrying'))
    expect(readUtf8File).toHaveBeenCalledExactlyOnceWith(path, expect.any(Number))
  })

  it('rejects malformed manifest JSON before reading any parameter files', async () => {
    const { load, readUtf8File } = await fixture()
    await expect(load(['generation', 'submit', '--stdin'], '{')).rejects.toThrow('Correct the JSON syntax before retrying')
    expect(readUtf8File).not.toHaveBeenCalled()
  })

  it.each([
    { argv: ['generation', 'submit', '--file'], message: 'choose exactly one input' },
    { argv: ['workbench', 'task', 'publish', '--file'], message: 'Read workbench --help' },
  ])('rejects an incomplete file argument: $argv', async ({ argv, message }) => {
    const { load, readUtf8File } = await fixture()
    await expect(load(argv, '')).rejects.toThrow(message)
    expect(readUtf8File).not.toHaveBeenCalled()
  })
})
