export type StaticResultTab = 'current' | 'session'

export type StaticRunTone = 'success' | 'pending' | 'failed' | 'unknown'

export interface StaticRunItem {
  readonly id: string
  readonly title: string
  readonly status: string
  readonly tone: StaticRunTone
  readonly instance: string
  readonly workflow: string
  readonly progress: number
  readonly progressLabel: string
  readonly detail: string
}

export type StaticMediaKind = 'image' | 'video' | 'audio'
export type StaticMediaTime = 'today' | 'yesterday' | 'older'

export interface StaticMediaItem {
  readonly id: string
  readonly runId: string
  readonly title: string
  readonly kind: StaticMediaKind
  readonly kindLabel: string
  readonly turnId: string
  readonly turnLabel: string
  readonly savedAt: string
  readonly time: StaticMediaTime
  readonly outputIndex: number
  readonly previewUrl: string | null
}

export interface StaticMediaFilters {
  readonly turn: string
  readonly kind: 'all' | StaticMediaKind
  readonly time: 'all' | StaticMediaTime
}

export const STATIC_RESULTS_COPY = Object.freeze({
  title: '生成结果',
  close: '关闭生成结果',
  downloadWorkflow: '下载所属运行的 Workflow',
  currentTab: '当前轮次结果',
  sessionTab: '本会话结果',
  total: '本会话共 6 项运行',
  currentFrom: '当前结果来自',
  currentTurn: '第 3 轮 · 生成服装与背景变体',
  currentTurnId: 'turn_portrait_03',
  turnFilter: '聊天轮次',
  kindFilter: '媒体种类',
  timeFilter: '保存时间',
  allTurns: '全部聊天轮次',
  allKinds: '全部媒体',
  allTimes: '全部时间',
  image: '图片',
  video: '视频',
  audio: '音频',
  today: '今天',
  yesterday: '昨天',
  older: '更早',
  previousPage: '上一页',
  nextPage: '下一页',
  noMedia: '当前筛选没有匹配的媒体',
  mediaCount: '个已保存媒体',
})

export function getMediaWorkflowDownloadLabel(item: Pick<StaticMediaItem, 'title'>): string {
  return `${STATIC_RESULTS_COPY.downloadWorkflow}：${item.title}`
}

export const STATIC_RUNS: readonly StaticRunItem[] = Object.freeze([
  {
    id: 'run_01J8QUEUE42',
    title: '银发调查员 · 深夜车站',
    status: '队列等待',
    tone: 'pending',
    instance: 'mac mini',
    workflow: 'Anima 角色半身像',
    progress: 12,
    progressLabel: '队列前方 2 项',
    detail: 'prompt_id 018c2f4e',
  },
  {
    id: 'run_01J8RUNNING',
    title: '2B · 废墟花园',
    status: '远端运行',
    tone: 'pending',
    instance: 'win3080',
    workflow: 'WAI 文生图',
    progress: 68,
    progressLabel: 'KSampler 19 / 28',
    detail: 'prompt_id 422f8d91',
  },
  {
    id: 'run_01J8SAVE003',
    title: '雨夜街巷 · 服装变体',
    status: '保存媒体',
    tone: 'pending',
    instance: 'win3080',
    workflow: 'WAI 文生图',
    progress: 33,
    progressLabel: '保存 1 / 3 项',
    detail: 'output 0',
  },
  {
    id: 'run_01J8UNKNOWN',
    title: '银发调查员 · 室内逆光',
    status: '提交结果未知',
    tone: 'unknown',
    instance: 'mac mini',
    workflow: 'Anima 角色半身像',
    progress: 45,
    progressLabel: '未确认 prompt_id',
    detail: 'run_id 已保存',
  },
])

const CHARACTER_PREVIEW = 'http://127.0.0.1:18092/media/images/70/702a1f82-f33b-418d-bc65-a33b713eb891-93249.webp'

export const STATIC_MEDIA: readonly StaticMediaItem[] = Object.freeze([
  {
    id: 'media_01J8A', runId: 'run_01J8MEDIA01', title: '2B · 废墟花园', kind: 'image', kindLabel: '图片',
    turnId: 'turn_portrait_03', turnLabel: '第 3 轮 · 服装与背景变体', savedAt: '08-24 14:42', time: 'today',
    outputIndex: 0, previewUrl: CHARACTER_PREVIEW,
  },
  {
    id: 'media_01J8B', runId: 'run_01J8MEDIA02', title: '银发调查员 · 深夜车站', kind: 'image', kindLabel: '图片',
    turnId: 'turn_portrait_03', turnLabel: '第 3 轮 · 服装与背景变体', savedAt: '08-24 14:39', time: 'today',
    outputIndex: 1, previewUrl: CHARACTER_PREVIEW,
  },
  {
    id: 'media_01J8C', runId: 'run_01J8MEDIA03', title: '雨夜街巷镜头', kind: 'video', kindLabel: '视频',
    turnId: 'turn_portrait_03', turnLabel: '第 3 轮 · 服装与背景变体', savedAt: '08-23 21:08', time: 'yesterday',
    outputIndex: 0, previewUrl: CHARACTER_PREVIEW,
  },
  {
    id: 'media_01J8D', runId: 'run_01J8MEDIA04', title: '车站环境声', kind: 'audio', kindLabel: '音频',
    turnId: 'turn_portrait_02', turnLabel: '第 2 轮 · 场景声音', savedAt: '08-23 20:56', time: 'yesterday',
    outputIndex: 0, previewUrl: null,
  },
  {
    id: 'media_01J8E', runId: 'run_01J8MEDIA05', title: '室内逆光肖像', kind: 'image', kindLabel: '图片',
    turnId: 'turn_portrait_01', turnLabel: '第 1 轮 · 角色基准', savedAt: '08-18 12:20', time: 'older',
    outputIndex: 0, previewUrl: CHARACTER_PREVIEW,
  },
  {
    id: 'media_01J8F', runId: 'run_01J8MEDIA06', title: '角色转身镜头', kind: 'video', kindLabel: '视频',
    turnId: 'turn_portrait_01', turnLabel: '第 1 轮 · 角色基准', savedAt: '08-18 12:18', time: 'older',
    outputIndex: 1, previewUrl: CHARACTER_PREVIEW,
  },
])

export const STATIC_MEDIA_PAGE_SIZE = 4

export function filterStaticMedia(
  items: readonly StaticMediaItem[],
  filters: StaticMediaFilters,
): readonly StaticMediaItem[] {
  return items.filter(item => (
    (filters.turn === 'all' || item.turnId === filters.turn)
    && (filters.kind === 'all' || item.kind === filters.kind)
    && (filters.time === 'all' || item.time === filters.time)
  ))
}
