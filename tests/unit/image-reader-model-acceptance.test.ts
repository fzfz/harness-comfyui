import { describe, expect, it } from 'vitest'

import {
  IMAGE_READER_MODEL_ACCEPTANCE_TIMEOUT_MS,
  classifyImageReaderModelAcceptance,
} from '../../scripts/verification/image-reader-model-acceptance.mjs'

const diagnosticPrefix = 'IMAGE_READER_PROVIDER_FAILED: The runtime visual model did not complete the image inspection. profile_name="配置 B"; profile_id="profile-b"; connection_type="runtime"; provider="opencode-go"; model="qwen3.8-flash"; temperature=0.1; max_tokens=8192; '

describe('image reader real-model acceptance decision table', () => {
  it('uses a fixed 60-second completion deadline', () => {
    expect(IMAGE_READER_MODEL_ACCEPTANCE_TIMEOUT_MS).toBe(60_000)
  })

  it('classifies every decision-table fixture into exactly one distinct result', () => {
    const cases = [
      {
        expected: { kind: 'stop-success', passed: true },
        input: {
          timedOut: false,
          exitCode: 0,
          stdout: '{"provider":"opencode-go","model":"deepseek-v4-flash-vision-exp","file_path":"/tmp/image.png","observation":"可见结果"}\n',
          stderr: '',
        },
      },
      {
        expected: { kind: 'provider-error-finish', passed: true },
        input: {
          timedOut: false,
          exitCode: 1,
          stdout: '',
          stderr: `${diagnosticPrefix}finish_kind="error"; failure_code="UPSTREAM_IMAGE_ERROR"; failure_status=422; request_id="request-1".\n`,
        },
      },
      {
        expected: { kind: 'provider-aborted-finish', passed: true },
        input: {
          timedOut: false,
          exitCode: 1,
          stdout: '',
          stderr: `${diagnosticPrefix}finish_kind="aborted"; failure_code="PROVIDER_ABORTED".\n`,
        },
      },
      {
        expected: { kind: 'caller-cancelled', passed: true },
        input: { timedOut: false, callerErrorName: 'AbortError', exitCode: null, stdout: '', stderr: '' },
      },
      {
        expected: { kind: 'timeout-without-output', passed: false },
        input: { timedOut: true, exitCode: null, stdout: '', stderr: '' },
      },
      {
        expected: { kind: 'timeout-with-partial-output', passed: false },
        input: { timedOut: true, exitCode: null, stdout: 'partial', stderr: '' },
      },
      {
        expected: { kind: 'unexpected-error-code', passed: false },
        input: { timedOut: false, exitCode: 1, stdout: '', stderr: 'IMAGE_READER_MODEL_UNAVAILABLE: unavailable\n' },
      },
      {
        expected: { kind: 'invalid-output', passed: false },
        input: { timedOut: false, exitCode: 0, stdout: '{"provider":"opencode-go"}\n', stderr: '' },
      },
    ] as const

    const results = cases.map(({ expected, input }) => {
      const result = classifyImageReaderModelAcceptance(input)
      expect(result).toEqual(expected)
      return result.kind
    })
    expect(new Set(results).size).toBe(cases.length)
  })

  it('rejects mixed, multiline, or incomplete output instead of matching more than one branch', () => {
    for (const input of [
      {
        timedOut: false,
        exitCode: 0,
        stdout: '{"provider":"p","model":"m","file_path":"/tmp/a.png","observation":"ok"}\n',
        stderr: 'warning\n',
      },
      {
        timedOut: false,
        exitCode: 1,
        stdout: 'unexpected stdout\n',
        stderr: `${diagnosticPrefix}finish_kind="error"; failure_code="FAILED".\n`,
      },
      {
        timedOut: false,
        exitCode: 1,
        stdout: '',
        stderr: `${diagnosticPrefix}finish_kind="error"; failure_code="FAILED".\nsecond line\n`,
      },
      {
        timedOut: false,
        callerErrorName: 'AbortError',
        exitCode: null,
        stdout: '',
        stderr: 'IMAGE_READER_PROVIDER_FAILED: wrong branch\n',
      },
    ] as const) {
      expect(classifyImageReaderModelAcceptance(input)).toEqual({ kind: 'invalid-output', passed: false })
    }
  })
})
