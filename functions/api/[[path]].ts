interface Env {
  HIVE_API_BASE_URL: string
  HIVE_ADMIN_TOKEN: string
  HIVE_UI_ACCESS_KEY?: string
}

function textResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, detail: message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const configuredKey = env.HIVE_UI_ACCESS_KEY?.trim()
  const suppliedKey = request.headers.get('X-HIVE-UI-Key')?.trim()

  if (!configuredKey) {
    return textResponse('HIVE UI access key is not configured', 503)
  }
  if (suppliedKey !== configuredKey) {
    return textResponse('Invalid HIVE UI access key', 401)
  }
  if (!env.HIVE_API_BASE_URL || !env.HIVE_ADMIN_TOKEN) {
    return textResponse('HIVE proxy environment is not configured', 503)
  }

  const rawPath = params.path
  const path = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath ?? '')
  const incomingUrl = new URL(request.url)
  const upstreamUrl = new URL(path, `${env.HIVE_API_BASE_URL.replace(/\/$/, '')}/`)
  upstreamUrl.search = incomingUrl.search

  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.delete('cookie')
  headers.delete('x-hive-ui-key')
  headers.set('authorization', `Bearer ${env.HIVE_ADMIN_TOKEN}`)

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  }
  if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body

  const upstream = await fetch(upstreamUrl.toString(), init)
  const responseHeaders = new Headers(upstream.headers)
  responseHeaders.set('cache-control', 'no-store')
  responseHeaders.delete('set-cookie')

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}
