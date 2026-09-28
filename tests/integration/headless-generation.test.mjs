import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { build } from 'tsdown'
import { expect, it } from 'vitest'
import { prepareCliRuntime } from '../../scripts/cli/run.mjs'

it('persists accepted headless runs across process exit and finishes them after restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'headless-generation-'))
  const workspace = join(root, 'workspace')
  let command = ''
  let allowCompletion = false
  const requests = []
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}
    requests.push({ path: request.url, body })
    if (request.url === '/v1/chat/completions') {
      const hasToolResult = body.messages?.some(message => message.role === 'tool')
      const call = body.tools?.length && !hasToolResult
      const delta = call
        ? { role: 'assistant', tool_calls: [{ index: 0, id: 'test_bash_call', type: 'function', function: { name: 'bash', arguments: JSON.stringify({ command, description: 'Exercise durable generation' }) } }] }
        : { role: 'assistant', content: hasToolResult ? JSON.stringify(body.messages.filter(message => message.role === 'tool')) : 'Completed test task.' }
      const chunk = (delta, finish_reason) => ({ id: 'test', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta, finish_reason }] })
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end(`data: ${JSON.stringify(chunk(delta, null))}\n\ndata: ${JSON.stringify(chunk({}, call ? 'tool_calls' : 'stop'))}\n\ndata: [DONE]\n\n`)
    } else if (request.url === '/prompt') {
      response.end(JSON.stringify({ prompt_id: body.prompt_id }))
    } else if (request.url.startsWith('/api/jobs/')) {
      response.end(JSON.stringify({ id: request.url.split('/').at(-1), status: allowCompletion ? 'completed' : 'pending', outputs: { '1': { images: [{ filename: 'result.png', subfolder: '', type: 'output' }] } } }))
    } else if (request.url.startsWith('/view?')) {
      response.writeHead(200, { 'content-type': 'image/png' }); response.end(png)
    } else { response.writeHead(404); response.end() }
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const origin = `http://127.0.0.1:${server.address().port}`
  try {
    await mkdir(workspace)
    for (const name of ['src', 'scripts', 'node_modules']) await symlink(resolve(name), join(root, name), 'dir')
    for (const name of ['config', 'profiles', 'agent-presets', '.agents']) await cp(resolve(name), join(root, name), { recursive: true })
    await cp(resolve('package.json'), join(root, 'package.json'))
    await cp(resolve('cordis.patch.yml'), join(root, 'cordis.patch.yml'))
    await writeFile(join(root, '.env'), '')
    const runtime = await prepareCliRuntime(root)
    const fixturePlugin = join(root, '.local/test-core.js')
    await build({ config: false, logLevel: 'silent', entry: { 'test-core': resolve('tests/support/headless-generation-fixture.ts') }, outDir: join(root, '.local/test-fixture'), format: 'esm', platform: 'node', target: 'node24', external: [/^@deepseek-ai\//], dts: false, sourcemap: false, outExtensions: () => ({ js: '.js' }) })
    await cp(join(root, '.local/test-fixture/test-core.js'), fixturePlugin)
    // Profile-only substitution of the documented Workflow preparation seam.
    const bundlePatch = join(root, 'cordis.patch.yml')
    await writeFile(bundlePatch, (await readFile(bundlePatch, 'utf8')).replace('name: harness-comfyui/core', `name: ${JSON.stringify(fixturePlugin)}`))
    const patchPath = join(runtime.environment.DSH_HOME, 'profiles/comfyui-cli/cordis.patch.yml')
    const patch = await readFile(patchPath, 'utf8')
    const fixtureProvider = { fixture: { displayName: 'Fixture', api: 'openai-completions', apiKeyEnv: 'HEADLESS_TEST_KEY', baseURL: `${origin}/v1`, models: [{ id: 'fixture', name: 'Fixture', contextWindow: 100000, maxTokens: 2000 }] } }
    await writeFile(patchPath, `${patch}\n- id: agent-default-model\n  config: ${JSON.stringify({ provider: 'fixture', model: 'fixture' })}\n- id: llm-pi-ai\n  config: ${JSON.stringify({ providers: fixtureProvider })}\n- id: harness-comfyui-cli-runner\n  config:\n    preset: harness-comfyui-cli-candidate\n    task: !!js ctx.headlessStartup.task\n`)
    const run = stage => new Promise((done, reject) => {
      const child = spawn(process.execPath, [runtime.executable, '--profile', 'comfyui-cli', 'Exercise generation lifecycle.'], {
        cwd: workspace, env: { ...runtime.environment, HEADLESS_TEST_STAGE: stage, HEADLESS_TEST_ORIGIN: origin, HEADLESS_TEST_KEY: 'fixture-key' }, stdio: ['ignore', 'pipe', 'pipe'],
      })
      let output = ''
      child.stdout.on('data', chunk => { output += chunk })
      child.stderr.on('data', chunk => { output += chunk })
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, 15000)
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.on('exit', code => {
        clearTimeout(timer)
        if (timedOut) reject(new Error(`Headless task exceeded 15 seconds: ${output}`))
        else done({ code, output })
      })
    })
    const input = { title: 'headless test', instance_id: '1', template_id: '1', model: null, parameters: { positive_prompt: 'test' }, loras: [] }
    command = `printf '%s' '${JSON.stringify(input)}' | node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin`
    const accepted = await run('accept')
    expect(accepted.code, accepted.output).toBe(0)
    const readRuns = () => {
      const db = new DatabaseSync(runtime.environment.HARNESS_COMFYUI_RUN_REPOSITORY_FILE)
      try { return db.prepare('SELECT run_id, status, workspace_id, session_id FROM generation_runs').all() } finally { db.close() }
    }
    const first = readRuns()
    expect(first, accepted.output).toHaveLength(1)
    expect(first[0].status).not.toBe('succeeded')
    command = `for i in $(seq 1 100); do result=$(printf '%s' '{"run_ids":["${first[0].run_id}"]}' | node "$DSH_HARNESS_COMFYUI_CLI" generation resolve-media --stdin); if [[ "$result" == *'"lookup_status":"available"'* ]]; then printf '%s' "$result"; exit 0; fi; sleep 0.1; done; exit 1`
    allowCompletion = true
    const resumed = await run('resume')
    expect(resumed.code, resumed.output).toBe(0)
    expect(readRuns()[0].status, resumed.output).toBe('succeeded')
    expect(requests.some(request => request.path === '/prompt')).toBe(true)
    expect(requests.some(request => request.path.startsWith('/view?'))).toBe(true)
  } finally {
    server.closeAllConnections()
    await new Promise(done => server.close(done))
    await rm(root, { recursive: true, force: true })
  }
}, 45000)
