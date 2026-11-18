import React, { type Ref } from 'react'
import { Button } from './experiment-controls.tsx'
import type { PromptTranslationSnapshot } from './experiment-translation-state.ts'

export function PromptTranslationContent({ source, translation, request, scrollRef, onScroll }: {
  readonly source: string
  readonly translation: PromptTranslationSnapshot
  readonly request: () => void
  readonly scrollRef?: Ref<HTMLDivElement>
  readonly onScroll?: React.UIEventHandler<HTMLDivElement>
}) {
  const result = translation.current
  if (!source.trim()) return <div className="pc-empty">未填写提示词</div>
  if (!result) return <div className="pc-empty"><p>{translation.stale ? '原文已修改，请重新翻译。' : '尚无当前原文的译文。'}</p><Button kind="small" onClick={request}>翻译当前原文</Button></div>
  if (result.status === 'running') return <div className="pc-empty" role="status"><span className="prompt-spinner" />正在翻译</div>
  if (result.status === 'failed') return <div className="pc-empty" role="alert"><p>{result.error}</p><Button kind="small" onClick={request}>重试翻译</Button></div>
  return <div className="pc-text pc-translated" tabIndex={0} ref={scrollRef} onScroll={onScroll}>{result.text}</div>
}
