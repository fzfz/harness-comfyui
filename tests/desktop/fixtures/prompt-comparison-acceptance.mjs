import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { requestMessageText } from './official-mcp-acceptance.mjs'

import baseline from '../../../prototype/prompt-comparison-20261118/baseline.json' with { type: 'json' }
import example from '../../../prototype/prompt-comparison-20261118/prompt-comparison-example.json' with { type: 'json' }

const ROOT = `document.querySelector('[data-experiment-workbench-root]')?.shadowRoot`
const REMOTE = `window.__runPanelTestContext.get('remote.harnessComfyuiWorkbenchRemote')`
const PROMPT_MARKER = 'Desktop prompt comparison acceptance'
const TRANSLATION_MARKER = 'Desktop prompt translation acceptance'
const FIELDS = ['positive_prompt', 'negative_prompt']
const FIELD_LABELS = { positive_prompt: '正向提示词', negative_prompt: '负向提示词' }
export const PROMPT_COMPARISON_EVIDENCE_FILES = [
  'official-business-prompt-comparison.json',
  ...baseline.viewports.flatMap(({ width, height }) => FIELDS.map(field =>
    `official-business-prompt-comparison-${width}x${height}-${field}.png`)),
  ...baseline.viewports.flatMap(({ width, height }) => ['stale', 'translation-failed'].map(state =>
    `official-business-prompt-comparison-${width}x${height}-${state}.png`)),
  ...['stale', 'close-confirm', 'running', 'failed', 'failure', 'standalone', 'translation-failed', 'translation-retried'].map(state =>
    `official-business-prompt-comparison-${state}.png`),
  ...['reload', 'restart'].flatMap(phase => ['json', 'png'].map(extension =>
    `official-business-prompt-comparison-${phase}.${extension}`)),
]
const SAMPLE = {
  before: { positive_prompt: example.before.prompt, negative_prompt: example.before.negative },
  result: { positive_prompt: example.result.prompt, negative_prompt: example.result.negative },
  beforeTranslation: { positive_prompt: example.before.prompt_zh, negative_prompt: example.before.negative_zh },
  resultTranslation: { positive_prompt: example.result.prompt_zh, negative_prompt: example.result.negative_zh },
}

export function assertPromptComparisonLayout(observation, viewport) {
  assert.ok(observation, 'Prompt comparison layout is missing')
  const visible = (bounds, name) => {
    assert.ok(bounds && bounds.width > 0 && bounds.height > 0, `${name} is missing`)
    assert.ok(bounds.left >= -1 && bounds.top >= -1 && bounds.right <= viewport.width + 1
      && bounds.bottom <= viewport.height + 1, `${name} is outside the viewport`)
  }
  for (const name of ['modal', 'requirement', 'tabs', 'compose', 'footer', 'rewrite', 'adopt']) {
    visible(observation[name], name)
  }
  assert.equal(observation.columns.length, 2, 'Prompt comparison requires two columns')
  const [before, result] = observation.columns
  assert.ok(Math.abs(before.bounds.height - result.bounds.height) <= 1, 'Columns must have equal height')
  assert.ok(Math.abs(before.bounds.width - result.bounds.width) <= 1, 'Columns must have equal width')
  assert.ok(before.bounds.right <= result.bounds.left + 1, 'Columns overlap')
  for (const [index, column] of observation.columns.entries()) {
    visible(column.bounds, `column ${index}`)
    for (const name of ['source', 'translation']) {
      const pane = column[name]
      visible(pane?.bounds, `column ${index} ${name}`)
      assert.ok(['auto', 'scroll'].includes(pane.overflowY), `column ${index} ${name} must scroll`)
      assert.ok(pane.bounds.bottom <= column.bounds.bottom + 1, `column ${index} ${name} overflows its column`)
    }
    assert.ok(column.source.bounds.bottom <= column.translation.bounds.top + 1, 'Bilingual panes overlap')
  }
}

export function assertPromptComparisonTranslationAction(observation, viewport, expectedButton) {
  assert.ok(observation, 'Translation action is missing')
  assert.deepEqual(observation.viewport, viewport, 'Translation action viewport differs from the requested viewport')
  const pane = observation.pane
  assert.ok(pane && pane.width > 0 && pane.height > 0, 'Translation pane is missing')
  assert.ok(pane.left >= -1 && pane.top >= -1 && pane.right <= viewport.width + 1
    && pane.bottom <= viewport.height + 1, 'Translation pane is outside the viewport')
  const state = observation.state
  assert.ok(state && state.width > 0 && state.height > 0, 'Translation state container is missing')
  for (const name of ['message', 'button']) {
    const element = observation[name], bounds = element?.bounds
    assert.ok(element?.visible && bounds && bounds.width > 0 && bounds.height > 0, `Translation ${name} is not visible`)
    assert.ok(bounds.left >= pane.left - 1 && bounds.top >= pane.top - 1 && bounds.right <= pane.right + 1
      && bounds.bottom <= pane.bottom + 1, `Translation ${name} is clipped by the translation pane`)
    assert.ok(bounds.left >= state.left - 1 && bounds.top >= state.top - 1 && bounds.right <= state.right + 1
      && bounds.bottom <= state.bottom + 1, `Translation ${name} is clipped by the state container`)
  }
  assert.ok(observation.message.text.trim(), 'Translation status message is empty')
  assert.equal(observation.button.text, expectedButton, 'Translation action label differs from the requested action')
  assert.equal(observation.button.enabled, true, 'Translation action is disabled')
  assert.equal(observation.button.hit, true, 'Translation action hit test failed')
}

export async function createPromptComparisonWorkspace(page, evidenceDirectory) {
  const workspacePath = join(evidenceDirectory, 'prompt-comparison-workspace')
  await mkdir(workspacePath, { recursive: true, mode: 0o700 })
  const created = unwrap(await page.evaluate(`window.__runPanelTestContext.get('remote.workspace').create(${JSON.stringify({ path: workspacePath })})`))
  return { workspaceId: created.workspace.workspaceId, workspacePath }
}

export function isPromptComparisonModelRequest(request, kind) {
  return matchesRequest(request, kind === 'prompt' ? PROMPT_MARKER : TRANSLATION_MARKER)
}

export async function setPromptComparisonSidebarCollapsed(page, collapsed) {
  const available = await page.evaluate(`(() => {
    const current = document.querySelector('[data-sidebar-collapsed="true"]') !== null
    if (current === ${collapsed}) return true
    const button = document.querySelector('button[aria-label="' + (current ? '打开侧边栏' : '收起侧边栏') + '"]')
    if (!button) return false
    button.click()
    return true
  })()`)
  assert.equal(available, true, 'Official Desktop sidebar control is missing')
  await waitFor(page, `document.querySelector('[data-sidebar-collapsed="true"]') !== null`, current => current === collapsed)
}

export async function verifyPromptComparison(page, services, options) {
  const { workspaceId: sourceWorkspaceId, evidenceDirectory, agentModel, baseModelId, identity = null } = options
  await mkdir(evidenceDirectory, { recursive: true, mode: 0o700 })
  const { workspaceId, workspacePath } = await createPromptComparisonWorkspace(page, evidenceDirectory)
  const previous = await captureSelection(page, workspaceId)
  const evidence = { sourceWorkspaceId, workspaceId, workspacePath, baseline: 'prototype/prompt-comparison-20261118/baseline.json', identity, viewports: baseline.viewports,
    screenshots: [], observations: [], steps: [], requestStart: services.requestLog.length }
  let setup
  let held
  let persistence
  const failures = []
  const queueTranslation = (source, text) => services.enqueueModelResponse(
    request => hasUserText(request, `${TRANSLATION_MARKER}\n${source}`),
    { role: 'assistant', content: text },
  )
  const queueTranslationFailure = source => services.enqueueModelResponse(
    request => hasUserText(request, `${TRANSLATION_MARKER}\n${source}`),
    () => { throw new Error('翻译服务请求失败。') },
  )
  const queueCurrentTranslations = state => {
    for (const target of ['before', 'result']) for (const field of FIELDS) {
      const source = state[target][field]
      if (source.trim()) queueTranslation(source, state[`${target}Translation`][field])
    }
  }
  const queuePrompt = result => services.enqueueModelResponse(request => matchesRequest(request, PROMPT_MARKER),
    { role: 'assistant', content: JSON.stringify({ type: 'prompt', ...result }) })
  const screenshot = async name => {
    const filename = `official-business-prompt-comparison-${name}.png`
    await captureScreenshot(page, join(evidenceDirectory, filename))
    evidence.screenshots.push(filename)
  }
  try {
    setup = await page.evaluate(`(${preparePromptComparison.toString()})(${REMOTE}, ${JSON.stringify({
      workspaceId, agentModel, baseModelId, originalRequest: example.requirement,
      before: SAMPLE.before, promptMarker: PROMPT_MARKER, translationMarker: TRANSLATION_MARKER,
    })})`)
    evidence.setup = setup
    assert.equal(setup.phase, 'ready', JSON.stringify(setup))
    const scope = { workspace_id: workspaceId, work_id: setup.work.workId, branch_id: setup.work.branchId }
    queuePrompt(SAMPLE.result)
    const started = unwrap(await page.evaluate(`${REMOTE}.promptStart(${JSON.stringify({
      ...scope, function_id: setup.prompt.function_id, request_id: randomUUID(), intent: 'rewrite', draft: setup.draft,
      input: { original_request: example.requirement, base_model_id: baseModelId, change_request: '按原始需求改写提示词。', ...SAMPLE.before },
    })})`))
    await waitForTurn(page, workspaceId, started.request_id, 'succeeded')
    evidence.initialRequest = started.request_id
    evidence.steps.push('public-promptStart')
    queueCurrentTranslations(SAMPLE)
    await openWorkbench(page, { workspaceId, workId: setup.work.workId, branchId: setup.work.branchId })
    await setPromptComparisonSidebarCollapsed(page, true)
    await openComparison(page)
    await fill(page, 'textarea[aria-label="改动意见"]', example.instruction)
    evidence.fixtureDisplay = { sidebarInitiallyCollapsed: previous.sidebarCollapsed, sidebarCollapsed: true, instruction: example.instruction }
    await assertCurrentText(page, SAMPLE, 'positive_prompt')
    assert.equal(translationRequests(services).filter(request => request.sequence >= evidence.requestStart).length, 2,
      'Opening must translate only the two non-empty positive prompt regions')
    evidence.baseModelLabel = await page.evaluate(`(${ROOT}).querySelector('.pc-model')?.textContent`)
    evidence.prototypeBaseModelLabel = 'MOSS Image'
    for (const viewport of baseline.viewports) {
      await page.command('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false })
      await waitFor(page, `({ width: innerWidth, height: innerHeight })`, actual => actual.width === viewport.width && actual.height === viewport.height)
      for (const field of FIELDS) {
        await selectField(page, field)
        await assertCurrentText(page, SAMPLE, field)
        const observation = await page.evaluate(`(${readComparisonLayout.toString()})(${ROOT})`)
        assertPromptComparisonLayout(observation, viewport)
        evidence.observations.push({ viewport, field, ...observation })
        await screenshot(`${viewport.width}x${viewport.height}-${field}`)
      }
    }
    await verifyPromptCopies(page, SAMPLE)
    evidence.steps.push('copy-current-original-and-translation')
    await selectField(page, 'positive_prompt')
    await clickButton(page, '展开', '.pc-requirement')
    assert.equal(await page.evaluate(`(${ROOT}).querySelector('.pc-requirement button').getAttribute('aria-expanded')`), 'true')
    await clickButton(page, '收起', '.pc-requirement')
    const scrollPoint = await page.evaluate(`(() => {
      const source = (${ROOT}).querySelector('.pc-column[aria-label="改写前"] textarea, .pc-column[aria-label="改写前"] .pc-text')
      window.__promptComparisonScroll = null
      source.addEventListener('scroll', () => { window.__promptComparisonScroll = source.scrollTop }, { once: true })
      const rect = source.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })()`)
    await page.command('Input.dispatchMouseEvent', { type: 'mouseWheel', ...scrollPoint, deltaX: 0, deltaY: 120 })
    const scroll = await waitFor(page, 'window.__promptComparisonScroll', value => typeof value === 'number' && value > 0)
    await page.evaluate('delete window.__promptComparisonScroll')
    assert.ok(scroll > 0, 'Long original prompt must scroll')
    await selectField(page, 'negative_prompt')
    await selectField(page, 'positive_prompt')
    assert.equal(await page.evaluate(`(${ROOT}).querySelector('.pc-column[aria-label="改写前"] textarea, .pc-column[aria-label="改写前"] .pc-text').scrollTop`), scroll)
    evidence.steps.push('requirement-expand-collapse', 'positive-negative-scroll-retained')

    const firstTranslationCount = translationRequests(services).length
    await clickButton(page, '关闭', '.pc-footer')
    await waitForClosed(page)
    await openComparison(page)
    for (const field of FIELDS) {
      await selectField(page, field)
      await assertCurrentText(page, SAMPLE, field)
    }
    assert.equal(translationRequests(services).length, firstTranslationCount, 'Reopening must use saved matching translations')
    evidence.steps.push('reopen-translation-cache')

    const edited = structuredClone(SAMPLE)
    edited.result.positive_prompt += '\nA narrow amber edge highlights the fringe.'
    edited.resultTranslation.positive_prompt += '\n狭窄的琥珀色光勾勒靴口流苏。'
    await selectField(page, 'positive_prompt')
    const editStart = translationRequests(services).length
    await fill(page, 'textarea[aria-label="生成结果的正向提示词"]', edited.result.positive_prompt)
    await waitFor(page, `(${ROOT}).querySelector('.pc-column[aria-label="生成结果"]').textContent`, text => text.includes('原文已修改'))
    evidence.comparisonTranslationActions = { stale: await observeComparisonTranslationActions(page, '翻译当前原文', 'stale', screenshot) }
    await screenshot('stale')
    await selectField(page, 'negative_prompt')
    await selectField(page, 'positive_prompt')
    assert.equal(await inputValue(page, 'textarea[aria-label="生成结果的正向提示词"]'), edited.result.positive_prompt)
    assert.equal(translationRequests(services).length, editStart, 'Tab switching must preserve the explicit translation update action')
    assert.equal(await page.evaluate(`(${ROOT}).querySelector('.pc-column[aria-label="生成结果"] .pc-translated') === null`), true)
    queueTranslationFailure(edited.result.positive_prompt)
    await clickButton(page, '翻译当前原文', '.pc-column[aria-label="生成结果"]')
    await waitFor(page, `(${ROOT}).querySelector('.pc-column[aria-label="生成结果"] [role="alert"]')?.textContent`, Boolean)
    assert.equal(translationRequests(services).length, editStart + 1, 'Updating the edited source must send one translation request')
    assert.equal(await page.evaluate(`(${ROOT}).querySelector('.pc-column[aria-label="生成结果"] .pc-translated') === null`), true)
    evidence.comparisonTranslationActions.failed = await observeComparisonTranslationActions(page, '重试翻译', 'translation-failed', screenshot)
    queueTranslation(edited.result.positive_prompt, edited.resultTranslation.positive_prompt)
    await clickButton(page, '重试翻译', '.pc-column[aria-label="生成结果"]')
    await assertCurrentText(page, edited, 'positive_prompt')
    assert.equal(translationRequests(services).length, editStart + 2, 'Retrying the edited source must send one translation request')
    await screenshot('translation-retried')
    evidence.steps.push('manual-edit-retained', 'translation-update-explicit', 'compact-comparison-translation-failure-retry')

    await clickButton(page, '关闭', '.pc-footer')
    await waitFor(page, `(${ROOT}).querySelector('[role="alertdialog"][aria-label="保留编辑内容"]') !== null`, Boolean)
    await screenshot('close-confirm')
    await clickButton(page, '继续编辑', '[role="alertdialog"]')
    assert.equal(await inputValue(page, 'textarea[aria-label="生成结果的正向提示词"]'), edited.result.positive_prompt)
    await clickButton(page, '关闭', '.pc-footer')
    await clickButton(page, '保存并关闭', '[role="alertdialog"]')
    await waitForClosed(page)
    const saved = await waitForTurn(page, workspaceId, started.request_id, 'succeeded')
    assert.deepEqual(saved.candidate, edited.result)
    await openComparison(page)
    await assertCurrentText(page, edited, 'positive_prompt')
    await fill(page, 'textarea[aria-label="生成结果的正向提示词"]', edited.result.positive_prompt + '\nDiscard this temporary sentence.')
    await clickButton(page, '关闭', '.pc-footer')
    await clickButton(page, '放弃修改', '[role="alertdialog"]')
    await waitForClosed(page)
    await openComparison(page)
    assert.equal(await inputValue(page, 'textarea[aria-label="生成结果的正向提示词"]'), edited.result.positive_prompt)
    evidence.steps.push('continue-editing', 'save-and-close', 'discard-and-reopen')

    const rewrite = {
      before: edited.result, beforeTranslation: edited.resultTranslation,
      result: { positive_prompt: edited.result.positive_prompt + '\nKeep the cool grey cast shadow crisp.', negative_prompt: edited.result.negative_prompt + ', warm reflected light' },
      resultTranslation: { positive_prompt: edited.resultTranslation.positive_prompt + '\n保持冷灰色投影的边缘清晰。', negative_prompt: edited.resultTranslation.negative_prompt + ' 暖色反光。' },
    }
    const feedback = '保持冷灰色投影的边缘清晰，并排除右侧暖色反光。'
    queuePrompt(rewrite.result)
    queueCurrentTranslations(rewrite)
    await fill(page, 'textarea[aria-label="改动意见"]', feedback)
    const rewriteStart = services.requestLog.length
    await clickButton(page, '继续改写', '.pc-compose')
    await waitFor(page, `(${ROOT}).querySelector('textarea[aria-label="生成结果的正向提示词"]')?.value`, text => text === rewrite.result.positive_prompt)
    await assertCurrentText(page, rewrite, 'positive_prompt')
    const rewritten = await currentTurn(page, workspaceId, started.task_id, turn => turn.status === 'succeeded' && turn.result?.positive_prompt === rewrite.result.positive_prompt)
    assert.deepEqual({ positive_prompt: rewritten.input.positive_prompt, negative_prompt: rewritten.input.negative_prompt }, edited.result)
    assert.equal(rewritten.input.change_request, feedback)
    assert.equal(rewritten.input.original_request, example.requirement)
    const rewriteRequest = services.requestLog.find(request => request.sequence >= rewriteStart && matchesRequest(request, PROMPT_MARKER))
    assert.ok(rewriteRequest && userText(rewriteRequest).includes(feedback), 'Rewrite feedback must reach the model')
    evidence.rewrite = { request_id: rewritten.request_id, input: rewritten.input }
    evidence.steps.push('rewrite-current-edited-prompts')

    const finalState = { before: rewrite.result, beforeTranslation: rewrite.resultTranslation,
      result: rewrite.result, resultTranslation: rewrite.resultTranslation }
    queueCurrentTranslations(finalState)
    const stopStart = services.requestLog.length
    const stopRequest = request => request.sequence >= stopStart && matchesRequest(request, PROMPT_MARKER)
    held = services.pauseNextModelResponse(stopRequest)
    queuePrompt(rewrite.result)
    await fill(page, 'textarea[aria-label="改动意见"]', '保留当前人物与场景。')
    await clickButton(page, '继续改写', '.pc-compose')
    await awaitControlled(held.started, 'Prompt rewrite did not start')
    await waitFor(page, `(${ROOT}).querySelector('.pc-column[aria-label="改写前"] .pc-translated')?.textContent`, text => text === finalState.beforeTranslation.positive_prompt)
    assert.equal(await page.evaluate(`(() => { const root = ${ROOT}; return [...root.querySelectorAll('.pc-footer button')].find(button => button.textContent.trim() === '采用正负提示词')?.disabled })()`), true)
    await screenshot('running')
    await clickButton(page, '停止改写', '.pc-compose')
    const interrupted = await currentTurn(page, workspaceId, started.task_id, turn => turn.status === 'interrupted')
    held.release()
    assert.equal((await awaitControlled(held.closed, 'Stopped rewrite did not release its request')).finished, false)
    held = undefined
    evidence.stopped = interrupted.request_id
    evidence.steps.push('stop-rewrite', 'adopt-disabled-while-running')

    services.enqueueModelResponse(request => matchesRequest(request, PROMPT_MARKER), { role: 'assistant', content: 'invalid controlled prompt response' })
    await fill(page, 'textarea[aria-label="改动意见"]', feedback)
    await clickButton(page, '改写提示词', '.pc-compose')
    const failed = await currentTurn(page, workspaceId, started.task_id, turn => turn.status === 'failed')
    await waitFor(page, `(${ROOT}).querySelector('.pc-error')?.textContent`, text => text === failed.error.message)
    await screenshot('failed')
    queuePrompt(finalState.result)
    await clickButton(page, '改写提示词', '.pc-compose')
    const finalTurn = await currentTurn(page, workspaceId, started.task_id, turn => turn.status === 'succeeded' && turn.turn_index > interrupted.turn_index)
    for (const field of FIELDS) {
      await selectField(page, field)
      await assertCurrentText(page, finalState, field)
    }
    persistence = { workspaceId, workId: setup.work.workId, branchId: setup.work.branchId, taskId: started.task_id,
      requestId: finalTurn.request_id, identity, ...finalState }
    await clickButton(page, '采用正负提示词', '.pc-footer')
    await waitForClosed(page)
    const adopted = await waitForTurn(page, workspaceId, finalTurn.request_id, 'succeeded')
    assert.deepEqual(adopted.adopted, finalState.result)
    await waitFor(page, `(() => { const root = ${ROOT}; return { positive_prompt: root.querySelector('textarea#positive_prompt')?.value, negative_prompt: root.querySelector('textarea#negative_prompt')?.value } })()`, prompts => prompts.positive_prompt === finalState.result.positive_prompt && prompts.negative_prompt === finalState.result.negative_prompt)
    evidence.steps.push('failed-rewrite-retry', 'adopt-original-positive-negative')
    evidence.standalone = await verifyStandaloneTranslation(page, services, finalState, queueTranslation, queueTranslationFailure, screenshot)
    evidence.steps.push('standalone-translation', 'translation-failure-retry', 'close-cancels-translation')
    await verifyPromptComparisonPersistence(page, services, persistence, evidenceDirectory, 'reload')
    evidence.steps.push('reload-translation-cache')
  } catch (error) {
    failures.push(error)
    evidence.failure = errorDetails(error)
    try { await screenshot('failure') } catch (captureError) { failures.push(captureError) }
  } finally {
    held?.release()
    const cleanup = await Promise.allSettled([
      restoreSelection(page, workspaceId, previous),
      setPromptComparisonSidebarCollapsed(page, previous.sidebarCollapsed),
      page.command('Emulation.clearDeviceMetricsOverride'),
    ])
    evidence.cleanup = cleanup.map(result => ({ status: result.status, ...(result.status === 'rejected' ? { error: errorDetails(result.reason) } : {}) }))
    for (const result of cleanup) if (result.status === 'rejected') failures.push(result.reason)
    evidence.requestEnd = services.requestLog.length
    evidence.persistence = persistence
    await writeFile(join(evidenceDirectory, 'official-business-prompt-comparison.json'), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 })
  }
  if (failures.length) throw new AggregateError(failures, 'Prompt comparison Desktop acceptance failed')
  return persistence
}

export async function verifyPromptComparisonPersistence(page, services, state, evidenceDirectory, phase = 'restart') {
  const previous = await captureSelection(page, state.workspaceId)
  const requestStart = services.requestLog.length
  const evidence = { phase, identity: state.identity, workspaceId: state.workspaceId, workId: state.workId,
    requestId: state.requestId, requestStart, fields: [] }
  try {
    if (phase === 'reload') {
      await page.command('Page.reload', { ignoreCache: true })
      await waitFor(page, `document.readyState === 'complete' && !!window.__runPanelTestContext`, Boolean)
    }
    await openWorkbench(page, state)
    await openComparison(page)
    for (const field of FIELDS) {
      await selectField(page, field)
      await assertCurrentText(page, state, field)
      evidence.fields.push(field)
    }
    await delay(150)
    const requests = services.requestLog.filter(request => request.sequence >= requestStart && matchesRequest(request, TRANSLATION_MARKER))
    assert.equal(requests.length, 0, `${phase} must reuse saved matching translations`)
    await captureScreenshot(page, join(evidenceDirectory, `official-business-prompt-comparison-${phase}.png`))
    evidence.modelCalls = requests.length
  } catch (error) {
    evidence.failure = errorDetails(error)
    throw error
  } finally {
    await restoreSelection(page, state.workspaceId, previous)
    await writeFile(join(evidenceDirectory, `official-business-prompt-comparison-${phase}.json`), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 })
  }
  return evidence
}

async function preparePromptComparison(remote, input) {
  const take = result => { if (!result.ok) throw new Error(JSON.stringify(result)); return result.value }
  const work = take(await remote.mutate({ type: 'new-work', workspaceId: input.workspaceId,
    value: { name: 'Desktop 提示词对比', goal: input.originalRequest } }))
  const projection = take(await remote.getProjection(work))
  const prompt = projection.functions.find(binding => binding.kind === 'prompt')
  const translate = projection.functions.find(binding => binding.kind === 'translate')
  if (!prompt || !translate) return { phase: 'bindings', work, bindings: [prompt, translate].filter(Boolean) }
  const bindings = [prompt, translate]
  try {
    for (const binding of bindings) {
      take(await remote.mutate({ ...work, type: 'function-edit', id: binding.function_id, value: {
        name: binding.name, kind: binding.kind, preset_id: binding.preset_id,
        agent_model: input.agentModel, requested_skill: null,
        request_template: binding.kind === 'prompt'
          ? `${input.promptMarker}\n{{requirements_block}}\n{{prompt_edit_block}}\n{{references_block}}`
          : `${input.translationMarker}\n{{source_text}}`,
        ...(binding.request_parts ? { request_parts: binding.request_parts } : {}),
      } }))
    }
    const branch = projection.branches.find(branch => branch.branch_id === work.branchId)
    const draft = structuredClone(branch.editing_draft ?? branch.draft)
    draft.base_model_id = input.baseModelId
    draft.prompt_input = input.before
    take(await remote.mutate({ ...work, type: 'save-draft', value: {
      expected: branch.draft, expectedEditingDraft: branch.editing_draft, draft,
      originalRequest: input.originalRequest, expectedOriginalRequest: branch.original_request,
    } }))
    return { phase: 'ready', work, prompt, bindings, draft }
  } catch (error) {
    return { phase: 'failed', work, bindings, error: error instanceof Error ? error.message : String(error) }
  }
}

function readComparisonLayout(root) {
  const modal = root?.querySelector('.pc-modal')
  if (!modal) return null
  const bounds = element => {
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
  }
  const pane = element => element ? { bounds: bounds(element), scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight, overflowY: getComputedStyle(element).overflowY } : null
  const button = (scope, text) => [...modal.querySelectorAll(`${scope} button`)].find(element => element.textContent.trim() === text)
  return {
    modal: bounds(modal), requirement: bounds(modal.querySelector('.pc-requirement')),
    tabs: bounds(modal.querySelector('.pc-toolbar')), compose: bounds(modal.querySelector('.pc-compose')),
    footer: bounds(modal.querySelector('.pc-footer')),
    rewrite: bounds(button('.pc-compose', '继续改写')), adopt: bounds(button('.pc-footer', '采用正负提示词')),
    columns: [...modal.querySelectorAll('.pc-column')].map(column => ({
      bounds: bounds(column), source: pane(column.querySelector('textarea, .pc-text:not(.pc-translated)')),
      translation: pane(column.querySelector('.pc-translated')),
    })),
  }
}

function readPromptComparisonTranslationAction(root, label) {
  const pane = root?.querySelector('.pc-column[aria-label="生成结果"] .pc-dual > section:last-child')
  const state = pane?.querySelector('.pc-empty')
  const message = state?.querySelector('p')
  const button = [...(state?.querySelectorAll('button') ?? [])].find(button => button.textContent.trim() === label)
  if (!pane || !message || !button) return null
  const bounds = element => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
  }
  const box = bounds(button), x = box.left + box.width / 2, y = box.top + box.height / 2
  const hit = root.elementFromPoint(x, y)
  return {
    viewport: { width: innerWidth, height: innerHeight }, pane: bounds(pane), state: bounds(state), role: state.getAttribute('role'),
    message: { text: message.textContent, bounds: bounds(message), visible: message.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) },
    button: { text: button.textContent.trim(), bounds: box, enabled: !button.disabled,
      visible: button.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
      hit: document.elementFromPoint(x, y) === root.host && (hit === button || button.contains(hit)) },
  }
}

async function observeComparisonTranslationActions(page, label, state, screenshot) {
  const observations = []
  for (const viewport of baseline.viewports) {
    await page.command('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false })
    await waitFor(page, `({ width: innerWidth, height: innerHeight })`, actual => actual.width === viewport.width && actual.height === viewport.height)
    const observation = await waitFor(page, `(${readPromptComparisonTranslationAction.toString()})(${ROOT}, ${JSON.stringify(label)})`, value => value?.button?.text === label)
    assertPromptComparisonTranslationAction(observation, viewport, label)
    if (state === 'translation-failed') assert.equal(observation.role, 'alert', 'Failed translation must expose its error')
    observations.push(observation)
    await screenshot(`${viewport.width}x${viewport.height}-${state}`)
  }
  const compact = baseline.viewports.find(viewport => viewport.width === 1280 && viewport.height === 720)
  assert.ok(compact, 'Frozen prototype must declare the 1280x720 viewport')
  await page.command('Emulation.setDeviceMetricsOverride', { ...compact, deviceScaleFactor: 1, mobile: false })
  await waitFor(page, `({ width: innerWidth, height: innerHeight })`, actual => actual.width === compact.width && actual.height === compact.height)
  return observations
}

async function verifyPromptCopies(page, state) {
  await page.evaluate(`(() => {
    window.__promptComparisonClipboard = { descriptor: Object.getOwnPropertyDescriptor(navigator, 'clipboard'), values: [] }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => { window.__promptComparisonClipboard.values.push(text) },
    } })
  })()`)
  const expected = []
  try {
    for (const field of FIELDS) {
      await selectField(page, field)
      await assertCurrentText(page, state, field)
      for (const [target, title] of [['before', '改写前'], ['result', '生成结果']]) {
        const scope = `.pc-column[aria-label="${title}"]`
        await clickButton(page, '复制原文', scope)
        expected.push(state[target][field])
        await clickButton(page, '复制译文', scope)
        expected.push(state[`${target}Translation`][field])
      }
    }
    assert.deepEqual(await page.evaluate('window.__promptComparisonClipboard.values'), expected)
  } finally {
    await page.evaluate(`(() => {
      const descriptor = window.__promptComparisonClipboard.descriptor
      if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor)
      else delete navigator.clipboard
      delete window.__promptComparisonClipboard
    })()`)
  }
}

async function verifyStandaloneTranslation(page, services, state, queueTranslation, queueTranslationFailure, screenshot) {
  const observation = { fields: [], cancelledRequest: null }
  const open = () => clickButton(page, '翻译', '.prompt-field:has(#positive_prompt)')
  const close = async () => {
    await clickButton(page, '关闭', '.translation-modal .modal-actions')
    await waitFor(page, `(${ROOT}).querySelector('.translation-modal') === null`, Boolean)
  }
  const assertTranslation = async (field, original, text) => {
    await clickButton(page, FIELD_LABELS[field], '.translation-tabs')
    await waitFor(page, `(${ROOT}).querySelector('.translation-result .pc-translated')?.textContent`, actual => actual === text)
    assert.equal(await page.evaluate(`(${ROOT}).querySelector('.translation-original')?.textContent`), original)
  }
  let paused
  try {
    for (const field of FIELDS) queueTranslation(state.result[field], state.resultTranslation[field])
    await open()
    for (const field of FIELDS) {
      await assertTranslation(field, state.result[field], state.resultTranslation[field])
      observation.fields.push(field)
    }
    await screenshot('standalone')
    await close()
    const count = translationRequests(services).length
    await open()
    await assertTranslation('positive_prompt', state.result.positive_prompt, state.resultTranslation.positive_prompt)
    assert.equal(translationRequests(services).length, count, 'Standalone reopen must reuse the current translation')
    await close()

    const failedSource = state.result.positive_prompt + '\nKeep the shop shelves clearly readable.'
    const recoveredText = state.resultTranslation.positive_prompt + '\n保持店内货架清晰可见。'
    await fill(page, 'textarea#positive_prompt', failedSource)
    queueTranslationFailure(failedSource)
    await open()
    await waitFor(page, `(${ROOT}).querySelector('.translation-result [role="alert"]')?.textContent`, Boolean)
    await screenshot('translation-failed')
    queueTranslation(failedSource, recoveredText)
    await clickButton(page, '重试翻译', '.translation-result')
    await assertTranslation('positive_prompt', failedSource, recoveredText)
    await close()

    const delayedSource = failedSource + '\nKeep the doorway in shadow.'
    await fill(page, 'textarea#positive_prompt', delayedSource)
    const requested = request => hasUserText(request, `${TRANSLATION_MARKER}\n${delayedSource}`)
    paused = services.pauseNextModelResponse(requested)
    queueTranslation(delayedSource, '此结果必须随关闭操作取消。')
    await open()
    const captured = await awaitControlled(paused.started, 'Standalone translation did not start')
    observation.cancelledRequest = captured.sequence
    await close()
    assert.equal((await awaitControlled(paused.closed, 'Closed translation did not release its request')).finished, false)
    paused.release()
    paused = undefined
    await fill(page, 'textarea#positive_prompt', state.result.positive_prompt)
    queueTranslation(state.result.positive_prompt, state.resultTranslation.positive_prompt)
    await open()
    await assertTranslation('positive_prompt', state.result.positive_prompt, state.resultTranslation.positive_prompt)
    await close()
  } finally {
    paused?.release()
  }
  return observation
}

async function assertCurrentText(page, state, field) {
  const actual = await waitFor(page, `(() => {
    const modal = (${ROOT})?.querySelector('.pc-modal')
    if (!modal) return null
    const original = column => { const element = column?.querySelector('textarea, .pc-text:not(.pc-translated)'); return element?.value ?? element?.textContent }
    const before = modal.querySelector('.pc-column[aria-label="改写前"]')
    const result = modal.querySelector('.pc-column[aria-label="生成结果"]')
    return { before: original(before), result: original(result),
      beforeTranslation: before?.querySelector('.pc-translated')?.textContent,
      resultTranslation: result?.querySelector('.pc-translated')?.textContent }
  })()`, value => value?.beforeTranslation === state.beforeTranslation[field] && value.resultTranslation === state.resultTranslation[field])
  for (const key of ['before', 'result', 'beforeTranslation', 'resultTranslation']) assert.equal(actual[key], state[key][field], `${field} ${key}`)
}

async function clickButton(page, text, scope = '.pc-modal') {
  const target = await waitFor(page, `(() => {
    const root = ${ROOT}
    const scope = root?.querySelector(${JSON.stringify(scope)})
    const button = [...(scope?.querySelectorAll('button') ?? [])].find(button => button.textContent.trim() === ${JSON.stringify(text)})
    if (!button) return null
    if (!button.closest('.pc-modal, .translation-modal')) button.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const rect = button.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
    const hit = root.elementFromPoint(x, y)
    return { x, y, enabled: !button.disabled, visible: button.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
      hit: document.elementFromPoint(x, y) === root.host && (hit === button || button.contains(hit)),
      inViewport: rect.width > 0 && rect.height > 0 && x >= 0 && x < innerWidth && y >= 0 && y < innerHeight }
  })()`, target => target?.enabled && target.visible && target.hit && target.inViewport)
  await page.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.x, y: target.y, button: 'left', clickCount: 1 })
  await page.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x, y: target.y, button: 'left', clickCount: 1 })
}

async function selectField(page, field) {
  await clickButton(page, FIELD_LABELS[field], '.pc-field-tabs')
  await waitFor(page, `(${ROOT}).querySelector('.pc-field-tabs [aria-selected="true"]')?.textContent.trim()`, text => text === FIELD_LABELS[field])
}

async function fill(page, selector, text) {
  await waitFor(page, `!!(${ROOT})?.querySelector(${JSON.stringify(selector)})`, Boolean)
  await page.evaluate(`(() => { const input = (${ROOT}).querySelector(${JSON.stringify(selector)}); input.focus(); input.select() })()`)
  await page.command('Input.insertText', { text })
  await waitFor(page, `(${ROOT}).querySelector(${JSON.stringify(selector)})?.value`, actual => actual === text)
}

async function inputValue(page, selector) {
  return page.evaluate(`(${ROOT}).querySelector(${JSON.stringify(selector)})?.value`)
}

async function captureSelection(page, workspaceId) {
  return page.evaluate(`({ workspace: localStorage.getItem('harness-comfyui:experiment-workspace'),
    view: localStorage.getItem(${JSON.stringify(`harness-comfyui:experiment-workbench:${workspaceId}`)}),
    sidebarCollapsed: document.querySelector('[data-sidebar-collapsed="true"]') !== null,
    open: document.querySelector('[data-experiment-workbench-root]') !== null })`)
}

async function openWorkbench(page, state) {
  await waitFor(page, `!!document.querySelector('button[aria-label="实验工作台"]')`, Boolean)
  await closeWorkbench(page)
  await page.evaluate(`(() => {
    localStorage.setItem('harness-comfyui:experiment-workspace', ${JSON.stringify(state.workspaceId)})
    const key = ${JSON.stringify(`harness-comfyui:experiment-workbench:${state.workspaceId}`)}
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'),
      workId: ${JSON.stringify(state.workId)}, branchId: ${JSON.stringify(state.branchId)}, page: 'workbench', inspectRun: false, selectedRunId: null }))
    document.querySelector('button[aria-label="实验工作台"]').click()
  })()`)
  await waitFor(page, `Boolean((${ROOT})?.querySelector('select[aria-label="切换工作"] option[value="${state.workId}"]'))`, Boolean)
  await page.evaluate(`(() => {
    const select = (${ROOT}).querySelector('select[aria-label="切换工作"]')
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(state.workId)})
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await waitFor(page, `(${ROOT})?.querySelector('select[aria-label="切换工作"]')?.value`, value => value === state.workId)
}

async function openComparison(page) {
  await clickButton(page, '对比提示词', '.inspector')
  await waitFor(page, `!!(${ROOT})?.querySelector('.pc-modal')`, Boolean)
  await selectField(page, 'positive_prompt')
}

async function closeWorkbench(page) {
  if (await page.evaluate(`document.querySelector('[data-experiment-workbench-root]') !== null`)) {
    await page.evaluate(`document.querySelector('button[aria-label="实验工作台"][aria-pressed="true"]')?.click()`)
    await waitFor(page, `document.querySelector('[data-experiment-workbench-root]') === null`, Boolean)
  }
}

async function restoreSelection(page, workspaceId, previous) {
  await closeWorkbench(page)
  await page.evaluate(`(() => {
    for (const [key, value] of ${JSON.stringify([
      ['harness-comfyui:experiment-workspace', previous.workspace],
      [`harness-comfyui:experiment-workbench:${workspaceId}`, previous.view],
    ])}) { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) }
    if (${previous.open}) document.querySelector('button[aria-label="实验工作台"]').click()
  })()`)
  if (previous.open) await waitFor(page, `document.querySelector('[data-experiment-workbench-root]') !== null`, Boolean)
}

async function waitForClosed(page) {
  await waitFor(page, `(${ROOT})?.querySelector('.pc-modal') === null`, Boolean)
}

async function waitForTurn(page, workspaceId, requestId, status) {
  const result = await waitFor(page, `${REMOTE}.promptGet(${JSON.stringify({ workspace_id: workspaceId, request_id: requestId })})`, result => result?.ok && result.value.status === status)
  return unwrap(result)
}

async function currentTurn(page, workspaceId, taskId, predicate) {
  const result = await waitFor(page, `${REMOTE}.promptList(${JSON.stringify({ workspace_id: workspaceId, task_id: taskId })})`, result => result?.ok && predicate(result.value.at(-1)))
  return unwrap(result).at(-1)
}

async function awaitControlled(promise, message) {
  const controller = new AbortController()
  try {
    return await Promise.race([promise, delay(30_000, undefined, { signal: controller.signal }).then(() => { throw new Error(message) })])
  } finally {
    controller.abort()
  }
}

async function waitFor(page, expression, accept, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let actual
  while (Date.now() < deadline) {
    actual = await page.evaluate(expression)
    if (accept(actual)) return actual
    await delay(75)
  }
  throw new Error(`Prompt comparison timed out: ${expression.slice(0, 180)}; observed ${JSON.stringify(actual)}`)
}

async function captureScreenshot(page, path) {
  const result = await page.command('Page.captureScreenshot', { format: 'png' })
  await writeFile(path, Buffer.from(result.data, 'base64'), { mode: 0o600 })
}

function unwrap(result) {
  assert.ok(result?.ok, JSON.stringify(result))
  return result.value
}

function userText(request) {
  return (request.body.messages ?? []).filter(message => message.role === 'user').map(requestMessageText).join('\n')
}

function hasUserText(request, text) {
  return (request.body.messages ?? []).some(message => message.role === 'user' && requestMessageText(message) === text)
}

function matchesRequest(request, marker) {
  return (request.body.messages ?? []).some(message => message.role === 'user'
    && requestMessageText(message).startsWith(`${marker}\n`))
}

function translationRequests(services) {
  return services.requestLog.filter(request => matchesRequest(request, TRANSLATION_MARKER))
}

function errorDetails(error) {
  return { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack ?? null : null }
}
