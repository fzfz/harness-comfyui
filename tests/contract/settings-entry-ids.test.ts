import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import entryIds from '../../config/settings-entry-ids.json' with { type: 'json' }
import entryIdSchema from '../../config/settings-entry-ids.schema.json' with { type: 'json' }
import { SOURCE_PROFILE_ENTRY_ID } from '../../src/source-settings.ts'
import { IMAGE_READER_PROFILE_ENTRY_ID } from '../../src/image-reader/settings.ts'

const requireFromModule = createRequire(import.meta.url)

describe('Settings Profile entry identities', () => {
  it('satisfies the shared entry ID schema', () => {
    expect(Object.keys(entryIds).sort()).toEqual([...entryIdSchema.required].sort())
    for (const key of entryIdSchema.required) {
      const constraint = entryIdSchema.properties[key as keyof typeof entryIdSchema.properties]
      const value = entryIds[key as keyof typeof entryIds]
      expect(typeof value).toBe(constraint.type)
      expect(value).toMatch(new RegExp(constraint.pattern))
    }
    expect(new Set(Object.values(entryIds)).size).toBe(entryIdSchema.required.length)
  })

  it('uses the shared IDs in Host and Client code and declares matching Loader rows', async () => {
    const yaml = requireFromModule('js-yaml')
    const { entryListSchema } = requireFromModule('@deepseek-ai/cordis-plugin-include')
    const rows = yaml.load(await readFile(resolve('cordis.patch.yml'), 'utf8'), { schema: entryListSchema }) as Array<{ insert?: Array<{ id: string }> }>
    const installed = new Set(rows.flatMap(row => row.insert?.map(entry => entry.id) ?? []))
    expect(SOURCE_PROFILE_ENTRY_ID).toBe(entryIds.core)
    expect(IMAGE_READER_PROFILE_ENTRY_ID).toBe(entryIds.imageReader)
    expect(installed.has(entryIds.core)).toBe(true)
    expect(installed.has(entryIds.imageReader)).toBe(true)
  })
})
