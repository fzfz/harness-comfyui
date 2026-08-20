import type { PackageArtifact } from './pack.mjs'

export interface ValidationResult {
  artifact: PackageArtifact
  entries: string[]
  packedManifest: Record<string, unknown>
}

export interface ValidateOptions {
  gitCommit?: (root: string) => string
  expectedVersion?: string
  expectedCommit?: string
  quiet?: boolean
}

export interface ParsedValidateArguments {
  root: string
  expectedVersion?: string
  expectedCommit?: string
}

export declare function assertExpectedIdentity(options?: ValidateOptions): {
  expectedVersion?: string
  expectedCommit?: string
}

export declare function parseArguments(argv: string[]): ParsedValidateArguments
export declare function readArtifact(root: string): { artifact: PackageArtifact; destination: string }
export declare function formatReleasePreview(artifact: PackageArtifact): string
export declare function validatePackage(root?: string, options?: ValidateOptions): ValidationResult
