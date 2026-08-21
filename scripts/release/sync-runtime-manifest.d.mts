type RuntimeManifestDependencies = {
  '@deepseek-ai/dsh': string
  '@deepseek-ai/dsh-base': string
  '@deepseek-ai/dsh-web-app': string
}

export type RuntimeManifestResult = {
  directory: string
  dependencies: RuntimeManifestDependencies
}

export type RuntimeManifestCheckResult = RuntimeManifestResult & {
  current: true
}

export function syncRuntimeManifest(root?: string): Promise<RuntimeManifestResult>
export function checkRuntimeManifest(root?: string): Promise<RuntimeManifestCheckResult>
