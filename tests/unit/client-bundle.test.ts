import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

import { afterEach, describe, expect, it } from 'vitest'

import {
  buildClientBundle,
  CLIENT_BUNDLE_POLICY,
} from '../../scripts/testing/client-bundle.ts'

const expectedExternals = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

const expectedInlineRules = [
  /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand)(\/|$)/,
  /^@deepseek-ai\/(cosmokit|schemastery)(\/|$)/,
  /^@deepseek-ai\/dsh-[a-z0-9]+(-[a-z0-9]+)*\/remote$/,
]

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const temporaryDirectories: string[] = []

async function createFixture(source: string): Promise<{
  directory: string
  output: string
}> {
  const directory = await mkdtemp(join(tmpdir(), 'harness-comfyui-client-policy-'))
  temporaryDirectories.push(directory)
  await writeFile(join(directory, 'fixture.ts'), source, 'utf8')
  await writeFile(join(directory, 'styles.css'), '', 'utf8')
  return {
    directory,
    output: join(directory, 'lib', 'client.js'),
  }
}

async function writeInlinePackage(
  directory: string,
  specifier: string,
  source: string,
): Promise<void> {
  const packageParts = specifier.split('/')
  const packageName = packageParts.slice(0, 2).join('/')
  const subpath = packageParts.slice(2)
  const packageDirectory = join(directory, 'node_modules', ...packageName.split('/'))
  await mkdir(packageDirectory, { recursive: true })
  await writeFile(join(packageDirectory, 'package.json'), '{"type":"module"}\n', 'utf8')
  const modulePath = subpath.length > 0 ? join(packageDirectory, ...subpath) + '.js' : join(packageDirectory, 'index.js')
  await mkdir(join(modulePath, '..'), { recursive: true })
  await writeFile(modulePath, source, 'utf8')
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('Client bundle build seam', () => {
  it('builds the Client directly from source without a generated Remote entry', async () => {
    const source = await readFile(join(repositoryRoot, 'src/client/index.tsx'), 'utf8')
    const testHelper = await readFile(join(repositoryRoot, 'scripts/testing/client-bundle.ts'), 'utf8')

    expect(source).not.toContain('harness-comfyui/remote')
    expect(source).not.toContain('ctx.remote.$mount')
    expect(source).not.toContain('applyWithRemote')
    expect(testHelper).not.toContain('lib/typert.remote-client.js')
    expect(testHelper).not.toContain('applyWithRemote')
  })

  it('exports the exact external and inline policy as one structured constant', () => {
    expect(CLIENT_BUNDLE_POLICY).toEqual({
      externals: expectedExternals,
      inlineRules: expectedInlineRules,
    })
  })

  it('builds a lazy ModuleLoader factory and injects one deterministic style tag', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'harness-comfyui-client-'))
    temporaryDirectories.push(directory)

    const entry = join(directory, 'fixture.ts')
    const css = join(directory, 'styles.css')
    const output = join(directory, 'lib', 'client.js')
    await writeFile(entry, 'export const apply = () => undefined\n', 'utf8')
    await writeFile(css, '[data-plugin="harness-comfyui-details"] { color: red; }\n', 'utf8')

    await buildClientBundle({ entry, css, output })

    const source = await readFile(output, 'utf8')
    let handoff: { id: string; factory: (require: (specifier: string) => unknown) => Record<string, unknown> } | undefined
    const window = {
      __ModuleLoader__: {
        load(value: typeof handoff) {
          handoff = value
        },
      },
    }
    const styleElements: Array<{ dataset: Record<string, string>; textContent: string }> = []
    const document = {
      head: {
        appendChild(element: (typeof styleElements)[number]) {
          styleElements.push(element)
        },
      },
      createElement() {
        return { dataset: {}, textContent: '' }
      },
      querySelector(selector: string) {
        return selector === 'style[data-plugin="harness-comfyui"]' ? styleElements[0] : undefined
      },
    }

    vm.runInNewContext(source, { document, window })

    expect(handoff?.id).toBe('harness-comfyui')
    expect(handoff?.factory).toBeTypeOf('function')
    const requireExternal = (specifier: string): unknown => {
      throw new Error(`unexpected fixture external: ${specifier}`)
    }
    handoff?.factory(requireExternal)
    handoff?.factory(requireExternal)

    expect(styleElements).toHaveLength(1)
    expect(styleElements[0]).toMatchObject({
      dataset: { plugin: 'harness-comfyui' },
      textContent: '[data-plugin="harness-comfyui-details"] { color: red; }\n',
    })
  })

  it.each(expectedExternals)('keeps exact external %s outside the client bundle', async (specifier) => {
    const fixture = await createFixture(`import * as imported from '${specifier}'\nexport const value = imported\n`)

    await buildClientBundle({
      entry: join(fixture.directory, 'fixture.ts'),
      css: join(fixture.directory, 'styles.css'),
      output: fixture.output,
    })

    const source = await readFile(fixture.output, 'utf8')
    expect(source).toContain(specifier)
  })

  it.each([
    ['host/session/llm/tools/brand', '@deepseek-ai/dsh-session'],
    ['cosmokit/schemastery', '@deepseek-ai/cosmokit'],
    ['remote subpath', '@deepseek-ai/dsh-example/remote'],
  ])('inlines the %s DeepSeek rule category', async (_category, specifier) => {
    const fixture = await createFixture(`import { marker } from '${specifier}'\nexport const value = marker\n`)
    await writeInlinePackage(fixture.directory, specifier, 'export const marker = "inlined"\n')

    await buildClientBundle({
      entry: join(fixture.directory, 'fixture.ts'),
      css: join(fixture.directory, 'styles.css'),
      output: fixture.output,
    })

    const source = await readFile(fixture.output, 'utf8')
    expect(source).toContain('inlined')
    expect(source).not.toContain(specifier)
  })

  it('inlines an ordinary non-DeepSeek module', async () => {
    const fixture = await createFixture("import { marker } from './ordinary.ts'\nexport const value = marker\n")
    await writeFile(join(fixture.directory, 'ordinary.ts'), 'export const marker = "ordinary-inline"\n', 'utf8')

    await buildClientBundle({
      entry: join(fixture.directory, 'fixture.ts'),
      css: join(fixture.directory, 'styles.css'),
      output: fixture.output,
    })

    const source = await readFile(fixture.output, 'utf8')
    expect(source).toContain('ordinary-inline')
  })

  it.each(['node:fs', 'fs'])('rejects Node builtin value imports: %s', async (specifier) => {
    const fixture = await createFixture(`import { readFile } from '${specifier}'\nexport const value = readFile\n`)

    await expect(buildClientBundle({
      entry: join(fixture.directory, 'fixture.ts'),
      css: join(fixture.directory, 'styles.css'),
      output: fixture.output,
    })).rejects.toThrow(`Client bundle cannot import Node builtin ${specifier}`)
  })

  it('rejects a disallowed DeepSeek value import', async () => {
    const specifier = '@deepseek-ai/dsh-forbidden'
    const fixture = await createFixture(`import imported from '${specifier}'\nexport const value = imported\n`)

    await expect(buildClientBundle({
      entry: join(fixture.directory, 'fixture.ts'),
      css: join(fixture.directory, 'styles.css'),
      output: fixture.output,
    })).rejects.toThrow(`Client bundle cannot value-import disallowed ${specifier}`)
  })

  it('removes a type-only import before applying the value-import policy', async () => {
    const specifier = '@deepseek-ai/dsh-type-only'
    const fixture = await createFixture(`import type { Missing } from '${specifier}'\nexport const value = 1\n`)

    await buildClientBundle({
      entry: join(fixture.directory, 'fixture.ts'),
      css: join(fixture.directory, 'styles.css'),
      output: fixture.output,
    })

    const source = await readFile(fixture.output, 'utf8')
    expect(source).toContain('const value = 1')
    expect(source).not.toContain(specifier)
  })
})
