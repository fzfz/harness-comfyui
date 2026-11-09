import type { CoreServices } from '../core/schema.ts'
import type { ImageRef, ImageSource } from '../../workbench/contract.ts'
import { generationMediaContentUrl } from '../../generation/contract.ts'
import configuration from '../../workbench/input-files.json' with { type: 'json' }

export async function resolveInputImages(services: Pick<CoreServices, 'images' | 'runtime'>, refs: readonly ImageRef[], signal: AbortSignal): Promise<ImageSource[]> {
  return Promise.all(refs.map(async ref => {
    try {
      const file = await services.images.resolve(ref, signal)
      const url = ref.source.kind === 'uploaded_file'
        ? `${configuration.url_prefix}${encodeURIComponent(ref.source.file_id)}`
        : generationMediaContentUrl(ref.source.media_id, services.runtime.getMedia(ref.source.media_id).sessionId)
      return { image_ref_id: ref.image_ref_id, file_path: file.filePath, name: file.filename, url }
    } catch (error) {
      signal.throwIfAborted()
      return { image_ref_id: ref.image_ref_id, file_path: null, name: ref.image_ref_id, url: null, error: error instanceof Error ? error.message : String(error) }
    }
  }))
}
