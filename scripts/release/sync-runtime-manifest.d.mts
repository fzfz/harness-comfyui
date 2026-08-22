type RuntimeManifestDependencies = Readonly<Record<string, string>>

export type RuntimeManifestResult = {
  directory: string
  dependencies: RuntimeManifestDependencies
  packageManagerVersion: string
}

export type RuntimeManifestCheckResult = RuntimeManifestResult & {
  current: true
}

export function syncRuntimeManifest(root?: string): Promise<RuntimeManifestResult>
export function checkRuntimeManifest(root?: string): Promise<RuntimeManifestCheckResult>
