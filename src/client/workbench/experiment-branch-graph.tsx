import React, { type CSSProperties } from 'react'
import type { Branch, Task, WorkbenchRun } from '../../workbench/contract.ts'
import { isGenerationRunTerminal } from '../../generation/run-status.ts'
import { Button } from './experiment-controls.tsx'
import { Identifier, shortId } from './experiment-identifier.tsx'
import presentation from './experiment-branch-graph.json' with { type: 'json' }
import runPresentation from './experiment-run-presentation.json' with { type: 'json' }

const { layout, labels } = presentation

interface BranchGraphProps {
  readonly branches: readonly Branch[]
  readonly tasks: readonly Task[]
  readonly runs: readonly WorkbenchRun[]
  readonly selectedRunId: string | null
  readonly baseModels?: readonly { id: string; label: string }[]
  readonly onRun: (runId: string) => void
  readonly onBranch: (branchId: string) => void
}

interface GraphRow {
  readonly branch: Branch
  readonly depth: number
  readonly top: number
}

interface RunNode {
  readonly run: WorkbenchRun
  readonly row: GraphRow
  readonly previousId: string | null
}

function branchRows(branches: readonly Branch[]): GraphRow[] {
  const ids = new Set(branches.map(branch => branch.branch_id))
  const children = new Map<string | null, Branch[]>()
  for (const branch of branches) {
    const parent = branch.parent_branch_id && ids.has(branch.parent_branch_id) ? branch.parent_branch_id : null
    children.set(parent, [...(children.get(parent) ?? []), branch])
  }
  const rows: GraphRow[] = []
  const append = (parent: string | null, depth: number) => {
    for (const branch of children.get(parent) ?? []) {
      rows.push({ branch, depth, top: rows.length * layout.rowHeight })
      append(branch.branch_id, depth + 1)
    }
  }
  append(null, 0)
  return rows
}

function branchSource(branch: Branch, branches: readonly Branch[], formatId: (id: string) => string = shortId): string {
  const parent = branches.find(item => item.branch_id === branch.parent_branch_id)
  let source: string
  if (branch.source_experience_id) {
    source = branch.source_run_id
      ? labels.experienceRun.replace('{experience}', formatId(branch.source_experience_id)).replace('{run}', formatId(branch.source_run_id))
      : labels.experience.replace('{id}', formatId(branch.source_experience_id))
  } else if (branch.source_run_id) {
    return labels.runSource.replace('{run}', formatId(branch.source_run_id))
  } else if (branch.source_artifact_id) {
    source = labels.artifact.replace('{id}', formatId(branch.source_artifact_id))
  } else if (branch.parent_branch_id) {
    source = labels.taskInput
  } else {
    return labels.root
  }
  return parent ? labels.parentSource.replace('{parent}', parent.name).replace('{source}', source) : source
}

export function ExperimentBranchGraph({ branches, tasks, runs, selectedRunId, baseModels, onRun, onBranch }: BranchGraphProps) {
  const rows = branchRows(branches)
  const taskBranches = new Map(tasks.map(task => [task.task_id, task.branch_id]))
  const groupedRuns = new Map(rows.map(row => [row.branch.branch_id, [] as WorkbenchRun[]]))
  for (const run of runs) groupedRuns.get(taskBranches.get(run.workbench_task_id) ?? '')?.push(run)
  const nodes: RunNode[] = rows.flatMap(row => groupedRuns.get(row.branch.branch_id)!.map((run, index, ownRuns) => ({
    run, row, previousId: index ? ownRuns[index - 1]!.run_id : row.branch.source_run_id,
  })))
  const nodesById = new Map(nodes.map(node => [node.run.run_id, node]))
  const columns = new Map<string, number>()
  const column = (node: RunNode): number => {
    const existing = columns.get(node.run.run_id)
    if (existing !== undefined) return existing
    const previous = node.previousId ? nodesById.get(node.previousId) : undefined
    const result = previous ? column(previous) + 1 : node.row.depth
    columns.set(node.run.run_id, result)
    return result
  }
  const left = (node: RunNode) => layout.nodeLeft + column(node) * layout.columnWidth
  const top = (node: RunNode) => node.row.top + layout.nodeTop
  const width = Math.max(layout.minimumWidth, ...nodes.map(node => left(node) + layout.nodeWidth + layout.nodeLeft))
  const style = {
    width, height: rows.length * layout.rowHeight + layout.bottomPadding,
    '--branch-node-width': `${layout.nodeWidth}px`, '--branch-node-height': `${layout.nodeHeight}px`,
  } as CSSProperties
  return <div className="branch-graph" style={style}>
    <svg className="branch-graph-connections" role="img" aria-label={labels.connections} width={width} height={style.height}>
      {nodes.map(node => {
        const previous = node.previousId ? nodesById.get(node.previousId) : undefined
        if (!previous) return null
        const x = left(previous) + layout.nodeWidth, y = top(previous) + layout.connectionTop
        const targetX = left(node), targetY = top(node) + layout.connectionTop
        return <path key={node.run.run_id} d={`M${x} ${y} C${x + layout.curveOffset} ${y},${targetX - layout.curveOffset} ${targetY},${targetX} ${targetY}`}>
          <title>{`${previous.run.run_id} → ${node.run.run_id}`}</title>
        </path>
      })}
    </svg>
    {rows.map(row => {
      const branch = row.branch
      const ownNodes = nodes.filter(node => node.row === row)
      const draft = branch.editing_draft ?? branch.draft
      const model = baseModels?.find(model => model.id === draft.base_model_id)?.label ?? draft.generation_input.model?.file_name
      return <article className="branch-graph-node" key={branch.branch_id} style={{ top: row.top, height: layout.rowHeight }}>
        <div className="branch-graph-heading row">
          <h3 title={branch.name}>{branch.name}</h3>
          {model && <span className="pill" title={model}>{model}</span>}
          <p title={branchSource(branch, branches, id => id)}>{branchSource(branch, branches)}</p>
          <span className="spacer" />
          <Button kind="small" onClick={() => onBranch(branch.branch_id)}>{labels.enterBranch}</Button>
        </div>
        <div className="branch-graph-runs">
          {ownNodes.map(node => {
            const run = node.run
            const running = !isGenerationRunTerminal(run.status)
            const image = run.status === 'succeeded' ? run.media.find(media => media.media_kind === 'image' && media.url)?.url : undefined
            return <button type="button" key={run.run_id}
              className={`map-node status-${running ? 'running' : run.status}${selectedRunId === run.run_id ? ' active' : ''}`}
              style={{ left: left(node), top: layout.nodeTop }}
              aria-label={labels.openRun.replace('{id}', run.run_id)} aria-pressed={selectedRunId === run.run_id}
              onClick={() => onRun(run.run_id)}>
              <span className="map-node-art">
                {image ? <img src={image} alt={run.title} /> : <>
                  {running && <span className="loading-ring" aria-hidden="true" />}
                  <span>{run.status === 'succeeded' ? labels.emptyImage : runPresentation[run.status]}</span>
                </>}
              </span>
              <span className="map-node-heading">
                <b className="mono"><Identifier value={run.run_id} /></b>
                <small>{run.status === 'failed' || run.status === 'cancelled' ? runPresentation[run.status] : labels[run.initiator]}</small>
              </span>
              <small className="map-node-title" title={run.title}>{run.title}</small>
            </button>
          })}
          {!ownNodes.length && <small className="branch-graph-empty" style={{ left: layout.nodeLeft + row.depth * layout.columnWidth, top: layout.nodeTop }}>{labels.emptyBranch}</small>}
        </div>
      </article>
    })}
  </div>
}
