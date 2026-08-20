import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'tsdown'

export const CLIENT_BUNDLE_POLICY = Object.freeze({
  externals: Object.freeze([
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
  ]),
  inlineRules: Object.freeze([
    /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand)(\/|$)/,
    /^@deepseek-ai\/(cosmokit|schemastery)(\/|$)/,
    /^@deepseek-ai\/dsh-[a-z0-9]+(-[a-z0-9]+)*\/remote$/,
  ]),
})

const isNodeBuiltin = (specifier: string): boolean =>
  specifier.startsWith('node:') || builtinModules.includes(specifier)

const isExactExternal = (specifier: string): boolean =>
  CLIENT_BUNDLE_POLICY.externals.includes(specifier)

const isInlineDeepSeekSpecifier = (specifier: string): boolean =>
  CLIENT_BUNDLE_POLICY.inlineRules.some(rule => rule.test(specifier))

const clientImportPolicy = {
  name: 'harness-comfyui-client-import-policy',
  resolveId(specifier: string, importer?: string) {
    if (!importer) return undefined
    if (isNodeBuiltin(specifier)) {
      throw new Error(`Client bundle cannot import Node builtin ${specifier}`)
    }
    if (
      specifier.startsWith('@deepseek-ai/') &&
      !isExactExternal(specifier) &&
      !isInlineDeepSeekSpecifier(specifier)
    ) {
      throw new Error(`Client bundle cannot value-import disallowed ${specifier}`)
    }
    return undefined
  },
}

interface ClientBundleOptions {
  readonly entry: string
  readonly css: string
  readonly output: string
}

async function resolveLockedZodEntry(): Promise<string> {
  const store = join(root, 'node_modules', '.pnpm')
  const candidates = (await readdir(store, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && /^zod@[^_]+$/u.test(entry.name))
    .map(entry => join(store, entry.name, 'node_modules', 'zod'))
  if (candidates.length !== 1) {
    throw new Error(`Client build requires exactly one locked zod package; found ${candidates.length}`)
  }
  const packageRoot = candidates[0]!
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as { name?: string }
  if (manifest.name !== 'zod') throw new Error(`Client build resolved a non-zod package at ${packageRoot}`)
  return join(packageRoot, 'index.js')
}

const cssInjection = (css: string): string => {
  const serializedCss = JSON.stringify(css)
  return [
    'const __harnessComfyuiStyle = document.querySelector(\'style[data-plugin="harness-comfyui"]\');',
    'if (!__harnessComfyuiStyle) {',
    '  const __style = document.createElement("style");',
    '  __style.dataset.plugin = "harness-comfyui";',
    `  __style.textContent = ${serializedCss};`,
    '  document.head.appendChild(__style);',
    '}',
  ].join('\n')
}

export async function buildClientBundle(options: ClientBundleOptions): Promise<void> {
  const css = await readFile(options.css, 'utf8')
  const outputDirectory = dirname(options.output)
  const zodEntry = await resolveLockedZodEntry()
  const generatedRemoteDependencies = {
    name: 'harness-comfyui-generated-remote-dependencies',
    resolveId(specifier: string) {
      return specifier === 'zod' ? zodEntry : undefined
    },
  }

  await build({
    config: false,
    entry: { client: options.entry },
    outDir: outputDirectory,
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    deps: {
      neverBundle: [...CLIENT_BUNDLE_POLICY.externals],
      alwaysBundle: () => true,
    },
    sourcemap: true,
    clean: false,
    dts: false,
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    plugins: [generatedRemoteDependencies, clientImportPolicy],
    banner: `window.__ModuleLoader__.load({ id: "harness-comfyui", factory: (require) => { const module = { exports: {} }; const exports = module.exports;\n${cssInjection(css)}\n`,
    footer: '\nreturn module.exports; } });',
  })
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const generatedEntry = join(root, '.local/build/client-entry.ts')
  await mkdir(dirname(generatedEntry), { recursive: true })
  await writeFile(generatedEntry, [
    "import TYPERT_REMOTE from '../../lib/typert.remote-client.js'",
    "import { applyWithRemote, inject, name } from '../../src/client/index.tsx'",
    '',
    'export { inject, name }',
    'export const apply = (ctx: Parameters<typeof applyWithRemote>[0]) =>',
    '  applyWithRemote(ctx, TYPERT_REMOTE)',
    '',
  ].join('\n'), 'utf8')
  try {
    await buildClientBundle({
      entry: generatedEntry,
      css: join(root, 'src/client/styles.css'),
      output: join(root, 'lib/client.js'),
    })
  } finally {
    await rm(generatedEntry, { force: true })
  }
}
