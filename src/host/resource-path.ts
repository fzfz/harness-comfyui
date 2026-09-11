import { fileURLToPath } from 'node:url'

export function repositoryResource(relativePath: string): string {
  return fileURLToPath(new URL(`../../${relativePath}`, import.meta.url))
}
