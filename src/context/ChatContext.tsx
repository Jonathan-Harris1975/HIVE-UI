import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { apiFetch } from '../lib/api'
import type {
  ConversationListResponse,
  ConversationResponse,
  ConversationSummary,
  UiMessage,
} from '../types/api'

interface ChatContextValue {
  conversations: ConversationSummary[]
  conversationsLoading: boolean
  currentConversationId: string | null
  messages: UiMessage[]
  conversationLoading: boolean
  setMessages: React.Dispatch<React.SetStateAction<UiMessage[]>>
  setCurrentConversationId: (id: string | null) => void
  refreshConversations: () => Promise<void>
  openConversation: (id: string) => Promise<void>
  newConversation: () => void
  renameConversation: (id: string, title: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  autoTitleConversation: (id: string) => Promise<void>
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [conversationLoading, setConversationLoading] = useState(false)

  const refreshConversations = useCallback(async () => {
    setConversationsLoading(true)
    try {
      const response = await apiFetch<ConversationListResponse>('/v1/chat/conversations?limit=100')
      if (!response.ok) throw new Error(response.error || 'Conversation storage is unavailable.')
      setConversations(response.conversations ?? [])
    } finally {
      setConversationsLoading(false)
    }
  }, [])

  const openConversation = useCallback(async (id: string) => {
    setCurrentConversationId(id)
    setConversationLoading(true)
    try {
      const response = await apiFetch<ConversationResponse>(`/v1/db/conversations/${encodeURIComponent(id)}?limit=200`)
      if (!response.ok) throw new Error(response.error || 'Conversation could not be loaded.')
      setMessages((response.messages ?? []).map((message) => ({ ...message, pending: false, local: false })))
    } finally {
      setConversationLoading(false)
    }
  }, [])

  const newConversation = useCallback(() => {
    setCurrentConversationId(null)
    setMessages([])
  }, [])

  const renameConversation = useCallback(async (id: string, title: string) => {
    const response = await apiFetch<{ ok: boolean; error?: string }>(`/v1/db/conversations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    })
    if (!response.ok) throw new Error(response.error || 'Conversation could not be renamed.')
    await refreshConversations()
  }, [refreshConversations])

  const deleteConversation = useCallback(async (id: string) => {
    const response = await apiFetch<{ ok: boolean; error?: string }>(`/v1/db/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!response.ok) throw new Error(response.error || 'Conversation could not be deleted.')
    if (id === currentConversationId) newConversation()
    await refreshConversations()
  }, [currentConversationId, newConversation, refreshConversations])

  const autoTitleConversation = useCallback(async (id: string) => {
    const response = await apiFetch<{ ok: boolean; error?: string }>(`/v1/chat/conversations/${encodeURIComponent(id)}/auto-title`, { method: 'POST' })
    if (!response.ok) throw new Error(response.error || 'Conversation title could not be generated.')
    await refreshConversations()
  }, [refreshConversations])

  useEffect(() => {
    void refreshConversations().catch(() => undefined)
  }, [refreshConversations])

  const value = useMemo<ChatContextValue>(() => ({
    conversations,
    conversationsLoading,
    currentConversationId,
    messages,
    conversationLoading,
    setMessages,
    setCurrentConversationId,
    refreshConversations,
    openConversation,
    newConversation,
    renameConversation,
    deleteConversation,
    autoTitleConversation,
  }), [
    conversations,
    conversationsLoading,
    currentConversationId,
    messages,
    conversationLoading,
    refreshConversations,
    openConversation,
    newConversation,
    renameConversation,
    deleteConversation,
    autoTitleConversation,
  ])

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat(): ChatContextValue {
  const value = useContext(ChatContext)
  if (!value) throw new Error('useChat must be used inside ChatProvider')
  return value
}
