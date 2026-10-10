/** Browser sessions are not an approval or production execution credential. */
export function isPrivilegedBrowserPath(path: string): boolean {
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
  if (segments[0] === 'v1' && segments[1] === 'execution-reviews' && segments[3] === 'decision') return true
  // The service proxy can forward arbitrary operations to another service.
  return segments[0] === 'v1' && segments[1] === 'services' && segments[3] === 'proxy'
}
