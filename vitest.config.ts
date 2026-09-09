import { readFileSync } from 'node:fs'

import ts from 'typescript'
import { configDefaults, defineConfig } from 'vitest/config'

const qualityPolicy = JSON.parse(readFileSync(new URL('./config/quality-gates.json', import.meta.url), 'utf8'))

const decoratorSyntax = /^\s*@[A-Za-z_$][\w$]*/m

const standardDecoratorPlugin = {
  name: 'harness-comfyui-standard-decorators',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    const file = id.split('?', 1)[0]!
    if (!/\.[cm]?tsx?$/.test(file) || !decoratorSyntax.test(code)) return

    const result = ts.transpileModule(code, {
      fileName: file,
      compilerOptions: {
        target: ts.ScriptTarget.ES2024,
        module: ts.ModuleKind.ESNext,
        jsx: file.endsWith('x') ? ts.JsxEmit.ReactJSX : undefined,
        sourceMap: true,
      },
    })

    return {
      code: result.outputText.replace(/\n?\/\/# sourceMappingURL=.*$/u, '\n'),
      map: result.sourceMapText,
    }
  },
}

export default defineConfig({
  plugins: [standardDecoratorPlugin],
  resolve: { dedupe: ['react', 'react-dom'] },
  test: {
    exclude: [...configDefaults.exclude, '**/.local/**'],
    deps: { optimizer: { ssr: { enabled: true, include: ['react', 'react-test-renderer'] } } },
    coverage: {
      provider: qualityPolicy.coverage.provider,
      include: qualityPolicy.coverage.include,
      exclude: qualityPolicy.coverage.exclude,
      reporter: ['text', 'json-summary'],
      thresholds: qualityPolicy.coverage.thresholds,
    },
  },
})
