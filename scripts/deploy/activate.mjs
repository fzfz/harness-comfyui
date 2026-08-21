import {
  ACTIVE_RELEASE_STATE_SCHEMA_VERSION,
  readActiveReleaseState,
  validateActiveReleaseState,
  writeActiveReleaseState,
} from './lifecycle.mjs'

function requireCandidateShape(candidate) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('candidate release must be an object')
  }
  const keys = Object.keys(candidate).sort()
  if (JSON.stringify(keys) !== JSON.stringify(['activeVersion', 'releasePath'])) {
    throw new Error('candidate release must contain only activeVersion and releasePath')
  }
  return candidate
}

function normalizeCandidate(installation, candidate) {
  const value = requireCandidateShape(candidate)
  return validateActiveReleaseState({
    schemaVersion: ACTIVE_RELEASE_STATE_SCHEMA_VERSION,
    installationId: installation.installationId,
    activeVersion: value.activeVersion,
    releasePath: value.releasePath,
    previousRelease: null,
  }, installation.root)
}

export async function activateProductRelease(installation, candidate) {
  const previous = await readActiveReleaseState(installation.root, installation.installationId)
  if (previous === undefined) throw new Error('cannot upgrade without an active release')
  const normalizedCandidate = normalizeCandidate(installation, candidate)
  if (normalizedCandidate.activeVersion === previous.activeVersion) {
    throw new Error(`release ${normalizedCandidate.activeVersion} is already active`)
  }
  const next = {
    ...normalizedCandidate,
    previousRelease: {
      activeVersion: previous.activeVersion,
      releasePath: previous.releasePath,
    },
  }
  await writeActiveReleaseState(installation.root, next)
  return { previous, active: next }
}

export async function restoreProductRelease(installation, state) {
  if (state === undefined) throw new Error('cannot restore an absent active release')
  if (state.installationId !== installation.installationId) {
    throw new Error('restored release installationId does not match installation')
  }
  return writeActiveReleaseState(installation.root, state)
}
