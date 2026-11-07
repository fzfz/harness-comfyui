import type { DatabaseSync } from 'node:sqlite'

let sequence = 0
const depths = new WeakMap<DatabaseSync, number>()

export function transaction<T>(database: DatabaseSync, callback: () => T): T {
  const nested = (depths.get(database) ?? 0) > 0
  const savepoint = `workbench_${++sequence}`
  database.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE')
  depths.set(database, (depths.get(database) ?? 0) + 1)
  try {
    const result = callback()
    if (result instanceof Promise) throw new TypeError('SQLite transaction callbacks must be synchronous')
    database.exec(nested ? `RELEASE SAVEPOINT ${savepoint}` : 'COMMIT')
    return result
  } catch (error) {
    database.exec(nested ? `ROLLBACK TO SAVEPOINT ${savepoint}` : 'ROLLBACK')
    if (nested) database.exec(`RELEASE SAVEPOINT ${savepoint}`)
    throw error
  } finally {
    depths.set(database, (depths.get(database) ?? 1) - 1)
  }
}
