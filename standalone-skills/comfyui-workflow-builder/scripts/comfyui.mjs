#!/usr/bin/env node
// @ts-check
import { readFile, writeFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseArgs, isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

/** @typedef {Record<string, any>} ObjectData */
/** @typedef {{directory: string, files: Record<string, string>}} Artifacts */

const commonOptions = {
  url: { type: /** @type {const} */ ('string'), description: 'Required HTTP(S) instance URL, without credentials, query or fragment.' },
  out: { type: /** @type {const} */ ('string'), description: 'Required output parent directory; each call creates a unique child.' },
  timeout: { type: /** @type {const} */ ('string'), default: '20', description: 'Timeout for each HTTP request or browser operation in seconds, default 20, greater than 0.' },
  help: { type: /** @type {const} */ ('boolean'), description: 'Print this command help.' },
};
/** @type {Record<string, {description: string, options: Record<string, {type: 'string' | 'boolean', description: string, default?: string | boolean}>, example: string}>} */
const commands = {
  export: {
    description: 'Load a UI workflow in the target frontend and compare API parameters after save/reimport. Never submits.',
    options: {
      browser: { type: 'string', description: 'Required path to an installed Chrome or Chromium executable.' },
      workflow: { type: 'string', description: 'Required UI workflow JSON path; use - for stdin.' },
    },
    example: 'export --url http://localhost:8188 --out ./evidence --browser /path/to/chrome --workflow ./workflow.json',
  },
  run: {
    description: 'Submit one frontend export, wait for the task and save its outputs. Never retries submission.',
    options: {
      export: { type: 'string', description: 'Required export.json from export; use - to read JSON from stdin.' },
      expect: { type: 'string', description: 'Required comma-separated output node IDs, from the task requirements and exported API.' },
      wait: { type: 'string', default: '120', description: 'Observation window in seconds, default 120; 0 submits then returns. Does not cancel the task.' },
    },
    example: 'run --url http://localhost:8188 --out ./evidence --export ./export.json --expect 9 --wait 120',
  },
  status: {
    description: 'Read an existing run.json, locate its task and collect its outputs without submitting.',
    options: {
      run: { type: 'string', description: 'Required run.json returned by run or status; use - for stdin.' },
      wait: { type: 'string', default: '0', description: 'Observation window in seconds, default 0 for one query.' },
    },
    example: 'status --url http://localhost:8188 --out ./evidence --run ./run.json --wait 120',
  },
  inspect: {
    description: 'Save installed node definitions and a compact index for progressive reading.',
    options: { node: { type: 'string', description: 'Optional exact registered node class; otherwise retrieve all nodes.' } },
    example: 'inspect --url http://localhost:8188 --out ./evidence --node SaveImage',
  },
};
const abort = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => abort.abort(new Error('Interrupted; use status for an already submitted task.')));
const authorization = process.env.COMFYUI_AUTHORIZATION;

/** @param {unknown} value @returns {ObjectData} */
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object. Check the input file.');
  return /** @type {ObjectData} */ (value);
}

/** @param {unknown} value */
function redact(value) {
  let text = JSON.stringify(value, null, 2);
  for (const secret of [authorization, authorization?.replace(/^\S+\s+/, '')]) {
    if (secret) text = text.split(JSON.stringify(secret).slice(1, -1)).join('[REDACTED]');
  }
  return text + '\n';
}

/** @param {Artifacts} artifacts @param {string} key @param {unknown} value */
async function save(artifacts, key, value) {
  const destination = join(artifacts.directory, key + '.json');
  const temporary = destination + '.' + randomUUID();
  await writeFile(temporary, redact(value), { flag: 'wx', mode: 0o600 });
  await rename(temporary, destination);
  artifacts.files[key] = destination;
  return destination;
}

/** @param {string} file */
async function readJson(file) {
  if (file !== '-') return object(JSON.parse(await readFile(resolve(file), 'utf8')));
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return object(JSON.parse(text));
}

/** @param {unknown} value @param {string} name @param {number} minimum */
function numberOption(value, name, minimum = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum) throw new Error(`--${name} must be a number >= ${minimum}. Run ${process.argv[2]} --help for valid parameters.`);
  return number;
}

/** @param {string} base @param {string} path @param {number} timeout @param {RequestInit} [init] */
async function requestResponse(base, path, timeout, init = {}) {
  const response = await fetch(base + path, {
    ...init, redirect: 'error', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(timeout * 1000)]),
    headers: { ...(authorization ? { authorization } : {}), ...init.headers },
  });
  await checkResponse(response, path);
  return response;
}

/** @param {string} base @param {string} path @param {number} timeout @param {RequestInit} [init] */
async function request(base, path, timeout, init = {}) {
  return object(await (await requestResponse(base, path, timeout, init)).json());
}

/** @param {Response} response @param {string} path */
async function checkResponse(response, path) {
  if (response.ok) return;
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  throw new HttpError(response.status, path, body);
}

/** @param {unknown} error */
function errorDetails(error) {
  return {
    command: process.argv[2],
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof HttpError ? { http_status: error.status, request_path: error.path, response_body: error.body } : {}),
  };
}

class HttpError extends Error {
  /** @param {number} status @param {string} path @param {unknown} body */
  constructor(status, path, body) {
    super(`HTTP ${status} from ${path}. Read the saved error response and correct the request.`);
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

/** @param {ObjectData} workflow */
function graphShape(workflow) {
  return { nodes: workflow.nodes, links: workflow.links, groups: workflow.groups, definitions: workflow.definitions };
}

/** @param {ObjectData} api @param {ObjectData} nodes @param {string[]} expected */
function validatePrompt(api, nodes, expected) {
  if (!Object.keys(api).length) throw new Error('The API prompt is empty. Export an active workflow.');
  for (const [id, nodeValue] of Object.entries(api)) {
    const node = object(nodeValue);
    if (typeof node.class_type !== 'string' || !nodes[node.class_type]) throw new Error(`Node ${id}: class ${node.class_type} is not installed. Use inspect to choose an installed class.`);
    const inputs = object(node.inputs);
    for (const name of Object.keys(nodes[node.class_type].input?.required ?? {})) {
      if (!(name in inputs)) throw new Error(`Node ${id}: missing required input ${name}. Connect or set it in the UI workflow and export again.`);
    }
    for (const [name, value] of Object.entries(inputs)) {
      if (Array.isArray(value)) {
        const source = value.length === 2 && typeof value[0] === 'string' && Number.isInteger(value[1]) ? api[value[0]] : undefined;
        if (!source || value[1] < 0 || !nodes[source.class_type]?.output?.[value[1]]) throw new Error(`Node ${id} input ${name}: invalid connection. Use [source node ID, integer output slot] and verify that source output exists.`);
      }
    }
  }
  for (const id of expected) {
    if (!api[id] || nodes[api[id].class_type]?.output_node !== true) throw new Error(`Expected output ${id} is not an active output node. Read export.json and pass its output IDs to --expect.`);
  }
}

/** @param {ObjectData} run @param {Artifacts} artifacts @param {number} timeout */
async function collect(run, artifacts, timeout) {
  if (!run.prompt_id) {
    const queue = await request(run.instance, '/queue', timeout);
    const history = await request(run.instance, '/history?max_items=200', timeout);
    const entries = [...(queue.queue_running ?? []), ...(queue.queue_pending ?? []), ...Object.values(history).map(item => item.prompt)];
    const matches = entries.filter(entry => entry?.[3]?.workflow_builder_run_id === run.id);
    const ids = [...new Set(matches.map(entry => entry[1]))];
    if (ids.length !== 1) { run.status = 'submission_unknown'; return; }
    run.prompt_id = ids[0];
  }
  const history = await request(run.instance, '/history/' + encodeURIComponent(run.prompt_id), timeout);
  const item = history[run.prompt_id];
  if (!item) {
    const queue = await request(run.instance, '/queue', timeout);
    run.status = (queue.queue_running ?? []).some(/** @param {any[]} entry */ entry => entry[1] === run.prompt_id) ? 'running' :
      (queue.queue_pending ?? []).some(/** @param {any[]} entry */ entry => entry[1] === run.prompt_id) ? 'queued' : 'not_found';
    return;
  }
  await save(artifacts, 'history', item);
  run.outputs = [];
  for (const [node, outputValue] of Object.entries(item.outputs ?? {})) {
    const output = object(outputValue);
    for (const [index, media] of (output.images ?? []).entries()) {
      const query = new URLSearchParams({ filename: media.filename, subfolder: media.subfolder ?? '', type: media.type ?? 'output' });
      const response = await requestResponse(run.instance, '/view?' + query, timeout);
      const extension = /\.[a-zA-Z0-9]{1,8}$/.exec(media.filename)?.[0] ?? '.bin';
      const destination = join(artifacts.directory, `image-${run.outputs.length}${extension}`);
      await writeFile(destination, new Uint8Array(await response.arrayBuffer()), { flag: 'wx', mode: 0o600 });
      run.outputs.push({ node, index, remote: media, path: destination });
    }
  }
  run.missing_outputs = run.expected.filter(/** @param {string} id */ id => !run.outputs.some(/** @param {{node: string}} output */ output => output.node === id));
  run.status = item.status?.status_str === 'error' || item.status?.messages?.some(/** @param {any[]} message */ message => ['execution_error', 'execution_interrupted'].includes(message[0])) ? 'execution_failed' :
    item.status?.completed !== true ? 'incomplete' :
    run.missing_outputs.length || Object.keys(run.node_errors ?? {}).length ? 'outputs_incomplete' : 'completed';
}

/** @param {ObjectData} run @param {Artifacts} artifacts @param {number} timeout @param {number} wait */
async function observe(run, artifacts, timeout, wait) {
  const deadline = Date.now() + wait * 1000;
  try {
    do {
      await collect(run, artifacts, timeout);
      delete run.observation_error;
      await save(artifacts, 'run', run);
      if (['completed', 'execution_failed', 'outputs_incomplete', 'incomplete'].includes(run.status) || Date.now() >= deadline) break;
      await delay(Math.min(1000, deadline - Date.now()), undefined, { signal: abort.signal });
    } while (!abort.signal.aborted);
  } catch (error) {
    run.observation_error = error instanceof Error ? error.message : String(error);
    await save(artifacts, 'run', run);
    throw error;
  }
  return run.status;
}

/** @param {ObjectData} bundle */
function validateExport(bundle) {
  const api = object(bundle.api);
  const workflow = object(bundle.workflow);
  if (!isDeepStrictEqual(graphShape(workflow), graphShape(object(bundle.reimportWorkflow)))) throw new Error('UI graph changed after reimport. Compare workflow and reimportWorkflow in export.json, repair the UI graph and re-run export.');
  if (!isDeepStrictEqual(api, bundle.reimportApi)) throw new Error('Export roundtrip differs or is missing. Compare api and reimportApi in export.json, repair the UI graph and re-run export.');
  return { api, workflow };
}

/** @param {Record<string, string | boolean | undefined>} values @param {string} base @param {Artifacts} artifacts @param {number} timeout */
async function submit(values, base, artifacts, timeout) {
  if (typeof values.export !== 'string' || typeof values.expect !== 'string') throw new Error('run requires --export and --expect. Run node scripts/comfyui.mjs run --help.');
  const bundle = await readJson(values.export);
  const { api, workflow } = validateExport(bundle);
  const expected = [...new Set(values.expect.split(',').map(id => id.trim()).filter(Boolean))];
  if (!expected.length) throw new Error('--expect requires at least one output node ID.');
  validatePrompt(api, await request(base, '/object_info', timeout), expected);
  const wait = numberOption(values.wait, 'wait');
  const id = randomUUID();
  const payload = { prompt: api, client_id: id, extra_data: { workflow_builder_run_id: id, extra_pnginfo: { workflow } } };
  await save(artifacts, 'request', payload);
  /** @type {ObjectData} */
  const run = { id, instance: base, status: 'submission_unknown', expected, started_at: new Date().toISOString(), outputs: [], request: artifacts.files.request };
  await save(artifacts, 'run', run);
  try {
    const accepted = await request(base, '/prompt', timeout, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    await save(artifacts, 'accepted', accepted);
    if (typeof accepted.prompt_id !== 'string') throw new Error('Submission response has no prompt_id. Query status; do not submit again.');
    run.prompt_id = accepted.prompt_id;
    run.node_errors = accepted.node_errors ?? {};
    run.status = 'accepted';
  } catch (error) {
    run.status = error instanceof HttpError && error.status < 500 ? 'rejected' : 'submission_unknown';
    run.submission_error = error instanceof HttpError ? error.body : String(error);
    await save(artifacts, 'error', errorDetails(error));
    await save(artifacts, 'run', run);
    return run.status;
  }
  await save(artifacts, 'run', run);
  return wait === 0 ? run.status : observe(run, artifacts, timeout, wait);
}


/** @param {Record<string, string | boolean | undefined>} values @param {string} base @param {Artifacts} artifacts @param {number} timeout */
async function exportWorkflow(values, base, artifacts, timeout) {
  if (typeof values.browser !== 'string' || typeof values.workflow !== 'string') throw new Error('export requires --browser and --workflow. Run node scripts/comfyui.mjs export --help.');
  const workflow = await readJson(values.workflow);
  if (!Array.isArray(workflow.nodes) || !Array.isArray(workflow.links)) throw new Error('Expected UI Workflow JSON with nodes and links arrays. Export the editable workflow from ComfyUI.');
  const profile = await mkdtemp(join(tmpdir(), 'comfy-workflow-browser-'));
  const child = spawn(values.browser, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--use-mock-keychain',
    '--disable-features=DialMediaRouteProvider', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let closed = false;
  /** @type {Error | undefined} */ let spawnError;
  const exited = new Promise(resolve => {
    child.once('error', error => { spawnError = error; closed = true; resolve(undefined); });
    child.once('close', () => { closed = true; resolve(undefined); });
  });
  /** @type {WebSocket | undefined} */ let socket;
  /** @type {Map<number, {resolve: (value: ObjectData) => void, reject: (error: Error) => void, timer: NodeJS.Timeout}>} */
  const pending = new Map();
  let serial = 0;
  let port = '';
  /** @param {Error} error */
  const rejectPending = error => {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
    pending.clear();
  };
  /** @param {string} method @param {ObjectData} [params] @returns {Promise<ObjectData>} */
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    if (socket?.readyState !== WebSocket.OPEN) return reject(new Error('Browser connection closed. Re-run export.'));
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser ${method} timed out. Check the target frontend and re-run export.`)); }, timeout * 1000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  /** @param {string} expression */
  const evaluate = async expression => {
    const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
    return reply.result.value;
  };
  const interrupted = () => { rejectPending(new Error('Browser export interrupted.')); child.kill(); };
  abort.signal.addEventListener('abort', interrupted, { once: true });
  try {
    let deadline = Date.now() + timeout * 1000;
    while (!port && Date.now() < deadline) {
      abort.signal.throwIfAborted();
      if (spawnError) throw spawnError;
      if (closed) throw new Error('Browser exited during startup. Check --browser and its execution permissions.');
      try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; }
      catch { await delay(100, undefined, { signal: abort.signal }); }
    }
    if (!/^\d+$/.test(port)) throw new Error('Browser debugging port unavailable. Check --browser or increase --timeout.');
    const target = await request(`http://127.0.0.1:${port}`, '/json/new?about:blank', timeout, { method: 'PUT', headers: { authorization: '' } });
    socket = new WebSocket(target.webSocketDebuggerUrl);
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      const entry = pending.get(message.id);
      if (entry) {
        clearTimeout(entry.timer); pending.delete(message.id);
        message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result);
      } else if (message.method === 'Fetch.requestPaused') {
        const params = message.params;
        const headers = Object.entries(params.request.headers).filter(([name]) => name.toLowerCase() !== 'authorization').map(([name, value]) => ({ name, value }));
        if (authorization && new URL(params.request.url).origin === new URL(base).origin) headers.push({ name: 'Authorization', value: authorization });
        send('Fetch.continueRequest', { requestId: params.requestId, headers }).catch(rejectPending);
      }
    });
    socket.addEventListener('close', () => rejectPending(new Error('Browser connection closed.')));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Browser WebSocket timed out.')), timeout * 1000);
      socket?.addEventListener('open', () => { clearTimeout(timer); resolve(undefined); }, { once: true });
      socket?.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Browser WebSocket failed.')); }, { once: true });
    });
    if (authorization) await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    await send('Page.navigate', { url: base });
    deadline = Date.now() + timeout * 1000;
    let ready = false;
    while (Date.now() < deadline) {
      abort.signal.throwIfAborted();
      ready = await evaluate(`(()=>{const app=globalThis.comfyAPI?.app?.app??globalThis.app;const splash=document.querySelector('#splash-loader');return document.readyState==='complete'&&Boolean(app?.graph&&app?.loadGraphData&&app?.graphToPrompt)&&!(splash&&getComputedStyle(splash).display!=='none')})()`);
      if (ready) break;
      await delay(100, undefined, { signal: abort.signal });
    }
    if (!ready) throw new Error('ComfyUI frontend did not become ready. Check its browser errors and extensions, then re-run export.');
    const exported = JSON.parse(await evaluate(`(async()=>{const app=globalThis.comfyAPI?.app?.app??globalThis.app;await app.loadGraphData(${JSON.stringify(workflow)});const first=await app.graphToPrompt();const saved=JSON.parse(JSON.stringify(app.graph.serialize()));await app.loadGraphData(saved);const second=await app.graphToPrompt();return JSON.stringify({api:first.output,workflow:saved,reimportApi:second.output,reimportWorkflow:app.graph.serialize()});})()`));
    await save(artifacts, 'export', exported);
    await save(artifacts, 'workflow', exported.workflow);
    await save(artifacts, 'api', exported.api);
    validateExport(exported);
    validatePrompt(object(exported.api), await request(base, '/object_info', timeout), []);
    return 'exported';
  } finally {
    abort.signal.removeEventListener('abort', interrupted);
    rejectPending(new Error('Browser cleanup.'));
    if (!closed) {
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      if (socket?.readyState === WebSocket.OPEN) {
        await send('Browser.close').catch(() => {});
      } else {
        child.kill('SIGTERM');
      }
      await exited;
      clearTimeout(timer);
    }
    socket?.close();
    await rm(profile, { recursive: true, force: true });
    await save(artifacts, 'browser', { pid: child.pid, port, profile, cleaned: closed });
  }
}

/** @param {string | undefined} command */
function help(command) {
  if (!command || !commands[command]) return 'Usage: node scripts/comfyui.mjs <command> --help\n' + Object.entries(commands).map(([name, entry]) => `  ${name}: ${entry.description}`).join('\n');
  const entry = commands[command];
  return `${entry.description}\nUsage: node scripts/comfyui.mjs ${command} [options]\n` +
    Object.entries({ ...commonOptions, ...entry.options }).map(([name, option]) => `  --${name} (${option.type}) ${option.description}`).join('\n') +
    `\nExample: node scripts/comfyui.mjs ${entry.example}\nAuthentication: COMFYUI_AUTHORIZATION supplies the Authorization header.\n`;
}

/** @type {Artifacts | undefined} */
let artifacts;
try {
  const command = process.argv[2];
  if (!command || command === '--help') { process.stdout.write(help(undefined) + '\n'); }
  else {
    if (!commands[command]) throw new Error(`Unknown command ${command}. Valid commands: ${Object.keys(commands).join(', ')}. Run node scripts/comfyui.mjs --help.`);
    const values = /** @type {Record<string, string | boolean | undefined>} */ (parseArgs({ args: process.argv.slice(3), options: { ...commonOptions, ...commands[command].options } }).values);
    if (values.help) process.stdout.write(help(command));
    else {
      if (typeof values.url !== 'string' || typeof values.out !== 'string') throw new Error(`--url and --out are required. Example: node scripts/comfyui.mjs ${commands[command].example}`);
      const url = new URL(values.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTP(S) --url without credentials, query or fragment. Set COMFYUI_AUTHORIZATION for authentication.');
      const base = url.href.replace(/\/$/, '');
      const timeout = numberOption(values.timeout, 'timeout', 0.001);
      await mkdir(resolve(values.out), { recursive: true });
      artifacts = { directory: await mkdtemp(join(resolve(values.out), command + '-')), files: {} };
      let status;
      if (command === 'export') status = await exportWorkflow(values, base, artifacts, timeout);
      else if (command === 'run') status = await submit(values, base, artifacts, timeout);
      else if (command === 'status') {
        if (typeof values.run !== 'string') throw new Error('status requires --run run.json. Run node scripts/comfyui.mjs status --help.');
        const run = await readJson(values.run);
        if (run.instance !== base || typeof run.id !== 'string' || !Array.isArray(run.expected)) throw new Error('The run.json instance or structure does not match. Pass the original --url and run.json.');
        status = await observe(run, artifacts, timeout, numberOption(values.wait, 'wait'));
      } else {
      const path = typeof values.node === 'string' ? '/object_info/' + encodeURIComponent(values.node) : '/object_info';
      const nodes = await request(base, path, timeout);
      await save(artifacts, 'nodes', nodes);
      await save(artifacts, 'index', Object.keys(nodes).sort().map(class_type => ({ class_type, category: nodes[class_type].category, python_module: nodes[class_type].python_module, output: nodes[class_type].output, output_node: nodes[class_type].output_node === true })));
      await save(artifacts, 'system', await request(base, '/system_stats', timeout));
      status = 'inspected';
      }
      process.stdout.write(JSON.stringify({ status, directory: artifacts.directory, files: artifacts.files }) + '\n');
      if (!['inspected', 'exported', 'completed', 'accepted', 'queued', 'running'].includes(status)) {
        process.stderr.write(`Task status: ${status}. Read the saved evidence. To observe an existing submission, run node scripts/comfyui.mjs status --url <instance> --out <directory> --run "${artifacts.files.run ?? 'run.json'}". Do not resubmit an unknown task.\n`);
        process.exitCode = 1;
      }
    }
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  const command = commands[process.argv[2]] ? process.argv[2] + ' ' : '';
  const message = detail + ` Run node scripts/comfyui.mjs ${command}--help for valid parameters and examples.`;
  if (artifacts) await save(artifacts, 'error', { ...errorDetails(error), message });
  process.stderr.write(redact({ error: message }));
  process.stdout.write(JSON.stringify({ status: 'failed', directory: artifacts?.directory, files: artifacts?.files }) + '\n');
  process.exitCode = 1;
}
