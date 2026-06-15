import { useNavigate, useParams } from 'react-router-dom'
import type { Conversation } from '@/types'
import { formatDate, truncate, cx } from '@/utils'
import { Spinner, EmptyState } from '@/components/shared'

interface ConversationSidebarProps {
  conversations: Conversation[]
  loading: boolean
  onNew: () => void
  onRefresh: () => void
}

const MODE_ICONS: Record<string, string> = {
  auto:    '✦',
  brand:   '◈',
  general: '◇',
  code:    '⟨⟩',
  audit:   '⊞',
  file:    '◱',
}

export function ConversationSidebar({
  conversations,
  loading,
  onNew,
  onRefresh,
}: ConversationSidebarProps) {
  const navigate = useNavigate()
  const { conversationId } = useParams<{ conversationId?: string }>()

  return (
    <div className="flex flex-col h-full w-60 bg-hive-surface border-r border-hive-border shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-hive-border shrink-0">
        <span className="hive-section-title">Conversations</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            title="Refresh"
            className="w-6 h-6 rounded text-hive-textDim hover:text-hive-text hover:bg-hive-surfaceHi transition-colors flex items-center justify-center text-xs"
          >
            ↻
          </button>
          <button
            onClick={onNew}
            title="New conversation"
            className="w-6 h-6 rounded bg-hive-accentSoft text-hive-accent hover:bg-hive-accent hover:text-white transition-colors flex items-center justify-center text-xs font-bold"
          >
            +
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading && conversations.length === 0 ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : conversations.length === 0 ? (
          <EmptyState
            icon="◇"
            title="No conversations yet"
            description="Start a new chat"
          />
        ) : (
          conversations.map(convo => (
            <ConvoItem
              key={convo.conversation_id}
              convo={convo}
              active={convo.conversation_id === conversationId}
              onClick={() => navigate(`/chat/${convo.conversation_id}`)}
            />
          ))
        )}
      </div>
    </div>
  )
}

interface ConvoItemProps {
  convo: Conversation
  active: boolean
  onClick: () => void
}

function ConvoItem({ convo, active, onClick }: ConvoItemProps) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'w-full flex flex-col gap-0.5 px-3 py-2.5 text-left transition-colors border-b border-hive-border/30',
        'hover:bg-hive-surfaceHi group',
        active && 'bg-hive-accentSoft border-l-2 border-l-hive-accent pl-2.5',
      )}
    >
      {/* Title row */}
      <div className="flex items-center gap-1.5">
        <span className={cx(
          'text-2xs shrink-0',
          active ? 'text-hive-accent' : 'text-hive-textDim',
        )}>
          {MODE_ICONS[convo.mode] ?? '◇'}
        </span>
        <span className={cx(
          'text-xs font-medium leading-snug truncate',
          active ? 'text-hive-text' : 'text-hive-textSoft group-hover:text-hive-text',
        )}>
          {truncate(convo.title || 'Untitled', 30)}
        </span>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-1.5 pl-4">
        <span className="text-2xs text-hive-textDim">
          {formatDate(convo.updated_at || convo.created_at)}
        </span>
        {convo.message_count > 0 && (
          <>
            <span className="text-hive-textDim text-2xs">·</span>
            <span className="text-2xs text-hive-textDim">
              {convo.message_count} msg{convo.message_count !== 1 ? 's' : ''}
            </span>
          </>
        )}
      </div>
    </button>
  )
}
