function isRunning(child) {
  return child.exitCode === null && child.signalCode === null
}

function sendSignal(child, signal, processGroup) {
  if (!isRunning(child) || child.pid === undefined) return false
  if (processGroup && process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal)
      return true
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error
    }
  }
  try {
    return child.kill(signal)
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
    return false
  }
}

function waitForClose(child, timeoutMs) {
  if (!isRunning(child)) return Promise.resolve({ code: child.exitCode, signal: child.signalCode })
  return new Promise(resolve => {
    let settled = false
    const finish = result => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      child.removeListener('close', onClose)
      child.removeListener('error', onError)
      resolve(result)
    }
    const onClose = (code, signal) => finish({ code, signal })
    const onError = () => finish({ code: child.exitCode, signal: child.signalCode })
    const timeout = setTimeout(() => finish(undefined), timeoutMs)
    child.once('close', onClose)
    child.once('error', onError)
  })
}

/**
 * Stop a child and its process group, escalating to SIGKILL when graceful
 * shutdown exceeds the bounded wait. The returned promise only resolves
 * after the child close event has been observed.
 */
export async function terminateChild(child, {
  processGroup = false,
  gracefulSignal = 'SIGTERM',
  forceSignal = 'SIGKILL',
  gracefulTimeoutMs = 1_000,
  forceTimeoutMs = 5_000,
} = {}) {
  if (!isRunning(child)) {
    return { code: child.exitCode, signal: child.signalCode, forced: false }
  }

  sendSignal(child, gracefulSignal, processGroup)
  const graceful = await waitForClose(child, gracefulTimeoutMs)
  if (graceful !== undefined) return { ...graceful, forced: false }

  sendSignal(child, forceSignal, processGroup)
  const forced = await waitForClose(child, forceTimeoutMs)
  if (forced === undefined) {
    throw new Error(`child process ${child.pid ?? 'unknown'} did not exit after ${forceSignal}`)
  }
  return { ...forced, forced: true }
}

export async function waitForChildClose(child, timeoutMs = 30_000) {
  const result = await waitForClose(child, timeoutMs)
  if (result === undefined) throw new Error(`child process ${child.pid ?? 'unknown'} did not exit within ${timeoutMs}ms`)
  return result
}

export { isRunning, sendSignal }
