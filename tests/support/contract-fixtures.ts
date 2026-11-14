import { contracts, type ContractInput, type ContractValue } from '#contracts'

type WorkbenchRecord = ContractValue<'workbenchRecord'>

export function recordFixture<const Type extends WorkbenchRecord['type']>(value: ContractInput<'workbenchRecord'> & { type: Type }) {
  const parsed = contracts.parse('workbenchRecord', 'output', value)
  if (parsed.type !== value.type) throw new Error('The record fixture changed its discriminator')
  return parsed as Extract<WorkbenchRecord, { type: Type }>
}

type Artifact = ContractValue<'taskArtifact'>

export function artifactFixture<const Type extends Artifact['type']>(value: ContractInput<'taskArtifact'> & { type: Type }) {
  const parsed = contracts.parse('taskArtifact', 'input', value)
  if (parsed.type !== value.type) throw new Error('The artifact fixture changed its discriminator')
  return parsed as Extract<Artifact, { type: Type }>
}
