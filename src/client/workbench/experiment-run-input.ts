import { useEffect, useMemo, useState } from 'react'
import type { WorkbenchRun, WorkbenchRunInput } from '../../workbench/contract.ts'
import type { ExperimentRemote } from './experiment-contract.ts'

const empty = new Map<string, WorkbenchRunInput>()

export function useRunInputs(load: ExperimentRemote['getRunInput'], workspaceId: string | null, workId: string | null,
  runs: readonly WorkbenchRun[], onError: (message: string) => void) {
  const scope = JSON.stringify([workspaceId, workId])
  const requests = JSON.stringify(runs.map(run => [run.run_id, run.status, run.updated_at]))
  const cache = useMemo(() => new Map<string, Promise<WorkbenchRunInput>>(), [load, scope])
  const [saved, setSaved] = useState<{ scope: string; values: ReadonlyMap<string, WorkbenchRunInput> }>({ scope, values: empty })
  useEffect(() => {
    if (!workspaceId || !workId) return
    let active = true
    for (const run of runs) {
      const key = JSON.stringify([run.run_id, run.status, run.updated_at])
      let pending = cache.get(key)
      if (!pending) {
        pending = load({ workspaceId, workId, runId: run.run_id })
        cache.set(key, pending)
      }
      void pending.then(input => {
        if (!active) return
        setSaved(current => {
          const values = current.scope === scope ? current.values : empty
          if (values.get(run.run_id) === input) return current
          return { scope, values: new Map(values).set(run.run_id, input) }
        })
      }).catch(error => {
        cache.delete(key)
        if (active) onError(error instanceof Error ? error.message : String(error))
      })
    }
    return () => { active = false }
  }, [cache, load, scope, requests, onError])
  return saved.scope === scope ? saved.values : empty
}
