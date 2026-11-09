import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import { ComfyHttpTransport } from '../../src/host/generation/comfy-http-transport.ts'
import { GenerationRuntime } from '../../src/host/generation/generation-runtime.ts'
import { WorkbenchInputFileService } from '../../src/host/generation/input-file-service.ts'
import { SourceGenerationPreparer, type GenerationSource } from '../../src/host/generation/source-preparer.ts'
import { ComfyWorkflowCompiler } from '../../src/host/generation/workflow-compiler.ts'

it('prepares ordered image inputs through file import, target upload, compilation, and durable Run queries', async () => {
  const root = mkdtempSync(join(tmpdir(), 'generation-image-inputs-'))
  const database = new DatabaseSync(join(root, 'runs.sqlite'))
  let runtime: GenerationRuntime | undefined
  try {
    const files = new WorkbenchInputFileService({ database, directory: join(root, 'files'), maxFileBytes: 1024 })
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#abc' } }).png().toBuffer()
    const first = await files.importFile({ name: 'first.png', media_type: 'image/png', bytes })
    const second = await files.importFile({ name: 'second.png', media_type: 'image/png', bytes })
    const source: GenerationSource = {
      async readInstance(id) { return { id, title: 'Target', url: 'http://target:8188', credentialType: 'none', authorization: null } },
      async readTemplate(id) { return { id, title: 'Image template', workflow: { version: 0.4, nodes: [
        { id: 4, type: 'LoadImage', mode: 0, inputs: [], outputs: [], widgets_values: [['default.png']] },
        { id: 3, type: 'SaveImage', mode: 0, inputs: [], outputs: [], widgets_values: ['result'] },
      ], links: [] } } },
    }
    const uploaded: string[] = []
    const fetchImplementation: typeof fetch = async (url, init) => {
      if (String(url).endsWith('/upload/image')) {
        const file = (init!.body as FormData).get('image') as File
        expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array(bytes))
        uploaded.push(file.name)
        return new Response(JSON.stringify({ name: file.name, subfolder: 'workbench', type: 'input' }))
      }
      if (String(url).endsWith('/object_info')) return new Response(JSON.stringify({
        LoadImage: { input: { required: { image: ['COMBO', { options: ['default.png', ...uploaded.map(name => 'workbench/' + name)], multiselect: true }] } }, input_order: { required: ['image'], optional: [] }, output_node: false },
        SaveImage: { input: { required: { filename_prefix: ['STRING', {}] } }, input_order: { required: ['filename_prefix'], optional: [] }, output_node: true },
      }))
      throw new Error('Unexpected ComfyUI request: ' + String(url))
    }
    const transport = new ComfyHttpTransport({ source, fetchImplementation })
    const compiler = new ComfyWorkflowCompiler({ fetchImplementation, officialApiWorkflowCompiler: { async compile(input) { return { apiWorkflow: input.runtimeProjection, cacheKey: 'controlled', cacheStatus: 'miss' } } } })
    const preparer = new SourceGenerationPreparer({ defaultInstanceId: '2', source, compiler, images: {
      async resolve(ref, signal) { if (ref.source.kind !== 'uploaded_file') throw new Error('Unexpected image source'); return files.resolve(ref.source.file_id, signal) },
      upload: input => transport.upload(input),
    } })
    runtime = new GenerationRuntime({ database, runRepositoryFile: join(root, 'runs.sqlite'), runDirectory: join(root, 'runs'), savedMediaDirectory: join(root, 'media'), preparer })
    const accepted = await runtime.acceptGenerations({ workspaceId: 'workspace-source', sessionId: 'session-caller', turn: 1, callId: 'call-images' }, [{ requestId: '11111111-1111-4111-8111-111111111111', request: {
      title: 'Image run', templateId: '34', instanceId: '2', parameters: {}, loras: [], model: null,
      imageRefs: [
        { image_ref_id: 'first', source: { kind: 'uploaded_file', file_id: first.file_id }, purpose: 'both', reference_requirement: '' },
        { image_ref_id: 'second', source: { kind: 'uploaded_file', file_id: second.file_id }, purpose: 'workflow', reference_requirement: '' },
        { image_ref_id: 'agent', source: { kind: 'uploaded_file', file_id: 'agent-only-not-uploaded' }, purpose: 'agent', reference_requirement: 'lighting' },
      ], workflowImageBindings: [{ parameter_id: 'reference_image', image_ref_ids: ['second', 'first'] }],
    } }])
    await runtime.advance()
    const result = await runtime.readGenerationRunInputs({ workspaceId: 'workspace-reader', runIds: [accepted.items[0]!.runId] })
    expect(result.runs[0]).not.toHaveProperty('workflow_error')
    expect(result.runs[0]).toMatchObject({
      lookup_status: 'available', effective_input: { parameters: { reference_image: ['workbench/second.png', 'workbench/first.png'] } },
      submitted_input: { parameters: {} }, image_uploads: [
        { image_ref_id: 'first', parameter_id: 'reference_image', instance_id: '2', name: 'first.png', subfolder: 'workbench', type: 'input' },
        { image_ref_id: 'second', parameter_id: 'reference_image', instance_id: '2', name: 'second.png', subfolder: 'workbench', type: 'input' },
      ], workflow_status: 'available', workflow: { nodes: expect.arrayContaining([expect.objectContaining({ id: 4, widgets_values: [['workbench/second.png', 'workbench/first.png']] })]) },
    })
    expect(uploaded).toEqual(['first.png', 'second.png'])
  } finally { runtime?.close(); database.close(); rmSync(root, { recursive: true, force: true }) }
})
