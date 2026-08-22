import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const scriptPath = join(process.cwd(), 'scripts/security/check-harness-boundary.mjs')

const clientInject = [
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-api-remotes',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-input-trigger',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-ui-theme',
]

const workspaceText = `packages:
  - .

strictDepBuilds: true

allowBuilds:
  koffi@3.1.5: true

overrides:
  nanoid@>=3.0.0 <3.3.18: 3.3.18
`

const rootPackage = {
  name: 'harness-comfyui',
  version: '0.1.0-rc.7',
  private: true,
  dependencies: { '@deepseek-ai/schemastery': '3.18.1' },
  devDependencies: { '@deepseek-ai/dsh': '0.1.0-rc.7' },
  peerDependencies: { '@deepseek-ai/dsh-client-runtime': '0.1.0-rc.7' },
  dsh: {
    bundle: { patch: './cordis.patch.yml' },
    client: { platform: 'web', inject: clientInject },
  },
}

const runtimePackage = {
  name: 'harness-comfyui-runtime',
  private: true,
  dependencies: {
    '@deepseek-ai/dsh': '0.1.0-rc.7',
    '@deepseek-ai/dsh-base': '0.1.0-rc.7',
    '@deepseek-ai/dsh-web-app': '0.1.0-rc.7',
  },
}

function lockfileText(packageNames: string[]): string {
  const importerEntries = packageNames.map(packageName => `      '${packageName}':
        specifier: 0.1.0-rc.7
        version: 0.1.0-rc.7`).join('\n')
  const packageEntries = packageNames.map(packageName => `  '${packageName}@0.1.0-rc.7': {}`).join('\n')
  return `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

overrides:
  nanoid@>=3.0.0 <3.3.18: 3.3.18

importers:

  .:
    dependencies:
${importerEntries}

packages:

${packageEntries}
`
}

const loaderPatch = `- insert:
    - id: harness-comfyui
      name: harness-comfyui
      config:
        configurationProfile: !!js process.env.HARNESS_COMFYUI_CONFIGURATION_PROFILE

- id: ui-layout
  disabled: true
`

function createFixture(otherSource = ''): string {
  const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-boundary-'))
  mkdirSync(join(root, 'src/host/tools'), { recursive: true })
  mkdirSync(join(root, 'deployment/runtime'), { recursive: true })
  mkdirSync(join(root, 'profiles/comfyui-workbench'), { recursive: true })
  writeFileSync(join(root, 'src.ts'), '// outside src directory\n', 'utf8')
  writeFileSync(join(root, 'README.md'), 'ctx.tools.register("markdown-only")\n', 'utf8')
  writeFileSync(join(root, 'src/host/tools/register-project-tools.ts'), 'ctx.tools.register(definition)\n', 'utf8')
  writeFileSync(join(root, 'src/host/plugin.ts'), 'registerProjectTools(ctx, definitions)\n', 'utf8')
  writeFileSync(join(root, 'package.json'), `${JSON.stringify(rootPackage, null, 2)}\n`, 'utf8')
  writeFileSync(join(root, 'deployment/runtime/package.json'), `${JSON.stringify(runtimePackage, null, 2)}\n`, 'utf8')
  writeFileSync(join(root, 'pnpm-workspace.yaml'), workspaceText, 'utf8')
  writeFileSync(join(root, 'deployment/runtime/pnpm-workspace.yaml'), workspaceText, 'utf8')
  writeFileSync(join(root, 'pnpm-lock.yaml'), lockfileText(['@deepseek-ai/dsh']), 'utf8')
  writeFileSync(join(root, 'deployment/runtime/pnpm-lock.yaml'), lockfileText([
    '@deepseek-ai/dsh',
    '@deepseek-ai/dsh-base',
    '@deepseek-ai/dsh-web-app',
  ]), 'utf8')
  writeFileSync(join(root, 'cordis.patch.yml'), loaderPatch, 'utf8')
  writeFileSync(join(root, 'profiles/comfyui-workbench/cordis.patch.yml'), '[]\n', 'utf8')
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

function updateJson(root: string, relativePath: string, update: (value: Record<string, any>) => void): void {
  const path = join(root, relativePath)
  const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>
  update(value)
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function appendText(root: string, relativePath: string, suffix: string): void {
  const path = join(root, relativePath)
  writeFileSync(path, `${readFileSync(path, 'utf8')}${suffix}`, 'utf8')
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

  it('rejects a non-public Harness subpath import', () => {
    const root = createFixture("import { hidden } from '@deepseek-ai/dsh-client-runtime/internal'\n")
    try {
      const result = run(root)
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toContain("src/other.ts imports non-public Harness specifier '@deepseek-ai/dsh-client-runtime/internal'")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts the public input-trigger client type import', () => {
    const root = createFixture("import type { InputTrigger } from '@deepseek-ai/dsh-client-ui-input-trigger/client'\n")
    try {
      expect(run(root).status).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a value input-trigger import', () => {
    const root = createFixture("import { InputTrigger } from '@deepseek-ai/dsh-client-ui-input-trigger/client'\n")
    try {
      const result = run(root)
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toContain('must import')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it.each([
    ['a dynamic import', "void import('@deepseek-ai/dsh-client-runtime/internal')"],
    ['an export import', "export { hidden } from '@deepseek-ai/dsh-client-runtime/internal'"],
    ['a relative Harness checkout import', "import hidden from '../harness-checkout/src/private.ts'"],
    ['an absolute Harness checkout import', "import hidden from '/tmp/deepseek-harness/src/private.ts'"],
  ])('rejects %s', (_label, source) => {
    const root = createFixture(`${source}\n`)
    try {
      const result = run(root)
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/src\/other\.ts|Harness|non-public/u)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a non-literal dynamic import', () => {
    const root = createFixture('void import(process.env.HARNESS_MODULE)\n')
    try {
      const result = run(root)
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toContain('dynamic import')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a direct sidebar dependency in the root manifest', () => {
    const root = createFixture()
    try {
      updateJson(root, 'package.json', manifest => {
        manifest.devDependencies['@deepseek-ai/dsh-client-ui-sidebar'] = '0.1.0-rc.7'
      })
      const result = run(root)
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toContain('package.json.devDependencies.@deepseek-ai/dsh-client-ui-sidebar')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a direct Tool dependency in the runtime manifest', () => {
    const root = createFixture()
    try {
      updateJson(root, 'deployment/runtime/package.json', manifest => {
        manifest.dependencies['@deepseek-ai/dsh-client-ui-tool'] = '0.1.0-rc.7'
      })
      const result = run(root)
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toContain('deployment/runtime/package.json.dependencies.@deepseek-ai/dsh-client-ui-tool')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it.each([
    ['root', 'package.json', 'devDependencies', 'file:../harness-checkout'],
    ['runtime', 'deployment/runtime/package.json', 'dependencies', 'workspace:*'],
  ])('rejects a %s Harness source binding', (_label, relativePath, field, value) => {
    const root = createFixture()
    try {
      updateJson(root, relativePath, manifest => {
        manifest[field]['@deepseek-ai/dsh'] = value
      })
      const result = run(root)
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/source binding|file:|workspace:/u)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it.each([
    ['patch', 'patch:../harness.patch'],
    ['npm alias', 'npm:@deepseek-ai/dsh@0.1.0-rc.7'],
    ['link', 'link:../harness-checkout'],
    ['fork', 'git+https://github.com/deepseek-ai/harness.git#main'],
  ])('rejects a runtime Harness %s dependency binding', (_label, value) => {
    const root = createFixture()
    try {
      updateJson(root, 'deployment/runtime/package.json', manifest => {
        manifest.dependencies['@deepseek-ai/dsh'] = value
      })
      const result = run(root)
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toContain('deployment/runtime/package.json.dependencies.@deepseek-ai/dsh')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a runtime lock patchedDependencies mutation', () => {
    const root = createFixture()
    try {
      appendText(root, 'deployment/runtime/pnpm-lock.yaml', '\npatchedDependencies:\n  @deepseek-ai/dsh: patches/dsh.patch\n')
      const result = run(root)
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toContain('deployment/runtime/pnpm-lock.yaml.patchedDependencies')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it.each([
    ['source binding', '\n  resolution: {tarball: file:../harness-checkout.tgz}\n'],
    ['fork', '\n  resolution: {repo: git+https://github.com/deepseek-ai/harness.git}\n'],
  ])('rejects a runtime lock %s mutation', (_label, suffix) => {
    const root = createFixture()
    try {
      appendText(root, 'deployment/runtime/pnpm-lock.yaml', suffix)
      const result = run(root)
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toContain('deployment/runtime/pnpm-lock.yaml')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a runtime workspace Harness override', () => {
    const root = createFixture()
    try {
      appendText(root, 'deployment/runtime/pnpm-workspace.yaml', "\n  '@deepseek-ai/dsh': file:../harness-checkout\n")
      const result = run(root)
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toContain('deployment/runtime/pnpm-workspace.yaml')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects runtime workspace patchedDependencies', () => {
    const root = createFixture()
    try {
      appendText(root, 'deployment/runtime/pnpm-workspace.yaml', '\npatchedDependencies:\n  @deepseek-ai/dsh: patches/dsh.patch\n')
      const result = run(root)
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toContain('deployment/runtime/pnpm-workspace.yaml.patchedDependencies')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a runtime lock Harness-targeted override', () => {
    const root = createFixture()
    try {
      appendText(root, 'deployment/runtime/pnpm-lock.yaml', "\noverrides:\n  '@deepseek-ai/dsh': 0.1.0-rc.7\n")
      const result = run(root)
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toContain('deployment/runtime/pnpm-lock.yaml.overrides')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a custom public Loader hook in dsh client metadata', () => {
    const root = createFixture()
    try {
      updateJson(root, 'package.json', manifest => {
        manifest.dsh.client.loader = './loader-hook.mjs'
      })
      const result = run(root)
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toContain('package.json.dsh')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it.each([
    ['root', 'cordis.patch.yml', 'custom Loader hook'],
    ['profile', 'profiles/comfyui-workbench/cordis.patch.yml', 'Harness checkout path'],
  ])('rejects a %s Cordis patch mutation', (_label, relativePath, mutation) => {
    const root = createFixture()
    try {
      writeFileSync(join(root, relativePath), `${mutation}: ../harness-checkout\n`, 'utf8')
      const result = run(root)
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toContain(relativePath)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
