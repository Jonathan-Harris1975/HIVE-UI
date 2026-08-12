import {
  clearSessionCookie,
  createCommsHandoffToken,
  createSessionToken,
  parseIdleTimeout,
  parseSessionTtl,
  refreshSessionToken,
  readCookie,
  secureStringEqual,
  sessionCookie,
  SESSION_COOKIE_NAME,
  verifySessionToken,
  type SessionPayload,
} from './security'

interface Env {
  ASSETS: Fetcher
  HIVE_UI_BUILD_SHA?: string
  HIVE_UI_BUILD_BRANCH?: string
  HIVE_API_BASE_URL: string
  HIVE_ADMIN_TOKEN: string
  HIVE_UI_ACCESS_KEY?: string
  HIVE_UI_SESSION_TTL_SECONDS?: string
  HIVE_UI_IDLE_TIMEOUT_SECONDS?: string
  KOYEB_TOKEN?: string
  KOYEB_SERVICE_ID_HIVE?: string
  HIVE_COMMS_HANDOFF_SECRET?: string
  HIVE_COMMS_ACTOR?: string
  HIVE_COMMS_ROLE?: string
  HIVE_COMMS_URL?: string
}

interface ErrorBody {
  ok: false
  code: string
  detail: string
  request_id: string
}

interface LoginAttempt {
  failures: number
  resetAt: number
}

const UI_VERSION = '0.11.1'
const LOGIN_WINDOW_MS = 10 * 60 * 1000
const LOGIN_MAX_FAILURES = 5
const loginAttempts = new Map<string, LoginAttempt>()

const REQUEST_HEADER_DENYLIST = new Set([
  'accept-encoding',
  'authorization',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'connection',
  'content-length',
  'cookie',
  'host',
  'keep-alive',
  'origin',
  'proxy-authenticate',
  'proxy-authorization',
  'referer',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-proto',
  'x-hive-ui-key',
])

const RESPONSE_HEADER_DENYLIST = new Set([
  'access-control-allow-credentials',
  'access-control-allow-headers',
  'access-control-allow-methods',
  'access-control-allow-origin',
  'access-control-expose-headers',
  'access-control-max-age',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'server',
  'set-cookie',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'via',
  'x-powered-by',
])

function hardenHeaders(headers: Headers, requestId: string): Headers {
  headers.set('cache-control', 'no-store, max-age=0')
  headers.set('cross-origin-opener-policy', 'same-origin')
  headers.set('cross-origin-resource-policy', 'same-origin')
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()')
  headers.set('referrer-policy', 'no-referrer')
  headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains')
  headers.set('x-content-type-options', 'nosniff')
  headers.set('x-frame-options', 'DENY')
  headers.set('x-hive-ui-version', UI_VERSION)
  headers.set('x-request-id', requestId)
  headers.set('x-robots-tag', 'noindex, nofollow, noarchive, nosnippet')
  const vary = headers.get('vary')
  if (!vary) headers.set('vary', 'Cookie')
  else if (!vary.toLowerCase().split(',').map((value) => value.trim()).includes('cookie')) headers.set('vary', `${vary}, Cookie`)
  return headers
}

function jsonResponse(
  body: Record<string, unknown> | ErrorBody,
  status: number,
  requestId: string,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(extraHeaders)
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), {
    status,
    headers: hardenHeaders(headers, requestId),
  })
}

function errorResponse(
  code: string,
  detail: string,
  status: number,
  requestId: string,
  extraHeaders?: HeadersInit,
): Response {
  return jsonResponse({ ok: false, code, detail, request_id: requestId }, status, requestId, extraHeaders)
}

function getRequestId(request: Request): string {
  const supplied = request.headers.get('x-request-id')?.trim() ?? ''
  return /^[A-Za-z0-9._:-]{8,128}$/.test(supplied) ? supplied : crypto.randomUUID()
}

function isSafeProxyPath(path: string): boolean {
  if (!path || path.length > 1024) return false
  if (path.includes('\\') || path.includes('..') || path.includes('//') || path.includes('://')) return false
  if (/%(?:2f|5c|2e)/i.test(path)) return false
  return path === 'health' || path === 'livez' || path === 'readyz' || path.startsWith('v1/')
}

function validateBackendBaseUrl(raw: string | undefined): URL | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null
    if (url.pathname !== '/' && url.pathname !== '') return null
    return url
  } catch {
    return null
  }
}

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return false
  const fetchSite = request.headers.get('sec-fetch-site')
  return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'none'
}

function getClientKey(request: Request): string {
  const ip = request.headers.get('cf-connecting-ip')?.trim()
  if (ip) return ip
  const userAgent = request.headers.get('user-agent')?.slice(0, 120) ?? 'unknown'
  return `unknown:${userAgent}`
}

function pruneLoginAttempts(now: number): void {
  if (loginAttempts.size < 128) return
  for (const [key, value] of loginAttempts.entries()) {
    if (value.resetAt <= now) loginAttempts.delete(key)
  }
  while (loginAttempts.size >= 1024) {
    const oldest = loginAttempts.keys().next().value as string | undefined
    if (!oldest) break
    loginAttempts.delete(oldest)
  }
}

function loginRateLimit(request: Request, now: number): { blocked: boolean; retryAfter: number; key: string } {
  pruneLoginAttempts(now)
  const key = getClientKey(request)
  const current = loginAttempts.get(key)
  if (!current || current.resetAt <= now) return { blocked: false, retryAfter: 0, key }
  if (current.failures < LOGIN_MAX_FAILURES) return { blocked: false, retryAfter: 0, key }
  return { blocked: true, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)), key }
}

function recordLoginFailure(key: string, now: number): void {
  const current = loginAttempts.get(key)
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { failures: 1, resetAt: now + LOGIN_WINDOW_MS })
    return
  }
  current.failures += 1
  loginAttempts.set(key, current)
}

async function readLoginKey(request: Request): Promise<string | null> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) return null
  const contentLength = Number.parseInt(request.headers.get('content-length') ?? '0', 10)
  if (Number.isFinite(contentLength) && contentLength > 4096) return null

  const text = await request.text()
  if (text.length > 4096) return null
  try {
    const parsed = JSON.parse(text) as { access_key?: unknown }
    return typeof parsed.access_key === 'string' ? parsed.access_key.trim() : null
  } catch {
    return null
  }
}

async function readSession(request: Request, secret: string): Promise<SessionPayload | null> {
  const token = readCookie(request, SESSION_COOKIE_NAME)
  return verifySessionToken(token, secret)
}

async function readSessionForLogout(request: Request, secret: string): Promise<SessionPayload | null> {
  const token = readCookie(request, SESSION_COOKIE_NAME)
  return verifySessionToken(token, secret, Math.floor(Date.now() / 1000), true)
}

type HiveKoyebState = 'healthy' | 'starting' | 'standby' | 'down' | 'unknown'

function koyebConfig(env: Env): { token: string; serviceId: string } | null {
  const token = env.KOYEB_TOKEN?.trim() ?? ''
  const serviceId = env.KOYEB_SERVICE_ID_HIVE?.trim() ?? ''
  return token && serviceId ? { token, serviceId } : null
}

async function getHiveKoyebState(env: Env): Promise<HiveKoyebState> {
  const config = koyebConfig(env)
  if (!config) return 'unknown'
  try {
    const response = await fetch(`https://app.koyeb.com/v1/services/${encodeURIComponent(config.serviceId)}`, {
      headers: { authorization: `Bearer ${config.token}`, accept: 'application/json' },
    })
    if (!response.ok) return 'unknown'
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    const service = payload.service && typeof payload.service === 'object' ? payload.service as Record<string, unknown> : payload
    const raw = String(service.status ?? service.state ?? '').trim().toLowerCase()
    if (['healthy', 'running', 'active'].includes(raw)) return 'healthy'
    if (['resuming', 'starting', 'provisioning'].includes(raw)) return 'starting'
    if (['paused', 'pausing', 'stopped'].includes(raw)) return 'standby'
    if (['unhealthy', 'error', 'failed'].includes(raw)) return 'down'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

async function requestHivePower(env: Env, action: 'resume' | 'pause', requestId: string): Promise<boolean> {
  const config = koyebConfig(env)
  if (!config) {
    console.error('HIVE lifecycle control is not configured', { request_id: requestId, action })
    return false
  }
  try {
    const response = await fetch(`https://app.koyeb.com/v1/services/${encodeURIComponent(config.serviceId)}/${action}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.token}`, accept: 'application/json' },
    })
    if (!response.ok) {
      console.error('HIVE Koyeb lifecycle request failed', { request_id: requestId, action, status: response.status })
      return false
    }
    return true
  } catch (error) {
    console.error('HIVE Koyeb lifecycle request failed', { request_id: requestId, action, error: error instanceof Error ? error.message : String(error) })
    return false
  }
}

async function ensureHiveAwake(env: Env, requestId: string): Promise<{ ok: boolean; owner: boolean; state: HiveKoyebState }> {
  const before = await getHiveKoyebState(env)
  if (before === 'healthy' || before === 'starting') return { ok: true, owner: false, state: before }
  const resumed = await requestHivePower(env, 'resume', requestId)
  if (resumed) return { ok: true, owner: true, state: 'starting' }
  const after = await getHiveKoyebState(env)
  if (after === 'healthy' || after === 'starting') return { ok: true, owner: false, state: after }
  return { ok: false, owner: false, state: after === 'unknown' ? before : after }
}

async function releaseHiveIfOwned(env: Env, session: SessionPayload | null, requestId: string): Promise<'paused' | 'not-owned' | 'failed'> {
  if (!session?.hive_owner) return 'not-owned'
  if (await requestHivePower(env, 'pause', requestId)) return 'paused'
  return await getHiveKoyebState(env) === 'standby' ? 'paused' : 'failed'
}

async function handleAuth(request: Request, env: Env, path: string, requestId: string): Promise<Response> {
  const configuredKey = env.HIVE_UI_ACCESS_KEY?.trim() ?? ''
  if (!configuredKey) {
    return errorResponse('ui_access_not_configured', 'HIVE UI access is not configured.', 503, requestId)
  }

  if (path === 'auth/login') {
    if (request.method !== 'POST') {
      return errorResponse('method_not_allowed', 'Use POST for UI login.', 405, requestId, { allow: 'POST' })
    }
    if (!isSameOriginRequest(request)) {
      return errorResponse('cross_origin_denied', 'Cross-origin login requests are not allowed.', 403, requestId)
    }

    const now = Date.now()
    const limit = loginRateLimit(request, now)
    if (limit.blocked) {
      return errorResponse(
        'login_rate_limited',
        'Too many failed access attempts. Try again later.',
        429,
        requestId,
        { 'retry-after': String(limit.retryAfter) },
      )
    }

    const suppliedKey = await readLoginKey(request)
    const valid = suppliedKey !== null && await secureStringEqual(suppliedKey, configuredKey)
    if (!valid) {
      recordLoginFailure(limit.key, now)
      return errorResponse('invalid_ui_access', 'Invalid HIVE UI access key.', 401, requestId, {
        'x-hive-auth-state': 'login-failed',
      })
    }

    loginAttempts.delete(limit.key)
    const lifecycle = await ensureHiveAwake(env, requestId)
    if (!lifecycle.ok) {
      return errorResponse('hive_wake_failed', 'HIVE could not be resumed. Try again shortly.', 503, requestId)
    }
    const ttlSeconds = parseSessionTtl(env.HIVE_UI_SESSION_TTL_SECONDS)
    const idleTimeoutSeconds = parseIdleTimeout(env.HIVE_UI_IDLE_TIMEOUT_SECONDS)
    const { token, payload } = await createSessionToken(configuredKey, ttlSeconds, idleTimeoutSeconds, lifecycle.owner)
    return jsonResponse(
      {
        ok: true,
        authenticated: true,
        expires_at: new Date(payload.exp * 1000).toISOString(),
        idle_expires_at: new Date(payload.idle_exp * 1000).toISOString(),
        idle_timeout_seconds: idleTimeoutSeconds,
        hive_state: lifecycle.state,
      },
      200,
      requestId,
      {
        'set-cookie': sessionCookie(token, ttlSeconds),
        'x-hive-auth-state': 'authenticated',
      },
    )
  }

  if (path === 'auth/session') {
    if (request.method !== 'GET') {
      return errorResponse('method_not_allowed', 'Use GET to inspect the UI session.', 405, requestId, { allow: 'GET' })
    }
    const session = await readSession(request, configuredKey)
    if (!session) {
      const signedExpiredSession = await readSessionForLogout(request, configuredKey)
      if (signedExpiredSession) await releaseHiveIfOwned(env, signedExpiredSession, requestId)
      return errorResponse('ui_session_invalid', 'The HIVE UI session is missing or expired.', 401, requestId, {
        'x-hive-auth-state': 'session-invalid',
        'set-cookie': clearSessionCookie(),
      })
    }
    const idleTimeoutSeconds = parseIdleTimeout(env.HIVE_UI_IDLE_TIMEOUT_SECONDS)
    return jsonResponse(
      {
        ok: true,
        authenticated: true,
        expires_at: new Date(session.exp * 1000).toISOString(),
        idle_expires_at: new Date(session.idle_exp * 1000).toISOString(),
        idle_timeout_seconds: idleTimeoutSeconds,
      },
      200,
      requestId,
      { 'x-hive-auth-state': 'authenticated' },
    )
  }

  if (path === 'auth/activity') {
    if (request.method !== 'POST') {
      return errorResponse('method_not_allowed', 'Use POST to record UI activity.', 405, requestId, { allow: 'POST' })
    }
    if (!isSameOriginRequest(request)) {
      return errorResponse('cross_origin_denied', 'Cross-origin activity requests are not allowed.', 403, requestId)
    }
    const session = await readSession(request, configuredKey)
    if (!session) {
      return errorResponse('ui_session_invalid', 'The HIVE UI session is missing or expired.', 401, requestId, {
        'x-hive-auth-state': 'session-invalid',
        'set-cookie': clearSessionCookie(),
      })
    }
    const idleTimeoutSeconds = parseIdleTimeout(env.HIVE_UI_IDLE_TIMEOUT_SECONDS)
    const refreshed = await refreshSessionToken(configuredKey, session, idleTimeoutSeconds)
    const maxAge = Math.max(1, refreshed.payload.exp - Math.floor(Date.now() / 1000))
    return jsonResponse(
      {
        ok: true,
        authenticated: true,
        expires_at: new Date(refreshed.payload.exp * 1000).toISOString(),
        idle_expires_at: new Date(refreshed.payload.idle_exp * 1000).toISOString(),
        idle_timeout_seconds: idleTimeoutSeconds,
      },
      200,
      requestId,
      { 'set-cookie': sessionCookie(refreshed.token, maxAge), 'x-hive-auth-state': 'authenticated' },
    )
  }

  if (path === 'auth/logout') {
    if (request.method !== 'POST') {
      return errorResponse('method_not_allowed', 'Use POST for UI logout.', 405, requestId, { allow: 'POST' })
    }
    if (!isSameOriginRequest(request)) {
      return errorResponse('cross_origin_denied', 'Cross-origin logout requests are not allowed.', 403, requestId)
    }
    const session = await readSessionForLogout(request, configuredKey)
    const hiveRelease = await releaseHiveIfOwned(env, session, requestId)
    return jsonResponse(
      { ok: true, authenticated: false, hive_release: hiveRelease },
      200,
      requestId,
      { 'set-cookie': clearSessionCookie(), 'x-hive-auth-state': 'signed-out' },
    )
  }

  return errorResponse('auth_route_not_found', 'Unknown HIVE UI authentication route.', 404, requestId)
}


async function handleCommsHandoff(request: Request, env: Env, requestId: string): Promise<Response> {
  if (request.method !== 'GET') return errorResponse('method_not_allowed', 'Use GET to open the Communications Interface.', 405, requestId, { allow: 'GET' })
  if (!isSameOriginRequest(request)) return errorResponse('cross_origin_denied', 'Cross-origin handoff requests are not allowed.', 403, requestId)

  const configuredKey = env.HIVE_UI_ACCESS_KEY?.trim() ?? ''
  const session = configuredKey ? await readSession(request, configuredKey) : null
  if (!session) {
    return errorResponse('ui_session_invalid', 'The HIVE UI session is missing or expired.', 401, requestId, {
      'x-hive-auth-state': 'session-invalid',
      'set-cookie': clearSessionCookie(),
    })
  }

  const secret = env.HIVE_COMMS_HANDOFF_SECRET?.trim() ?? ''
  if (!secret) return errorResponse('comms_handoff_not_configured', 'Communications Interface handoff is not configured.', 503, requestId)

  const actor = env.HIVE_COMMS_ACTOR?.trim() || 'hive-owner'
  const rawRole = env.HIVE_COMMS_ROLE?.trim().toLowerCase() || 'admin'
  const role = (['admin', 'reviewer', 'operator', 'read_only'].includes(rawRole) ? rawRole : 'admin') as 'admin' | 'reviewer' | 'operator' | 'read_only'
  const token = await createCommsHandoffToken(secret, actor, role)
  let communicationsUrl: URL
  try {
    communicationsUrl = new URL(env.HIVE_COMMS_URL?.trim() || 'https://chat.jonathan-harris.online/console/')
  } catch {
    return errorResponse('comms_handoff_url_invalid', 'Communications Interface URL is invalid.', 503, requestId)
  }
  if (communicationsUrl.protocol !== 'https:' || communicationsUrl.username || communicationsUrl.password) {
    return errorResponse('comms_handoff_url_invalid', 'Communications Interface URL must be an HTTPS origin.', 503, requestId)
  }
  if (communicationsUrl.pathname === '/' || communicationsUrl.pathname === '') communicationsUrl.pathname = '/console/'
  else if (!communicationsUrl.pathname.endsWith('/')) communicationsUrl.pathname += '/'
  const handoffRequestUrl = new URL(request.url)
  const embedded = handoffRequestUrl.searchParams.get('embed') === '1'
  communicationsUrl.search = embedded ? '?embed=1' : ''
  communicationsUrl.hash = `handoff=${encodeURIComponent(token)}`
  const location = communicationsUrl.toString()
  if (handoffRequestUrl.searchParams.get('format') === 'json') {
    return jsonResponse({ ok: true, url: location }, 200, requestId, { 'cache-control': 'no-store' })
  }

  return new Response(null, {
    status: 302,
    headers: {
      location,
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-request-id': requestId,
    },
  })
}


function buildUpstreamHeaders(request: Request, adminToken: string, requestId: string): Headers {
  const headers = new Headers()
  for (const [name, value] of request.headers.entries()) {
    const lowerName = name.toLowerCase()
    if (REQUEST_HEADER_DENYLIST.has(lowerName) || lowerName.startsWith('cf-') || lowerName.startsWith('x-forwarded-')) continue
    headers.append(name, value)
  }
  headers.set('authorization', `Bearer ${adminToken}`)
  headers.set('x-request-id', requestId)
  headers.set('x-hive-ui-version', UI_VERSION)
  return headers
}

function buildResponseHeaders(upstreamHeaders: Headers, requestId: string): Headers {
  const headers = new Headers()
  for (const [name, value] of upstreamHeaders.entries()) {
    const lowerName = name.toLowerCase()
    if (RESPONSE_HEADER_DENYLIST.has(lowerName) || lowerName.startsWith('cf-') || lowerName.startsWith('x-envoy-')) continue
    headers.append(name, value)
  }
  return hardenHeaders(headers, requestId)
}

async function handleApi(request: Request, env: Env, path: string): Promise<Response> {
  const requestId = getRequestId(request)

  if (path === 'auth/comms-handoff') return handleCommsHandoff(request, env, requestId)
  if (path.startsWith('auth/')) return handleAuth(request, env, path, requestId)

  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    return errorResponse('method_not_allowed', 'This HTTP method is not supported by the HIVE proxy.', 405, requestId)
  }
  if (!isSafeProxyPath(path)) {
    return errorResponse('proxy_path_denied', 'This API path is not available through HIVE-UI.', 404, requestId)
  }
  if (!isSameOriginRequest(request)) {
    return errorResponse('cross_origin_denied', 'Cross-origin API requests are not allowed.', 403, requestId)
  }

  const configuredKey = env.HIVE_UI_ACCESS_KEY?.trim() ?? ''
  if (!configuredKey) {
    return errorResponse('ui_access_not_configured', 'HIVE UI access is not configured.', 503, requestId)
  }
  const session = await readSession(request, configuredKey)
  if (!session) {
    const signedExpiredSession = await readSessionForLogout(request, configuredKey)
    if (signedExpiredSession) await releaseHiveIfOwned(env, signedExpiredSession, requestId)
    return errorResponse('ui_session_invalid', 'The HIVE UI session is missing or expired.', 401, requestId, {
      'x-hive-auth-state': 'session-invalid',
      'set-cookie': clearSessionCookie(),
    })
  }


  const configuredBackend = validateBackendBaseUrl(env.HIVE_API_BASE_URL)
  const adminToken = env.HIVE_ADMIN_TOKEN?.trim() ?? ''
  if (!adminToken) {
    return errorResponse('proxy_not_configured', 'The HIVE backend admin token is not configured.', 503, requestId)
  }

  const requestOrigin = new URL(request.url).origin
  if (!configuredBackend || configuredBackend.origin === requestOrigin) {
    return errorResponse('proxy_not_configured', 'No valid HIVE backend origin is configured.', 503, requestId)
  }

  const incomingUrl = new URL(request.url)
  const upstreamUrl = new URL(`/${path}`, configuredBackend.origin)
  upstreamUrl.search = incomingUrl.search
  const requestBody = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer()
  const init: RequestInit = {
    method: request.method,
    headers: buildUpstreamHeaders(request, adminToken, requestId),
    redirect: 'manual',
    signal: request.signal,
    ...(requestBody !== undefined ? { body: requestBody } : {}),
  }

  try {
    const upstream = await fetch(upstreamUrl.toString(), init)
    if (upstream.status >= 300 && upstream.status < 400) {
      console.error('HIVE upstream returned an unexpected redirect', { request_id: requestId, path, status: upstream.status, backend: configuredBackend.host })
      return errorResponse('upstream_redirect_denied', 'The HIVE backend returned an unexpected redirect.', 502, requestId)
    }

    const responseHeaders = buildResponseHeaders(upstream.headers, requestId)
    responseHeaders.set('x-hive-backend-origin', configuredBackend.host)
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders })
  } catch (error) {
    console.error('HIVE proxy request failed', { request_id: requestId, path, backend: configuredBackend.host, error: error instanceof Error ? error.message : String(error) })
    return errorResponse('backend_unreachable', 'The HIVE backend could not be reached.', 502, requestId)
  }

}


function healthHeaders(): Headers {
  return new Headers({
    'cache-control': 'no-store, max-age=0',
    'content-type': 'application/json; charset=utf-8',
    'cross-origin-resource-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'referrer-policy': 'no-referrer',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'x-robots-tag': 'noindex, nofollow, noarchive',
  })
}

function handleHealth(request: Request, env: Env): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const headers = healthHeaders()
    headers.set('allow', 'GET, HEAD')
    return new Response(JSON.stringify({ ok: false, status: 'method_not_allowed' }), { status: 405, headers })
  }
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers: healthHeaders() })
  return new Response(JSON.stringify({
    ok: true,
    status: 'healthy',
    service: 'HIVE-UI',
    version: UI_VERSION,
    branch: env.HIVE_UI_BUILD_BRANCH ?? null,
    commit: env.HIVE_UI_BUILD_SHA?.slice(0, 12) ?? null,
    time: new Date().toISOString(),
  }), { status: 200, headers: healthHeaders() })
}

async function serveAssets(request: Request, env: Env): Promise<Response> {
  const response = await env.ASSETS.fetch(request)
  if (response.status !== 404 || request.method !== 'GET') return response

  const url = new URL(request.url)
  const lastSegment = url.pathname.split('/').pop() ?? ''
  if (lastSegment.includes('.')) return response

  url.pathname = '/index.html'
  url.search = ''
  return env.ASSETS.fetch(new Request(url.toString(), request))
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/health') return handleHealth(request, env)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const path = url.pathname.replace(/^\/api\/?/, '')
      return handleApi(request, env, path)
    }
    return serveAssets(request, env)
  },
} satisfies ExportedHandler<Env>
