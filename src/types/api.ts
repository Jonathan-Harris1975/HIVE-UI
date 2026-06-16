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
  description?: string | null
  context_length?: number
  max_completion_tokens?: number | null
  prompt_price?: number | string | null
  completion_price?: number | string | null
  image_price?: number | string | null
  request_price?: number | string | null
  architecture?: Record<string, unknown> | null
  input_modalities?: string[]
  output_modalities?: string[]
  supported_parameters?: string[]
  is_free?: boolean
  configured_roles?: string[]
  groups?: string[]
  primary_group?: string
  group_label?: string
  chat_selectable?: boolean
  visible_in_chat_picker?: boolean
  disabled_reason?: string | null
  [key: string]: unknown
}

export interface ModelGroupSummary {
  id: string
  label: string
  count: number
  chat_selectable_count?: number
}

export interface ModelsResponse {
  count: number
  visible_count?: number
  models: ModelSummary[]
  groups?: ModelGroupSummary[]
  policy?: Record<string, unknown>
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
  lane?: string
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
  lane?: string
  bucket?: string
  access_mode?: string
  prefix?: string
  search?: string | null
  prefix_count?: number
  prefixes?: string[]
  files?: FileObject[]
  next_cursor?: string | null
  scanned_count?: number
  truncated?: boolean
  error?: string | { message?: string; hint?: string }
  message?: string
}


export interface FileMetadataResponse {
  ok: boolean
  lane?: string
  access_mode?: string
  metadata?: FileObject
  preview_supported?: boolean
  chat_supported?: boolean
  error?: string | { message?: string; hint?: string }
}

export interface FileReadResponse {
  ok: boolean
  lane?: string
  access_mode?: string
  file?: FileObject
  content?: string
  extraction?: Record<string, unknown>
  error?: string
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

export interface RepoHealthProbe {
  status: 'healthy' | 'degraded' | 'down' | 'not_configured' | string
  configured?: boolean
  http_status?: number | null
  latency_ms?: number | null
  checked_at?: string | null
  detail?: string
  payload?: Record<string, unknown> | null
}

export interface RepoHealthItem {
  repo: string
  label?: string
  category?: 'core_api' | 'frontend' | 'background_api' | 'static_service' | string
  description?: string
  status: 'healthy' | 'degraded' | 'down' | 'not_configured' | string
  detail?: string
  liveness?: RepoHealthProbe | null
  operational?: RepoHealthProbe | null
}

export interface RepoHealthResponse {
  ok: boolean
  overall_status?: string
  generated_at?: string
  cache_seconds?: number
  cached?: boolean
  summary?: {
    total?: number
    healthy?: number
    degraded?: number
    down?: number
    not_configured?: number
  }
  repos?: RepoHealthItem[]
  note?: string
}

export interface WorkflowTemplate {
  label?: string
  description?: string
  recommended_presets?: string[]
  default_repo?: string
  free_tier_safe?: boolean
  [key: string]: unknown
}

export interface WorkflowTemplatesResponse {
  ok: boolean
  count?: number
  templates?: Record<string, WorkflowTemplate>
  note?: string
  error?: string
}

export interface WorkflowNode {
  id: string
  type?: string
  label?: string
  status?: string
  summary?: string
  skill_ids?: string[]
  [key: string]: unknown
}

export interface WorkflowEdge {
  from: string
  to: string
  type?: string
  [key: string]: unknown
}

export interface WorkflowGraphResponse {
  ok: boolean
  graph_id?: string
  template?: string
  task?: string
  repo?: string
  workflow_preset?: string | null
  execution_mode?: string
  can_execute_now?: boolean
  requires_approval?: boolean
  node_count?: number
  edge_count?: number
  nodes?: WorkflowNode[]
  edges?: WorkflowEdge[]
  risk_summary?: Record<string, unknown>
  candidate_skills?: SkillItem[]
  message?: string
  error_code?: string
  [key: string]: unknown
}

export interface ExecutionStepStatus {
  node_id: string
  label?: string
  type?: string
  status?: string
  can_run?: boolean
  blocker?: string | null
  summary?: string
  [key: string]: unknown
}

export interface ExecutionPreviewResponse {
  ok: boolean
  preview_id?: string
  task?: string
  repo?: string
  template?: string
  approval_state?: string
  execution_mode?: string
  can_execute_now?: boolean
  adapter_execution_enabled?: boolean
  step_count?: number
  blocked_count?: number
  step_statuses?: ExecutionStepStatus[]
  workflow_graph?: WorkflowGraphResponse
  next_required_actions?: string[]
  message?: string
  error_code?: string
  [key: string]: unknown
}

export interface RepoHygieneResponse {
  ok: boolean
  file_count?: number
  scanned_file_count?: number
  duplicate_content_group_count?: number
  orphan_candidate_count?: number
  generated_artifact_count?: number
  deletion_manifest?: {
    dry_run?: boolean
    recommended_delete_count?: number
    recommended_delete_paths?: string[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface ExecutionReviewItem {
  plan_id?: string
  id?: string
  title?: string
  status?: string
  task?: string
  repo?: string
  workflow_preset?: string | null
  requested_by?: string
  created_at?: string
  updated_at?: string
  can_execute_now?: boolean
  requires_approval?: boolean
  [key: string]: unknown
}

export interface ExecutionReviewsResponse {
  ok: boolean
  enabled?: boolean
  count?: number
  open_count?: number
  items?: ExecutionReviewItem[]
  error_code?: string
  [key: string]: unknown
}

export interface R2Lane {
  lane: string
  bucket?: string | null
  public_base_url?: string | null
  configured?: boolean
  description?: string
  primary_upload_lane?: boolean
  readable?: boolean
  writable?: boolean
  access_mode?: 'read_write' | 'read_only' | 'registry_only' | 'unavailable' | string
  chat_supported?: boolean
}

export interface R2LanesResponse {
  ok: boolean
  count?: number
  configured_count?: number
  primary_upload_lane?: string
  multi_bucket_read_enabled?: boolean
  read_credentials_configured?: boolean
  lanes?: R2Lane[]
  note?: string
  error?: string
}
