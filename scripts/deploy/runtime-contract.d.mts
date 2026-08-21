export type RuntimeDependencyPolicy = {
  readonly packages: readonly [
    '@deepseek-ai/dsh',
    '@deepseek-ai/dsh-base',
    '@deepseek-ai/dsh-web-app',
  ]
  readonly install: {
    readonly strictDepBuilds: true
    readonly strictPeerDependencies: true
  }
}

export const RUNTIME_DEPENDENCY_POLICY: RuntimeDependencyPolicy

export function readPnpmPackageManagerVersion(manifest: unknown, label?: string): string
export function runtimeInstallNpmrc(): string
export function runtimeInstallEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv
