import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import sourceProtocol from '../../../config/source-client.json' with { type: 'json' };
import { prepareCatalogRequest } from '../../../src/host/source-client/catalog-protocol.mjs';

import fixture from './official-mcp-fixture.json' with { type: 'json' };
const defaults = fixture.boundary;
import { resolve } from 'node:path';
import { redactEvidence } from './official-trace-evidence.mjs';

function valueAt(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}


export async function startBoundaryFixture({ scenarioFile, upstreamUrl, upstreamHttpUrl, token, port = defaults.port, evidenceDirectory, runtime = defaults }) {
  if (typeof token !== 'string' || !token) throw new Error('请提供目录 MCP 的 Bearer 凭据。');
  const runId = randomUUID();
  evidenceDirectory = resolve(evidenceDirectory);
  await mkdir(evidenceDirectory, { recursive: true });
  async function save(prefix, evidence) {
    const path = resolve(evidenceDirectory, `${prefix}-${randomUUID()}.json`);
    await writeFile(path, JSON.stringify(redactEvidence(evidence, [token]), null, 2), { mode: 0o600 });
    return path;
  }
  const scenario = JSON.parse(await readFile(scenarioFile, 'utf8'));
  const shutdown = new AbortController();
  const activeRequests = new Set();
  const mcpRequests = new Map();
  async function httpUpstream(method, path, body, signal, rawBody) {
    const request = { method, path, body: body ?? null, ...(rawBody === undefined ? {} : { rawBody }) };
    let result = null;
    let failure = null;
    try {
      const response = await fetch(new URL(path, upstreamHttpUrl), {
        method, headers: body === undefined && rawBody === undefined ? {} : { 'Content-Type': 'application/json' },
        ...(body === undefined && rawBody === undefined ? {} : { body: rawBody ?? JSON.stringify(body) }),
        signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(runtime.upstreamTimeoutMs), ...(signal ? [signal] : [])]),
      });
      result = { status: response.status, body: await response.json() };
      return result;
    } catch (error) {
      failure = { name: error.name, message: error.message, cancelled: shutdown.signal.aborted || signal?.aborted === true };
      throw error;
    } finally {
      await save('http-upstream', { at: new Date().toISOString(), request, response: result, error: failure });
    }
  }
  let session;
  let id = 0;
  async function upstream(method, params, { signal, onRequest, notification = false } = {}) {
    const requestId = notification ? undefined : ++id;
    const request = { jsonrpc: '2.0', ...(notification ? {} : { id: requestId }), method, params };
    onRequest?.(requestId);
    let httpStatus = null;
    let parsed = null;
    let failure = null;
    try {
      const response = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${token}`, ...(session ? { 'Mcp-Session-Id': session } : {}),
        },
        body: JSON.stringify(request),
        signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(runtime.upstreamTimeoutMs), ...(signal ? [signal] : [])]),
      });
      httpStatus = response.status;
      session = response.headers.get('mcp-session-id') ?? session;
      if (!response.ok) throw new Error(`目录 MCP 返回 HTTP ${response.status}。`);
      if (notification) return {};
      const raw = await response.text();
      parsed = response.headers.get('content-type')?.includes('text/event-stream')
        ? raw.split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5))).find(message => message.id === requestId)
        : JSON.parse(raw);
      if (!parsed) throw new Error('目录 MCP 响应缺少当前请求的 JSON-RPC 消息。');
      return parsed;
    } catch (error) {
      failure = { name: error.name, message: error.message, cancelled: shutdown.signal.aborted || signal?.aborted === true };
      throw error;
    } finally {
      await save('upstream', { at: new Date().toISOString(), request, httpStatus, response: parsed, error: failure });
    }
  }
  function cancelMcpRequest(entry, reason) {
    entry.cancelling ??= (async () => {
      entry.controller.abort();
      let forwarded = false;
      let error = null;
      if (!shutdown.signal.aborted && entry.upstreamId !== null) {
        try {
          await upstream('notifications/cancelled', { requestId: entry.upstreamId, ...(reason === undefined ? {} : { reason }) }, { notification: true });
          forwarded = true;
        } catch (failure) { error = { name: failure.name, message: failure.message }; }
      }
      await save('mcp-cancellation', { at: new Date().toISOString(), sessionId: entry.sessionId, requestId: entry.requestId, upstreamRequestId: entry.upstreamId, reason, forwarded, error });
    })();
    return entry.cancelling;
  }
  const initialization = await upstream('initialize', {
    protocolVersion: fixture.protocolVersion, capabilities: {}, clientInfo: runtime.clientInfo,
  });
  const listing = await upstream('tools/list', {});
  await save('scenario', { scenario });
  const readonlyTools = new Set(listing.result.tools.filter(tool => tool.annotations?.readOnlyHint === true).map(tool => tool.name));
  const readonlyResourceMethods = new Set(Object.hasOwn(initialization.result?.capabilities ?? {}, 'resources')
    ? ['resources/list', 'resources/templates/list', 'resources/read'] : []);
  const toolSchemas = new Map(listing.result.tools.map(tool => [tool.name, tool.inputSchema]));
  const instancePath = Object.keys(sourceProtocol.catalog.operations).find(path => sourceProtocol.catalog.operations[path].toolName === 'query_semantic_comfyui_instances');
  const httpDiscoveries = new Map();
  for (const path of [sourceProtocol.catalog.discoveryPath, sourceProtocol.source.discoveryPath]) {
    const discovery = await httpUpstream('GET', path);
    if (discovery.status !== 200) throw new Error(`HTTP discovery 返回 ${discovery.status}，请核对上游 HTTP 地址。`);
    httpDiscoveries.set(path, discovery);
  }
  const catalogDiscovery = httpDiscoveries.get(sourceProtocol.catalog.discoveryPath).body;
  // Reuse the production discovery validator; request errors are handled by the upstream protocol.
  prepareCatalogRequest(catalogDiscovery, instancePath, { mode: 'resolve', id: scenario.absentInstance?.id ?? '1' });
  const catalogPaths = new Set(Object.keys(sourceProtocol.catalog.operations).filter(path => catalogDiscovery.paths[path]?.post));
  const sourceEnvelope = httpDiscoveries.get(sourceProtocol.source.discoveryPath).body;
  const sourceDiscovery = sourceEnvelope.openapi ? sourceEnvelope : sourceEnvelope.results?.[0];
  if (sourceDiscovery?.openapi !== '3.1.0' || !sourceDiscovery.paths) throw new Error('HTTP Source discovery 缺少 OpenAPI paths，请核对上游服务。');
  const sourcePaths = new Map();
  for (const [operation, path] of Object.entries(sourceProtocol.source.operations)) {
    const declaration = Object.entries(sourceDiscovery.paths).find(([candidate]) => candidate.replace(/\{[^}]+\}/g, '{id}') === path)?.[1];
    if (!declaration?.get?.operationId || Object.keys(declaration).some(method => ['post', 'put', 'patch', 'delete'].includes(method))) throw new Error(`HTTP Source discovery 未声明只读 GET ${path}，请核对上游服务。`);
    sourcePaths.set(operation, path);
  }
  function validCatalogInput(path, input) {
    try { prepareCatalogRequest(catalogDiscovery, path, input); return true; } catch { return false; }
  }
  if (scenario.absentInstance) {
    for (const [params, expected] of [
      [{ name: 'get_catalog_resource', arguments: { ref: { kind: 'instance', id: scenario.absentInstance.id } } }, scenario.absentInstance.resourceErrorCode],
      [{ name: 'get_instance_status', arguments: { instance_id: scenario.absentInstance.id } }, scenario.absentInstance.operationErrorCode],
    ]) {
      const response = await upstream('tools/call', params);
      const error = response.result?.isError && response.result.content?.find(item => item.type === 'text');
      if (!error || JSON.parse(error.text).code !== expected) throw new Error('空实例夹具的映射目标未确认不存在，请重新核对 absentInstance.id。');
    }
    for (const [method, path, body] of [
      ['GET', sourcePaths.get('instance').replace('{id}', scenario.absentInstance.id), undefined],
      ['POST', instancePath, { mode: 'resolve', id: scenario.absentInstance.id }],
    ]) {
      const response = await httpUpstream(method, path, body);
      if (response.status !== 404 || response.body?.status !== 'error' || response.body.results?.length !== 0) throw new Error('HTTP 空实例夹具的映射目标未确认不存在，请重新核对 absentInstance.id。');
    }
  }

  async function handleHttpRequest(request, response) {
    const url = new URL(request.url, 'http://127.0.0.1');
    const sourceMatch = [...sourcePaths].map(([operation, path]) => {
      const [prefix, suffix] = path.split('{id}');
      const id = url.pathname.slice(prefix.length, suffix ? -suffix.length : undefined);
      return url.pathname.startsWith(prefix) && url.pathname.endsWith(suffix) && id && !id.includes('/')
        ? { operation, path, id } : null;
    }).find(Boolean);
    const allowed = request.method === 'GET' && (httpDiscoveries.has(url.pathname) || sourceMatch)
      || request.method === 'POST' && catalogPaths.has(url.pathname);
    let requestBody = null;
    let rawBody;
    let forwardedRequest = null;
    let upstreamResponse = null;
    let responseSource = 'fixture-protocol';
    const fields = {};
    const controller = new AbortController();
    const cancel = () => { if (!response.writableEnded) controller.abort(); };
    request.once('aborted', cancel);
    response.once('close', cancel);
    async function send(status, body) {
      await save('exchange', { at: new Date().toISOString(), protocol: 'http', scenario: scenario.name, httpMethod: request.method, path: request.url, requestHeaders: request.headers, request: requestBody, requestRaw: rawBody ?? null, forwardedRequest, httpStatus: status, upstreamResponse, responseSource, fields, response: body });
      if (response.destroyed) return;
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    }
    try {
      if (!allowed) return await send(405, { error: '请使用 discovery 声明的 HTTP 只读入口和请求方法。' });
      if (shutdown.signal.aborted) return await send(503, { error: '夹具正在停止，请等待停止命令完成后重新启动。' });
      if (request.method === 'POST') {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        rawBody = Buffer.concat(chunks).toString('utf8');
        try { requestBody = JSON.parse(rawBody); } catch { requestBody = null; }
      }
      let forwardedPath = request.url;
      let forwardedBody = request.method === 'POST' ? requestBody : undefined;
      if (scenario.absentInstance) {
        if (url.pathname === instancePath && requestBody?.mode === 'resolve' && validCatalogInput(instancePath, requestBody)) {
          forwardedBody = { ...requestBody, id: scenario.absentInstance.id };
          fields['request.id'] = { before: requestBody.id, after: scenario.absentInstance.id };
        } else if (sourceMatch?.operation === 'instance' && validCatalogInput(instancePath, { mode: 'resolve', id: sourceMatch.id })) {
          forwardedPath = sourceMatch.path.replace('{id}', scenario.absentInstance.id) + url.search;
          fields['request.path'] = { before: request.url, after: forwardedPath };
        }
      }
      forwardedRequest = { method: request.method, path: forwardedPath, body: forwardedBody ?? null };
      const upstreamResult = await httpUpstream(request.method, forwardedPath, forwardedBody, controller.signal, forwardedBody === requestBody ? rawBody : undefined);
      upstreamResponse = structuredClone(upstreamResult);
      responseSource = Object.keys(fields).length ? 'real-catalog+absent-instance' : 'real-catalog';
      const body = structuredClone(upstreamResult.body);
      if (scenario.absentInstance && url.pathname === instancePath && requestBody?.mode === 'search' && upstreamResult.status === 200 && body.status === 'ok') {
        fields.results = { before: body.results, after: scenario.fields.results };
        fields.total_count = { before: body.total_count, after: 0 };
        body.results = structuredClone(scenario.fields.results);
        body.total_count = 0;
        responseSource += '+boundary-fields';
      }
      if (upstreamResult.status === 200 && body.status === 'ok' && Array.isArray(body.results)) {
        for (const rule of scenario.httpOverrides ?? []) {
          if (sourceProtocol.catalog.operations[url.pathname]?.toolName !== rule.catalogTool && sourceMatch?.operation !== rule.sourceOperation) continue;
          body.results.forEach((row, index) => {
            if (String(row.id) !== scenario.arguments[rule.idFromArgument]) return;
            for (const [key, scenarioField] of Object.entries(rule.fieldsFromScenario)) {
              if (!Object.hasOwn(row, key)) continue;
              const after = scenario.fields[scenarioField];
              fields[`results.${index}.${key}`] = { before: row[key], after };
              row[key] = after;
            }
          });
        }
        if (Object.keys(fields).some(key => key.startsWith('results.'))) responseSource += '+boundary-fields';
      }
      return await send(upstreamResult.status, body);
    } catch (error) {
      responseSource = shutdown.signal.aborted || controller.signal.aborted ? 'fixture-cancelled' : 'fixture-error';
      return await send(responseSource === 'fixture-cancelled' ? 503 : 502, { error: `HTTP 目录读取失败，请核对请求与上游连接：${redactEvidence(error.message, [token])}` });
    } finally {
      request.removeListener('aborted', cancel);
      response.removeListener('close', cancel);
    }
  }

  async function handleRequest(request, response) {
    let requestBody = null;
    let forwardedRequest = null;
    let entry;
    let requestKey;
    const sessionId = request.headers['mcp-session-id'] ?? '';
    const keyFor = requestId => JSON.stringify([sessionId, requestId]);
    const cancelConnection = () => { if (entry && !response.writableEnded) void cancelMcpRequest(entry, 'MCP consumer connection closed.'); };
    let upstreamResponse = null;
    let responseSource = 'fixture-protocol';
    const fields = {};
    const send = async (status, body, suppressResponse = false) => {
      await save('exchange', { at: new Date().toISOString(), protocol: 'mcp', scenario: scenario.name, httpMethod: request.method, path: request.url, requestHeaders: request.headers, request: requestBody, forwardedRequest, httpStatus: status, responseSource, fields, upstreamResponse, response: body, responseSuppressed: suppressResponse });
      if (suppressResponse) { response.destroy(); return; }
      if (response.destroyed) return;
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(body === undefined ? undefined : JSON.stringify(body));
    };
    if (shutdown.signal.aborted) return send(503, { error: '夹具正在停止，请等待停止命令完成后重新启动。' });
    if (request.headers.authorization !== `Bearer ${token}`) return send(401, { error: '请使用目录 MCP 的 Bearer 凭据连接夹具。' });
    if (request.method !== 'POST' || request.url !== '/mcp') return send(405);
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (body?.jsonrpc !== '2.0' || typeof body.method !== 'string') return send(400, { error: '请发送 JSON-RPC 2.0 请求并填写 method。' });
      if (body.id === undefined) {
        if (body.method === 'notifications/cancelled') {
          const params = body.params;
          const valid = params && (typeof params.requestId === 'string' || Number.isInteger(params.requestId)) && (params.reason === undefined || typeof params.reason === 'string');
          const target = valid ? mcpRequests.get(keyFor(params.requestId)) : undefined;
          if (target) {
            fields['request.params.requestId'] = { before: params.requestId, after: target.upstreamId };
            forwardedRequest = { method: body.method, params: { requestId: target.upstreamId, ...(params.reason === undefined ? {} : { reason: params.reason }) } };
            await cancelMcpRequest(target, params.reason);
            responseSource = 'fixture-cancelled';
          }
          return await send(202);
        }
        if (body.method === 'notifications/initialized') return await send(202);
        return send(400, { error: '目录读取请求必须填写 id；通知仅支持 initialized 和 cancelled。' });
      }
      let message;
      if (body.method === 'initialize') { response.setHeader('Mcp-Session-Id', randomUUID()); message = initialization; }
      else if (body.method === 'tools/list') message = listing;
      else if (body.method === 'ping') message = { result: {} };
      else if ((body.method === 'tools/call' && readonlyTools.has(body.params?.name)) || readonlyResourceMethods.has(body.method)) {
        requestKey = keyFor(body.id);
        if (mcpRequests.has(requestKey)) return await send(400, { error: '当前 MCP 会话中的请求 ID 仍在读取目录，请为并发请求使用不同的 ID。' });
        entry = { sessionId, requestId: body.id, upstreamId: null, controller: new AbortController(), cancelling: null };
        mcpRequests.set(requestKey, entry);
        request.once('aborted', cancelConnection);
        response.once('close', cancelConnection);
        const toolCall = body.method === 'tools/call';
        const matches = toolCall && body.params?.name === scenario.tool
          && Object.entries(scenario.arguments).every(([path, value]) => valueAt(body.params.arguments, path) === value);
        let upstreamParams = body.params;
        const schema = toolCall ? toolSchemas.get(body.params?.name) : undefined;
        const resourceLookup = toolCall && body.params?.name === 'get_catalog_resource' && body.params.arguments?.ref?.kind === 'instance';
        const idSchema = resourceLookup ? schema?.properties?.ref?.properties?.id : schema?.properties?.instance_id;
        const originalId = resourceLookup ? body.params.arguments?.ref?.id : body.params?.arguments?.instance_id;
        if (scenario.absentInstance && idSchema && typeof originalId === 'string' && typeof idSchema.pattern === 'string' && new RegExp(idSchema.pattern).test(originalId)) {
          upstreamParams = structuredClone(body.params);
          if (resourceLookup) upstreamParams.arguments.ref.id = scenario.absentInstance.id;
          else upstreamParams.arguments.instance_id = scenario.absentInstance.id;
          fields[resourceLookup ? 'request.ref.id' : 'request.instance_id'] = { before: originalId, after: scenario.absentInstance.id };
        }
        forwardedRequest = { method: body.method, params: upstreamParams };
        message = await upstream(body.method, upstreamParams, { signal: entry.controller.signal, onRequest: requestId => { entry.upstreamId = requestId; } });
        upstreamResponse = structuredClone(message);
        responseSource = upstreamParams === body.params ? 'real-catalog' : 'real-catalog+absent-instance';
        const collectionOverrides = (scenario.collectionOverrides ?? []).filter(rule => toolCall && rule.tool === body.params?.name);
        if ((matches || collectionOverrides.length) && message.result && !message.result.isError) {
          responseSource += '+boundary-fields';
          const result = structuredClone(message.result);
          for (const [path, value] of Object.entries(matches ? scenario.fields : {})) {
            const parts = path.split('.');
            const key = parts.pop();
            const parent = parts.length ? valueAt(result.structuredContent, parts.join('.')) : result.structuredContent;
            fields[path] = { before: parent[key], after: value };
            parent[key] = value;
          }
          for (const rule of collectionOverrides) {
            const rows = valueAt(result.structuredContent, rule.path);
            if (!Array.isArray(rows)) throw new Error(`夹具响应缺少数组 ${rule.path}。`);
            rows.forEach((row, index) => {
              if (!Object.entries(rule.match).every(([path, value]) => valueAt(row, path) === value)) return;
              for (const [key, value] of Object.entries(rule.fields)) {
                fields[`${rule.path}.${index}.${key}`] = { before: row[key], after: value };
                row[key] = value;
              }
            });
          }
          result.content = result.content.map(content => content.type === 'text'
            ? { ...content, text: JSON.stringify(result.structuredContent) } : content);
          message = { result };
        }
      } else message = { error: { code: -32601, message: `请调用 ${['initialize', 'tools/list', 'ping', ...readonlyResourceMethods].join('、')}，或通过 tools/call 读取以下工具：${[...readonlyTools].join('、')}。` } };
      await send(200, { jsonrpc: '2.0', id: body.id, ...(message.error ? { error: message.error } : { result: message.result }) });
    } catch (error) {
      responseSource = shutdown.signal.aborted || entry?.controller.signal.aborted ? 'fixture-cancelled' : 'fixture-error';
      if (entry?.controller.signal.aborted && !shutdown.signal.aborted) { await send(null, undefined, true); return; }
      await send(shutdown.signal.aborted ? 503 : 400, { error: shutdown.signal.aborted
        ? '夹具正在停止，本次目录读取已取消。'
        : `请核对 JSON-RPC 目录读取请求和目录 MCP 连接：${redactEvidence(error.message, [token])}` });
    } finally {
      if (entry) {
        await entry.cancelling;
        mcpRequests.delete(requestKey);
        request.removeListener('aborted', cancelConnection);
        response.removeListener('close', cancelConnection);
      }
    }
  }
  const server = createServer((request, response) => {
    const handling = request.url === '/mcp'
      ? handleRequest(request, response) : handleHttpRequest(request, response);
    activeRequests.add(handling);
    handling.then(() => activeRequests.delete(handling), () => activeRequests.delete(handling));
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolveListen);
  });
  const stateFile = resolve(evidenceDirectory, 'state.json');
  const state = {
    runId, pid: process.pid, scenario: scenario.name, status: 'running',
    url: `http://127.0.0.1:${server.address().port}/mcp`, mcpUrl: `http://127.0.0.1:${server.address().port}/mcp`,
    sourceAddress: { url: 'http://127.0.0.1', port: server.address().port }, port: server.address().port,
    evidenceDirectory, startedAt: new Date().toISOString(),
  };
  async function writeState(value) {
    const temporary = resolve(evidenceDirectory, `state-${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(temporary, stateFile);
  }
  try {
    await writeState(state);
  } catch (error) {
    shutdown.abort();
    const closed = new Promise(resolveClose => server.close(resolveClose));
    server.closeAllConnections();
    await closed;
    await Promise.allSettled([...activeRequests]);
    throw error;
  }
  let closing;
  return {
    ...state, stateFile,
    close() {
      closing ??= (async () => {
        shutdown.abort();
        const closed = new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
        server.closeAllConnections();
        await writeState({ ...state, status: 'stopping', stoppingAt: new Date().toISOString() });
        await closed;
        const completed = await Promise.allSettled([...activeRequests]);
        const failures = completed.filter(result => result.status === 'rejected');
        if (failures.length) throw new AggregateError(failures.map(result => result.reason), '夹具请求证据写入失败，请核对证据目录。');
        const probe = createServer();
        let portReleased;
        try {
          await new Promise((resolveListen, reject) => { probe.once('error', reject); probe.listen(state.port, '127.0.0.1', resolveListen); });
          portReleased = true;
        } catch { portReleased = false; }
        if (probe.listening) await new Promise(resolveClose => probe.close(resolveClose));
        const stopped = { ...state, status: 'stopped', stoppedAt: new Date().toISOString(), portReleased };
        await save('lifecycle', stopped);
        await writeState(stopped);
        return stopped;
      })();
      return closing;
    },
  };
}
