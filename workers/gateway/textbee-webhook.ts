interface TextBeeWebhookEnv {
  AIMS_API_BASE_URL?: string
  AIMS_ADMIN_TOKEN?: string
  TEXTBEE_WEBHOOK_SECRET?: string
}

const MAX_WEBHOOK_BYTES = 16_384
const UPSTREAM_TIMEOUT_MS = 10_000
const encoder = new TextEncoder()

function secureBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length)
  let difference = left.length ^ right.length
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return difference === 0
}

function decodeHex(value: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/.test(value)) return null
  const bytes = new Uint8Array(32)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

async function verifyTextBeeSignature(rawBody: Uint8Array, signature: string, secret: string): Promise<boolean> {
  const supplied = decodeHex(signature.trim().toLowerCase())
  if (!supplied) return false
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, toArrayBuffer(rawBody)))
  return secureBytesEqual(supplied, expected)
}

function webhookResponse(status: number, body: Record<string, unknown>, requestId: string): Response {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store, max-age=0',
      'content-type': 'application/json; charset=utf-8',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'x-request-id': requestId,
    },
  })
}

function cleanAimsOrigin(raw: string | undefined): URL | null {
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

async function readBoundedBody(request: Request): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      totalBytes += result.value.byteLength
      if (totalBytes > MAX_WEBHOOK_BYTES) {
        await reader.cancel()
        return null
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export async function handleTextBeeKdpOtpWebhook(request: Request, env: TextBeeWebhookEnv): Promise<Response> {
  const suppliedRequestId = request.headers.get('x-request-id')?.trim() ?? ''
  const requestId = /^[A-Za-z0-9._:-]{8,128}$/.test(suppliedRequestId) ? suppliedRequestId : crypto.randomUUID()

  if (request.method !== 'POST') {
    return webhookResponse(405, { ok: false, code: 'method_not_allowed' }, requestId)
  }
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return webhookResponse(415, { ok: false, code: 'content_type_required' }, requestId)
  }

  const contentLength = Number.parseInt(request.headers.get('content-length') ?? '0', 10)
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
    return webhookResponse(413, { ok: false, code: 'payload_too_large' }, requestId)
  }
  const rawBody = await readBoundedBody(request)
  if (!rawBody) return webhookResponse(413, { ok: false, code: 'payload_too_large' }, requestId)
  if (rawBody.byteLength === 0) return webhookResponse(400, { ok: false, code: 'invalid_payload_size' }, requestId)

  const signingSecret = env.TEXTBEE_WEBHOOK_SECRET?.trim() ?? ''
  if (signingSecret.length < 20) {
    return webhookResponse(503, { ok: false, code: 'textbee_webhook_not_configured' }, requestId)
  }
  const signature = request.headers.get('x-signature') ?? ''
  if (!(await verifyTextBeeSignature(rawBody, signature, signingSecret))) {
    return webhookResponse(401, { ok: false, code: 'invalid_webhook_signature' }, requestId)
  }

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody))
  } catch {
    return webhookResponse(400, { ok: false, code: 'invalid_json' }, requestId)
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return webhookResponse(400, { ok: false, code: 'invalid_json' }, requestId)
  }
  const parsedPayload = payload as Record<string, unknown>
  if (parsedPayload.webhookEvent !== 'MESSAGE_RECEIVED') {
    return webhookResponse(202, { ok: true, accepted: false, reason: 'event_ignored' }, requestId)
  }
  if (
    typeof parsedPayload.idempotencyKey !== 'string'
    || parsedPayload.idempotencyKey.length > 200
    || typeof parsedPayload.message !== 'string'
    || typeof parsedPayload.sender !== 'string'
    || typeof parsedPayload.deviceId !== 'string'
  ) {
    return webhookResponse(400, { ok: false, code: 'invalid_message_event' }, requestId)
  }

  const aimsOrigin = cleanAimsOrigin(env.AIMS_API_BASE_URL)
  const aimsToken = env.AIMS_ADMIN_TOKEN?.trim() ?? ''
  if (!aimsOrigin || !aimsToken) {
    return webhookResponse(503, { ok: false, code: 'aims_kdp_forward_not_configured' }, requestId)
  }

  try {
    const upstream = await fetch(new URL('/kdp/otp/textbee', aimsOrigin), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${aimsToken}`,
        'content-type': 'application/json',
        'x-idempotency-key': parsedPayload.idempotencyKey,
        'x-request-id': requestId,
      },
      body: toArrayBuffer(rawBody),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    if (!upstream.ok) {
      await upstream.body?.cancel()
      return webhookResponse(503, { ok: false, code: 'aims_kdp_forward_failed' }, requestId)
    }
    const result = await upstream.json().catch(() => ({})) as Record<string, unknown>
    return webhookResponse(202, { ok: true, accepted: result.accepted === true }, requestId)
  } catch {
    return webhookResponse(503, { ok: false, code: 'aims_kdp_forward_unavailable' }, requestId)
  }
}

export const __textBeeWebhookTestHooks = { verifyTextBeeSignature, cleanAimsOrigin, readBoundedBody }
