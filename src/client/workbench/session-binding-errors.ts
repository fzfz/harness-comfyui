export const WORKBENCH_SESSION_ERROR_MESSAGES = {
  WORKBENCH_HOST_DISCONNECTED: '无法连接 Harness Host，暂时不能打开 ComfyUI 工作台会话。',
  WORKBENCH_SESSION_CREATE_FAILED: 'Harness 未能创建 ComfyUI 工作台会话，请查看产品日志。',
  WORKBENCH_SESSION_PRESET_MISMATCH: 'Harness 创建的会话没有使用 harness-comfyui Agent Preset。',
  WORKBENCH_SESSION_LIST_TIMEOUT: 'Harness 已创建会话，但会话列表在 10 秒内没有确认该记录。',
  WORKBENCH_SESSION_LIST_MISMATCH: 'Harness 会话列表中的 Agent Preset 与创建结果不一致。',
  WORKBENCH_SESSION_OPEN_FAILED: 'Harness 已确认会话，但工作台无法打开该会话。',
} as const

export type WorkbenchSessionErrorCode = keyof typeof WORKBENCH_SESSION_ERROR_MESSAGES

export type WorkbenchSessionBindingError = {
  code: WorkbenchSessionErrorCode
  message: (typeof WORKBENCH_SESSION_ERROR_MESSAGES)[WorkbenchSessionErrorCode]
}

export function createWorkbenchSessionError(code: WorkbenchSessionErrorCode): WorkbenchSessionBindingError {
  return {
    code,
    message: WORKBENCH_SESSION_ERROR_MESSAGES[code],
  }
}
