export interface PackageArtifact {
  tarballPath: string
  filename: string
  version: string
  commit: string
  byteLength: number
  sha256: string
}

export interface PackOptions {
  gitCommit?: (root: string) => string
  runPack?: (input: { root: string; destination: string; manifest: Record<string, unknown> }) => void
}

export declare function packPackage(root?: string, options?: PackOptions): PackageArtifact
