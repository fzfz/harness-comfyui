import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

const marker = '[redacted]';
const sensitive = key => /^(authorization|proxy_authorization|api_?key|access_?token|refresh_?token|bearer_?token|token|password|passwd|secret|client_?secret|credential|credentials|credential_value|capability)$/i.test(key.replaceAll('-', '_'));
const sensitiveEnvironment = key => /(?:^|_)(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CAPABILITY|CREDENTIALS?)$/i.test(key);
const initialContext = value => ({
 location:value && typeof value === 'object' && !Array.isArray(value) && (
  value.kind === 'request' || Array.isArray(value.messages) ||
  Object.keys(value).length > 0 && Object.keys(value).every(key=>['tools','toolHistory'].includes(key))
 ) ? 'request' : 'root',
 runtime:false,schema:false,
});
const nodeContext = (value,context) => {
 if(context.schema)return context;
 const runtime=context.runtime || value?.type === 'tool/result' || value?.role === 'tool';
 return {...context,runtime,location:runtime?'data':value?.kind === 'request'?'request':context.location};
};
const childContext = (value,key,context) => {
 if(context.schema)return context;
 if(context.runtime || key === 'result')return {location:'data',runtime:true,schema:false};
 if(context.location === 'declaration' && key === 'parameters' && typeof value.name === 'string' && value.parameters && typeof value.parameters === 'object' && !Array.isArray(value.parameters))return {location:'schema',runtime:false,schema:true};
 if(value.type === 'request/header' && key === 'data')return {location:'header-data',runtime:false,schema:false};
 if(context.location === 'header-data' && ['header','request'].includes(key))return {location:'request',runtime:false,schema:false};
 if(['root','request'].includes(context.location) && key === 'request')return {location:'request',runtime:false,schema:false};
 if(context.location === 'request' && key === 'tools')return {location:'declarations',runtime:false,schema:false};
 if(context.location === 'request' && key === 'toolHistory')return {location:'tool-history',runtime:false,schema:false};
 if(context.location === 'tool-history' && key === 'tools')return {location:'declarations',runtime:false,schema:false};
 if(context.location === 'tool-history' && key === 'updates')return {location:'updates',runtime:false,schema:false};
 if(context.location === 'update' && key === 'additions')return {location:'declarations',runtime:false,schema:false};
 return {location:'data',runtime:false,schema:false};
};
const itemContext = context => context.schema ? context : {...context,location:context.location === 'declarations'?'declaration':context.location === 'updates'?'update':context.location};


function jsonTree(text) {
 try { JSON.parse(text); } catch { return null; }
 let cursor = 0;
 const space = () => { while (cursor < text.length && /\s/.test(text[cursor])) cursor++; };
 const readString = () => {
  const start = cursor++;
  const offsets = [];
  while (text[cursor] !== '"') {
   offsets.push(cursor);
   if (text[cursor] === '\\') cursor += text[cursor + 1] === 'u' ? 6 : 2;
   else cursor++;
  }
  offsets.push(cursor);
  cursor++;
  return { start, end: cursor, offsets, value: JSON.parse(text.slice(start, cursor)) };
 };
 const read = () => {
  space();
  const start = cursor;
  if (text[cursor] === '"') return readString();
  if (text[cursor] === '{') {
   cursor++; space();
   const entries = [];
   if (text[cursor] !== '}') for (;;) {
    const key = readString(); space(); cursor++;
    const item = read(); entries.push([key.value,item]); space();
    if (text[cursor] === '}') break;
    cursor++; space();
   }
   cursor++;
   return { start, end: cursor, entries, value: Object.fromEntries(entries.map(([key,item]) => [key,item.value])) };
  }
  if (text[cursor] === '[') {
   cursor++; space();
   const items = [];
   if (text[cursor] !== ']') for (;;) {
    items.push(read()); space();
    if (text[cursor] === ']') break;
    cursor++;
   }
   cursor++;
   return { start, end: cursor, items, value: items.map(item => item.value) };
  }
  while (cursor < text.length && !/[\s,}\]]/.test(text[cursor])) cursor++;
  return { start, end: cursor, value: JSON.parse(text.slice(start,cursor)) };
 };
 return read();
}
function applyEdits(text, edits) {
 for (const edit of [...edits].sort((a,b) => b.start-a.start)) text = text.slice(0,edit.start)+edit.value+text.slice(edit.end);
 return text;
}
function disjoint(edits) {
 const output=[];
 for (const edit of edits.sort((a,b) => a.start-b.start || b.end-a.end)) {
  const previous=output.at(-1);
  if (!previous || edit.start >= previous.end) output.push(edit);
 }
 return output;
}
export function createEvidenceRedactor(secrets=[]) {
 const known=new Set(secrets.filter(value => typeof value === 'string' && value && value !== marker));
 const add=value => { if (typeof value === 'string' && value && value !== marker) known.add(value); };
 const collectLeaves=value => {
  if (typeof value === 'string') add(value);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) collectLeaves(item);
 };
 const envEdits=text => {
  const edits=[];
  for (const match of text.matchAll(/^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*([^\r\n]*)/gm)) {
   if (!sensitiveEnvironment(match[1]) || !match[2]) continue;
   const start=match.index+match[0].length-match[2].length;
   const quoted=/^(['"]).*\1$/.test(match[2]), value=quoted ? match[2].slice(1,-1) : match[2];
   add(value);
   if (value && value !== marker) edits.push({start:start+(quoted?1:0),end:start+match[2].length-(quoted?1:0),value:marker,reason:'environment'});
  }
  return edits;
 };
 const partialJsonEdits=text => {
  const edits=[];
  for (const match of text.matchAll(/"((?:\\.|[^"\\])*)"\s*:\s*"((?:\\.|[^"\\])*)/g)) {
   let key;
   try { key=JSON.parse('"'+match[1]+'"'); } catch { continue; }
   if (!sensitive(key) || !match[2] || match[2] === marker) continue;
   let value;
   try { value=JSON.parse('"'+match[2]+'"'); } catch { value=match[2]; }
   add(value);
   const start=match.index+match[0].length-match[2].length;
   edits.push({start,end:start+match[2].length,value:marker,reason:'incomplete-json'});
  }
  return edits;
 };
 const urlEdits=text => {
  const edits=[];
  for (const match of text.matchAll(/\b[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#\s]+)@/g)) {
   if (match[1] === marker) continue;
   const start=match.index+match[0].length-match[1].length-1;
   add(match[1]);
   const separator=match[1].indexOf(':');
   if (separator !== -1) add(match[1].slice(separator+1));
   edits.push({start,end:start+match[1].length+1,value:'',reason:'url-userinfo'});
  }
  return edits;
 };
 const discoverText=(text,context={location:'root',runtime:false,schema:false}) => {
  let value;
  try { value=JSON.parse(text); }
  catch { if (!context.schema) { envEdits(text); partialJsonEdits(text); urlEdits(text); } return; }
  discover(value,context.location === 'root' ? initialContext(value) : context);
 };
 const discover=(value,context=initialContext(value)) => {
  if (typeof value === 'string') discoverText(value,context);
  else if (Array.isArray(value)) for (const item of value) discover(item,itemContext(context));
  else if (value && typeof value === 'object') {
   context=nodeContext(value,context);
   for (const [key,item] of Object.entries(value)) {
    if (!context.schema && sensitive(key)) collectLeaves(item);
    else discover(item,childContext(value,key,context));
   }
  }
 };
 const textEdits=(text,context={location:'root',runtime:false,schema:false}) => {
  const tree=jsonTree(text);
  const edits=[];
  if (tree) {
   const visit=(node,context) => {
    if (node.entries) {
     context=nodeContext(node.value,context);
     for (const [key,item] of node.entries) {
      if (!context.schema && sensitive(key) && item.value !== marker) edits.push(typeof item.value === 'string' ? {start:item.start+1,end:item.end-1,value:marker,reason:'json-field'} : {start:item.start,end:item.end,value:JSON.stringify(marker),reason:'json-field'});
      else visit(item,childContext(node.value,key,context));
     }
    } else if (node.items) for (const item of node.items) visit(item,itemContext(context));
    else if (typeof node.value === 'string') {
     for (const edit of textEdits(node.value,context)) {
      edits.push({start:node.offsets[edit.start],end:node.offsets[edit.end],value:JSON.stringify(edit.value).slice(1,-1),reason:edit.reason});
     }
    }
   };
   visit(tree,context.location === 'root' ? initialContext(tree.value) : context);
  } else if (!context.schema) edits.push(...envEdits(text),...partialJsonEdits(text),...urlEdits(text));
  for (const value of [...known].sort((a,b) => b.length-a.length)) {
   for (let start=0;(start=text.indexOf(value,start)) !== -1;start+=value.length) edits.push({start,end:start+value.length,value:marker,reason:'known-value'});

  }
  return disjoint(edits);
 };
 const replace=(value,context,path,positions) => {
  if (typeof value === 'string') {
   const edits=textEdits(value,context);
   for (const edit of edits) positions.push({path,start:edit.start,end:edit.end,reason:edit.reason});
   return applyEdits(value,edits);
  }
  if (Array.isArray(value)) return value.map((item,index) => replace(item,itemContext(context),[...path,index],positions));
  if (value && typeof value === 'object') {
   context=nodeContext(value,context);
   return Object.fromEntries(Object.entries(value).map(([key,item]) => {
    const childPath=[...path,key];
    if (!context.schema && sensitive(key) && item !== marker) {
     positions.push({path:childPath,reason:'sensitive-field'});
     return [key,marker];
    }
    return [key,replace(item,childContext(value,key,context),childPath,positions)];
   }));
  }
  return value;
 };
 const redactWithReport=value => {
  discover(value);
  const positions=[];
  const safe=replace(value,initialContext(value),[],positions);
  return {value:safe,report:{marker,replacements:positions.length,positions}};
 };
 return {
  collect:discover,redactWithReport,
  redact:value => redactWithReport(value).value,

 };
}
export function redactEvidence(value,secrets=[]) { return createEvidenceRedactor(secrets).redact(value); }

export function evidenceSecretsFromEnvironment(environment = process.env) {
  return Object.entries(environment)
    .filter(([key, value]) => sensitiveEnvironment(key) && typeof value === 'string' && value)
    .map(([, value]) => value)
}

export function createTraceEvidenceWriter({ directory, secrets = [] }) {
  if (typeof directory !== 'string' || !isAbsolute(directory)) {
    throw new TypeError('Trace evidence directory must be an absolute path')
  }
  const root = resolve(directory)
  const redactor = createEvidenceRedactor(secrets)

  const targetPath = filename => {
    if (typeof filename !== 'string' || !filename || isAbsolute(filename) || filename.includes('\\')) {
      throw new TypeError('Trace evidence filename must be a relative path')
    }
    const path = resolve(root, filename)
    const child = relative(root, path)
    if (!child || child === '..' || child.startsWith('..' + sep)) {
      throw new TypeError('Trace evidence filename must stay within its directory as a relative path')
    }
    return path
  }
  const write = (filename, text) => {
    const path = targetPath(filename)
    const temporary = path + '.' + randomUUID() + '.tmp'
    let descriptor
    let temporaryCreated = false
    try {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
      descriptor = openSync(temporary, 'wx', 0o600)
      temporaryCreated = true
      writeFileSync(descriptor, text, 'utf8')
      fsyncSync(descriptor)
      closeSync(descriptor)
      descriptor = undefined
      renameSync(temporary, path)
    } catch (cause) {
      const error = new Error('TRACE_EVIDENCE_WRITE_FAILED: 请检查采集目录的写入权限与剩余空间：' + path, { cause })
      error.code = 'TRACE_EVIDENCE_WRITE_FAILED'
      throw error
    } finally {
      if (descriptor !== undefined) closeSync(descriptor)
      if (temporaryCreated) {
        try { unlinkSync(temporary) } catch (error) { if (error.code !== 'ENOENT') throw error }
      }
    }
    return path
  }
  const preflight = () => {
    const filename = '.trace-write-probe-' + randomUUID()
    const path = write(filename, '')
    unlinkSync(path)
    return { directory: root, writable: true }
  }
  preflight()
  return {
    directory: root,
    redactor,
    writeJson(filename, value) {
      const result = redactor.redactWithReport(value)
      return { path: write(filename, JSON.stringify(result.value, null, 2) + '\n'), redaction: result.report }
    },

  }
}
