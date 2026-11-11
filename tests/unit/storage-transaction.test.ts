import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import { afterCommit, transaction } from '../../src/host/storage/transaction.ts'

describe('SQLite commit delivery', () => {
  it('delivers changes once after the outer commit and discards rolled back changes', () => {
    const database = new DatabaseSync(':memory:')
    const committed = vi.fn()
    const discarded = vi.fn()
    try {
      transaction(database, () => {
        afterCommit(database, committed)
        transaction(database, () => afterCommit(database, committed))
        expect(committed).not.toHaveBeenCalled()
        expect(() => transaction(database, () => {
          afterCommit(database, discarded)
          throw new Error('rollback nested change')
        })).toThrow('rollback nested change')
      })
      expect(committed).toHaveBeenCalledTimes(1)
      expect(discarded).not.toHaveBeenCalled()
      expect(() => transaction(database, () => {
        transaction(database, () => afterCommit(database, discarded))
        throw new Error('rollback outer change')
      })).toThrow('rollback outer change')
      expect(discarded).not.toHaveBeenCalled()
    } finally { database.close() }
  })
})
