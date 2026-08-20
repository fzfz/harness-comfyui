import { defineConfig } from 'tsdown'
import { typertPlugin } from '@deepseek-ai/dsh-typert-generator/tsdown'

import {
  standaloneTypertOutputDirectory,
  standaloneTypertWorkspacePlugin,
} from './scripts/build/standalone-typert-plugin.ts'

export default defineConfig([
  {
    entry: {
      index: 'lib/types/src/index.js',
      types: 'lib/types/src/types.js',
    },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'node22.19.0',
    fixedExtension: false,
    dts: false,
    clean: false,
    plugins: [],
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
  {
    entry: { types: 'src/types.ts' },
    outDir: 'lib/types',
    format: 'esm',
    platform: 'node',
    target: 'node22.19.0',
    fixedExtension: false,
    dts: { emitDtsOnly: true },
    clean: false,
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  },
  {
    entry: { index: 'lib/types/src/index.js' },
    outDir: standaloneTypertOutputDirectory,
    format: 'esm',
    platform: 'node',
    target: 'node22.19.0',
    fixedExtension: false,
    dts: false,
    clean: false,
    plugins: [
      typertPlugin({ mode: 'package', faces: ['host'] }),
      standaloneTypertWorkspacePlugin(),
    ],
  },
])
