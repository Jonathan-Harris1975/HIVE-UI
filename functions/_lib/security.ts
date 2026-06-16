export const SESSION_COOKIE_NAME = '__Host-hive_session'
export const DEFAULT_SESSION_TTL_SECONDS = 43_200
export const MIN_SESSION_TTL_SECONDS = 900
export const MAX_SESSION_TTL_SECONDS = 86_400

export interface SessionPayload {
  v: 1
  iat: number
  exp: number
  sid: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    if (base64UrlEncode(bytes) !== value) return null
    return bytes
  } catch {
    return null
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length)
  let difference = left.length ^ right.length
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return difference === 0
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}

async function hmac(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
}

export async function secureStringEqual(left: string, right: string): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([digest(left), digest(right)])
  return constantTimeEqual(leftDigest, rightDigest)
}

export function parseSessionTtl(raw: string | undefined): number {
  if (!raw) return DEFAULT_SESSION_TTL_SECONDS
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return DEFAULT_SESSION_TTL_SECONDS
  return Math.min(MAX_SESSION_TTL_SECONDS, Math.max(MIN_SESSION_TTL_SECONDS, parsed))
}

export async function createSessionToken(
  secret: string,
  ttlSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ token: string; payload: SessionPayload }> {
  const nonce = crypto.getRandomValues(new Uint8Array(18))
  const payload: SessionPayload = {
    v: 1,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    sid: base64UrlEncode(nonce),
  }
  const payloadPart = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
  const signaturePart = base64UrlEncode(await hmac(secret, payloadPart))
  return { token: `${payloadPart}.${signaturePart}`, payload }
}

export async function verifySessionToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<SessionPayload | null> {
  if (!token || token.length > 2048) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [payloadPart, signaturePart] = parts
  const suppliedSignature = base64UrlDecode(signaturePart)
  if (!suppliedSignature) return null

  const expectedSignature = await hmac(secret, payloadPart)
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) return null

  const payloadBytes = base64UrlDecode(payloadPart)
  if (!payloadBytes) return null

  try {
    const parsed = JSON.parse(decoder.decode(payloadBytes)) as Partial<SessionPayload>
    if (parsed.v !== 1 || typeof parsed.iat !== 'number' || typeof parsed.exp !== 'number' || typeof parsed.sid !== 'string') {
      return null
    }
    if (!Number.isFinite(parsed.iat) || !Number.isFinite(parsed.exp)) return null
    if (parsed.iat > nowSeconds + 60 || parsed.exp <= nowSeconds || parsed.exp - parsed.iat > MAX_SESSION_TTL_SECONDS) return null
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(parsed.sid)) return null
    return parsed as SessionPayload
  } catch {
    return null
  }
}

export function readCookie(request: Request, name: string): string {
  const cookieHeader = request.headers.get('cookie') ?? ''
  for (const entry of cookieHeader.split(';')) {
    const separator = entry.indexOf('=')
    if (separator < 0) continue
    const key = entry.slice(0, separator).trim()
    if (key !== name) continue
    return entry.slice(separator + 1).trim()
  }
  return ''
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
}
