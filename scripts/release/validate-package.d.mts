import type { PackageArtifact } from './pack.mjs'

export interface ValidationResult {
  artifact: PackageArtifact
  entries: string[]
  packedManifest: Record<string, unknown>
}

export interface ValidateOptions {
  gitCommit?: (root: string) => string
}

export declare function validatePackage(root?: string, options?: ValidateOptions): ValidationResult
