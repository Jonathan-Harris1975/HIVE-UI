import { useState, useEffect, useCallback } from 'react'
import { conversations } from '@/api/hive'
import type { Conversation, ConversationDetail } from '@/types'

export function useConversations() {
  const [list, setList]       = useState<Conversation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await conversations.list(100)
      setList(res.conversations ?? [])
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string }
      setError(err?.detail ?? err?.message ?? 'Failed to load conversations')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { list, loading, error, refresh }
}

export function useConversation(id: string | null) {
  const [data, setData]       = useState<ConversationDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!id) { setData(null); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    conversations.get(id)
      .then(res => { if (!cancelled) setData(res) })
      .catch(e  => { if (!cancelled) setError(String(e?.detail ?? e?.message ?? e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  return { data, loading, error, setData }
}
