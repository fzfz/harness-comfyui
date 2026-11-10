import configuration from '../../config/workbench-agent-roles.json' with { type: 'json' }

export function defaultPresetForFunction(kind: string): string | undefined {
  return configuration.roles.find(role => role.functions.includes(kind))?.id
}
