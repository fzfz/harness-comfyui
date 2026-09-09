import { useEffect, useState, useSyncExternalStore } from 'react'

import { IconWarningOutline16, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'

import type { SourceSettingsView } from '../../source-settings.ts'

export const COMFYUI_PRESET_ID = 'harness-comfyui-cli-candidate'

export const SOURCE_PRESET_TIP_COPY = Object.freeze({
  checkFailed: '数据源服务检查失败。请打开设置，检查“ComfyUI → 数据源服务”的 URL、端口和服务状态。',
})

type SourcePresetTipMessage = keyof typeof SOURCE_PRESET_TIP_COPY

export interface SourcePresetTipProps {
  readonly sessionId: string
  readonly useSessions: <Selected>(selector: (state: {
    readonly byId: Readonly<Record<string, {
      readonly projectionValues?: { readonly agentPreset?: string }
    } | undefined>>
  }) => Selected) => Selected
  readonly sourceScope: SettingsScope<SourceSettingsView>
  readonly probe: (signal: AbortSignal) => Promise<unknown>
}

export function SourcePresetTip({ sessionId, useSessions, sourceScope, probe }: SourcePresetTipProps) {
  const preset = useSessions(state => state.byId[sessionId]?.projectionValues?.agentPreset)
  const settings = useSyncExternalStore(
    listener => sourceScope.subscribe(listener),
    () => sourceScope.getSnapshot(),
  )
  const effectiveAddress = settings.value?.configuration
  const addressKey = effectiveAddress === undefined ? '' : `${effectiveAddress.url}\u0000${effectiveAddress.port}`
  const [notice, setNotice] = useState<{ readonly type: SourcePresetTipMessage; readonly sequence: number } | null>(null)

  useEffect(() => {
    if (preset !== COMFYUI_PRESET_ID) {
      setNotice(null)
      return
    }
    if (settings.status !== 'ready' || effectiveAddress === undefined) {
      setNotice(null)
      return
    }

    const controller = new AbortController()
    setNotice(null)
    void probe(controller.signal).catch(() => {
      if (!controller.signal.aborted) {
        setNotice(previous => ({ type: 'checkFailed', sequence: (previous?.sequence ?? 0) + 1 }))
      }
    })
    return () => controller.abort()
  }, [addressKey, preset, probe, settings.status])

  if (notice === null) return null
  return (
    <Toast
      key={`${notice.type}-${notice.sequence}`}
      text={SOURCE_PRESET_TIP_COPY[notice.type]}
      icon={<IconWarningOutline16 />}
      holdMs={6000}
      onDone={() => setNotice(null)}
    />
  )
}
