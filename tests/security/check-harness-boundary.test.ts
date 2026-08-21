import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const scriptPath = join(process.cwd(), 'scripts/security/check-harness-boundary.mjs')

function createFixture(otherSource = ''): string {
  const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-boundary-'))
  mkdirSync(join(root, 'src/host/tools'), { recursive: true })
  writeFileSync(join(root, 'src.ts'), '// outside src directory\n', 'utf8')
  writeFileSync(join(root, 'README.md'), 'ctx.tools.register("markdown-only")\n', 'utf8')
  writeFileSync(join(root, 'src/host/tools/register-project-tools.ts'), 'ctx.tools.register(definition)\n', 'utf8')
  writeFileSync(join(root, 'src/host/plugin.ts'), 'registerProjectTools(ctx, definitions)\n', 'utf8')
  if (otherSource) {
    writeFileSync(join(root, 'src/other.ts'), otherSource, 'utf8')
  }
  return root
}

function run(root: string) {
  return spawnSync(process.execPath, [scriptPath, '--root', root], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
  })
}

describe('check:harness-boundary', () => {
  it('accepts the one registry call and one Host lifecycle call without reading Markdown', () => {
    const root = createFixture()
    try {
      const result = run(root)
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a direct Harness registration from any other src file', () => {
    const root = createFixture('ctx.tools.register(otherDefinition)\n')
    try {
      const result = run(root)
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toContain('src/other.ts')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a second Host registry call', () => {
    const root = createFixture('')
    try {
      writeFileSync(join(root, 'src/host/plugin.ts'), 'registerProjectTools(ctx, first)\nregisterProjectTools(ctx, second)\n', 'utf8')
      const result = run(root)
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toContain('src/host/plugin.ts')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
