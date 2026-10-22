import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../comfyui-workflow-builder/scripts/comfyui.mjs', import.meta.url));
const nodeDefinitions = {
  SaveImage: { input: { required: { images: ['IMAGE'] } }, output: [], output_node: true, python_module: 'nodes' },
  Color: { input: { required: { color: [['red', 'blue']] } }, output: ['IMAGE'], python_module: 'custom_nodes.color' },
};

async function fixture(t, handler) {
  const directory = await mkdtemp(join(tmpdir(), 'comfy-cli-test-'));
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, url: `http://127.0.0.1:${server.address().port}` };
}

async function command(args, { input, env = {} } = {}) {
  const child = spawn(process.execPath, [cli, ...args], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => stdout += chunk);
  child.stderr.on('data', chunk => stderr += chunk);
  child.stdin.end(input);
  const [code] = await once(child, 'close');
  let result = null;
  try { result = JSON.parse(stdout); } catch { /* Help is plain text. */ }
  return { code, stdout, stderr, result };
}

function json(response, body, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

test('inspect saves full node definitions and returns only a small file index', async t => {
  const f = await fixture(t, (request, response) => {
    if (request.url === '/object_info') return json(response, nodeDefinitions);
    return json(response, { system: { comfyui_version: 'fixture' } });
  });
  const result = await command(['inspect', '--url', f.url, '--out', f.directory]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.result.status, 'inspected');
  const nodes = JSON.parse(await readFile(result.result.files.nodes, 'utf8'));
  assert.deepEqual(nodes, nodeDefinitions);
  const index = JSON.parse(await readFile(result.result.files.index, 'utf8'));
  assert.deepEqual(index.map(node => node.class_type), ['Color', 'SaveImage']);
  assert.ok(result.stdout.length < 2000);
});

const prompt = {
  '1': { class_type: 'Color', inputs: { color: 'red' } },
  '2': { class_type: 'SaveImage', inputs: { images: ['1', 0] } },
};
async function bundleFile(directory, api = prompt) {
  const file = join(directory, 'export.json');
  await writeFile(file, JSON.stringify({ workflow: { nodes: [], links: [] }, reimportWorkflow: { nodes: [], links: [] }, api, reimportApi: api }));
  return file;
}

test('run submits one paired workflow and saves every requested image with its history', async t => {
  let submitted;
  let count = 0;
  const f = await fixture(t, async (request, response) => {
    if (request.url === '/object_info') return json(response, nodeDefinitions);
    if (request.url === '/prompt') {
      count++;
      let body = '';
      for await (const chunk of request) body += chunk;
      submitted = JSON.parse(body);
      return json(response, { prompt_id: 'task-1', node_errors: {} });
    }
    if (request.url === '/history/task-1') return json(response, {
      'task-1': { status: { completed: true, status_str: 'success', messages: [] },
        outputs: { '2': { images: [
          { filename: 'one.png', subfolder: '', type: 'output' },
          { filename: 'two.png', subfolder: '', type: 'output' },
        ] } } },
    });
    if (request.url.startsWith('/view?')) {
      response.writeHead(200, { 'content-type': 'image/png' });
      return response.end('fixture image bytes');
    }
    json(response, {}, 404);
  });
  const result = await command(['run', '--url', f.url, '--out', f.directory, '--export', await bundleFile(f.directory), '--expect', '2', '--wait', '2']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.result.status, 'completed');
  assert.equal(count, 1);
  assert.deepEqual(submitted.prompt, prompt);
  assert.deepEqual(submitted.extra_data.extra_pnginfo.workflow, { nodes: [], links: [] });
  const run = JSON.parse(await readFile(result.result.files.run, 'utf8'));
  assert.equal(run.prompt_id, 'task-1');
  assert.equal(run.outputs.length, 2);
  assert.equal(await readFile(run.outputs[1].path, 'utf8'), 'fixture image bytes');
  assert.ok(result.result.files.history);
});

test('run rejects a missing required input before submission', async t => {
  let posts = 0;
  const f = await fixture(t, (request, response) => {
    if (request.method === 'POST') posts++;
    json(response, nodeDefinitions);
  });
  const incomplete = structuredClone(prompt);
  delete incomplete['2'].inputs.images;
  const result = await command(['run', '--url', f.url, '--out', f.directory, '--export', await bundleFile(f.directory, incomplete), '--expect', '2']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /required input images/);
  assert.equal(posts, 0);
});

const browser = process.env.COMFYUI_TEST_BROWSER;
function frontend(response) {
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end(`<!doctype html><script>
    let data;
    window.app = {
      graph: { serialize() { return data; } },
      async loadGraphData(value) { data = structuredClone(value); },
      async graphToPrompt() { return { output: data.extra.fixtureApi }; }
    };
  </script>`);
}

test('export uses the browser frontend, preserves widget objects and verifies reimport', { skip: !browser }, async t => {
  const f = await fixture(t, (request, response) => request.url === '/object_info' ? json(response, nodeDefinitions) : frontend(response));
  const workflow = { nodes: [], links: [], extra: { fixtureApi: prompt, layout: [{ x: 0.2, caption: 'object preserved' }] } };
  const result = await command(['export', '--url', f.url, '--out', f.directory, '--browser', browser, '--workflow', '-'], { input: JSON.stringify(workflow) });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.result.status, 'exported');
  const exported = JSON.parse(await readFile(result.result.files.export, 'utf8'));
  assert.deepEqual(exported.workflow.extra.layout, [{ x: 0.2, caption: 'object preserved' }]);
  assert.deepEqual(exported.api, prompt);
  assert.deepEqual(exported.reimportApi, prompt);
  const cleanup = JSON.parse(await readFile(result.result.files.browser, 'utf8'));
  assert.equal(cleanup.cleaned, true);
  await assert.rejects(readFile(join(cleanup.profile, 'DevToolsActivePort')), { code: 'ENOENT' });
  assert.throws(() => process.kill(cleanup.pid, 0), { code: 'ESRCH' });
  await assert.rejects(fetch('http://127.0.0.1:' + cleanup.port + '/json/list'));
});

test('a lost submit response stays unknown and status recovers without resubmission', async t => {
  let payload;
  let posts = 0;
  const f = await fixture(t, async (request, response) => {
    if (request.url === '/object_info') return json(response, nodeDefinitions);
    if (request.url === '/prompt') {
      posts++;
      let body = '';
      for await (const chunk of request) body += chunk;
      payload = JSON.parse(body);
      return request.socket.destroy();
    }
    if (request.url === '/queue') return json(response, { queue_running: [[0, 'recovered', payload.prompt, payload.extra_data]], queue_pending: [] });
    if (request.url === '/history?max_items=200') return json(response, {});
    if (request.url === '/history/recovered') return json(response, { recovered: { status: { completed: true, status_str: 'success' }, outputs: { '2': { images: [{ filename: 'result.png' }] } } } });
    response.writeHead(200, { 'content-type': 'image/png' }); response.end('result');
  });
  const first = await command(['run', '--url', f.url, '--out', f.directory, '--export', await bundleFile(f.directory), '--expect', '2']);
  assert.equal(first.code, 1);
  assert.equal(first.result.status, 'submission_unknown');
  assert.match(first.stderr, /status.*--run/);
  const recovered = await command(['status', '--url', f.url, '--out', f.directory, '--run', first.result.files.run]);
  assert.equal(recovered.result.status, 'completed', recovered.stderr);
  assert.equal(posts, 1);
});

test('export detects graph changes on reload even when API parameters remain unchanged', { skip: !browser }, async t => {
  const f = await fixture(t, (request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`<script>
      let data, loads = 0;
      window.app = {
        graph: { serialize() { return data; } },
        async loadGraphData(value) { data = structuredClone(value); if (++loads > 1) data.nodes.push({id: 999, type: 'Unexpected'}); },
        async graphToPrompt() { return {output: data.extra.fixtureApi}; }
      };
    </script>`);
  });
  const result = await command(['export', '--url', f.url, '--out', f.directory, '--browser', browser, '--workflow', '-'], {
    input: JSON.stringify({ nodes: [], links: [], extra: { fixtureApi: prompt } }),
  });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /graph changed after reimport/);
  assert.equal(JSON.parse(await readFile(result.result.files.browser, 'utf8')).cleaned, true);
});

test('missing target images and per-node validation errors cannot be reported as completed', async t => {
  const api = { ...prompt, '3': { class_type: 'SaveImage', inputs: { images: ['1', 0] } } };
  const f = await fixture(t, (request, response) => {
    if (request.url === '/object_info') return json(response, nodeDefinitions);
    if (request.url === '/prompt') return json(response, { prompt_id: 'partial', node_errors: { '3': { errors: ['invalid'] } } });
    if (request.url === '/history/partial') return json(response, { partial: {
      status: { completed: true, status_str: 'success' },
      outputs: { '2': { images: [{ filename: '../../duplicate.png' }] } },
    } });
    response.writeHead(200, { 'content-type': 'image/png' }); response.end('available image');
  });
  const result = await command(['run', '--url', f.url, '--out', f.directory, '--export', await bundleFile(f.directory, api), '--expect', '2,3']);
  assert.equal(result.code, 1);
  assert.equal(result.result.status, 'outputs_incomplete');
  const run = JSON.parse(await readFile(result.result.files.run, 'utf8'));
  assert.deepEqual(run.missing_outputs, ['3']);
  assert.deepEqual(Object.keys(run.node_errors), ['3']);
  assert.equal(run.outputs.length, 1);
  assert.equal(resolve(run.outputs[0].path, '..'), result.result.directory);
});

test('execution failure retains the backend error evidence', async t => {
  const f = await fixture(t, (request, response) => {
    if (request.url === '/object_info') return json(response, nodeDefinitions);
    if (request.url === '/prompt') return json(response, { prompt_id: 'failed', node_errors: {} });
    json(response, { failed: { status: { completed: false, status_str: 'error', messages: [['execution_error', { node_id: '1', exception_message: 'fixture failure' }]] }, outputs: {} } });
  });
  const result = await command(['run', '--url', f.url, '--out', f.directory, '--export', await bundleFile(f.directory), '--expect', '2']);
  assert.equal(result.code, 1);
  assert.equal(result.result.status, 'execution_failed');
  assert.match(await readFile(result.result.files.history, 'utf8'), /fixture failure/);
});

test('authenticated concurrent inspections keep credentials out of evidence and use separate directories', async t => {
  const token = 'Digest username="review", response="fixture-private-token\\\\proof"';
  const f = await fixture(t, (request, response) => {
    assert.equal(request.headers.authorization, token);
    if (request.url === '/object_info') return json(response, nodeDefinitions);
    json(response, { echo: token, [token]: 'credential key' });
  });
  const results = await Promise.all([1, 2].map(() => command(['inspect', '--url', f.url, '--out', f.directory], { env: { COMFYUI_AUTHORIZATION: token } })));
  assert.equal(results[0].code, 0);
  assert.equal(results[1].code, 0);
  assert.notEqual(results[0].result.directory, results[1].result.directory);
  for (const result of results) {
    for (const file of Object.values(result.result.files)) {
      assert.doesNotMatch(await readFile(file, 'utf8'), /fixture-private-token/);
    }
  }
});

test('export startup failure and frontend timeout clean their browser resources', { skip: !browser }, async t => {
  const f = await fixture(t, (request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' }); response.end('No ComfyUI frontend');
  });
  for (const [executable, timeout] of [[join(f.directory, 'missing-browser'), '1'], [browser, '2']]) {
    const result = await command(['export', '--url', f.url, '--out', f.directory, '--browser', executable, '--workflow', '-', '--timeout', timeout], { input: JSON.stringify({ nodes: [], links: [] }) });
    assert.equal(result.code, 1);
    const cleanup = JSON.parse(await readFile(result.result.files.browser, 'utf8'));
    assert.equal(cleanup.cleaned, true);
    await assert.rejects(readFile(join(cleanup.profile, 'DevToolsActivePort')), { code: 'ENOENT' });
    if (cleanup.pid) assert.throws(() => process.kill(cleanup.pid, 0), { code: 'ESRCH' });
  }
});

test('invalid arguments explain how to discover valid parameters', async () => {
  const result = await command(['inspect', '--invalid-option']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /inspect --help/);
  const top = await command(['--help']);
  assert.equal(top.code, 0);
  for (const name of ['inspect', 'export', 'run', 'status']) {
    assert.match(top.stdout, new RegExp(name));
    const detail = await command([name, '--help']);
    assert.equal(detail.code, 0);
    assert.match(detail.stdout, /Required/);
    assert.match(detail.stdout, /Example/);
  }
});

test('invalid connection tuples are rejected before HTTP submission', async t => {
  let posts = 0;
  const f = await fixture(t, (request, response) => { if (request.method === 'POST') posts++; json(response, nodeDefinitions); });
  for (const images of [['absent-node', 0], ['1', '0'], ['1'], ['1', 0, 1], [1, 0], ['1', -1], ['1', 0.5], ['1', 99]]) {
    const api = { ...prompt, '2': { class_type: 'SaveImage', inputs: { images } } };
    const result = await command(['run', '--url', f.url, '--out', f.directory, '--export', await bundleFile(f.directory, api), '--expect', '2']);
    assert.equal(result.code, 1, `Accepted invalid connection ${JSON.stringify(images)}`);
    assert.match(result.stderr, /invalid connection/);
  }
  assert.equal(posts, 0);
});

test('parameter values are validated by the instance, including values outside widget choices', async t => {
  let posts = 0;
  const api = { ...prompt, '1': { class_type: 'LoadImage', inputs: { image: 'nested/image.png' } } };
  const definitions = { ...nodeDefinitions, LoadImage: { input: { required: { image: [['root.png'], { image_upload: true }] } }, output: ['IMAGE'] } };
  const rejection = { error: { type: 'prompt_outputs_failed_validation' }, node_errors: { '1': { errors: [{ type: 'custom_validation_failed', details: 'Invalid image file: missing.png' }] } } };
  const f = await fixture(t, async (request, response) => {
    if (request.url === '/object_info') return json(response, definitions);
    if (request.url === '/prompt') {
      posts++;
      let body = '';
      for await (const chunk of request) body += chunk;
      const value = JSON.parse(body).prompt['1'].inputs.image;
      return value === 'nested/image.png' ? json(response, { prompt_id: 'valid-subfolder', node_errors: {} }) : json(response, rejection, 400);
    }
    json(response, {}, 404);
  });
  const args = ['run', '--url', f.url, '--out', f.directory, '--expect', '2', '--wait', '0'];
  const accepted = await command([...args, '--export', await bundleFile(f.directory, api)]);
  assert.equal(accepted.code, 0, accepted.stderr);
  assert.equal(accepted.result.status, 'accepted');
  api['1'].inputs.image = 'missing.png';
  const rejected = await command([...args, '--export', await bundleFile(f.directory, api)]);
  assert.equal(rejected.code, 1);
  assert.equal(rejected.result.status, 'rejected');
  const run = JSON.parse(await readFile(rejected.result.files.run, 'utf8'));
  assert.deepEqual(run.submission_error, rejection);
  assert.equal(posts, 2);
});

test('export rejects invalid connections and releases its browser before submission', { skip: !browser }, async t => {
  let posts = 0;
  const f = await fixture(t, (request, response) => {
    if (request.method === 'POST') posts++;
    return request.url === '/object_info' ? json(response, nodeDefinitions) : frontend(response);
  });
  for (const images of [['missing-source', 0], ['1', '0']]) {
    const api = { ...prompt, '2': { class_type: 'SaveImage', inputs: { images } } };
    const result = await command(['export', '--url', f.url, '--out', f.directory, '--browser', browser, '--workflow', '-'], {
      input: JSON.stringify({ nodes: [], links: [], extra: { fixtureApi: api } }),
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Node 2 input images: invalid connection/);
    const cleanup = JSON.parse(await readFile(result.result.files.browser, 'utf8'));
    assert.equal(cleanup.cleaned, true);
    assert.throws(() => process.kill(cleanup.pid, 0), { code: 'ESRCH' });
  }
  assert.equal(posts, 0);
});

test('HTTP failures retain status, request path and redacted JSON or text diagnostics', async t => {
  const token = 'Digest username="review", response="fixture-diagnostic-secret\\\\proof"';
  for (const format of ['json', 'text', 'image']) {
    const f = await fixture(t, (request, response) => {
      if (format === 'image' && request.url === '/history/download') {
        return json(response, { download: { status: { completed: true }, outputs: { '2': { images: [{ filename: 'missing.png' }] } } } });
      }
      if (format !== 'text') return json(response, { error: 'missing_scope', required_scope: 'read_nodes', echo: token }, 403);
      response.writeHead(502, { 'content-type': 'text/plain' });
      response.end('Upstream unavailable: ' + token);
    });
    let args = ['inspect', '--url', f.url, '--out', f.directory];
    if (format === 'image') {
      const run = join(f.directory, 'run.json');
      await writeFile(run, JSON.stringify({ id: 'download-run', instance: f.url, prompt_id: 'download', expected: ['2'] }));
      args = ['status', '--url', f.url, '--out', f.directory, '--run', run];
    }
    const result = await command(args, { env: { COMFYUI_AUTHORIZATION: token } });
    assert.equal(result.code, 1);
    const saved = await readFile(result.result.files.error, 'utf8');
    const error = JSON.parse(saved);
    assert.equal(error.command, args[0]);
    assert.equal(error.http_status, format === 'text' ? 502 : 403);
    assert.match(error.request_path, format === 'image' ? /^\/view\?/ : /^\/object_info$/);
    if (format === 'text') assert.equal(error.response_body, 'Upstream unavailable: [REDACTED]');
    else assert.deepEqual(error.response_body, { error: 'missing_scope', required_scope: 'read_nodes', echo: '[REDACTED]' });
    assert.doesNotMatch(saved + result.stdout + result.stderr, /fixture-diagnostic-secret/);
    assert.ok(result.stderr.length < 2000);
  }
});

test('status recovery clears only the current error and preserves the failed call record', async t => {
  let shouldTimeout = true;
  let posts = 0;
  const f = await fixture(t, (request, response) => {
    if (request.method === 'POST') posts++;
    if (request.url === '/history/retry') {
      if (shouldTimeout) return;
      return json(response, { retry: { status: { completed: true, status_str: 'success' }, outputs: { '2': { images: [{ filename: 'result.png' }] } } } });
    }
    response.writeHead(200, { 'content-type': 'image/png' }); response.end('result');
  });
  const input = join(f.directory, 'run.json');
  await writeFile(input, JSON.stringify({ id: 'retry-run', instance: f.url, prompt_id: 'retry', expected: ['2'], status: 'accepted' }));
  const args = ['status', '--url', f.url, '--out', f.directory];
  const failed = await command([...args, '--run', input, '--timeout', '0.05']);
  assert.equal(failed.code, 1);
  const original = await readFile(failed.result.files.run, 'utf8');
  assert.equal(typeof JSON.parse(original).observation_error, 'string');
  shouldTimeout = false;
  const recovered = await command([...args, '--run', failed.result.files.run]);
  assert.equal(recovered.code, 0, recovered.stderr);
  const run = JSON.parse(await readFile(recovered.result.files.run, 'utf8'));
  assert.equal(run.status, 'completed');
  assert.equal('observation_error' in run, false);
  assert.equal(await readFile(failed.result.files.run, 'utf8'), original);
  assert.equal(posts, 0);
});
