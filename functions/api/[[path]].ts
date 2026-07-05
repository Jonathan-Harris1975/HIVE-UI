import {
  clearSessionCookie,
  createSessionToken,
  parseSessionTtl,
  readCookie,
  secureStringEqual,
  sessionCookie,
  SESSION_COOKIE_NAME,
  verifySessionToken,
  type SessionPayload,
} from '../_lib/security'

interface Env {
  HIVE_API_BASE_URL: string
  HIVE_ADMIN_TOKEN: string
  HIVE_UI_ACCESS_KEY?: string
  HIVE_UI_SESSION_TTL_SECONDS?: string
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

const UI_VERSION = '0.10.11'
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

function getPath(params: Record<string, string | string[] | undefined>): string {
  const rawPath = params.path
  return (Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath ?? '')).replace(/^\/+/, '')
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
    const ttlSeconds = parseSessionTtl(env.HIVE_UI_SESSION_TTL_SECONDS)
    const { token, payload } = await createSessionToken(configuredKey, ttlSeconds)
    return jsonResponse(
      { ok: true, authenticated: true, expires_at: new Date(payload.exp * 1000).toISOString() },
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
      return errorResponse('ui_session_invalid', 'The HIVE UI session is missing or expired.', 401, requestId, {
        'x-hive-auth-state': 'session-invalid',
        'set-cookie': clearSessionCookie(),
      })
    }
    return jsonResponse(
      { ok: true, authenticated: true, expires_at: new Date(session.exp * 1000).toISOString() },
      200,
      requestId,
      { 'x-hive-auth-state': 'authenticated' },
    )
  }

  if (path === 'auth/logout') {
    if (request.method !== 'POST') {
      return errorResponse('method_not_allowed', 'Use POST for UI logout.', 405, requestId, { allow: 'POST' })
    }
    if (!isSameOriginRequest(request)) {
      return errorResponse('cross_origin_denied', 'Cross-origin logout requests are not allowed.', 403, requestId)
    }
    return jsonResponse(
      { ok: true, authenticated: false },
      200,
      requestId,
      { 'set-cookie': clearSessionCookie(), 'x-hive-auth-state': 'signed-out' },
    )
  }

  return errorResponse('auth_route_not_found', 'Unknown HIVE UI authentication route.', 404, requestId)
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

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const requestId = getRequestId(request)
  const path = getPath(params)

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
    return errorResponse('ui_session_invalid', 'The HIVE UI session is missing or expired.', 401, requestId, {
      'x-hive-auth-state': 'session-invalid',
      'set-cookie': clearSessionCookie(),
    })
  }

  const backendBase = validateBackendBaseUrl(env.HIVE_API_BASE_URL)
  const adminToken = env.HIVE_ADMIN_TOKEN?.trim() ?? ''
  if (!backendBase || !adminToken) {
    return errorResponse('proxy_not_configured', 'The HIVE backend proxy is not configured.', 503, requestId)
  }

  const incomingUrl = new URL(request.url)
  const upstreamUrl = new URL(`/${path}`, backendBase.origin)
  upstreamUrl.search = incomingUrl.search

  const init: RequestInit = {
    method: request.method,
    headers: buildUpstreamHeaders(request, adminToken, requestId),
    redirect: 'manual',
    signal: request.signal,
  }
  if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body

  try {
    const upstream = await fetch(upstreamUrl.toString(), init)
    if (upstream.status >= 300 && upstream.status < 400) {
      console.error('HIVE upstream returned an unexpected redirect', {
        request_id: requestId,
        path,
        status: upstream.status,
      })
      return errorResponse('upstream_redirect_denied', 'The HIVE backend returned an unexpected redirect.', 502, requestId)
    }

    const responseHeaders = buildResponseHeaders(upstream.headers, requestId)
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error('HIVE proxy request failed', {
      request_id: requestId,
      path,
      error: error instanceof Error ? error.message : String(error),
    })
    return errorResponse('backend_unreachable', 'The HIVE backend could not be reached.', 502, requestId)
  }
}
