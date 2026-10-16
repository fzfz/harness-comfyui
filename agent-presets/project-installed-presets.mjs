import Include from '@deepseek-ai/cordis-plugin-include'
import z from '@deepseek-ai/schemastery'
import { fileURLToPath } from 'node:url'

const installedPath = fileURLToPath(new URL('./presets.cordis.yml', import.meta.url))

/** @typedef {{ patches?: import('@deepseek-ai/cordis-plugin-include').PatchOptions[] }} InstalledPresetsConfig */

export default class InstalledPresets extends Include {
  static Config = z.transform(z.object({ patches: z.array(z.any()).default([]) }), config => ({
    ...config,
    path: installedPath,
  }))

  /** @param {import('@deepseek-ai/cordis').Context} ctx
   * @param {InstalledPresetsConfig} config */
  constructor(ctx, config = {}) {
    super(ctx, {
      path: installedPath,
      patches: config.patches,
    })
  }
}
