import type { PackageArtifact } from './pack.mjs'

export interface PreviewOptions {
  expectedVersion?: string
  expectedCommit?: string
}

export declare function createReleasePreview(root?: string, options?: PreviewOptions): string
export declare function formatReleasePreview(artifact: PackageArtifact): string
