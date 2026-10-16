import { rmSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { GenerationRuntime } from '../../src/host/generation/generation-runtime.ts'
import { observationExecution as execution, observationMediaFixture } from './fixtures/observation-media-runtime.ts'

const resources: { root: string; runtime: GenerationRuntime }[] = []
afterEach(() => {
  for (const { root, runtime } of resources.splice(0)) {
    runtime.close()
    rmSync(root, { recursive: true, force: true })
  }
})

function fixture() {
  const result = observationMediaFixture()
  resources.push(result)
  return result
}

describe('observation media references', () => {
  it('resolves more than two query batches without changing reference order', async () => {
    const { root, accept, resolve } = fixture()
    const images = []
    for (let index = 0; index < 41; index += 1) images.push({ run_id: await accept(), media_id: `media_aa_bb_${index * 3 + 1}` })
    const selected = [images[40]!, ...images.slice(0, 40), images[20]!]
    const result = await resolve(selected)
    expect(result).toHaveLength(42)
    expect(result[0]).toEqual({ ...images[40], path: join(root, 'media/aa/bb/media_aa_bb_121.png') })
    expect(result[1]).toEqual({ ...images[0], path: join(root, 'media/aa/bb/media_aa_bb_1.png') })
    expect(result[41]).toEqual({ ...images[20], path: join(root, 'media/aa/bb/media_aa_bb_61.png') })
  })

  it.each([
    undefined, null, {}, [], [null], ['image'], [{}],
    [{ run_id: ' ', media_id: 'media_1' }], [{ run_id: 'run_1', media_id: '\t' }],
    [{ run_id: 1, media_id: 'media_1' }], [{ run_id: 'run_1', media_id: null }],
    [{ run_id: 'run_1', media_id: 'media_1', path: '/manual.png' }],
  ].map(images => ({ images })))('rejects invalid image references before Workspace lookup: $images', async ({ images }) => {
    const { resolve, workspaceRegistry } = fixture()
    await expect(resolve(images)).rejects.toMatchObject({ code: 'GENERATION_PARAMETER_INVALID' })
    expect(workspaceRegistry.resolveByPath).not.toHaveBeenCalled()
  })

  it('resolves the selected image subset and duplicate references in input order using the owning Workspace', async () => {
    const { root, accept, resolve, workspaceRegistry } = fixture()
    const runId = await accept()
    const images = [
      { run_id: runId.slice(0, 12), media_id: 'media_aa_bb_3' },
      { run_id: runId, media_id: 'media_aa_bb_1' },
      { run_id: runId.slice(0, 12), media_id: 'media_aa_bb_3' },
    ]
    const before = structuredClone(images)
    expect(await resolve(images)).toEqual([
      { run_id: runId, media_id: 'media_aa_bb_3', path: join(root, 'media/aa/bb/media_aa_bb_3.png') },
      { run_id: runId, media_id: 'media_aa_bb_1', path: join(root, 'media/aa/bb/media_aa_bb_1.png') },
      { run_id: runId, media_id: 'media_aa_bb_3', path: join(root, 'media/aa/bb/media_aa_bb_3.png') },
    ])
    expect(images).toEqual(before)
    expect(workspaceRegistry.resolveByPath).toHaveBeenCalledWith('/workspace')
  })
})
