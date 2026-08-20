import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const workspaceRoot = join(repositoryRoot, '.local', 'typert-workspace')
const packageRoot = join(workspaceRoot, 'packages', 'harness-comfyui')
const protocolPackageRoot = join(workspaceRoot, 'packages', 'dsh-typert-protocol')
const generatedNames = [
  'typert.host.js',
  'typert.host.d.ts',
  'typert.remote-client.js',
  'typert.remote-client.d.ts',
] as const

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function prepareWorkspace(): void {
  rmSync(workspaceRoot, { recursive: true, force: true })
  mkdirSync(packageRoot, { recursive: true })
  cpSync(join(repositoryRoot, 'src'), join(packageRoot, 'src'), { recursive: true })
  cpSync(join(repositoryRoot, 'config'), join(packageRoot, 'config'), { recursive: true })
  cpSync(join(repositoryRoot, 'package.json'), join(packageRoot, 'package.json'))
  cpSync(join(repositoryRoot, 'tsconfig.json'), join(packageRoot, 'tsconfig.json'))
  symlinkSync(join(repositoryRoot, 'node_modules'), join(workspaceRoot, 'node_modules'), 'dir')

  const require = createRequire(import.meta.url)
  const protocolManifest = require.resolve('@deepseek-ai/dsh-typert-protocol/package.json')
  cpSync(dirname(protocolManifest), protocolPackageRoot, { recursive: true })
  mkdirSync(join(protocolPackageRoot, 'src'), { recursive: true })
  writeFileSync(join(protocolPackageRoot, 'src', 'index.ts'), [
    "import { Service, type Context } from '@deepseek-ai/cordis'",
    '',
    'export interface TypertGatewayBinding<ServiceType extends object = object> {',
    '  readonly service: ServiceType',
    '  readonly serviceKey: string',
    '  readonly namespace: string',
    '}',
    '',
    'export interface RemoteFailure {',
    '  readonly code: string',
    '  readonly message: string',
    '  readonly details: object',
    '}',
    '',
    'export type RemoteResult<T> =',
    '  | { readonly ok: true; readonly value: T }',
    '  | { readonly ok: false; readonly error: RemoteFailure }',
    '',
    'export interface TypertRemoteContribution {',
    '  readonly package: string',
    '  readonly descriptors: readonly unknown[]',
    '}',
    '',
    'export declare abstract class TypertRemoteService<out T = never> extends Service<T> {',
    '  readonly typertRemote: TypertGatewayBinding<this>',
    '  protected constructor(ctx: Context, serviceKey: string, options?: { readonly namespace?: string })',
    '}',
    '',
    'type RemoteMethodDecorator = <This extends object, Args extends unknown[], Result>(',
    '  method: (this: This, ...args: Args) => Result,',
    '  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Result>,',
    ') => void',
    '',
    'export declare function Remote(exportName: string): RemoteMethodDecorator',
    '',
  ].join('\n'), 'utf8')
  const stagedProtocolManifest = JSON.parse(readFileSync(join(protocolPackageRoot, 'package.json'), 'utf8')) as Record<string, unknown>
  stagedProtocolManifest.exports = {
    '.': './src/index.ts',
    './package.json': './package.json',
  }
  writeJson(join(protocolPackageRoot, 'package.json'), stagedProtocolManifest)
  writeJson(join(protocolPackageRoot, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: ['src/**/*.ts'],
  })
  const packageScope = join(packageRoot, 'node_modules', '@deepseek-ai')
  mkdirSync(packageScope, { recursive: true })
  symlinkSync(protocolPackageRoot, join(packageScope, 'dsh-typert-protocol'), 'dir')
  writeJson(join(workspaceRoot, 'tsconfig.host.json'), {
    files: [],
    references: [
      { path: './packages/dsh-typert-protocol/tsconfig.json' },
      { path: './packages/harness-comfyui/tsconfig.json' },
    ],
  })
}

function copyGeneratedArtifacts(): void {
  for (const name of generatedNames) {
    const source = join(packageRoot, 'lib', name)
    const contents = readFileSync(source)
    writeFileSync(join(repositoryRoot, 'lib', name), contents)
  }
}

/**
 * Adapt the locked rc.7 workspace-only generator to this standalone package.
 * The official Typert plugin owns generation; this adapter only stages inputs
 * and copies its four public outputs back into the package build directory.
 */
export function standaloneTypertWorkspacePlugin(): Record<string, unknown> {
  return {
    name: 'harness-comfyui-standalone-typert-workspace',
    options() {
      prepareWorkspace()
    },
    writeBundle() {
      copyGeneratedArtifacts()
    },
    closeBundle() {
      rmSync(workspaceRoot, { recursive: true, force: true })
    },
  }
}

export const standaloneTypertOutputDirectory = join(packageRoot, 'lib')
