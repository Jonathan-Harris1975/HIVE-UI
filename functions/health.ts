interface Env {
  CF_PAGES_COMMIT_SHA?: string
  CF_PAGES_BRANCH?: string
  CF_PAGES_URL?: string
}

const VERSION = '0.10.9'

function responseHeaders(): Headers {
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

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const headers = responseHeaders()
    headers.set('allow', 'GET, HEAD')
    return new Response(JSON.stringify({ ok: false, status: 'method_not_allowed' }), { status: 405, headers })
  }
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers: responseHeaders() })
  return new Response(JSON.stringify({
    ok: true,
    status: 'healthy',
    service: 'HIVE-UI',
    version: VERSION,
    branch: env.CF_PAGES_BRANCH ?? null,
    commit: env.CF_PAGES_COMMIT_SHA?.slice(0, 12) ?? null,
    url: env.CF_PAGES_URL ?? null,
    time: new Date().toISOString(),
  }), { status: 200, headers: responseHeaders() })
}
