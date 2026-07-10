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
  auto_titled?: boolean | null
  created_at?: string | null
  updated_at?: string | null
  message_count?: number
  cost_usd?: number | string | null
  total_tokens?: number | null
  token_total?: number | null
  total_cost_usd?: number | string | null
}

export interface AutoTitleRequest {
  force?: boolean
}

export interface AutoTitleResponse {
  ok: boolean
  conversation_id?: string
  title?: string | null
  auto_titled?: boolean
  skipped?: boolean
  error?: string
}

export interface PersistedMessage {
  id: string
  role: ChatRole
  content: string
  model?: string | null
  provider?: string | null
  token_total?: number | null
  cost_usd?: number | null
  streaming_model?: string | null
  streaming_count?: number
  streaming_status?: string | null
  metadata?: Record<string, unknown> | null
  created_at?: string | null
}

export interface UiMessage extends PersistedMessage {
  pending?: boolean
  error?: string | null
  warning?: string | null
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
  skill_id?: string | null
  skill_title?: string | null
  conversation_id?: string | null
  use_persisted_history?: boolean
  db_history_limit?: number
  use_skills?: boolean
  skill_repo?: string | null
  skill_lane?: string | null
  skill_risk_ceiling?: 'low' | 'medium' | 'high' | null
  skill_limit?: number | null
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
  finish_reason?: string | null
  completion_truncated?: boolean
  partial_response?: boolean
  [key: string]: unknown
}


export interface FileSourceSelection {
  lane: string
  object_key: string
  name?: string | null
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
  recursive?: boolean
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

export interface FileDeleteResponse {
  ok: boolean
  dry_run?: boolean
  lane?: string
  bucket?: string
  requested_count?: number
  deleted_count?: number
  deleted_keys?: string[]
  object_keys?: string[]
  errors?: Array<{ key?: string; code?: string; message?: string }>
  error?: string | { message?: string; hint?: string }
  message?: string
}

export interface FileChatResponse {
  ok: boolean
  reply?: string
  conversation_id?: string
  model_used?: string
  provider?: string
  usage?: UsageSummary
  source?: FileObject
  sources?: FileObject[]
  source_citation?: SourceCitation
  source_citations?: SourceCitation[]
  source_chunks?: Array<Record<string, unknown>>
  retrieval_summary?: Record<string, unknown> | string | null
  selected_skill?: Record<string, unknown> | null
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

export interface SkillCleanupCandidate {
  id?: string
  title?: string
  source_id?: string
  object_key?: string
  source_lane?: string
  hive_lane?: string
  created_at?: string
  reasons?: string[]
}

export interface SkillCleanupResponse {
  ok?: boolean
  enabled?: boolean
  dry_run?: boolean
  checked_count?: number
  candidate_count?: number
  deleted_count?: number
  candidates?: SkillCleanupCandidate[]
  deleted_ids?: string[]
  error_code?: string
  message?: string
  scope?: string
  r2_deletes_attempted?: number
  delete_result?: Record<string, unknown>
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
  category?: 'core_api' | 'frontend' | 'background_api' | 'background_worker' | 'static_service' | string
  description?: string
  status: 'healthy' | 'degraded' | 'down' | 'not_configured' | 'standby' | 'starting' | 'busy' | 'maintenance' | string
  detail?: string
  liveness?: RepoHealthProbe | null
  operational?: RepoHealthProbe | null
  readiness?: RepoHealthProbe | null
}


export interface OpsEventItem {
  event_id: string
  source?: string
  service?: string
  environment?: string
  severity?: 'info' | 'warning' | 'critical' | string
  event_type?: string
  title?: string
  summary?: string
  status?: string
  release_id?: string | null
  occurred_at?: string | null
  received_at?: string | null
  url?: string | null
  details?: Record<string, unknown> | null
}

export interface OpsEventsResponse {
  ok: boolean
  enabled?: boolean
  persistent_store?: boolean
  persistent_store_error?: string | null
  count?: number
  items?: OpsEventItem[]
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
    standby?: number
    starting?: number
  }
  repos?: RepoHealthItem[]
  note?: string
  error?: string
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
  multi_bucket_write_enabled?: boolean
  read_credentials_configured?: boolean
  lanes?: R2Lane[]
  note?: string
  error?: string
}

export const REPOSITORY_MEMORY_SCALAR_FIELDS = [
  'project_dna',
  'architecture_summary',
  'coding_standards',
  'build_profile',
  'deployment_profile',
  'environment_schema',
] as const

export const REPOSITORY_MEMORY_HISTORY_FIELDS = [
  'known_issues',
  'learned_patterns',
  'previous_patches',
  'optimisation_history',
  'qa_history',
  'repository_council_history',
] as const

export type RepositoryMemoryScalarField = (typeof REPOSITORY_MEMORY_SCALAR_FIELDS)[number]
export type RepositoryMemoryHistoryField = (typeof REPOSITORY_MEMORY_HISTORY_FIELDS)[number]
export type RepositoryMemoryFieldName = RepositoryMemoryScalarField | RepositoryMemoryHistoryField

export interface RepositoryMemoryResponse {
  repository_id: string
  fields: {
    scalar: readonly string[]
    history: readonly string[]
  }
  memory: Record<string, unknown>
}

export interface RepositoryMemoryFieldResponse {
  repository_id: string
  field_name: string
  content: unknown
  updated_at?: string | null
}

export interface RepositoryMemorySearchItem {
  id?: string
  source_type?: string
  source_id?: string
  title?: string
  metadata?: Record<string, unknown>
  updated_at?: string
  [key: string]: unknown
}

export interface RepositoryMemorySearchResponse {
  ok?: boolean
  count?: number
  items?: RepositoryMemorySearchItem[]
  error?: string
}

export interface AiSearchDiagnosticsResponse {
  ok?: boolean
  configured?: boolean
  status?: string
  index?: string
  error?: string
  [key: string]: unknown
}

export const MODEL_REGISTRY_CATEGORIES = [
  'coding',
  'reasoning',
  'planning',
  'vision',
  'research',
  'fast',
  'cheap',
  'creative',
  'long_context',
] as const

export type ModelRegistryCategory = (typeof MODEL_REGISTRY_CATEGORIES)[number]

export const MODEL_REGISTRY_CONFIDENCE_LEVELS = ['measured', 'heuristic', 'unverified'] as const

export type ModelRegistryConfidence = (typeof MODEL_REGISTRY_CONFIDENCE_LEVELS)[number]

export interface ModelRegistryEntry {
  model_id: string
  score: number
  provider: string | null
  notes: string | null
  registered_at: number
  benchmark_score: number | null
  confidence: ModelRegistryConfidence
  latency_ms: number | null
  cost_per_1k_tokens: number | null
}

export interface ModelRegistryCategoriesResponse {
  categories: readonly string[]
}

export interface ModelRegistryOverviewResponse {
  registry: Record<string, ModelRegistryEntry[]>
}

export interface ModelRegistryCategoryResponse {
  category: string
  default_model: string | null
  models: ModelRegistryEntry[]
}

export interface ModelRegistryMutationResponse {
  category: string
  default_model?: string | null
  model_count?: number
  model_id?: string
  removed?: boolean
  persisted?: boolean
}

export interface RepositoryDependencyFinding {
  manifest_path: string
  ecosystem: string
  declared: string[]
}

export interface RepositorySummary {
  repository_id: string
  source_filename: string
  fingerprint: string
  file_count: number
  total_bytes: number
  created_at: number
  updated_at: number
  indexed_version: number
  /** True if this repository was rehydrated from an R2 manifest after a backend
   * restart and has no local working copy. Reindex/diff will fail until the
   * repository is re-uploaded. */
  rehydrated?: boolean
}

export interface RepositoryManifest extends RepositorySummary {
  languages: Record<string, number>
  dependencies: RepositoryDependencyFinding[]
}

export interface RepositoryListResponse {
  repositories: RepositorySummary[]
}

export interface RepositoryDiffResponse {
  added: string[]
  removed: string[]
  changed: string[]
}

export interface RepositoryDeleteResponse {
  repository_id: string
  removed: boolean
}

export interface RepositoryCleanupResponse {
  removed: string[]
  removed_count: number
}

export interface RepositoryQaCheck {
  name: string
  status: 'ok' | 'warning' | 'skipped' | string
  summary: string
  details: Record<string, unknown>
}

export interface RepositoryQaReport {
  repository_id: string
  score: number
  warning_count: number
  checks: RepositoryQaCheck[]
}

export interface RepositoryCouncilDimensionScore {
  dimension: string
  score: number
  rationale: string
  confidence: 'measured' | 'heuristic' | string
}

export interface RepositoryCouncilReport {
  repository_id: string
  occurred_at: string
  overall_score: number
  dimensions: RepositoryCouncilDimensionScore[]
  recommendations: string[]
  heuristic_dimensions: string[]
  has_unmeasured_signal: boolean
}

export interface RepositoryCouncilHistoryResponse {
  repository_id: string
  runs: RepositoryCouncilReport[]
}

export interface RepositoryLearningEntryResponse {
  summary?: string
  success?: boolean
  files_changed?: string[]
  pattern?: string
  context?: string
  recorded_at?: string
  [key: string]: unknown
}

export interface RepositoryProjectDnaResponse {
  patch_summary?: string
  pattern_summary?: string
  latest_qa_score?: number | null
  latest_council_score?: number | null
  [key: string]: unknown
}

export interface ConnectorReport {
  name: string
  configured: boolean
  healthy: boolean
  authenticated: boolean
  capabilities: string[]
  rate_limit: Record<string, unknown> | null
  diagnostics: Record<string, unknown> | null
  error: string | null
}

export interface ConnectorsResponse {
  connectors: ConnectorReport[]
}

export interface BucketsResponse {
  buckets: string[]
}

export interface AiCouncilPromotion {
  category: string
  model_id: string
  score: number
  provider: string
}

export interface AiCouncilRunReport {
  run_id: string
  occurred_at: string
  providers_discovered: number
  models_seen: number
  new_models: string[]
  retired_models: string[]
  promotions: AiCouncilPromotion[]
  weights_used: Record<string, number>
}

export interface AiCouncilHistoryResponse {
  runs: AiCouncilRunReport[]
}

export interface BenchmarkMetricKeysResponse {
  metric_keys: readonly string[]
}

export interface BenchmarkCandidateInput {
  model_id: string
  coding_benchmark?: number
  reasoning_benchmark?: number
  cost?: number
  latency?: number
  reliability?: number
  long_context?: number
  json_reliability?: number
  structured_output?: number
  community_maturity?: number
  internal_historical_performance?: number
}

export interface BenchmarkRankResult {
  model_id: string
  score: number
  confidence: number
  metrics: Record<string, number>
}

export interface BenchmarkRankResponse {
  ranking: BenchmarkRankResult[]
}

export interface ExecutionReviewSummary {
  id: string
  plan_id: string
  status: string
  task: string
  repo: string | null
  target: string
  workflow_preset: string | null
  requested_by: string | null
  created_at: string | null
  updated_at: string | null
  requires_approval: boolean
  can_execute_now: boolean
  adapter_execution_enabled: boolean
  execution_state: string
  execution_mode: string
  risk_level: string | null
  skill_name: string | null
  description: string | null
  evidence_summary: string | null
  decision_count: number
}

export interface ExecutionReviewListResponse {
  ok: boolean
  count: number
  total_count: number
  open_count: number
  ready_count: number
  closed_count: number
  items: ExecutionReviewSummary[]
  safety_note: string
}

export interface ExecutionReviewDetailResponse {
  ok: boolean
  error_code?: string
  plan_id: string
  review: Record<string, unknown>
  safety_note: string
}

export interface ExecutionReviewCreateResponse {
  ok: boolean
  error_code?: string
  message?: string
  dry_run: boolean
  plan_id: string
  status: string
  title: string
  review: Record<string, unknown>
  safety_note: string
}

export interface ExecutionReviewDecisionResponse {
  ok: boolean
  error_code?: string
  allowed_decisions?: string[]
  plan_id: string
  decision: string
  review: Record<string, unknown>
  safety_note: string
}

export interface PolicyProfile {
  label: string
  can_execute_now: boolean
  can_execute_after_approval: boolean
  allows_repo_mutation: boolean
  allows_r2_write: boolean
  requires_human_approval: boolean
  description: string
}

export interface PolicyProfilesResponse {
  ok: boolean
  count: number
  profiles: Record<string, PolicyProfile>
}

export interface WorkflowSimulationResponse {
  ok: boolean
  error_code?: string
  simulation_id?: string
  preview_id?: string
  task?: string
  repo?: string | null
  policy_profile?: string
  policy?: PolicyProfile
  execution_mode?: string
  can_execute_now?: boolean
  adapter_execution_enabled?: boolean
  execution_state?: string
  required_services?: string[]
  affected_repos?: string[]
  affected_buckets?: string[]
  risk_summary?: Record<string, unknown>
  estimated_cost?: Record<string, unknown>
  missing_prerequisites?: string[]
  rollback_notes?: string[]
  workflow_graph?: WorkflowGraphResponse
  next_required_actions?: string[]
  safety_note?: string
}

export interface SavedExecutionPreviewSummary {
  id: string
  preview_id: string
  task: string
  repo: string | null
  policy_profile: string | null
  status: string
  can_execute_now: boolean
  created_at: string | null
  updated_at: string | null
}

export interface ExecutionPreviewHistoryResponse {
  ok: boolean
  count: number
  items: SavedExecutionPreviewSummary[]
}

export interface ExecutionPreviewDetailResponse {
  ok: boolean
  error_code?: string
  preview: Record<string, unknown>
}

export interface ExecutionPreviewSaveResponse {
  ok: boolean
  error_code?: string
  dry_run: boolean
  preview_id: string
  preview?: Record<string, unknown>
  would_save?: Record<string, unknown>
  can_execute_now: boolean
  safety_note: string
}

export interface OptimisationDecision {
  decision_id: string
  decision_type: string
  description: string
  previous_state: unknown
  new_state: unknown
  confidence: number
  status: 'applied' | 'reverted' | string
  created_at: string
  reverted_at: string | null
}

export interface OptimisationExperiment {
  experiment_id: string
  name: string
  hypothesis: string
  outcome: string
  success: boolean
  created_at: string
}

export interface OptimisationDecisionsResponse {
  decisions: OptimisationDecision[]
}

export interface OptimisationExperimentsResponse {
  experiments: OptimisationExperiment[]
}

export interface OptimisationStatsResponse {
  decision_count: number
  applied_count: number
  reverted_count: number
  rollback_rate: number
  experiment_count: number
  experiment_success_rate: number
}

export interface EnvironmentAuditResponse {
  env_example_path: string
  env_example_found: boolean
  total_settings_fields: number
  documented_field_count: number
  undocumented_field_count: number
  undocumented_fields: { field: string; expected_env_names: string[] }[]
  extra_in_env_example: string[]
  coverage_ratio: number
}

export interface RuntimeStatsResponse {
  ok: boolean
  build?: string
  sampled_at?: number
  repository_manager?: {
    registered_count: number
    latest_updated_at?: number | null
  }
  model_registry?: {
    total_models: number
    categories_populated: string[]
    default_coding_model?: string | null
  }
  providers?: {
    count: number
    names: string[]
  }
  storage?: {
    sql?: { enabled: boolean; dialect?: string | null }
    d1?: { enabled: boolean }
    r2?: { enabled: boolean; write_enabled: boolean; bucket?: string | null }
  }
  ops_events?: {
    ingest_enabled: boolean
    memory_limit: number
  }
}
