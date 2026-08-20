import { defineConfig } from 'tsdown'
import { typertPlugin } from '@deepseek-ai/dsh-typert-generator/tsdown'

export default defineConfig([
  {
    entry: { index: 'lib/types/src/index.js' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'node22.19.0',
    fixedExtension: false,
    dts: false,
    clean: false,
    plugins: [typertPlugin({ mode: 'package', faces: ['host'] })],
  },
  {
    entry: {
      index: 'src/index.ts',
      client: 'src/client/index.tsx',
    },
    outDir: 'lib/types',
    format: 'esm',
    platform: 'node',
    target: 'node22.19.0',
    fixedExtension: false,
    dts: { emitDtsOnly: true },
    clean: false,
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  },
])
