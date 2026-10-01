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
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-input-trigger',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-sidebar',
  '@deepseek-ai/dsh-client-ui-sidebar-right',
]
type BundleEntry = { id: string; name: string }
const officialBundleEntries: BundleEntry[] = [
  { id: 'harness-comfyui-core', name: 'harness-comfyui/core' },
  { id: 'harness-comfyui-image-reader', name: 'harness-comfyui/image-reader' },
  { id: 'harness-comfyui-cli', name: 'harness-comfyui/cli' },
  { id: 'harness-comfyui', name: 'harness-comfyui' },
  { id: 'harness-comfyui-presets', name: './agent-presets/project-installed-presets.mjs' },
]

function writeBundle(root: string, update: (entries: BundleEntry[]) => void = () => {}) {
  const entries = officialBundleEntries.map(entry => ({ ...entry }))
  update(entries)
  const rows = entries.map(entry => `    - id: ${entry.id}\n      name: ${entry.name}`).join('\n')
  writeFileSync(join(root, 'cordis.patch.yml'), `- insert:\n${rows}\n`)
}

function fixture(otherSource = ''): string {
  const root = mkdtempSync(join(tmpdir(), 'harness-boundary-'))
  for (const directory of [
    'src/host/tools',
    'src/host/core',
    'src/host/image-reader',
  ]) {
    mkdirSync(join(root, directory), { recursive: true })
  }
  writeFileSync(join(root, 'src/host/tools/register-project-tools.ts'), 'ctx.tools.register(definition)\n')
  writeFileSync(join(root, 'src/host/core/plugin.ts'), 'registerProjectTools(ctx, definitions)\n')
  writeFileSync(join(root, 'src/host/image-reader/plugin.ts'), 'registerProjectTools(ctx, definitions)\n')
  if (otherSource) writeFileSync(join(root, 'src/other.ts'), otherSource)
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({
    name: 'harness-comfyui',
    private: true,
    dependencies: { '@deepseek-ai/schemastery': '3.18.1' },
    devDependencies: { '@deepseek-ai/dsh': '0.1.2-alpha.1' },
    peerDependencies: {},
    exports: {},
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: clientInject } },
  }, null, 2)}\n`)
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - .\n')
  writeFileSync(join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n")
  writeBundle(root, () => {})
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
  it('accepts the official plugin bundle without repository-owned Host Profiles', () => {
    const root = fixture()
    try {
      expect(run(root)).toMatchObject({ status: 0, stderr: '' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts public Agent model selection and Session identity exports', () => {
    const root = fixture("import { installModelSelection } from '@deepseek-ai/dsh-agent'\nimport { SessionId } from '@deepseek-ai/dsh-session'\n")
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

  it('accepts a public DSH home path type-only import', () => {
    const root = fixture("import type { DSH_HOME_ENV } from '@deepseek-ai/dsh-home-paths'\n")
    try {
      expect(run(root)).toMatchObject({ status: 0, stderr: '' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts public credential references and durable Session metadata types', () => {
    const root = fixture("import { credentialRef } from '@deepseek-ai/dsh-credentials'\nimport type { CredentialRef } from '@deepseek-ai/dsh-credentials/types'\nimport type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'\n")
    try {
      expect(run(root)).toMatchObject({ status: 0, stderr: '' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('requires a type-only durable Session metadata import', () => {
    const root = fixture("import { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'\n")
    try {
      expect(run(root).stderr).toContain("must import '@deepseek-ai/dsh-session-persistence' as a type-only specifier")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('requires a type-only credential types subpath import', () => {
    const root = fixture("import { CredentialRef } from '@deepseek-ai/dsh-credentials/types'\n")
    try {
      expect(run(root).stderr).toContain("must import '@deepseek-ai/dsh-credentials/types' as a type-only specifier")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it.each(['dsh-credentials', 'dsh-session-persistence'])('rejects the %s source subpath', name => {
    const root = fixture(`import type { Internal } from '@deepseek-ai/${name}/src/index.ts'\n`)
    try {
      expect(run(root).status).not.toBe(0)
      expect(run(root).stderr).toContain('Harness source')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a value import from the type-only DSH home path permission', () => {
    const root = fixture("import { dshHomePath } from '@deepseek-ai/dsh-home-paths'\n")
    try {
      expect(run(root).stderr).toContain("must import '@deepseek-ai/dsh-home-paths' as a type-only specifier")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('requires the complete official Host, Client, and Preset bundle entries', () => {
    for (const missingId of [
      'harness-comfyui-core',
      'harness-comfyui-image-reader',
      'harness-comfyui-cli',
      'harness-comfyui',
      'harness-comfyui-presets',
    ]) {
      const root = fixture()
      try {
        writeBundle(root, bundle => {
          const retained = bundle.filter(entry => entry.id !== missingId)
          bundle.splice(0, bundle.length, ...retained)
        })
        expect(run(root).stderr, `missing ${missingId}`).toContain('complete Host, Client, and Preset entries')
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  })

  it('rejects global model, sandbox, and default Preset overrides in the official bundle patch', () => {
    for (const id of ['agent-default-model', 'bash-sandbox', 'agent-preset-registry']) {
      const root = fixture()
      try {
        writeBundle(root, bundle => {
          bundle.push({ id, name: id })
        })
        expect(run(root).stderr, `unexpected ${id}`).toContain('must not override global defaults')
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  })

  it('rejects malformed official bundle YAML', () => {
    const root = fixture()
    try {
      writeFileSync(join(root, 'cordis.patch.yml'), 'insert: [unterminated\n')
      expect(run(root).stderr).toContain('could not parse cordis.patch.yml')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects recursive aliases in official bundle YAML', () => {
    const root = fixture()
    try {
      writeFileSync(join(root, 'cordis.patch.yml'), 'recursive: &recursive [*recursive]\n')
      expect(run(root).stderr).toContain('must not contain cyclic YAML aliases')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects Desktop package archives as manifest development dependencies', () => {
    const root = fixture()
    try {
      updateJson(root, 'package.json', value => {
        value.devDependencies['@deepseek-ai/dsh'] = 'file:.local/upstreams/dsh-desktop/packages/harness-0.1.2-alpha.1/npm-dsh/deepseek-ai-dsh-0.1.2-alpha.1.tgz'
      })
      const result = run(root)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('forbidden Harness source binding')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects Desktop node_modules as the development test dependency source', () => {
    const root = fixture()
    try {
      updateJson(root, 'package.json', value => {
        value.devDependencies['@deepseek-ai/dsh'] = 'link:.local/upstreams/dsh-desktop/node_modules/@deepseek-ai/dsh'
      })
      const result = run(root)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('forbidden Harness source binding')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects duplicate Tool registration and non-public Harness imports', () => {
    for (const source of [
      'ctx.tools.register(other)\n',
      "import { hidden } from '@deepseek-ai/dsh-typert-protocol/internal'\n",
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

})
