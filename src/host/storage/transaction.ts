import type { DatabaseSync } from 'node:sqlite'

let sequence = 0
const frames = new WeakMap<DatabaseSync, Set<() => void>[]>()

export function afterCommit(database: DatabaseSync, callback: () => void): void {
  const current = frames.get(database)?.at(-1)
  if (current) current.add(callback)
  else callback()
}

export function transaction<T>(database: DatabaseSync, callback: () => T): T {
  const stack = frames.get(database) ?? []
  const parent = stack.at(-1)
  const pending = new Set<() => void>()
  const savepoint = `workbench_${++sequence}`
  database.exec(parent ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE')
  stack.push(pending)
  frames.set(database, stack)
  let result: T
  try {
    result = callback()
    if (result instanceof Promise) throw new TypeError('SQLite transaction callbacks must be synchronous')
    database.exec(parent ? `RELEASE SAVEPOINT ${savepoint}` : 'COMMIT')
  } catch (error) {
    database.exec(parent ? `ROLLBACK TO SAVEPOINT ${savepoint}` : 'ROLLBACK')
    if (parent) database.exec(`RELEASE SAVEPOINT ${savepoint}`)
    throw error
  } finally {
    stack.pop()
    if (stack.length === 0) frames.delete(database)
  }
  if (parent) for (const delivery of pending) parent.add(delivery)
  else for (const delivery of pending) delivery()
  return result
}
