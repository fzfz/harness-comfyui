import managedCliEnvironment from '../../config/managed-cli-environment.json' with { type: 'json' }
import { parseManagedCliEnvironment } from '../../config/managed-cli-environment-schema.ts'

export const CLI_ROUTE_PATH = '/api/harness-comfyui/cli/v1'
export { CLI_MAX_BODY_BYTES } from './limits.ts'
export const CLI_ENVIRONMENT_NAMES = Object.freeze(parseManagedCliEnvironment(managedCliEnvironment).environmentNames)
