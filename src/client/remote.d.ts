declare module 'harness-comfyui/remote' {
  const harnessComfyuiRemote: Parameters<import('@deepseek-ai/dsh-api-remotes/client').ClientRemote['$mount']>[0]
  export default harnessComfyuiRemote
}
