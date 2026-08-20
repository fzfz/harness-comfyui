import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const smokeScript = resolve(repositoryRoot, 'scripts/release/smoke.mjs')
const artifactManifestPath = resolve(repositoryRoot, '.release/quality/artifact.json')

function runSmoke(): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [smokeScript, '--artifact-manifest', artifactManifestPath], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('release-smoke process exceeded 90 seconds'))
    }, 90_000)
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', error => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('close', code => {
      clearTimeout(timeout)
      resolveResult({ code, stdout, stderr })
    })
  })
}

describe('release artifact smoke', () => {
  it('runs the exact artifact from an isolated extracted directory', async () => {
    const manifest = JSON.parse(await readFile(artifactManifestPath, 'utf8')) as { commit: string; sha256: string; version: string }
    const result = await runSmoke()
    expect(result.code, result.stderr || result.stdout).toBe(0)
    const evidence = JSON.parse(result.stdout.trim()) as {
      artifact: { commit: string; sha256: string; version: string }
      configuration: string
      bootEntries: string[]
      runtimeVersions: { cliDsh: string; dshBase: string; dshWebApp: string; harnessComfyui: string }
      cleanup: { processExited: boolean; portReleased: boolean; directoryRemoved: boolean }
    }
    expect(evidence.artifact).toEqual({
      commit: manifest.commit,
      sha256: manifest.sha256,
      version: manifest.version,
    })
    expect(evidence.configuration).toBe('release-smoke')
    expect(evidence.bootEntries).toContain('@deepseek-ai/dsh-client-ui-layout')
    expect(evidence.bootEntries).toContain('@deepseek-ai/dsh-client-ui-conversation')
    expect(evidence.bootEntries).toContain('harness-comfyui')
    expect(evidence.runtimeVersions).toEqual({
      cliDsh: manifest.version,
      dshBase: manifest.version,
      dshWebApp: manifest.version,
      harnessComfyui: manifest.version,
    })
    expect(evidence.cleanup).toEqual({
      processExited: true,
      portReleased: true,
      directoryRemoved: true,
    })
  }, 120000)
})
