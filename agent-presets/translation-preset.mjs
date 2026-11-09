import AgentPreset from '@deepseek-ai/dsh-agent-preset'
import z from '@deepseek-ai/schemastery'
import translation from '../config/workbench-translation.json' with { type: 'json' }

export default class TranslationPreset extends AgentPreset {
  static Config = z.transform(z.any(), config => AgentPreset.Config({
    ...config, id: translation.preset_id, name: translation.preset_name,
  }))
}
