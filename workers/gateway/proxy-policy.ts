/** Browser sessions are not an approval or production execution credential. */
export function isPrivilegedBrowserPath(path: string, method = 'GET'): boolean {
  let decoded: string
  try {
    decoded = decodeURIComponent(path)
  } catch {
    return true
  }
  // Never let an upstream decoder reinterpret an ambiguous path.
  if (decoded.includes('%') || decoded.includes('\\') || decoded.includes('..')) return true
  const segments = decoded.toLowerCase().split('/').filter(Boolean)
  if (segments.some((part) => /^(?:approve|approval|approvals|execute|execution|repair|repairs|deploy|deployment|deployments)$/.test(part))) return true
  // These HIVE endpoints perform a decision or destructive mutation. A
  // shared UI session plus the Worker admin token is not an operator identity.
  if (segments.includes('accept-fix')) return true
  if (segments[0] === 'v1' && segments[1] === 'db' && segments[2] === 'purge-reset'
    && (segments.length === 3 || !['targets', 'preview'].includes(segments[3]) || segments.length > 4)) return true
  if (segments[0] === 'v1' && segments[1] === 'model-registry' && !['GET', 'HEAD'].includes(method.toUpperCase())) return true
  if (segments[0] === 'v1' && segments[1] === 'files' && segments[2] === 'r2' && segments[4] === 'objects'
    && method.toUpperCase() === 'DELETE') return true
  if (segments[0] === 'v1' && segments[1] === 'db' && segments[2] === 'conversations'
    && method.toUpperCase() === 'DELETE') return true
  if (segments[0] === 'v1' && segments[1] === 'execution-reviews' && segments[3] === 'decision') return true
  if (segments[0] === 'v1' && segments[1] === 'system' && segments[2] === 'ops-events' && !['GET', 'HEAD'].includes(method.toUpperCase())) return true
  // The service proxy can forward arbitrary operations to another service.
  return segments[0] === 'v1' && segments[1] === 'services' && segments[3] === 'proxy'
}
