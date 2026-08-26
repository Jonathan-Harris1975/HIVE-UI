import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import type { RepositoryListResponse, RepositorySummary } from '../types/api'

export function useRepositoryCatalog() {
  const [repositories, setRepositories] = useState<RepositorySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch<RepositoryListResponse>('/v1/repositories')
      setRepositories(response.repositories ?? [])
    } catch (caught) {
      setRepositories([])
      setError(caught instanceof Error ? caught.message : 'Repository catalogue could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { repositories, loading, error, refresh }
}
