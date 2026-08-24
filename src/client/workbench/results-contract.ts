import errorCatalog from '../../../config/error-catalog.json' with { type: 'json' }

export type ResultTab = 'current' | 'session'

export const RESULTS_COPY = Object.freeze({
  title: '生成结果',
  close: '关闭生成结果',
  downloadWorkflow: '下载所属运行的 Workflow',
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

export interface GenerationErrorCopy {
  readonly code: string
  readonly title: string
  readonly reason: string
  readonly next_step: string
  readonly cancellable: boolean
  readonly confirm_repeat: boolean
}

export const GENERATION_ERROR_COPY: Readonly<Record<string, GenerationErrorCopy>> = Object.freeze(errorCatalog)

export function generationErrorCopy(errorCode: string): string {
  const entry = GENERATION_ERROR_COPY[errorCode]
  return entry === undefined
    ? `错误码 ${errorCode}。请检查 Harness 日志。`
    : `${entry.reason}${entry.next_step}`
}

export const MEDIA_PAGE_SIZE = 4
