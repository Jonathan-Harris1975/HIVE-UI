import { useState, useEffect } from 'react'
import { models } from '@/api/hive'
import type { HiveModel } from '@/types'

export function useModels() {
  const [data, setData]     = useState<HiveModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    models.list()
      .then(res => { if (!cancelled) setData(res.models) })
      .catch(e  => { if (!cancelled) setError(String(e?.detail ?? e?.message ?? e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { models: data, loading, error }
}
