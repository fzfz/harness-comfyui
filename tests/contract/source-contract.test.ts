import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const contract = JSON.parse(readFileSync(
  resolve(repositoryRoot, 'config/source-contract-v0.84.0.json'),
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

describe('Source Contract Identity v0.84.0', () => {
  it('pins the exact contract file identity and Source release version', () => {
    expect(contract.$id).toBe('harness-comfyui/source-contract-v0.84.0.json')
    expect(contract.contractId).toBe('imagegen-source-contract')
    expect(contract.sourceReleaseVersion).toBe('0.84.0')
  })

  it('requires sample images only for the eight insertable Catalog operations', () => {
    const catalog = contract.catalog as {
      normalization: {
        additionalRequiredResultFieldsByOperation: Record<string, readonly string[]>
        fieldMappings: Record<string, unknown>
      }
    }
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
})
