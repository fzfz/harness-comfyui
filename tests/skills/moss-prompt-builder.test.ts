import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

it('runs the MOSS prompt compiler Python regression suite', async () => {
  const { stdout, stderr } = await execFileAsync('python3', [
    '-B', '-m', 'unittest', 'discover',
    '-s', resolve('.agents/skills/moss-prompt-builder/scripts'),
    '-p', 'test_compile_prompt.py', '-v',
  ], { encoding: 'utf8', timeout: 10000 })

  expect(stdout).toBe('')
  expect(stderr).toMatch(/\nOK\n$/u)
}, 15000)
