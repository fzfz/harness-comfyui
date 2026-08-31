import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const contract = JSON.parse(readFileSync(
  resolve(repositoryRoot, 'config/source-contract-v0.86.1.json'),
  'utf8',
)) as Record<string, unknown>

const sampleImageOperationIds = [
  'querySemanticGenerationModelsForSkill',
  'querySemanticLorasForSkill',
  'querySemanticWorksForSkill',
  'querySemanticCharactersForSkill',
  'querySemanticStylesForSkill',
  'querySemanticPromptTermsForSkill',
  'querySemanticArtistPromptStringsForSkill',
  'querySemanticComfyuiTemplatesForSkill',
] as const

describe('Source Contract Identity v0.86.1', () => {
  it('pins the exact contract file identity and Source release version', () => {
    expect(contract.$id).toBe('harness-comfyui/source-contract-v0.86.1.json')
    expect(contract.contractId).toBe('imagegen-source-contract')
    expect(contract.sourceReleaseVersion).toBe('0.86.1')
  })

  it('requires sample images only for the eight insertable Catalog operations', () => {
    const catalog = contract.catalog as {
      discovery: { operationCount: number }
      operations: readonly unknown[]
      normalization: {
        additionalRequiredResultFieldsByOperation: Record<string, readonly string[]>
        fieldMappings: Record<string, unknown>
      }
    }
    expect(catalog.discovery.operationCount).toBe(10)
    expect(catalog.operations).toHaveLength(10)
    expect(catalog.normalization.additionalRequiredResultFieldsByOperation).toEqual(
      Object.fromEntries(sampleImageOperationIds.map(operationId => [operationId, ['sample_image_urls']])),
    )
    expect(catalog.normalization.additionalRequiredResultFieldsByOperation)
      .not.toHaveProperty('querySemanticBaseModelsForSkill')
    expect(catalog.normalization.additionalRequiredResultFieldsByOperation)
      .not.toHaveProperty('querySemanticComfyuiInstancesForSkill')
    expect(catalog.normalization.fieldMappings).toEqual({
      sample_image_urls: {
        target: 'sampleImageUrls',
        scope: 'catalog-item-display',
        includeInCatalogContext: false,
      },
    })
  })

  it('normalizes the Source v0.86.1 three-field TemplateBundle', () => {
    const source = contract.source as {
      operations: readonly unknown[]
      templateBundleNormalization: {
        requiredResultFields: readonly string[]
        mapping: Record<string, string>
      }
    }
    expect(source.operations).toHaveLength(2)
    expect((contract.catalog as { operations: readonly unknown[] }).operations.length + source.operations.length)
      .toBe(12)
    expect(source.templateBundleNormalization.requiredResultFields).toEqual(['id', 'title', 'workflow_json'])
    expect(source.templateBundleNormalization.mapping).toEqual({
      id: 'template_id',
      workflow_json: 'source_workflow',
    })
    for (const field of [
      'revision_number',
      'workflow_sha256',
      'config_revision',
      'dimension_strategy',
      'expected_output_node_ids_json',
    ]) {
      expect(source.templateBundleNormalization.requiredResultFields).not.toContain(field)
      expect(source.templateBundleNormalization.mapping).not.toHaveProperty(field)
    }
  })
})
