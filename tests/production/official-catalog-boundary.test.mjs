import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { test, afterAll } from 'vitest';
import { tmpdir } from 'node:os';

import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('./fixtures/catalog-boundary/', import.meta.url));
const evidenceRoot = (await mkdtemp(`${tmpdir()}/catalog-boundary-test-`)) + '/';
afterAll(() => rm(evidenceRoot, { recursive: true, force: true }));
const workflowItem = { ref: { kind: 'workflow', id: '29' }, name: 'Boundary Workflow', model: { id: '1', name: 'default' }, workflow_json: { nodes: [], links: [] } };
const workflowResponse = { structuredContent: { item: workflowItem }, content: [{ type: 'text', text: JSON.stringify({ item: workflowItem }) }] };
const instances = { results: [{ ref: { kind: 'instance', id: '2' }, name: 'Fixture instance' }], next: 'second-page' };
const instanceResponse = { structuredContent: instances, content: [{ type: 'text', text: JSON.stringify(instances) }] };
const protocol = JSON.parse(await readFile(new URL('../../config/source-client.json', import.meta.url), 'utf8'));
const catalogDiscovery = JSON.parse(await readFile(`${root}catalog-discovery.json`, 'utf8'));
const sourceDiscovery = { openapi: '3.1.0', paths: Object.fromEntries(Object.entries(protocol.source.operations).map(([name, path]) => [path, { get: { operationId: name } }])) };
const instancePath = Object.keys(protocol.catalog.operations).find(path => protocol.catalog.operations[path].toolName === 'query_semantic_comfyui_instances');
const templatePath = Object.keys(protocol.catalog.operations).find(path => protocol.catalog.operations[path].toolName === 'query_semantic_comfyui_templates');
const testWorkflow = { version: 0.4, nodes: [{ id: 1, type: 'CheckpointLoaderSimple', widgets_values: ['saved-model.safetensors'] }], links: [] };
const testTemplates = [{ id: 29, title: 'wai_basic_txt2img', base_model_id: 2, model_id: 1, workflow_json: testWorkflow }, { id: 30, title: 'other', base_model_id: 2, model_id: 2, workflow_json: testWorkflow }];
const tools = [
  { name: 'get_catalog_resource', inputSchema: { type: 'object', properties: { ref: { properties: { id: {type:'string',pattern:'^[1-9][0-9]{0,19}$'} } } } }, annotations: { readOnlyHint: true } },
  { name: 'search_workflows', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'search_instances', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  ...['get_instance_connection','get_instance_status','get_instance_queue','search_instance_nodes','get_instance_node'].map(name=>({name,inputSchema:{type:'object',properties:{instance_id:{type:'string',pattern:'^[1-9][0-9]{0,19}$'}}},annotations:{readOnlyHint:true}})),
  { name: 'get_mutation', inputSchema: { type: 'object' }, annotations: { readOnlyHint: false } },
];

async function upstream(t, { onToolCall, onHttpRequest, onResourceRequest, capabilities = { tools: {} } } = {}) {
  const requests = [];
  const httpRequests = [];
  const server = createServer(async (request, response) => {
    if (request.url !== '/mcp') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString();
      let body;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
      const exchange = { method: request.method, path: request.url, body, raw, authorization: request.headers.authorization };
      httpRequests.push(exchange);
      await onHttpRequest?.(exchange, request, response);
      const requestPath = new URL(request.url, 'http://127.0.0.1').pathname;
      let status = 200;
      let result;
      if (requestPath === protocol.catalog.discoveryPath) result = catalogDiscovery;
      else if (requestPath === protocol.source.discoveryPath) result = sourceDiscovery;
      else if (requestPath === instancePath) {
        const invalid = !body || !['search', 'resolve'].includes(body.mode) || Object.hasOwn(body, 'unknown') || body.mode === 'resolve' && !/^[1-9][0-9]{0,19}$/.test(body.id) || body.mode === 'search' && body.page !== undefined && (!Number.isInteger(body.page) || body.page < 1);
        status = invalid ? 422 : body.mode === 'resolve' && body.id === '1' ? 404 : 200;
        result = { status: status === 200 ? 'ok' : 'error', message: status === 200 ? null : status === 404 ? 'Catalog record was not found.' : 'Catalog request is invalid.', results: status === 200 ? [{ id: 2, title: 'win3080' }] : [], page: body?.page ?? 1, page_size: status === 200 ? body?.page_size ?? 20 : 0, total_count: status === 200 ? 1 : 0 };
      } else if (requestPath.startsWith(protocol.source.operations.instance.split('{id}')[0])) {
        const id = requestPath.slice(protocol.source.operations.instance.split('{id}')[0].length);
        status = !/^[1-9][0-9]{0,19}$/.test(id) ? 422 : id === '1' ? 404 : 200;
        result = { status: status === 200 ? 'ok' : 'error', message: status === 200 ? null : status === 404 ? 'ComfyUI instance was not found.' : 'Source request is invalid.', results: status === 200 ? [{ id: Number(id), title: 'win3080', url: 'http://127.0.0.1:8188/', credential_type: 'none' }] : [], page: 1, page_size: status === 200 ? 1 : 0, total_count: status === 200 ? 1 : 0 };
      } else if (request.url === templatePath || request.url === protocol.source.operations['template-bundle'].replace('{id}', '29')) {
        const rows = request.url === templatePath ? body?.mode === 'resolve' ? testTemplates.filter(row => String(row.id) === body.id) : testTemplates : [{ id: 29, title: 'wai_basic_txt2img', workflow_json: testWorkflow }];
        result = { status: 'ok', message: null, results: rows, page: 1, page_size: rows.length, total_count: rows.length };
      } else { status = 404; result = { error: 'Unhandled test request' }; }
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(result));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    assert.equal(request.headers.authorization, 'Bearer selftest-secret');
    let result;
    let resourceMessage;
    if (body.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities, serverInfo: { name: 'readonly-upstream', version: '1' } };
    else if (body.method === 'tools/list') result = { tools };
    else if (body.method === 'tools/call') {
      await onToolCall?.(body);
      result = structuredClone(body.params.name === 'search_instances' ? instanceResponse : workflowResponse);
      if (body.params.name === 'search_workflows') {
        const records = [{ ref: { kind: 'workflow', id: '29' }, model: { id: '1', name: 'default' } }, { ref: { kind: 'workflow', id: '30' }, model: { id: '2', name: 'other' } }];
        result = { structuredContent: { results: records, next: null }, content: [{ type: 'text', text: JSON.stringify({ results: records, next: null }) }] };
      }
      const args=body.params.arguments??{};
      const isResource=body.params.name==='get_catalog_resource'&&args.ref?.kind==='instance';
      const isOperation=tools.find(t=>t.name===body.params.name)?.inputSchema.properties?.instance_id;
      if(isResource||isOperation){
        const instanceId=isResource?args.ref.id:args.instance_id;
        const invalid=typeof instanceId!=='string'||!/^[1-9][0-9]{0,19}$/.test(instanceId)||Object.hasOwn(args,'unknown')||(body.params.name==='get_instance_queue'&&args.state==='bad')||(body.params.name==='get_instance_node'&&!args.class_name);
        if(invalid||instanceId==='1')result={isError:true,content:[{type:'text',text:JSON.stringify({code:invalid?'MCP_INVALID_PARAMS':isResource?'MCP_QUERY_RESOURCE_NOT_FOUND':'MCP_INSTANCE_NOT_FOUND',field:isResource?'ref.id':'instance_id',message:'Fixture upstream error',suggested_call:{tool:'search_instances',arguments:{}}})}]};
        else result={structuredContent:{instance_id:instanceId},content:[{type:'text',text:JSON.stringify({instance_id:instanceId})}]};
      }
      if (body.params.name === 'get_catalog_resource' && (!args.ref || Object.keys(args).some(key => key !== 'ref') || Object.keys(args.ref).some(key => !['kind', 'id'].includes(key)))) result = { isError: true, content: [{ type: 'text', text: JSON.stringify({ code: 'MCP_INVALID_PARAMS', field: 'arguments', message: 'Resource request contains invalid fields.' }) }] };
      if (body.params.arguments?.fail) result = { content: [{ type: 'text', text: 'Catalog read failed' }], isError: true };
      if (body.params.arguments?.includeCredentials) {
        result.structuredContent.credential = 'unknown-upstream-secret';
        result.content[0].text = JSON.stringify(result.structuredContent);
        result._meta = { token: 'selftest-secret', password: 'other-password', endpoint: 'http://admin:secret-pass@127.0.0.1/' };
      }
    }
    else if (['resources/list', 'resources/templates/list', 'resources/read'].includes(body.method)) {
      resourceMessage = await onResourceRequest?.(body, request) ?? { error: { code: -32601, message: 'Method not found' } };
    }
    else if (body.id === undefined) { response.writeHead(202); response.end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Mcp-Session-Id': 'test-session' });
    response.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, ...(resourceMessage ?? { result }) })}\n\n`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.onTestFinished(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return { url: `http://127.0.0.1:${server.address().port}/mcp`, httpUrl: `http://127.0.0.1:${server.address().port}`, requests, httpRequests };
}

async function rpc(url, method, params = {}, id = 1, options = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer selftest-secret', ...options.headers },
    signal: options.signal,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const raw = await response.text();
  const body = response.headers.get('content-type')?.includes('text/event-stream') ? JSON.parse(raw.split('\n').find(line => line.startsWith('data:')).slice(5)) : JSON.parse(raw);
  return { status: response.status, body, headers: response.headers };
}

test('no-default-model preserves Workflow 29 except item.model and matching text', async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  const service = await upstream(t);
  const evidenceDirectory = `${evidenceRoot}${randomUUID()}`;
  await mkdir(evidenceDirectory, { recursive: true });
  const fixture = await startBoundaryFixture({
    scenarioFile: `${root}no-default-model.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl,
    token: 'selftest-secret', evidenceDirectory,
  });
  t.onTestFinished(() => fixture.close());
  assert.deepEqual((await rpc(fixture.url, 'tools/list')).body.result, { tools });
  const result = (await rpc(fixture.url, 'tools/call', { name: 'get_catalog_resource', arguments: { ref: { kind: 'workflow', id: '29' } } })).body.result;
  const expected = structuredClone(workflowResponse);
  expected.structuredContent.item.model = null;
  expected.content[0].text = JSON.stringify(expected.structuredContent);
  assert.deepEqual(result, expected);
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
});

test('empty-instances changes results and next while preserving other tool responses', async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  const service = await upstream(t);
  const fixture = await startBoundaryFixture({
    scenarioFile: `${root}empty-instances.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl,
    token: 'selftest-secret', evidenceDirectory: `${evidenceRoot}${randomUUID()}`,
  });
  t.onTestFinished(() => fixture.close());
  const result = (await rpc(fixture.url, 'tools/call', { name: 'search_instances', arguments: { limit: 10 } })).body.result;
  assert.deepEqual(result, {
    ...instanceResponse, content: [{ type: 'text', text: '{"results":[],"next":null}' }],
    structuredContent: { results: [], next: null },
  });
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  assert.deepEqual((await rpc(fixture.url, 'tools/call', { name: 'get_catalog_resource', arguments: { ref: { kind: 'workflow', id: '29' } } })).body.result, workflowResponse);
});

test('only declared readonly calls reach the catalog and other requests are rejected', async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  const service = await upstream(t);
  const fixture = await startBoundaryFixture({
    scenarioFile: `${root}empty-instances.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl,
    token: 'selftest-secret', evidenceDirectory: `${evidenceRoot}${randomUUID()}`,
  });
  t.onTestFinished(() => fixture.close());
  const initialCount = service.requests.length;
  for (const name of ['get_mutation', 'get_unknown', 'create_generation']) {
    const response = await rpc(fixture.url, 'tools/call', { name, arguments: {} });
    assert.equal(response.body.error.code, -32601);
  }
  assert.equal((await rpc(fixture.url, 'tasks/create', {})).body.error.code, -32601);
  const notification = await fetch(fixture.url, {
    method: 'POST', headers: { Authorization: 'Bearer selftest-secret', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'get_mutation', arguments: {} } }),
  });
  assert.equal(notification.status, 400);
  assert.equal(service.requests.length, initialCount);
  const unauthenticated = await fetch(fixture.url, { method: 'POST', body: '{}' });
  assert.equal(unauthenticated.status, 401);
  for (const method of ['GET', 'DELETE', 'PUT']) {
    assert.equal((await fetch(fixture.url, { method, headers: { Authorization: 'Bearer selftest-secret' } })).status, 405);
  }
  assert.equal(service.requests.length, initialCount);
});

test('evidence records complete exchanges and field values while removing credentials', async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  const service = await upstream(t);
  const evidenceDirectory = `${evidenceRoot}${randomUUID()}`;
  const fixture = await startBoundaryFixture({
    scenarioFile: `${root}empty-instances.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl,
    token: 'selftest-secret', evidenceDirectory,
  });
  t.onTestFinished(() => fixture.close());
  await rpc(fixture.url, 'tools/call', { name: 'search_instances', arguments: { includeCredentials: true, api_key: 'request-api-secret', note: 'Bearer selftest-secret' } });
  const files = await readdir(evidenceDirectory);
  const entries = await Promise.all(files.filter(file => file.startsWith('exchange-')).map(async file => JSON.parse(await readFile(`${evidenceDirectory}/${file}`, 'utf8'))));
  const entry = entries.find(value => value.request?.params?.name === 'search_instances');
  assert.equal(entry.responseSource, 'real-catalog+boundary-fields');
  assert.deepEqual(entry.fields, { results: { before: instanceResponse.structuredContent.results, after: [] }, next: { before: 'second-page', after: null } });
  assert.equal(entry.upstreamResponse.result.structuredContent.credential, '[redacted]');
  assert.equal(entry.response.result.structuredContent.credential, '[redacted]');
  assert.deepEqual(JSON.parse(entry.response.result.content[0].text), entry.response.result.structuredContent);
  const evidence = entries.map(value => JSON.stringify(value)).join('\n');
  for (const secret of ['selftest-secret', 'unknown-upstream-secret', 'other-password', 'secret-pass', 'request-api-secret']) assert.equal(evidence.includes(secret), false);
});

test('a startup state write failure releases the assigned listener before rejecting', async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  const service = await upstream(t);
  const directory = `${evidenceRoot}${randomUUID()}`;
  await mkdir(`${directory}/state.json`, { recursive: true });
  const listener = createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  await assert.rejects(startBoundaryFixture({
    scenarioFile: `${root}empty-instances.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl,
    token: 'selftest-secret', evidenceDirectory: directory, port,
  }), /EISDIR/);
  t.onTestFinished(() => listener.listening ? new Promise(resolve => listener.close(resolve)) : undefined);
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(port, '127.0.0.1', resolve); });
});

test('closing the fixture releases its listening port and records the result', async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  const service = await upstream(t);
  const fixture = await startBoundaryFixture({
    scenarioFile: `${root}empty-instances.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl,
    token: 'selftest-secret', evidenceDirectory: `${evidenceRoot}${randomUUID()}`,
  });
  t.onTestFinished(() => fixture.close());
  const { port } = fixture;
  const result = await fixture.close();
  assert.equal(result.portReleased, true);
  assert.deepEqual(await fixture.close(), result);
  const state = JSON.parse(await readFile(fixture.stateFile, 'utf8'));
  assert.equal(state.status, 'stopped');
  assert.equal(state.portReleased, true);
  assert.equal(state.port, port);
  const listener = createServer();
  await new Promise((resolveListen, reject) => { listener.once('error', reject); listener.listen(port, '127.0.0.1', resolveListen); });
  await new Promise(resolveClose => listener.close(resolveClose));
});

test('upstream tool errors stay unchanged and evidence identifies the real catalog', async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  const service = await upstream(t);
  const evidenceDirectory = `${evidenceRoot}${randomUUID()}`;
  const fixture = await startBoundaryFixture({ scenarioFile: `${root}empty-instances.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl, token: 'selftest-secret', evidenceDirectory });
  t.onTestFinished(() => fixture.close());
  const result = (await rpc(fixture.url, 'tools/call', { name: 'search_instances', arguments: { fail: true } })).body.result;
  assert.deepEqual(result, { content: [{ type: 'text', text: 'Catalog read failed' }], isError: true });
  const entries = await Promise.all((await readdir(evidenceDirectory)).filter(file => file.startsWith('exchange-')).map(async file => JSON.parse(await readFile(`${evidenceDirectory}/${file}`, 'utf8'))));
  assert.equal(entries[0].responseSource, 'real-catalog');
  assert.deepEqual(entries[0].fields, {});
});

 test('no-default-model search agrees with details and preserves other Workflow models', async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  const service = await upstream(t);
  const fixture = await startBoundaryFixture({ scenarioFile: `${root}no-default-model.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl, token: 'selftest-secret', evidenceDirectory: `${evidenceRoot}${randomUUID()}` });
  t.onTestFinished(() => fixture.close());
  const result = (await rpc(fixture.url, 'tools/call', { name: 'search_workflows', arguments: {} })).body.result;
  assert.equal(result.structuredContent.results[0].model, null);
  assert.deepEqual(result.structuredContent.results[1].model, { id: '2', name: 'other' });
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
});


test('empty instance domain maps valid IDs to absent upstream record and preserves validation errors', async t => {
 const {startBoundaryFixture}=await import('../desktop/fixtures/official-catalog-boundary.mjs'); const service=await upstream(t);
 const fixture=await startBoundaryFixture({scenarioFile:`${root}empty-instances.json`,upstreamUrl:service.url,upstreamHttpUrl:service.httpUrl,token:'selftest-secret',evidenceDirectory:`${evidenceRoot}${randomUUID()}`});t.onTestFinished(()=>fixture.close());
 const calls=[{name:'get_catalog_resource',arguments:{ref:{kind:'instance',id:'2'}}},...['get_instance_connection','get_instance_status','get_instance_queue','search_instance_nodes','get_instance_node'].map(name=>({name,arguments:{instance_id:'2',...(name==='get_instance_node'?{class_name:'CheckpointLoaderSimple'}:{})}}))];
 for(const params of calls){const result=(await rpc(fixture.url,'tools/call',params)).body.result;assert.equal(result.isError,true,params.name);assert.equal(JSON.parse(result.content[0].text).code,params.name==='get_catalog_resource'?'MCP_QUERY_RESOURCE_NOT_FOUND':'MCP_INSTANCE_NOT_FOUND');assert.equal(result.structuredContent,undefined);const last=service.requests.at(-1);assert.equal(last.params.arguments.ref?.id??last.params.arguments.instance_id,'1');}
 for(const params of [{name:'get_instance_status',arguments:{}},{name:'get_instance_status',arguments:{instance_id:'bad'}},{name:'get_instance_status',arguments:{instance_id:'2',unknown:true}},{name:'get_instance_queue',arguments:{instance_id:'2',state:'bad'}},{name:'get_instance_node',arguments:{instance_id:'2'}}]){const result=(await rpc(fixture.url,'tools/call',params)).body.result;assert.equal(JSON.parse(result.content[0].text).code,'MCP_INVALID_PARAMS');}
 assert.equal(service.requests.some(r=>r.params?.arguments?.instance_id==='2'||r.params?.arguments?.ref?.kind==='instance'&&r.params.arguments.ref.id==='2'),false);
});

test('empty instance fixture refuses an existing mapping target at startup', async t => {
 const {startBoundaryFixture}=await import('../desktop/fixtures/official-catalog-boundary.mjs');const service=await upstream(t);const directory=`${evidenceRoot}${randomUUID()}`;await mkdir(directory,{recursive:true});
 const scenario=JSON.parse(await readFile(`${root}empty-instances.json`,'utf8'));scenario.absentInstance.id='2';const scenarioFile=`${directory}/scenario.json`;await writeFile(scenarioFile,JSON.stringify(scenario));
 await assert.rejects(startBoundaryFixture({scenarioFile,upstreamUrl:service.url,upstreamHttpUrl:service.httpUrl,token:'selftest-secret',evidenceDirectory:`${directory}/evidence`}),/未确认不存在/);
});


test('MCP and HTTP consumers share an empty instance domain and HTTP discovery keeps the upstream contract', async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  const service = await upstream(t);
  const fixture = await startBoundaryFixture({ scenarioFile: `${root}empty-instances.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl, token: 'selftest-secret', evidenceDirectory: `${evidenceRoot}${randomUUID()}` });
  t.onTestFinished(() => fixture.close());
  assert.equal(fixture.mcpUrl, fixture.url);
  const origin = `${fixture.sourceAddress.url}:${fixture.sourceAddress.port}`;
  assert.deepEqual(await (await fetch(origin + protocol.catalog.discoveryPath)).json(), catalogDiscovery);
  assert.deepEqual(await (await fetch(origin + protocol.source.discoveryPath)).json(), sourceDiscovery);
  for (const page of [1, 2]) {
    const response = await fetch(origin + instancePath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'search', query: '', page, page_size: 20 }) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', message: null, results: [], page, page_size: 20, total_count: 0 });
  }
  assert.deepEqual((await rpc(fixture.mcpUrl, 'tools/call', { name: 'search_instances', arguments: {} })).body.result.structuredContent, { results: [], next: null });
  for (const id of ['2', '777']) {
    const resolve = await fetch(origin + instancePath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'resolve', id }) });
    assert.equal(resolve.status, 404);
    assert.deepEqual(await resolve.json(), { status: 'error', message: 'Catalog record was not found.', results: [], page: 1, page_size: 0, total_count: 0 });
    const source = await fetch(origin + protocol.source.operations.instance.replace('{id}', id));
    assert.equal(source.status, 404);
    assert.deepEqual(await source.json(), { status: 'error', message: 'ComfyUI instance was not found.', results: [], page: 1, page_size: 0, total_count: 0 });
  }
  assert.equal(service.httpRequests.every(request => request.authorization === undefined), true);
});


test('HTTP instance inputs retain upstream validation and unknown writes never reach the upstream', async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  const service = await upstream(t);
  const fixture = await startBoundaryFixture({ scenarioFile: `${root}empty-instances.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl, token: 'selftest-secret', evidenceDirectory: `${evidenceRoot}${randomUUID()}` });
  t.onTestFinished(() => fixture.close());
  const origin = `${fixture.sourceAddress.url}:${fixture.sourceAddress.port}`;
  for (const body of [{ mode: 'resolve', id: 'invalid' }, { mode: 'resolve', id: '2', unknown: true }, { mode: 'search', page: 0 }]) {
    const response = await fetch(origin + instancePath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 422);
    assert.deepEqual(service.httpRequests.at(-1).body, body);
  }
  const invalid = await fetch(origin + protocol.source.operations.instance.replace('{id}', 'invalid'));
  assert.equal(invalid.status, 422);
  assert.equal(service.httpRequests.at(-1).path, protocol.source.operations.instance.replace('{id}', 'invalid'));
  const count = service.httpRequests.length;
  for (const [method, path] of [['PUT', instancePath], ['DELETE', protocol.source.operations.instance.replace('{id}', '2')], ['POST', '/prompt'], ['POST', '/internal/semantic/unknown'], ['GET', '/internal/comfyui-source/instances/2/write']]) {
    const response = await fetch(origin + path, { method });
    assert.equal(response.status, 405, `${method} ${path}`);
  }
  assert.equal(service.httpRequests.length, count);
  assert.equal((await fetch(fixture.mcpUrl, { method: 'POST', body: '{}' })).status, 401);
  const read = await fetch(origin + protocol.catalog.discoveryPath, { headers: { Authorization: 'Bearer incoming-http-secret' } });
  assert.equal(read.status, 200);
  assert.equal(service.httpRequests.at(-1).authorization, undefined);
});


test('no-default-model HTTP templates agree with MCP and preserve Workflow nodes and sibling models', async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  const service = await upstream(t);
  const fixture = await startBoundaryFixture({ scenarioFile: `${root}no-default-model.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl, token: 'selftest-secret', evidenceDirectory: `${evidenceRoot}${randomUUID()}` });
  t.onTestFinished(() => fixture.close());
  const origin = `${fixture.sourceAddress.url}:${fixture.sourceAddress.port}`;
  for (const input of [{ mode: 'search' }, { mode: 'resolve', id: '29' }]) {
    const response = await fetch(origin + templatePath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.results[0], { ...testTemplates[0], model_id: null });
    if (input.mode === 'search') assert.deepEqual(body.results[1], testTemplates[1]);
  }
  assert.deepEqual((await rpc(fixture.mcpUrl, 'tools/call', { name: 'get_catalog_resource', arguments: { ref: { kind: 'workflow', id: '29' } } })).body.result.structuredContent.item.model, null);
  const bundle = await fetch(origin + protocol.source.operations['template-bundle'].replace('{id}', '29'));
  assert.deepEqual((await bundle.json()).results, [{ id: 29, title: 'wai_basic_txt2img', workflow_json: testWorkflow }]);
  const instance = await fetch(origin + protocol.source.operations.instance.replace('{id}', '2'));
  assert.equal(instance.status, 200);
});

test('production CatalogClient and GenerationSourceClient read the same fixture settings and retain error mapping', async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  const { CatalogClient } = await import('../../src/host/catalog/catalog-client.ts');
  const { GenerationSourceClient } = await import('../../src/host/generation/source-client.ts');
  const service = await upstream(t);
  const fixture = await startBoundaryFixture({ scenarioFile: `${root}empty-instances.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl, token: 'selftest-secret', evidenceDirectory: `${evidenceRoot}${randomUUID()}` });
  t.onTestFinished(() => fixture.close());
  const settings = { get: () => fixture.sourceAddress };
  const catalog = new CatalogClient({ settings });
  const source = new GenerationSourceClient({ settings });
  assert.deepEqual(await catalog.queryComfyuiInstances({ mode: 'search', query: '', page: 1, page_size: 100 }, new AbortController().signal), { status: 'ok', message: null, results: [], page: 1, page_size: 100, total_count: 0 });
  await assert.rejects(source.readInstance('2'), { code: 'SOURCE_QUERY_FAILED', message: /instance.*2.*HTTP 404/ });
  assert.deepEqual(await source.readTemplate('29'), { id: '29', title: 'wai_basic_txt2img', workflow: testWorkflow });
  assert.deepEqual(await catalog.resolveTemplate('29', new AbortController().signal), { id: '29', title: 'wai_basic_txt2img', base_model_id: '2', model_id: '1' });
  assert.equal(service.httpRequests.some(request => request.path === '/prompt'), false);
});

test('production clients keep normal source reads and the no-default-model contract', async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  const { CatalogClient } = await import('../../src/host/catalog/catalog-client.ts');
  const { GenerationSourceClient } = await import('../../src/host/generation/source-client.ts');
  const service = await upstream(t);
  const fixture = await startBoundaryFixture({ scenarioFile: `${root}no-default-model.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl, token: 'selftest-secret', evidenceDirectory: `${evidenceRoot}${randomUUID()}` });
  t.onTestFinished(() => fixture.close());
  const settings = { get: () => fixture.sourceAddress };
  const catalog = new CatalogClient({ settings });
  const source = new GenerationSourceClient({ settings });
  assert.deepEqual(await catalog.queryComfyuiInstances({ mode: 'search', query: '', page: 1, page_size: 100 }, new AbortController().signal), { status: 'ok', message: null, results: [{ id: '2' }], page: 1, page_size: 100, total_count: 1 });
  assert.deepEqual(await source.readInstance('2'), { id: '2', title: 'win3080', url: 'http://127.0.0.1:8188/', credentialType: 'none', authorization: null });
  assert.deepEqual(await catalog.resolveTemplate('29', new AbortController().signal), { id: '29', title: 'wai_basic_txt2img', base_model_id: '2', model_id: null });
  assert.deepEqual(await source.readTemplate('29'), { id: '29', title: 'wai_basic_txt2img', workflow: testWorkflow });
});

async function evidenceEntries(directory, prefix) {
  const files = (await readdir(directory)).filter(file => file.startsWith(prefix));
  return Promise.all(files.map(async file => JSON.parse(await readFile(`${directory}/${file}`, 'utf8'))));
}

test('HTTP evidence stores original and forwarded requests, raw protocol results and scenario fields without credentials', async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  const service = await upstream(t);
  const evidenceDirectory = `${evidenceRoot}${randomUUID()}`;
  const fixture = await startBoundaryFixture({ scenarioFile: `${root}empty-instances.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl, token: 'selftest-secret', evidenceDirectory });
  t.onTestFinished(() => fixture.close());
  const origin = `${fixture.sourceAddress.url}:${fixture.sourceAddress.port}`;
  await fetch(origin + instancePath, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer extra-http-secret' }, body: JSON.stringify({ mode: 'resolve', id: '2' }) });
  await fetch(origin + instancePath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'search', page: 2, page_size: 20 }) });
  const entries = (await evidenceEntries(evidenceDirectory, 'exchange-')).filter(entry => entry.protocol === 'http');
  const resolve = entries.find(entry => entry.request?.mode === 'resolve');
  assert.deepEqual(resolve.request, { mode: 'resolve', id: '2' });
  assert.deepEqual(resolve.forwardedRequest, { method: 'POST', path: instancePath, body: { mode: 'resolve', id: '1' } });
  assert.equal(resolve.upstreamResponse.status, 404);
  assert.deepEqual(resolve.response, resolve.upstreamResponse.body);
  assert.deepEqual(resolve.fields, { 'request.id': { before: '2', after: '1' } });
  assert.equal(resolve.requestHeaders.authorization, '[redacted]');
  const search = entries.find(entry => entry.request?.mode === 'search');
  assert.deepEqual(search.upstreamResponse.body.results, [{ id: 2, title: 'win3080' }]);
  assert.deepEqual(search.fields.results, { before: [{ id: 2, title: 'win3080' }], after: [] });
  const serialized = JSON.stringify(entries);
  assert.equal(serialized.includes('extra-http-secret'), false);
  assert.equal(serialized.includes('selftest-secret'), false);
});

test('HTTP caller cancellation aborts only its upstream read and a concurrent read completes', { timeout: 5000 }, async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  let started;
  const pendingStarted = new Promise(resolve => { started = resolve; });
  const service = await upstream(t, { onHttpRequest: async (exchange, request) => {
    if (exchange.body?.query !== 'cancelled-read') return;
    started();
    await new Promise(resolve => request.socket.once('close', resolve));
  } });
  const fixture = await startBoundaryFixture({ scenarioFile: `${root}empty-instances.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl, token: 'selftest-secret', evidenceDirectory: `${evidenceRoot}${randomUUID()}` });
  t.onTestFinished(() => fixture.close());
  const origin = `${fixture.sourceAddress.url}:${fixture.sourceAddress.port}`;
  const controller = new AbortController();
  const pending = fetch(origin + instancePath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'search', query: 'cancelled-read' }), signal: controller.signal });
  const rejection = assert.rejects(pending, { name: 'AbortError' });
  await pendingStarted;
  controller.abort();
  const completed = await fetch(origin + instancePath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'search', query: 'completed-read' }) });
  assert.equal(completed.status, 200);
  assert.deepEqual((await completed.json()).results, []);
  await rejection;
  await fixture.close();
  const entries = await evidenceEntries(fixture.evidenceDirectory, 'http-upstream-');
  assert.equal(entries.filter(entry => entry.request.body?.query === 'cancelled-read' && entry.error?.cancelled === true).length, 1);
  assert.equal(entries.filter(entry => entry.request.body?.query === 'completed-read' && entry.response?.status === 200).length, 1);
});

test('stopping the fixture cancels concurrent HTTP reads, finalizes evidence and releases the shared listener', { timeout: 5000 }, async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  let started;
  let count = 0;
  const pendingStarted = new Promise(resolve => { started = resolve; });
  const service = await upstream(t, { onHttpRequest: async (exchange, request) => {
    if (!exchange.body?.query?.startsWith('pending-http-')) return;
    if (++count === 2) started();
    await new Promise(resolve => request.socket.once('close', resolve));
  } });
  const fixture = await startBoundaryFixture({ scenarioFile: `${root}empty-instances.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl, token: 'selftest-secret', evidenceDirectory: `${evidenceRoot}${randomUUID()}` });
  t.onTestFinished(() => fixture.close());
  const origin = `${fixture.sourceAddress.url}:${fixture.sourceAddress.port}`;
  const pending = [1, 2].map(id => fetch(origin + instancePath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'search', query: `pending-http-${id}` }) }).catch(error => error));
  await pendingStarted;
  const stopped = await fixture.close();
  await Promise.all(pending);
  assert.equal(stopped.portReleased, true);
  const exchanges = await evidenceEntries(fixture.evidenceDirectory, 'exchange-');
  assert.equal(exchanges.filter(entry => entry.protocol === 'http' && entry.responseSource === 'fixture-cancelled').length, 2);
  const httpEntries = await evidenceEntries(fixture.evidenceDirectory, 'http-upstream-');
  assert.equal(httpEntries.filter(entry => entry.request.body?.query?.startsWith('pending-http-') && entry.error?.cancelled === true).length, 2);
  const before = (await readdir(fixture.evidenceDirectory)).sort();
  await delay(30);
  assert.deepEqual((await readdir(fixture.evidenceDirectory)).sort(), before);
  const listener = createServer();
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(fixture.sourceAddress.port, '127.0.0.1', resolve); });
  await new Promise(resolve => listener.close(resolve));
});


test('malformed HTTP JSON reaches the upstream request validator without rewriting its bytes', async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  const service = await upstream(t);
  const fixture = await startBoundaryFixture({ scenarioFile: `${root}empty-instances.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl, token: 'selftest-secret', evidenceDirectory: `${evidenceRoot}${randomUUID()}` });
  t.onTestFinished(() => fixture.close());
  const origin = `${fixture.sourceAddress.url}:${fixture.sourceAddress.port}`;
  const response = await fetch(origin + instancePath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(response.status, 422);
  assert.equal(service.httpRequests.at(-1).raw, '{broken');
  assert.deepEqual(await response.json(), { status: 'error', message: 'Catalog request is invalid.', results: [], page: 1, page_size: 0, total_count: 0 });
});


test('HTTP source query strings preserve the empty instance domain and the upstream query bytes', async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  const service = await upstream(t);
  const fixture = await startBoundaryFixture({ scenarioFile: `${root}empty-instances.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl, token: 'selftest-secret', evidenceDirectory: `${evidenceRoot}${randomUUID()}` });
  t.onTestFinished(() => fixture.close());
  const origin = `${fixture.sourceAddress.url}:${fixture.sourceAddress.port}`;
  const response = await fetch(origin + protocol.source.operations.instance.replace('{id}', '2') + '?unknown=true');
  assert.equal(response.status, 404);
  assert.equal(service.httpRequests.at(-1).path, protocol.source.operations.instance.replace('{id}', '1') + '?unknown=true');
});


test('no-default-model preserves real upstream errors for extra resource argument fields', async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  const service = await upstream(t);
  const fixture = await startBoundaryFixture({ scenarioFile: `${root}no-default-model.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl, token: 'selftest-secret', evidenceDirectory: `${evidenceRoot}${randomUUID()}` });
  t.onTestFinished(() => fixture.close());
  for (const arguments_ of [{ ref: { kind: 'workflow', id: '29' }, fail: true }, { ref: { kind: 'workflow', id: '29' }, unknown: true }, { ref: { kind: 'workflow', id: '29', unknown: true } }]) {
    const params = { name: 'get_catalog_resource', arguments: arguments_ };
    const expected = (await rpc(service.url, 'tools/call', params)).body.result;
    const actual = (await rpc(fixture.mcpUrl, 'tools/call', params)).body.result;
    assert.equal(actual.isError, true);
    assert.deepEqual(actual, expected);
    assert.deepEqual(service.requests.at(-1).params, params);
  }
});


async function cancelRpc(url, requestId, reason = 'consumer cancellation', session) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer selftest-secret', ...(session ? { 'Mcp-Session-Id': session } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId, reason } }),
  });
}

test('MCP cancellation forwards the mapped upstream ID and stops only the requested read', { timeout: 5000 }, async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  let release;
  let started;
  const blocked = new Promise(resolve => { release = resolve; });
  const pendingStarted = new Promise(resolve => { started = resolve; });
  t.onTestFinished(() => release());
  const service = await upstream(t, { onToolCall: async body => {
    if (body.params.arguments?.query !== 'pending-mcp') return;
    started();
    await blocked;
  } });
  const fixture = await startBoundaryFixture({ scenarioFile: `${root}empty-instances.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl, token: 'selftest-secret', evidenceDirectory: `${evidenceRoot}${randomUUID()}` });
  t.onTestFinished(() => fixture.close());
  const pending = rpc(fixture.mcpUrl, 'tools/call', { name: 'search_instances', arguments: { query: 'pending-mcp' } }, 17).catch(error => ({ error: error.name }));
  await pendingStarted;
  const upstreamCall = service.requests.find(body => body.params?.arguments?.query === 'pending-mcp');
  const notification = await cancelRpc(fixture.mcpUrl, 17);
  assert.equal(notification.status, 202);
  const forwarded = service.requests.find(body => body.method === 'notifications/cancelled');
  assert.equal(forwarded?.params.requestId, upstreamCall.id);
  assert.equal(forwarded.params.reason, 'consumer cancellation');
  assert.equal(Object.hasOwn(forwarded, 'id'), false);
  const completed = await rpc(fixture.mcpUrl, 'tools/call', { name: 'search_instances', arguments: { query: 'completed-mcp' } }, 18);
  assert.equal(completed.status, 200);
  assert.deepEqual(completed.body.result.structuredContent.results, []);
  const cancelled = await pending;
  assert.equal(cancelled.error, 'TypeError');
  await fixture.close();
  const entries = await evidenceEntries(fixture.evidenceDirectory, 'upstream-');
  assert.equal(entries.filter(entry => entry.request.id === upstreamCall.id && entry.error?.cancelled === true).length, 1);
  const exchanges = await evidenceEntries(fixture.evidenceDirectory, 'exchange-');
  assert.equal(exchanges.filter(entry => entry.request?.id === 17 && entry.responseSource === 'fixture-cancelled').length, 1);
});


test('MCP sessions isolate identical request IDs and ignore invalid or completed cancellation notifications', { timeout: 5000 }, async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  let release;
  let started;
  let count = 0;
  const blocked = new Promise(resolve => { release = resolve; });
  const pendingStarted = new Promise(resolve => { started = resolve; });
  t.onTestFinished(() => release());
  const service = await upstream(t, { onToolCall: async body => {
    if (!body.params.arguments?.query?.startsWith('session-pending-')) return;
    if (++count === 2) started();
    await blocked;
  } });
  const fixture = await startBoundaryFixture({ scenarioFile: `${root}empty-instances.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl, token: 'selftest-secret', evidenceDirectory: `${evidenceRoot}${randomUUID()}` });
  t.onTestFinished(() => fixture.close());
  const sessions = await Promise.all([1, 2].map(async id => (await rpc(fixture.mcpUrl, 'initialize', {}, id)).headers.get('mcp-session-id')));
  assert.ok(sessions[0]);
  assert.notEqual(sessions[0], sessions[1]);
  const pending = sessions.map((session, index) => rpc(fixture.mcpUrl, 'tools/call', { name: 'search_instances', arguments: { query: `session-pending-${index}` } }, 17, { headers: { 'Mcp-Session-Id': session } }).catch(error => ({ error: error.name })));
  await pendingStarted;
  const before = service.requests.length;
  assert.equal((await cancelRpc(fixture.mcpUrl, 17, 'different session', 'unknown-session')).status, 202);
  assert.equal((await cancelRpc(fixture.mcpUrl, null, 'invalid', sessions[0])).status, 202);
  assert.equal((await cancelRpc(fixture.mcpUrl, 17, 123, sessions[0])).status, 202);
  assert.equal(service.requests.length, before);
  assert.equal((await cancelRpc(fixture.mcpUrl, 17, 'first session only', sessions[0])).status, 202);
  const forwarded = service.requests.filter(body => body.method === 'notifications/cancelled');
  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0].params.requestId, service.requests.find(body => body.params?.arguments?.query === 'session-pending-0').id);
  release();
  const results = await Promise.all(pending);
  assert.equal(results[0].error, 'TypeError');
  assert.equal(results[1].status, 200);
  assert.deepEqual(results[1].body.result.structuredContent.results, []);
  const completedCount = service.requests.length;
  assert.equal((await cancelRpc(fixture.mcpUrl, 17, 'completed request', sessions[1])).status, 202);
  assert.equal(service.requests.length, completedCount);
});

test('MCP consumer connection abort cancels its upstream read and preserves a sibling read', { timeout: 5000 }, async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  let started;
  const pendingStarted = new Promise(resolve => { started = resolve; });
  const service = await upstream(t, { onToolCall: async body => {
    if (body.params.arguments?.query !== 'connection-aborted') return;
    started();
    await new Promise(resolve => {
      const interval = setInterval(() => {
        if (service.requests.some(entry => entry.method === 'notifications/cancelled' && entry.params.requestId === body.id)) { clearInterval(interval); resolve(); }
      }, 5);
      t.onTestFinished(() => { clearInterval(interval); resolve(); });
    });
  } });
  const fixture = await startBoundaryFixture({ scenarioFile: `${root}empty-instances.json`, upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl, token: 'selftest-secret', evidenceDirectory: `${evidenceRoot}${randomUUID()}` });
  t.onTestFinished(() => fixture.close());
  const controller = new AbortController();
  const pending = rpc(fixture.mcpUrl, 'tools/call', { name: 'search_instances', arguments: { query: 'connection-aborted' } }, 27, { signal: controller.signal });
  const rejection = assert.rejects(pending, { name: 'AbortError' });
  await pendingStarted;
  controller.abort();
  await rejection;
  const completed = await rpc(fixture.mcpUrl, 'tools/call', { name: 'search_instances', arguments: { query: 'connection-retained' } }, 28);
  assert.equal(completed.status, 200);
  assert.deepEqual(completed.body.result.structuredContent.results, []);
  await fixture.close();
  const entries = await evidenceEntries(fixture.evidenceDirectory, 'mcp-cancellation-');
  assert.equal(entries.filter(entry => entry.requestId === 27 && entry.forwarded === true).length, 1);
});

for (const scenario of ['no-default-model', 'empty-instances']) {
test('declared resource reads preserve upstream documents and protocol errors in ' + scenario, async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  const capabilities = { tools: {}, resources: {}, extensions: { 'io.modelcontextprotocol/skills': {} } };
  const uri = 'skill://catalog-query/SKILL.md';
  const resources = { resources: [{ uri, name: 'catalog-query', mimeType: 'text/markdown' }], nextCursor: 'next-skill-page' };
  const document = { contents: [{ uri, mimeType: 'text/markdown', text: 'Read works, characters and prompt terms through the Catalog query tools.' }] };
  const outcomes = {
    'resources/list': { result: resources },
    'resources/read': { result: document },
    'resources/templates/list': { error: { code: -32601, message: 'Method not found' } },
  };
  const service = await upstream(t, { capabilities, onResourceRequest: async (body, request) => {
    assert.equal(request.headers['mcp-session-id'], 'test-session');
    return outcomes[body.method];
  } });
  const fixture = await startBoundaryFixture({
    scenarioFile: root + scenario + '.json', upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl,
    token: 'selftest-secret', evidenceDirectory: evidenceRoot + randomUUID(),
  });
  t.onTestFinished(() => fixture.close());
  const initialized = await rpc(fixture.url, 'initialize', {}, 40);
  assert.deepEqual(initialized.body.result.capabilities, capabilities);
  const session = initialized.headers.get('mcp-session-id');
  for (const [index, [method, params]] of [
    ['resources/list', { cursor: 'prior-skill-page' }],
    ['resources/read', { uri, _meta: { requestLabel: 'original-metadata' } }],
    ['resources/templates/list', { cursor: 'prior-template-page' }],
  ].entries()) {
    const response = await rpc(fixture.url, method, params, 41 + index, { headers: { 'Mcp-Session-Id': session } });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { jsonrpc: '2.0', id: 41 + index, ...outcomes[method] });
    assert.deepEqual(service.requests.at(-1).params, params);
  }
  const before = service.requests.length;
  for (const method of ['resources/write', 'resources/subscribe', 'skills/list']) {
    assert.equal((await rpc(fixture.url, method, { uri })).body.error.code, -32601);
  }
  const unauthorized = await fetch(fixture.url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 44, method: 'resources/read', params: { uri } }),
  });
  assert.equal(unauthorized.status, 401);
  assert.equal(service.requests.length, before);
  const exchanges = await evidenceEntries(fixture.evidenceDirectory, 'exchange-');
  for (const method of Object.keys(outcomes)) {
    const entry = exchanges.find(entry => entry.request?.method === method);
    assert.deepEqual(entry.fields, {});
    assert.equal(entry.responseSource, 'real-catalog');
    assert.deepEqual(entry.forwardedRequest, { method, params: entry.request.params });
    assert.deepEqual(entry.response.error ?? entry.response.result, entry.upstreamResponse.error ?? entry.upstreamResponse.result);
    assert.equal(entry.requestHeaders.authorization, '[redacted]');
  }
});
}

test('resources remain unavailable when initialization declares only the skills extension', async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  const service = await upstream(t, { capabilities: { tools: {}, extensions: { 'io.modelcontextprotocol/skills': {} } } });
  const fixture = await startBoundaryFixture({
    scenarioFile: root + 'no-default-model.json', upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl,
    token: 'selftest-secret', evidenceDirectory: evidenceRoot + randomUUID(),
  });
  t.onTestFinished(() => fixture.close());
  const before = service.requests.length;
  for (const method of ['resources/list', 'resources/templates/list', 'resources/read']) {
    assert.equal((await rpc(fixture.url, method, {})).body.error.code, -32601);
  }
  assert.equal(service.requests.length, before);
});

test('resource cancellation keeps consumer sessions and their identical request IDs separate', { timeout: 5000 }, async t => {
  const { startBoundaryFixture } = await import('../desktop/fixtures/official-catalog-boundary.mjs');
  let release;
  let started;
  const blocked = new Promise(resolve => { release = resolve; });
  const pendingStarted = new Promise(resolve => { started = resolve; });
  t.onTestFinished(() => release());
  const uri = 'skill://catalog-query/SKILL.md';
  const document = { contents: [{ uri, mimeType: 'text/markdown', text: 'Catalog query documentation' }] };
  const service = await upstream(t, {
    capabilities: { tools: {}, resources: {} },
    onResourceRequest: async body => {
      if (body.params._meta?.label === 'pending-resource') { started(); await blocked; }
      return { result: document };
    },
  });
  const fixture = await startBoundaryFixture({
    scenarioFile: root + 'no-default-model.json', upstreamUrl: service.url, upstreamHttpUrl: service.httpUrl,
    token: 'selftest-secret', evidenceDirectory: evidenceRoot + randomUUID(),
  });
  t.onTestFinished(() => fixture.close());
  const sessions = await Promise.all([1, 2].map(async id => (await rpc(fixture.url, 'initialize', {}, id)).headers.get('mcp-session-id')));
  assert.notEqual(sessions[0], sessions[1]);
  const pending = rpc(fixture.url, 'resources/read', { uri, _meta: { label: 'pending-resource' } }, 17,
    { headers: { 'Mcp-Session-Id': sessions[0] } }).catch(error => ({ error: error.name }));
  await pendingStarted;
  const upstreamRead = service.requests.find(body => body.method === 'resources/read' && body.params._meta?.label === 'pending-resource');
  const sibling = await rpc(fixture.url, 'resources/read', { uri, _meta: { label: 'completed-resource' } }, 17,
    { headers: { 'Mcp-Session-Id': sessions[1] } });
  assert.deepEqual(sibling.body, { jsonrpc: '2.0', id: 17, result: document });
  assert.equal((await cancelRpc(fixture.url, 17, 'resource cancellation', sessions[0])).status, 202);
  const notification = service.requests.find(body => body.method === 'notifications/cancelled');
  assert.deepEqual(notification.params, { requestId: upstreamRead.id, reason: 'resource cancellation' });
  assert.equal(Object.hasOwn(notification, 'id'), false);
  release();
  assert.equal((await pending).error, 'TypeError');
  await fixture.close();
  const cancellations = await evidenceEntries(fixture.evidenceDirectory, 'mcp-cancellation-');
  assert.equal(cancellations.filter(entry => entry.sessionId === sessions[0] && entry.requestId === 17
    && entry.upstreamRequestId === upstreamRead.id && entry.forwarded === true).length, 1);
  const records = await evidenceEntries(fixture.evidenceDirectory, 'upstream-');
  assert.equal(records.filter(entry => entry.request.id === upstreamRead.id && entry.error?.cancelled === true).length, 1);
});
