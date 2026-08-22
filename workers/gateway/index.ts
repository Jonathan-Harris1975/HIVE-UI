import {
  clearSessionCookie,
  createCommsHandoffToken,
  createSessionToken,
  parseIdleTimeout,
  parseSessionTtl,
  refreshSessionToken,
  readCookie,
  resolveCommsHandoffSecret,
  resolveSessionSigningSecret,
  secureStringEqual,
  sessionCookie,
  SESSION_COOKIE_NAME,
  verifyCommsHandoffToken,
  verifySessionToken,
  type SessionPayload,
} from './security'
import { HIVE_UI_VERSION } from '../../shared/version'

interface Env {
  ASSETS: Fetcher
  HIVE_UI_BUILD_SHA?: string
  HIVE_UI_BUILD_BRANCH?: string
  HIVE_API_BASE_URL: string
  HIVE_ADMIN_TOKEN: string
  HIVE_UI_ACCESS_KEY?: string
  HIVE_UI_SESSION_SECRET?: string
  LOGIN_RATE_LIMITER: DurableObjectNamespace
  HIVE_UI_SESSION_TTL_SECONDS?: string
  HIVE_UI_IDLE_TIMEOUT_SECONDS?: string
  KOYEB_TOKEN?: string
  KOYEB_SERVICE_ID_HIVE?: string
  KOYEB_SERVICE_ID_AIMS?: string
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

const UI_VERSION = HIVE_UI_VERSION
const LOGIN_WINDOW_MS = 10 * 60 * 1000
const LOGIN_MAX_FAILURES = 5

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

async function loginLimiterRequest(env: Env, request: Request, method: 'GET' | 'POST' | 'DELETE'): Promise<{ blocked: boolean; retryAfter: number }> {
  if (!env.LOGIN_RATE_LIMITER) throw new Error('LOGIN_RATE_LIMITER Durable Object binding is not configured.')
  const key = getClientKey(request)
  const id = env.LOGIN_RATE_LIMITER.idFromName(key)
  const stub = env.LOGIN_RATE_LIMITER.get(id)
  const response = await stub.fetch('https://login-rate-limiter/attempt', { method })
  if (!response.ok) throw new Error('Login rate limiter is unavailable.')
  return await response.json() as { blocked: boolean; retryAfter: number }
}

async function loginRateLimit(env: Env, request: Request): Promise<{ blocked: boolean; retryAfter: number }> {
  return loginLimiterRequest(env, request, 'GET')
}

async function recordLoginFailure(env: Env, request: Request): Promise<{ blocked: boolean; retryAfter: number }> {
  return loginLimiterRequest(env, request, 'POST')
}

async function clearLoginFailures(env: Env, request: Request): Promise<void> {
  await loginLimiterRequest(env, request, 'DELETE')
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

type KoyebServiceState = 'healthy' | 'starting' | 'standby' | 'down' | 'unknown'
type LifecycleService = 'HIVE' | 'AIMS'

function koyebConfig(env: Env, service: LifecycleService): { token: string; serviceId: string } | null {
  const token = env.KOYEB_TOKEN?.trim() ?? ''
  const serviceId = service === 'HIVE'
    ? env.KOYEB_SERVICE_ID_HIVE?.trim() ?? ''
    : env.KOYEB_SERVICE_ID_AIMS?.trim() ?? ''
  return token && serviceId ? { token, serviceId } : null
}

async function getKoyebState(env: Env, service: LifecycleService): Promise<KoyebServiceState> {
  const config = koyebConfig(env, service)
  if (!config) return 'unknown'
  try {
    const response = await fetch(`https://app.koyeb.com/v1/services/${encodeURIComponent(config.serviceId)}`, {
      headers: { authorization: `Bearer ${config.token}`, accept: 'application/json' },
    })
    if (!response.ok) return 'unknown'
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    const servicePayload = payload.service && typeof payload.service === 'object' ? payload.service as Record<string, unknown> : payload
    const raw = String(servicePayload.status ?? servicePayload.state ?? '').trim().toLowerCase()
    if (['healthy', 'running', 'active'].includes(raw)) return 'healthy'
    if (['resuming', 'starting', 'provisioning'].includes(raw)) return 'starting'
    if (['paused', 'pausing', 'stopped'].includes(raw)) return 'standby'
    if (['unhealthy', 'error', 'failed'].includes(raw)) return 'down'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

async function requestKoyebPower(env: Env, service: LifecycleService, action: 'resume' | 'pause', requestId: string): Promise<boolean> {
  const config = koyebConfig(env, service)
  if (!config) {
    console.error(`${service} lifecycle control is not configured`, { request_id: requestId, action })
    return false
  }
  try {
    const response = await fetch(`https://app.koyeb.com/v1/services/${encodeURIComponent(config.serviceId)}/${action}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.token}`, accept: 'application/json' },
    })
    if (!response.ok) {
      console.error(`${service} Koyeb lifecycle request failed`, { request_id: requestId, action, status: response.status })
      return false
    }
    return true
  } catch (error) {
    console.error(`${service} Koyeb lifecycle request failed`, { request_id: requestId, action, error: error instanceof Error ? error.message : String(error) })
    return false
  }
}

async function ensureServiceAwake(env: Env, service: LifecycleService, requestId: string): Promise<{ ok: boolean; owner: boolean; state: KoyebServiceState }> {
  const before = await getKoyebState(env, service)
  if (before === 'healthy' || before === 'starting') return { ok: true, owner: false, state: before }
  const resumed = await requestKoyebPower(env, service, 'resume', requestId)
  if (resumed) return { ok: true, owner: true, state: 'starting' }
  const after = await getKoyebState(env, service)
  if (after === 'healthy' || after === 'starting') return { ok: true, owner: false, state: after }
  return { ok: false, owner: false, state: after === 'unknown' ? before : after }
}

async function releaseServiceIfOwned(
  env: Env,
  service: LifecycleService,
  owned: boolean,
  requestId: string,
): Promise<'paused' | 'not-owned' | 'failed'> {
  if (!owned) return 'not-owned'
  if (await requestKoyebPower(env, service, 'pause', requestId)) return 'paused'
  return await getKoyebState(env, service) === 'standby' ? 'paused' : 'failed'
}

async function releaseSessionServices(env: Env, session: SessionPayload | null, requestId: string): Promise<{ aims: string; hive: string }> {
  const aims = await releaseServiceIfOwned(env, 'AIMS', Boolean(session?.aims_owner), requestId)
  const hive = await releaseServiceIfOwned(env, 'HIVE', Boolean(session?.hive_owner), requestId)
  return { aims, hive }
}

async function handleAuth(request: Request, env: Env, path: string, requestId: string): Promise<Response> {
  const configuredKey = env.HIVE_UI_ACCESS_KEY?.trim() ?? ''
  const sessionSecret = await resolveSessionSigningSecret(env.HIVE_UI_SESSION_SECRET, configuredKey)

  if (path === 'auth/login') {
    if (!configuredKey) {
      return errorResponse('ui_access_not_configured', 'HIVE UI access is not configured.', 503, requestId)
    }
    if (!sessionSecret) {
      return errorResponse('ui_session_secret_not_configured', 'HIVE UI session signing is not configured.', 503, requestId)
    }
    if (request.method !== 'POST') {
      return errorResponse('method_not_allowed', 'Use POST for UI login.', 405, requestId, { allow: 'POST' })
    }
    if (!isSameOriginRequest(request)) {
      return errorResponse('cross_origin_denied', 'Cross-origin login requests are not allowed.', 403, requestId)
    }

    let limit
    try {
      limit = await loginRateLimit(env, request)
    } catch {
      return errorResponse('login_rate_limiter_unavailable', 'Login protection is temporarily unavailable.', 503, requestId)
    }
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
      let failure: { blocked: boolean; retryAfter: number }
      try { failure = await recordLoginFailure(env, request) } catch {
        return errorResponse('login_rate_limiter_unavailable', 'Login protection is temporarily unavailable.', 503, requestId)
      }
      if (failure.blocked) {
        return errorResponse('login_rate_limited', 'Too many failed access attempts. Try again later.', 429, requestId, {
          'retry-after': String(failure.retryAfter),
          'x-hive-auth-state': 'login-failed',
        })
      }
      return errorResponse('invalid_ui_access', 'Invalid HIVE UI access key.', 401, requestId, {
        'x-hive-auth-state': 'login-failed',
      })
    }

    try { await clearLoginFailures(env, request) } catch {
      return errorResponse('login_rate_limiter_unavailable', 'Login protection is temporarily unavailable.', 503, requestId)
    }
    const hiveLifecycle = await ensureServiceAwake(env, 'HIVE', requestId)
    if (!hiveLifecycle.ok) {
      return errorResponse('hive_wake_failed', 'HIVE could not be resumed. Try again shortly.', 503, requestId)
    }
    const aimsLifecycle = await ensureServiceAwake(env, 'AIMS', requestId)
    if (!aimsLifecycle.ok) {
      if (hiveLifecycle.owner) await releaseServiceIfOwned(env, 'HIVE', true, requestId)
      return errorResponse('aims_wake_failed', 'AIMS could not be resumed. Try again shortly.', 503, requestId)
    }
    const ttlSeconds = parseSessionTtl(env.HIVE_UI_SESSION_TTL_SECONDS)
    const idleTimeoutSeconds = parseIdleTimeout(env.HIVE_UI_IDLE_TIMEOUT_SECONDS)
    const { token, payload } = await createSessionToken(
      sessionSecret,
      ttlSeconds,
      idleTimeoutSeconds,
      hiveLifecycle.owner,
      aimsLifecycle.owner,
    )
    return jsonResponse(
      {
        ok: true,
        authenticated: true,
        expires_at: new Date(payload.exp * 1000).toISOString(),
        idle_expires_at: new Date(payload.idle_exp * 1000).toISOString(),
        idle_timeout_seconds: idleTimeoutSeconds,
        hive_state: hiveLifecycle.state,
        aims_state: aimsLifecycle.state,
      },
      200,
      requestId,
      {
        'set-cookie': sessionCookie(token, ttlSeconds),
        'x-hive-auth-state': 'authenticated',
      },
    )
  }

  if (!sessionSecret) {
    return errorResponse('ui_session_secret_not_configured', 'HIVE UI session signing is not configured.', 503, requestId)
  }

  if (path === 'auth/session') {
    if (request.method !== 'GET') {
      return errorResponse('method_not_allowed', 'Use GET to inspect the UI session.', 405, requestId, { allow: 'GET' })
    }
    const session = await readSession(request, sessionSecret)
    if (!session) {
      const signedExpiredSession = await readSessionForLogout(request, sessionSecret)
      if (signedExpiredSession) await releaseSessionServices(env, signedExpiredSession, requestId)
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
    const session = await readSession(request, sessionSecret)
    if (!session) {
      return errorResponse('ui_session_invalid', 'The HIVE UI session is missing or expired.', 401, requestId, {
        'x-hive-auth-state': 'session-invalid',
        'set-cookie': clearSessionCookie(),
      })
    }
    const idleTimeoutSeconds = parseIdleTimeout(env.HIVE_UI_IDLE_TIMEOUT_SECONDS)
    const refreshed = await refreshSessionToken(sessionSecret, session, idleTimeoutSeconds)
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
    const session = await readSessionForLogout(request, sessionSecret)
    const releases = await releaseSessionServices(env, session, requestId)
    return jsonResponse(
      { ok: true, authenticated: false, hive_release: releases.hive, aims_release: releases.aims },
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

  const sessionSecret = await resolveSessionSigningSecret(env.HIVE_UI_SESSION_SECRET, env.HIVE_UI_ACCESS_KEY)
  if (!sessionSecret) return errorResponse('ui_session_secret_not_configured', 'HIVE UI session signing is not configured.', 503, requestId)
  const session = await readSession(request, sessionSecret)
  if (!session) {
    return errorResponse('ui_session_invalid', 'The HIVE UI session is missing or expired.', 401, requestId, {
      'x-hive-auth-state': 'session-invalid',
      'set-cookie': clearSessionCookie(),
    })
  }

  const secret = await resolveCommsHandoffSecret(env.HIVE_COMMS_HANDOFF_SECRET, env.HIVE_UI_ACCESS_KEY)
  if (!secret) return errorResponse('comms_handoff_not_configured', 'Communications Interface handoff is not configured.', 503, requestId)

  const actor = env.HIVE_COMMS_ACTOR?.trim() || 'hive-owner'
  const rawRole = env.HIVE_COMMS_ROLE?.trim().toLowerCase() || 'read_only'
  if (!['admin', 'reviewer', 'operator', 'read_only'].includes(rawRole)) {
    return errorResponse('comms_role_invalid', 'HIVE communications role configuration is invalid.', 503, requestId)
  }
  const role = rawRole as 'admin' | 'reviewer' | 'operator' | 'read_only'
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


async function handleCommsIdentity(request: Request, env: Env, requestId: string): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse('method_not_allowed', 'Use GET to verify a Communications Interface handoff.', 405, requestId, { allow: 'GET' })
  }
  const authorization = request.headers.get('authorization')?.trim() ?? ''
  const token = authorization.replace(/^Bearer\s+/i, '')
  if (!token || token === authorization) {
    return errorResponse('comms_handoff_invalid', 'Communications handoff token is missing or invalid.', 401, requestId)
  }
  const secret = await resolveCommsHandoffSecret(env.HIVE_COMMS_HANDOFF_SECRET, env.HIVE_UI_ACCESS_KEY)
  if (!secret) {
    return errorResponse('comms_handoff_not_configured', 'Communications Interface handoff is not configured.', 503, requestId)
  }
  const identity = await verifyCommsHandoffToken(token, secret)
  if (!identity) {
    return errorResponse('comms_handoff_invalid', 'Communications handoff token is invalid or expired.', 401, requestId)
  }
  return jsonResponse({ ok: true, actor: identity.actor, role: identity.role }, 200, requestId, { 'cache-control': 'no-store' })
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
  if (path === 'auth/comms-identity') return handleCommsIdentity(request, env, requestId)
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

  const sessionSecret = await resolveSessionSigningSecret(env.HIVE_UI_SESSION_SECRET, env.HIVE_UI_ACCESS_KEY)
  if (!sessionSecret) {
    return errorResponse('ui_session_secret_not_configured', 'HIVE UI session signing is not configured.', 503, requestId)
  }
  const session = await readSession(request, sessionSecret)
  if (!session) {
    const signedExpiredSession = await readSessionForLogout(request, sessionSecret)
    if (signedExpiredSession) await releaseSessionServices(env, signedExpiredSession, requestId)
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

function secureAssetResponse(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('cache-control', response.headers.get('cache-control') || 'no-store, max-age=0')
  headers.set('cross-origin-opener-policy', 'same-origin')
  headers.set('cross-origin-resource-policy', 'same-origin')
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()')
  headers.set('referrer-policy', 'no-referrer')
  headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains')
  headers.set('x-content-type-options', 'nosniff')
  headers.set('x-frame-options', 'DENY')
  headers.set('x-robots-tag', 'noindex, nofollow, noarchive, nosnippet')

  const contentType = headers.get('content-type') || ''
  if (contentType.includes('text/html')) {
    headers.set(
      'content-security-policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; frame-src https://chat.jonathan-harris.online; child-src https://chat.jonathan-harris.online; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; manifest-src 'self'; worker-src 'self' blob:; upgrade-insecure-requests",
    )
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

async function serveAssets(request: Request, env: Env): Promise<Response> {
  let response = await env.ASSETS.fetch(request)
  if (response.status === 404 && request.method === 'GET') {
    const url = new URL(request.url)
    const lastSegment = url.pathname.split('/').pop() ?? ''
    if (!lastSegment.includes('.')) {
      url.pathname = '/index.html'
      url.search = ''
      response = await env.ASSETS.fetch(new Request(url.toString(), request))
    }
  }
  return secureAssetResponse(response)
}

export class LoginRateLimiter {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== '/attempt') return new Response('Not found', { status: 404 })
    const now = Date.now()
    let attempt = await this.state.storage.get<LoginAttempt>('attempt')
    if (attempt && attempt.resetAt <= now) {
      await this.state.storage.delete('attempt')
      attempt = undefined
    }

    if (request.method === 'DELETE') {
      await this.state.storage.delete('attempt')
      return Response.json({ blocked: false, retryAfter: 0 })
    }
    if (request.method === 'POST') {
      const next: LoginAttempt = attempt
        ? { failures: attempt.failures + 1, resetAt: attempt.resetAt }
        : { failures: 1, resetAt: now + LOGIN_WINDOW_MS }
      await this.state.storage.put('attempt', next)
      const blocked = next.failures >= LOGIN_MAX_FAILURES
      return Response.json({ blocked, retryAfter: blocked ? Math.max(1, Math.ceil((next.resetAt - now) / 1000)) : 0 })
    }
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
    const blocked = Boolean(attempt && attempt.failures >= LOGIN_MAX_FAILURES)
    return Response.json({ blocked, retryAfter: blocked && attempt ? Math.max(1, Math.ceil((attempt.resetAt - now) / 1000)) : 0 })
  }
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
