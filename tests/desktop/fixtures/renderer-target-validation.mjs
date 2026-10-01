export function assertRendererCdpResponse(response, requestUrl) {
  if (response?.redirected === true) {
    throw sourceMismatch('Renderer CDP endpoint returned a redirected response')
  }
  if (typeof response?.url !== 'string' || response.url !== requestUrl) {
    throw sourceMismatch('Renderer CDP endpoint response URL does not match the requested endpoint URL')
  }
  return response
}

export function validateRendererCdpWebSocketUrl(value, host, port) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new TypeError('Renderer CDP WebSocket URL is invalid')
  }
  if (url.protocol !== 'ws:' || url.hostname !== host || Number(url.port) !== port
    || url.username !== '' || url.password !== '') {
    throw new TypeError(`Renderer CDP WebSocket URL must use ${host}:${port}`)
  }
  return url.href
}

export function validateRendererPageWebSocketTarget(value, target, host, port) {
  const socketUrl = validateRendererCdpWebSocketUrl(value, host, port)
  const url = new URL(socketUrl)
  if (typeof target?.id !== 'string' || target.id.trim() === ''
    || url.pathname !== `/devtools/page/${target.id}`
    || url.search !== '' || url.hash !== '') {
    throw new TypeError('Renderer CDP page WebSocket path must identify its exposed target')
  }
  return socketUrl
}

function sourceMismatch(message) {
  const error = new Error(message)
  error.code = 'RENDERER_CDP_SOURCE_MISMATCH'
  return error
}
