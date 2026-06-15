export type ChatRole = 'user' | 'assistant' | 'system'
export type ChatMode = 'auto' | 'brand' | 'general' | 'code' | 'file_analysis' | 'audit'

export interface UsageSummary {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  cost?: number
  [key: string]: unknown
}

export interface ConversationSummary {
  id: string
  mode?: string | null
  model?: string | null
  title?: string | null
  created_at?: string | null
  updated_at?: string | null
  message_count?: number
  cost_usd?: number | string | null
}

export interface PersistedMessage {
  id: string
  role: ChatRole
  content: string
  model?: string | null
  provider?: string | null
  token_total?: number | null
  cost_usd?: number | null
  metadata?: Record<string, unknown> | null
  created_at?: string | null
}

export interface UiMessage extends PersistedMessage {
  pending?: boolean
  error?: string | null
  local?: boolean
  usage?: UsageSummary | null
  sourceCitation?: SourceCitation | null
}

export interface ConversationListResponse {
  ok: boolean
  enabled?: boolean
  count?: number
  conversations?: ConversationSummary[]
  error?: string
}

export interface ConversationResponse {
  ok: boolean
  enabled?: boolean
  conversation?: ConversationSummary
  message_count?: number
  messages?: PersistedMessage[]
  error?: string
}

export interface ModelSummary {
  id: string
  name?: string
  context_length?: number
  prompt_price?: number | string | null
  completion_price?: number | string | null
  architecture?: string | Record<string, unknown> | null
  [key: string]: unknown
}

export interface ModelsResponse {
  count: number
  models: ModelSummary[]
}

export interface ChatRequestPayload {
  message: string
  history?: Array<{ role: ChatRole; content: string }>
  mode: ChatMode
  model?: string | null
  temperature?: number
  max_tokens?: number
  conversation_id?: string | null
  use_persisted_history?: boolean
  db_history_limit?: number
}

export interface StreamEvent {
  event: string
  type?: string
  content?: string
  message?: string
  ok?: boolean
  conversation_id?: string
  model_used?: string
  provider?: string
  usage?: UsageSummary
  db_recorded?: boolean
  db_error?: string | null
  [key: string]: unknown
}

export interface SourceCitation {
  label?: string
  object_key?: string
  public_url?: string | null
}

export interface FileObject {
  key?: string
  object_key?: string
  filename?: string
  original_name?: string
  size?: number
  size_bytes?: number
  last_modified?: string
  content_type?: string
  public_url?: string | null
  storage?: string
  [key: string]: unknown
}

export interface FileListResponse {
  ok: boolean
  count?: number
  storage?: string
  files?: FileObject[]
  error?: string
  message?: string
}

export interface FileChatResponse {
  ok: boolean
  reply?: string
  conversation_id?: string
  model_used?: string
  provider?: string
  usage?: UsageSummary
  source_citation?: SourceCitation
  source_chunks?: Array<Record<string, unknown>>
  retrieval_summary?: Record<string, unknown> | string | null
  db_recorded?: boolean
  db_error?: string | null
  message?: string
  error_code?: string
}

export interface SkillItem {
  id?: string
  name?: string
  title?: string
  description?: string
  repo?: string
  hive_lane?: string
  lane?: string
  risk_level?: string
  priority_tier?: string
  score?: number
  status?: string
  [key: string]: unknown
}

export interface SkillListResponse {
  ok?: boolean
  count?: number
  skills?: SkillItem[]
  items?: SkillItem[]
  results?: SkillItem[]
  error?: string
}

export interface WorkflowPreset {
  id?: string
  name?: string
  label?: string
  description?: string
  [key: string]: unknown
}

export interface HealthResponse {
  ok: boolean
  build?: string
  app?: string
  env?: string
  openrouter_configured?: boolean
  database_configured?: boolean
  database_dialect?: string | null
  r2_configured?: boolean
  vectorize_configured?: boolean
  embeddings_configured?: boolean
  d1_configured?: boolean
  storage_flags?: Record<string, unknown>
  [key: string]: unknown
}
