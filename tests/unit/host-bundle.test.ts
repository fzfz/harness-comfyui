import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  materializeHostModule,
  hostModulePath,
  hostWorkerModulePath,
} from '../../scripts/build/host-module.mjs'

describe('Host bundle', () => {
  it('keeps Harness package imports external in the packaged JavaScript entry', async () => {
    const repositoryRoot = process.cwd()
    const [outputRoot, concurrentOutputRoot] = await Promise.all([
      mkdtemp(join(tmpdir(), 'harness-comfyui-host-bundle-')),
      mkdtemp(join(tmpdir(), 'harness-comfyui-host-bundle-')),
    ])
    const readChunks = async (entry: string) => {
      const seen = new Set<string>()
      const sources: string[] = []
      const visit = async (file: string): Promise<void> => {
        if (seen.has(file)) return
        seen.add(file)
        const source = await readFile(file, 'utf8')
        sources.push(source)
        for (const match of source.matchAll(/(?:from|import)\s*["'](\.[^"']+)["']/gu)) {
          await visit(resolve(dirname(file), match[1]!))
        }
      }
      await visit(entry)
      await visit(join(dirname(entry), 'core.js'))
      return sources.join('\n')
    }
    try {
      const staleOutput = resolve(outputRoot, '.local/source-host/stale-worker-chunk.js')
      await mkdir(dirname(staleOutput), { recursive: true })
      await writeFile(staleOutput, '--use-mock-keychain')
      const [output, concurrentOutput] = await Promise.all([
        materializeHostModule(repositoryRoot, { outputRoot }),
        materializeHostModule(repositoryRoot, { outputRoot: concurrentOutputRoot }),
      ])
      const workerOutput = hostWorkerModulePath(outputRoot)
      const [source, workerSource, concurrentSource] = await Promise.all([
        readChunks(output),
        readFile(workerOutput, 'utf8'),
        readChunks(concurrentOutput),
      ])

      expect(output).toBe(hostModulePath(outputRoot))
      expect(source).toContain('from "@deepseek-ai/dsh-typert-protocol"')
      expect(source).not.toContain('class TypertRemoteService')
      expect(source).toContain('new NodeWorkerComfyFrontend')
      expect(source).not.toContain('new ChromeComfyFrontend')
      expect(workerSource).toContain('runFrontendCompilerWorker')
      expect(workerSource).toContain('--use-mock-keychain')
      expect(workerSource).toContain('--disable-features=DialMediaRouteProvider')
      expect(workerSource).not.toContain('@deepseek-ai/')
      expect(concurrentSource).toContain('new NodeWorkerComfyFrontend')
      await expect(access(staleOutput)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await Promise.all([
        rm(outputRoot, { recursive: true, force: true }),
        rm(concurrentOutputRoot, { recursive: true, force: true }),
      ])
    }
  })
})
