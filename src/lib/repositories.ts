export const GOVERNED_REPOSITORIES: readonly string[] = [
  'HIVE',
  'HIVE-UI',
  'AIMS',
  'AIMS-UI',
  'RAMS',
  'MAST',
  'IRS',
  'Website',
]

export const MEMORY_REPOSITORIES: readonly string[] = [...GOVERNED_REPOSITORIES, 'Shared']

export function healthyServiceCount(repositories: readonly { status: string }[]): number {
  return repositories.filter((repo) => repo.status === 'healthy').length
}

export function healthEvidenceFresh(generatedAt?: string, now = Date.now()): boolean {
  const observed = Date.parse(generatedAt || '')
  return Number.isFinite(observed) && observed <= now + 60_000 && now - observed <= 120_000
}

export function serviceAttentionRank(status?: string): number {
  if (['down', 'failed', 'error', 'critical'].includes(status || '')) return 0
  if (['degraded', 'warning', 'blocked'].includes(status || '')) return 1
  if (!status || ['unknown', 'not_configured', 'unavailable'].includes(status)) return 2
  if (status === 'healthy') return 4
  return 3
}
