import { DatabaseSync } from 'node:sqlite'

export function publishSavedDesktopRun(destinationRunRepositoryFile, stagedRunRepositoryFile, runId) {
  const database = new DatabaseSync(destinationRunRepositoryFile)
  let transactionStarted = false
  try {
    database.prepare('ATTACH DATABASE ? AS fixture').run(stagedRunRepositoryFile)
    database.exec('BEGIN IMMEDIATE')
    transactionStarted = true
    database.prepare('INSERT INTO main.generation_runs SELECT * FROM fixture.generation_runs WHERE run_id = ?').run(runId)
    database.prepare('INSERT INTO main.generation_media SELECT * FROM fixture.generation_media WHERE run_id = ?').run(runId)
    database.exec('COMMIT')
    transactionStarted = false
  } catch (error) {
    if (transactionStarted) database.exec('ROLLBACK')
    throw error
  } finally {
    database.close()
  }
}
