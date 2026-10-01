import { ERROR_CATALOG as errorCatalog, type ErrorCatalogEntry } from '../../../config/error-catalog-schema.ts'

export type ResultTab = 'current' | 'session'

export const RESULTS_COPY = Object.freeze({
  title: '生成结果',
  close: '关闭生成结果',
  errorDetails: '错误详情',
  closeErrorDetails: '关闭错误详情',
  runId: '运行 ID',
  errorCode: '错误码',
  downloadWorkflow: '下载所属运行的 Workflow',
  downloadOriginalMedia: '下载原文件',
  downloadOriginalMediaButtonLabelPrefix: '下载当前原文件：',
  openMediaViewer: '打开媒体查看器',
  mediaViewer: '媒体查看器',
  closeMediaViewer: '关闭媒体查看器',
  mediaViewerRunId: 'RUN_ID',
  copyRunId: '点击复制',
  runIdCopied: '已复制',
  runIdCopyFailed: '复制失败',
  copyRunIdButtonLabel: '复制当前 Run ID',
  runIdCopiedAnnouncementPrefix: '已复制完整 Run ID：',
  runIdCopyApiUnavailable: '当前 Desktop 不支持剪贴板写入。请手动选择上方显示的完整 Run ID。',
  runIdCopyPermissionDenied: 'Desktop 没有授予剪贴板写入权限。请重试，或手动选择上方显示的完整 Run ID。',
  currentTab: '运行状态',
  sessionTab: '本会话媒体',
  turnFilter: '聊天轮次',
  kindFilter: '媒体种类',
  allTurns: '全部聊天轮次',
  allKinds: '全部媒体',
  image: '图片',
  video: '视频',
  previousPage: '上一页',
  nextPage: '下一页',
  noMedia: '当前筛选没有匹配的媒体',
  mediaCount: '个已保存媒体',
  outputIndex: '输出',
})

export type GenerationErrorCopy = ErrorCatalogEntry

export const GENERATION_ERROR_COPY: Readonly<Record<string, GenerationErrorCopy>> = Object.freeze(errorCatalog)

export function generationErrorCopy(errorCode: string): string {
  const entry = GENERATION_ERROR_COPY[errorCode]
  return entry === undefined
    ? `错误码 ${errorCode}。请检查 Harness 日志。`
    : `${entry.reason}${entry.next_step}`
}

export const MEDIA_PAGE_SIZE = 4
