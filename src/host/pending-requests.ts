/** Wait for cancelled requests to unwind within the owning plugin's deadline. */
export async function drainPendingRequests(pending: ReadonlySet<Promise<unknown>>, timeoutMs: number, message: string): Promise<void> {
  if (pending.size === 0) return
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      Promise.allSettled([...pending]),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs) }),
    ])
  } finally { clearTimeout(timer) }
}
