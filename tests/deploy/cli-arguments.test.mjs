import { describe, expect, it } from 'vitest'

import {
  parseInstallArguments,
  parsePreflightArguments,
  parseUpgradeArguments,
  parseLifecycleArguments,
  parseLogsArguments,
} from '../../scripts/deploy/cli.mjs'

const installation = '/tmp/harness-comfyui-installation.json'
const artifact = '/tmp/harness-comfyui-release.tgz'

function expectUsageFailure(action, fragment) {
  expect(action).toThrowError(new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

describe('product CLI argument contracts', () => {
  it('requires --json for status and health', () => {
    expect(() => parseLifecycleArguments(['--installation', installation], 'status')).toThrow()
    expect(() => parseLifecycleArguments(['--installation', installation], 'health')).toThrow()
    expect(parseLifecycleArguments(['--json', '--installation', installation], 'status')).toEqual({
      json: true,
      installation,
    })
    expect(parseLifecycleArguments(['--json', '--installation', installation], 'health')).toEqual({
      json: true,
      installation,
    })
  })

  it('rejects --json for commands that do not expose JSON output', () => {
    for (const command of ['start', 'stop', 'restart', 'rollback']) {
      expectUsageFailure(
        () => parseLifecycleArguments(['--json', '--installation', installation], command),
        `--json is not supported for ${command}`,
      )
    }
  })

  it('requires both absolute artifact inputs for install, preflight, and upgrade', () => {
    for (const command of ['install', 'preflight', 'upgrade']) {
      const parseArguments = command === 'install'
        ? parseInstallArguments
        : command === 'preflight' ? parsePreflightArguments : parseUpgradeArguments
      expect(() => parseArguments(['--installation', installation])).toThrow()
      expect(() => parseArguments(['--artifact', artifact])).toThrow()
      expect(() => parseArguments(['--installation', 'relative.json', '--artifact', artifact])).toThrow()
      expect(() => parseArguments(['--installation', installation, '--artifact', 'release.tgz'])).toThrow()
      expect(parseArguments(['--installation', installation, '--artifact', artifact])).toEqual({
        installation,
        artifact,
      })
    }
  })

  it('requires the complete logs contract and allows only --follow as an optional flag', () => {
    expect(() => parseLogsArguments(['--installation', installation, '--source', 'stdout'])).toThrow()
    expect(() => parseLogsArguments(['--installation', installation, '--lines', '10'])).toThrow()
    expect(() => parseLogsArguments(['--source', 'stdout', '--lines', '10'])).toThrow()
    expect(() => parseLogsArguments([
      '--installation', installation,
      '--source', 'stdout',
      '--lines', '10',
      '--follow', '--follow',
    ])).toThrow()
    expect(() => parseLogsArguments([
      '--installation', installation,
      '--source', 'stdout',
      '--lines', '10',
      '--json',
    ])).toThrow()
    expect(parseLogsArguments([
      '--installation', installation,
      '--source', 'stdout',
      '--lines', '10',
      '--follow',
    ])).toEqual({
      installation,
      source: 'stdout',
      lines: 10,
      follow: true,
    })
  })

  it('rejects unknown, repeated, missing-value, and relative-path arguments', () => {
    expect(() => parseLifecycleArguments(['--installation', installation, '--unexpected'], 'status')).toThrow()
    expect(() => parseLifecycleArguments([
      '--json', '--json', '--installation', installation,
    ], 'status')).toThrow()
    expect(() => parseLifecycleArguments(['--installation'], 'status')).toThrow()
    expect(() => parseLifecycleArguments(['--installation', 'installation.json'], 'status')).toThrow()
    expect(() => parseInstallArguments([
      '--installation', installation,
      '--artifact', artifact,
      '--artifact', artifact,
    ])).toThrow()
    expect(() => parseLogsArguments([
      '--installation', installation,
      '--source', 'stdout',
      '--lines',
    ])).toThrow()
    expect(() => parseLogsArguments([
      '--installation', installation,
      '--source', 'stdout',
      '--lines', '1',
      '--unexpected',
    ])).toThrow()
  })
})
