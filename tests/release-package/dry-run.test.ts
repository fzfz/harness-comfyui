import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { runReleaseDryRun } from '../../scripts/release/dry-run.mjs'

describe('release dry-run', () => {
  it('runs only the shared build, pack, validate, and release-smoke entry points in order', () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-dry-run-'))
    const calls: string[][] = []

    runReleaseDryRun(root, {
      runCommand: ({ args }) => {
        calls.push(args)
        return 0
      },
    })

    expect(calls).toEqual([
      ['run', 'build'],
      ['run', 'package:pack'],
      ['run', 'package:validate'],
      ['run', 'release:smoke'],
    ])
    expect(calls.flat().join(' ')).not.toMatch(/(?:tag|push|gh|deploy|release:create)/i)
  })

  it('stops at the first failed shared entry point', () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-comfyui-dry-run-fail-'))
    const calls: string[][] = []

    expect(() =>
      runReleaseDryRun(root, {
        runCommand: ({ args }) => {
          calls.push(args)
          return args[1] === 'package:validate' ? 9 : 0
        },
      }),
    ).toThrow(/package:validate.*status 9/i)
    expect(calls).toEqual([
      ['run', 'build'],
      ['run', 'package:pack'],
      ['run', 'package:validate'],
    ])
  })
})
