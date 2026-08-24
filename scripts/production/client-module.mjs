import { readFile } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { dirname, resolve } from 'node:path'

import { build } from 'tsdown'

export const CLIENT_MODULE_POLICY = Object.freeze({
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

const isNodeBuiltin = specifier =>
  specifier.startsWith('node:') || builtinModules.includes(specifier)

const isExactExternal = specifier =>
  CLIENT_MODULE_POLICY.externals.includes(specifier)

const isInlineDeepSeekSpecifier = specifier =>
  CLIENT_MODULE_POLICY.inlineRules.some(rule => rule.test(specifier))

const clientImportPolicy = {
  name: 'harness-comfyui-client-import-policy',
  resolveId(specifier, importer) {
    if (!importer) return undefined
    if (isNodeBuiltin(specifier)) {
      throw new Error(`Client bundle cannot import Node builtin ${specifier}`)
    }
    if (
      specifier.startsWith('@deepseek-ai/')
      && !isExactExternal(specifier)
      && !isInlineDeepSeekSpecifier(specifier)
    ) {
      throw new Error(`Client bundle cannot value-import disallowed ${specifier}`)
    }
    return undefined
  },
}

const cssInjection = css => {
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

export async function materializeClientModule(options) {
  const css = await readFile(options.css, 'utf8')
  await build({
    config: false,
    logLevel: 'silent',
    entry: { client: options.entry },
    outDir: dirname(options.output),
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    deps: {
      neverBundle: [...CLIENT_MODULE_POLICY.externals],
      alwaysBundle: () => true,
    },
    sourcemap: true,
    clean: false,
    dts: false,
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    plugins: [clientImportPolicy],
    banner: `window.__ModuleLoader__.load({ id: "harness-comfyui", factory: (require) => { const module = { exports: {} }; const exports = module.exports;\n${cssInjection(css)}\n`,
    footer: '\nreturn module.exports; } });',
  })
}

export function sourceClientModulePath(repositoryRoot) {
  return resolve(repositoryRoot, '.local/source-client/client.js')
}

export async function materializeSourceClientModule(repositoryRoot) {
  const sourceRoot = resolve(repositoryRoot)
  const output = sourceClientModulePath(sourceRoot)
  await materializeClientModule({
    entry: resolve(sourceRoot, 'src/client/index.tsx'),
    css: resolve(sourceRoot, 'src/client/styles.css'),
    output,
  })
  return output
}
