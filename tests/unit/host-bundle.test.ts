import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import {
  materializeSourceHostModule,
  sourceHostModulePath,
} from '../../scripts/production/host-module.mjs'

describe('Host bundle', () => {
  it('keeps Harness package imports external in the packaged JavaScript entry', async () => {
    const repositoryRoot = process.cwd()
    const output = await materializeSourceHostModule(repositoryRoot)
    const source = await readFile(output, 'utf8')

    expect(output).toBe(sourceHostModulePath(repositoryRoot))
    expect(source).toContain('from "@deepseek-ai/dsh-typert-protocol"')
    expect(source).not.toContain('class TypertRemoteService')
  })
})
