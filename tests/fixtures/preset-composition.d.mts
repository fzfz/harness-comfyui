export function readProjectComposition(repositoryRoot: string, presetId: string): Promise<{
  id: string
  metadata: { name: string }
  composition: Array<{ id?: string; name: string; config?: unknown }>
}>
