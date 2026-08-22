export type RuntimeDependencyPolicy = {
  readonly packages: readonly string[]
  readonly install: {
    readonly strictDepBuilds: true
    readonly strictPeerDependencies: true
  }
  readonly workspace: {
    readonly strictDepBuilds: true
    readonly allowBuilds: Readonly<Record<string, true>>
    readonly overrides: Readonly<Record<string, string>>
  }
}

export const RUNTIME_DEPENDENCY_POLICY: RuntimeDependencyPolicy

export function readPnpmPackageManagerVersion(manifest: unknown, label?: string): string
export function runtimeInstallNpmrc(): string
export function runtimeInstallEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv
