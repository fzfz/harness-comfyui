import { setTimeout as delay } from 'node:timers/promises'

import {
  assertOfficialCandidateClientSource,
  isOfficialCandidateClientScriptUrl,
  readOfficialCandidateClientSourceMap,
} from './official-candidate-identity.mjs'

async function waitForClientContext(page, expression, accept, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (accept(await page.evaluate(expression))) return
    await delay(100)
  }
  throw new Error('官方 Client Context 未就绪；请核对项目插件已启用，且页面已完成加载。')
}

export async function captureProjectClientContext(page, sourceIdentity, evidenceDirectory, waitForValue = waitForClientContext) {
  await waitForValue(page,
    'document.readyState === "complete" && document.body.innerText.replace(/\\s+/gu, "").includes("ComfyUI工作台")',
    value => value === true)
  await page.command('Page.enable')
  await page.command('Debugger.enable')
  const parsedScriptPromise = page.waitForDebuggerScript(
    params => isOfficialCandidateClientScriptUrl(params.url, sourceIdentity), 30_000,
  )
  const { identifier } = await page.command('Page.addScriptToEvaluateOnNewDocument', { source: `
    let loader
    Object.defineProperty(window, '__ModuleLoader__', {
      configurable: true,
      get: () => loader,
      set: value => {
        loader = value
        const wrap = load => definition => {
          if (definition.id !== 'harness-comfyui') return load.call(loader, definition)
          const factory = definition.factory
          return load.call(loader, { ...definition, factory: require => {
            const plugin = factory(require)
            return { ...plugin, apply: ctx => {
              window.__runPanelTestContext = ctx
              return plugin.apply(ctx)
            } }
          } })
        }
        let load = wrap(loader.load)
        Object.defineProperty(loader, 'load', {
          configurable: true,
          get: () => load,
          set: value => { load = wrap(value) },
        })
      },
    })
  ` })
  await page.command('Page.reload')
  await waitForValue(page, 'window.__runPanelTestContext !== undefined', value => value === true, 10_000)
  const parsedScript = await parsedScriptPromise
  const scriptSource = await page.command('Debugger.getScriptSource', { scriptId: parsedScript.scriptId })
  const sourceMapText = await readOfficialCandidateClientSourceMap({
    page,
    sourceIdentity,
    scriptUrl: parsedScript.url,
    sourceMapUrl: parsedScript.sourceMapURL,
  })
  const loadedClientSource = await assertOfficialCandidateClientSource({
    sourceIdentity,
    scriptId: parsedScript.scriptId,
    scriptUrl: parsedScript.url,
    sourceMapUrl: parsedScript.sourceMapURL,
    scriptSource: scriptSource.scriptSource,
    sourceMapText,
    evidenceDirectory,
  })
  return { identifier, loadedClientSource }
}
