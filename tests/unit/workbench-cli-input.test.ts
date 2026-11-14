import { contracts } from '#contracts'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'

// @ts-expect-error The runtime manifest loader is JavaScript.
import { loadCliFileRequest } from '../../scripts/cli/input-files.mjs'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const manifest = {
  workbench_task_id: 'task-input-a',
  items: [{ request_id: '01234567-89ab-4cde-8fab-0123456789ab', request: {
    title: '暖光', instance_id: '1', template_id: '2', model: null, parameters: {}, loras: [],
  } }],
}

it('keeps the explicit task ID through stdin and parameter-file expansion', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workbench-cli-')); roots.push(root)
  const prompt = join(root, 'prompt.txt'); writeFileSync(prompt, 'warm light')
  const input = { ...manifest, items: [{ ...manifest.items[0], parameter_files: { positive: prompt } }] }
  const result = await loadCliFileRequest(['generation', 'submit', '--stdin'], JSON.stringify(input))
  expect(result.workbench_task_id).toBe('task-input-a')
  expect(result.items[0].request.parameters).toEqual({ positive: 'warm light' })
})

it('keeps the explicit task ID from a manifest file', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workbench-cli-')); roots.push(root)
  const path = join(root, 'manifest.json'); writeFileSync(path, JSON.stringify(manifest))
  const result = await loadCliFileRequest(['generation', 'submit', '--file', path], '')
  expect(result.workbench_task_id).toBe('task-input-a')
})

it('rejects malformed ownership while preserving ordinary chat submissions', () => {
  expect(() => contracts.parse('cliRequest', 'input', { command: 'generation.submit', ...manifest, workbench_task_id: '' })).toThrow()
  expect(contracts.parse('cliRequest', 'input', { command: 'generation.submit', items: manifest.items })).not.toHaveProperty('workbench_task_id')
})
