import type { ChildProcess } from 'node:child_process'

export interface TerminationOptions {
  processGroup?: boolean
  gracefulSignal?: NodeJS.Signals
  forceSignal?: NodeJS.Signals
  gracefulTimeoutMs?: number
  forceTimeoutMs?: number
}

export interface ChildExitResult {
  code: number | null
  signal: NodeJS.Signals | null
}

export function isRunning(child: ChildProcess): boolean
export function sendSignal(child: ChildProcess, signal: NodeJS.Signals, processGroup?: boolean): boolean
export function waitForChildClose(child: ChildProcess, timeoutMs?: number): Promise<ChildExitResult>
export function terminateChild(child: ChildProcess, options?: TerminationOptions): Promise<ChildExitResult & { forced: boolean }>
