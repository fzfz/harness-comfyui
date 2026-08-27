import errorCatalog from '../../../config/error-catalog.json' with { type: 'json' }
import { parseCatalogContext, type CatalogContext } from '../../catalog/contract.ts'

export const WORKBENCH_ENTRY_ID = 'harness-comfyui-workbench'
export const WORKBENCH_DOCK_ID = 'harness-comfyui-context-dock'
export const WORKBENCH_RESULTS_OVERLAY_ID = 'harness-comfyui-results-overlay'
export const WORKBENCH_DETAILS_PRIORITY = -10
export const WORKBENCH_CONTEXT_RECORD_TYPE = 'comfyui-context'

export const WORKBENCH_COPY = Object.freeze({
  entry: 'ComfyUI 工作台',
  insertContext: '插入上下文',
  openResults: '生成结果',
  selectedContexts: '已选中上下文',
  removeContext: '移除',
  dialogTitle: '插入 ComfyUI 上下文',
  closeDialog: '关闭',
  cancel: '取消',
  confirm: '插入',
  search: '搜索',
  baseModel: '底模',
  allBaseModels: '全部底模',
  previousPage: '上一页',
  nextPage: '下一页',
  noCover: '暂无封面',
  selected: '已选',
  selectItem: '选择',
  selectedItem: '已选择',
  galleryTitle: '预览封面与样例图',
  openGallery: '预览图片',
  closeGallery: '返回资源列表',
  previousImage: '上一张图片',
  nextImage: '下一张图片',
  currentImage: '当前图片',
  image: '图片',
  imageLoadFailed: '当前图片加载失败，请切换其他图片或关闭预览。',
  loading: '加载中',
  empty: '无结果',
})

function errorCode(value: unknown): string {
  if (value instanceof Error && 'code' in value && typeof value.code === 'string') return value.code
  return 'CATALOG_REMOTE_FAILED'
}

export function catalogFailureText(error: unknown): string {
  return workbenchErrorText(errorCode(error))
}

export function workbenchErrorText(code: string): string {
  const entry = errorCatalog[code as keyof typeof errorCatalog] ?? errorCatalog.CATALOG_REMOTE_FAILED
  return `${entry.code}：${entry.reason}${entry.next_step}`
}

export function workbenchContextKey(context: CatalogContext): string {
  return `${context.kind}:${context.id}`
}

export function serializeWorkbenchContext(context: CatalogContext): string {
  const data = context.kind === 'comfyui-template'
    ? { kind: context.kind, id: context.id, title: context.title }
    : context
  return JSON.stringify({ type: WORKBENCH_CONTEXT_RECORD_TYPE, data })
}

export function parseWorkbenchContext(line: string): CatalogContext | null {
  try {
    const value: unknown = JSON.parse(line)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    if (Object.keys(record).length !== 2 || record.type !== WORKBENCH_CONTEXT_RECORD_TYPE) return null
    return parseCatalogContext(record.data)
  } catch {
    return null
  }
}

export function workbenchContextsFromDraft(draft: string): readonly CatalogContext[] {
  return draft.split('\n').flatMap(line => {
    const item = parseWorkbenchContext(line)
    return item === null ? [] : [item]
  })
}

export function replaceWorkbenchContextLines(draft: string, items: Iterable<CatalogContext>): string {
  const retained = draft.split('\n').filter(line => parseWorkbenchContext(line) === null).join('\n')
  const context = Array.from(items, serializeWorkbenchContext).join('\n')
  if (context === '') return retained
  if (retained === '') return context
  return retained.endsWith('\n') ? `${retained}${context}` : `${retained}\n${context}`
}
