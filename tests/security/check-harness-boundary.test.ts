import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const script = resolve(repositoryRoot, 'scripts/security/check-harness-boundary.mjs')
const clientInject = [
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-api-remotes',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-input-trigger',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-ui-sidebar',
]

function fixture(otherSource = ''): string {
  const root = mkdtempSync(join(tmpdir(), 'harness-boundary-'))
  for (const directory of ['src/host/tools', 'profiles/comfyui-workbench']) {
    mkdirSync(join(root, directory), { recursive: true })
  }
  writeFileSync(join(root, 'src/host/tools/register-project-tools.ts'), 'ctx.tools.register(definition)\n')
  writeFileSync(join(root, 'src/host/plugin.ts'), 'registerProjectTools(ctx, definitions)\n')
  if (otherSource) writeFileSync(join(root, 'src/other.ts'), otherSource)
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({
    name: 'harness-comfyui',
    private: true,
    dependencies: { '@deepseek-ai/schemastery': '3.18.1' },
    devDependencies: { '@deepseek-ai/dsh': '0.1.1-rc.2' },
    peerDependencies: {},
    exports: {},
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: clientInject } },
  }, null, 2)}\n`)
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - .\n')
  writeFileSync(join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n")
  writeFileSync(join(root, 'cordis.patch.yml'), `- insert:
    - id: harness-comfyui
      name: harness-comfyui
      config:
        configurationProfile: !!js process.env.HARNESS_COMFYUI_CONFIGURATION_PROFILE
`)
  writeFileSync(join(root, 'profiles/comfyui-workbench/cordis.patch.yml'), `- id: skill-filesystem
  disabled: false

- id: tool-skill
  disabled: false
`)
  return root
}

function run(root: string) {
  return spawnSync(process.execPath, [script, '--root', root], { cwd: repositoryRoot, encoding: 'utf8' })
}

function updateJson(root: string, path: string, update: (value: Record<string, any>) => void) {
  const absolute = join(root, path)
  const value = JSON.parse(readFileSync(absolute, 'utf8')) as Record<string, any>
  update(value)
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`)
}

describe('Harness source boundary', () => {
  it('accepts one project Tool registry in the Host plugin', () => {
    const root = fixture()
    try {
      expect(run(root)).toMatchObject({ status: 0, stderr: '' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts the public WorkspaceRegistry type export', () => {
    const root = fixture("import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'\n")
    try {
      expect(run(root)).toMatchObject({ status: 0, stderr: '' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects duplicate Tool registration and non-public Harness imports', () => {
    for (const source of [
      'ctx.tools.register(other)\n',
      "import { hidden } from '@deepseek-ai/dsh-client-runtime/internal'\n",
    ]) {
      const root = fixture(source)
      try {
        const result = run(root)
        expect(result.status).not.toBe(0)
        expect(result.stderr).toMatch(/ctx\.tools\.register|non-public Harness specifier/u)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  })

  it('rejects source-bound package dependencies', () => {
    const root = fixture()
    try {
      updateJson(root, 'package.json', value => { value.devDependencies['@deepseek-ai/dsh'] = 'file:../dsh' })
      expect(run(root).stderr).toMatch(/forbidden Harness source binding/u)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects profile patch drift', () => {
    const root = fixture()
    try {
      writeFileSync(join(root, 'profiles/comfyui-workbench/cordis.patch.yml'), 'invalid: true\n')
      expect(run(root).stderr).toContain('profiles/comfyui-workbench/cordis.patch.yml')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
