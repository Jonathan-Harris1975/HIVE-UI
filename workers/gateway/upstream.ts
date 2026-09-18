const DEFAULT_BACKEND_TIMEOUT_MS = 10_000
const MIN_BACKEND_TIMEOUT_MS = 1_000
const MAX_BACKEND_TIMEOUT_MS = 30_000
const RETRYABLE_UPSTREAM_STATUSES = new Set([502, 503, 504])

export function validateBackendBaseUrl(raw: string | undefined): URL | null {
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

export function configuredBackends(
  primary: string | undefined,
  fallbacks: string | undefined,
  requestOrigin: string,
): URL[] {
  const rawCandidates = [primary ?? '', ...(fallbacks ?? '').split(',')]
  const seen = new Set<string>()
  const backends: URL[] = []

  for (const rawCandidate of rawCandidates) {
    const candidate = validateBackendBaseUrl(rawCandidate.trim())
    if (!candidate || candidate.origin === requestOrigin || seen.has(candidate.origin)) continue
    seen.add(candidate.origin)
    backends.push(candidate)
  }
  return backends
}

export function backendTimeoutMs(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(parsed)) return DEFAULT_BACKEND_TIMEOUT_MS
  return Math.min(MAX_BACKEND_TIMEOUT_MS, Math.max(MIN_BACKEND_TIMEOUT_MS, parsed))
}

export function isTimeoutError(error: unknown): boolean {
  return (error instanceof DOMException || error instanceof Error) && error.name === 'TimeoutError'
}

export function isRetryableUpstreamStatus(status: number): boolean {
  return RETRYABLE_UPSTREAM_STATUSES.has(status)
}
