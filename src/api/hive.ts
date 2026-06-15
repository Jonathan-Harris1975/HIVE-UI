import { apiGet, apiPost, apiPostForm, streamPost } from './client'
import type {
  HealthResponse,
  HiveModel,
  Conversation,
  ConversationDetail,
  CostSummary,
  HiveFile,
  HiveMode,
  SkillSearchResult,
  SkillRecommendation,
  ExecutionReviewPlan,
  WorkflowGraph,
  RepoHygieneReport,
} from '@/types'

// ── Health ────────────────────────────────────────────────────────────────
export const health = {
  get: () => apiGet<HealthResponse>('/health'),
  ping: () => apiGet<{ ok: boolean }>('/healthz'),
}

// ── Models ────────────────────────────────────────────────────────────────
export const models = {
  list: () => apiGet<{ models: HiveModel[]; count: number }>('/v1/models'),
  validateKey: (key: string) =>
    apiPost<{ valid: boolean; detail?: string }>('/v1/models/validate-key', { key }),
}

// ── Conversations (DB) ────────────────────────────────────────────────────
export const conversations = {
  list: (limit = 50, offset = 0) =>
    apiGet<{ conversations: Conversation[]; total: number }>('/v1/db/conversations', { limit, offset }),

  get: (id: string) =>
    apiGet<ConversationDetail>(`/v1/db/conversations/${id}`),

  costSummary: () =>
    apiGet<CostSummary>('/v1/db/cost-summary'),
}

// ── Chat ──────────────────────────────────────────────────────────────────
export interface ChatRequest {
  message: string
  mode?: HiveMode
  model?: string
  conversation_id?: string
  skill_id?: string
  auto_skill_routing?: boolean
  system_prompt?: string
}

export interface ChatResponse {
  ok: boolean
  reply: string
  model_used?: string
  conversation_id?: string
  message_id?: string
  prompt_tokens?: number
  completion_tokens?: number
  cost_usd?: string
  source_metadata?: Record<string, unknown>
  skill_routing?: Record<string, unknown>
}

export const chat = {
  send: (req: ChatRequest) =>
    apiPost<ChatResponse>('/v1/chat', req),

  stream: (req: ChatRequest, signal?: AbortSignal) =>
    streamPost('/v1/chat/stream', req, signal),
}

// ── Files ─────────────────────────────────────────────────────────────────
export interface UploadResult {
  ok: boolean
  object_key: string
  filename: string
  size_bytes: number
  content_type?: string
  chunk_count?: number
}

export interface ChatWithFileRequest {
  object_key: string
  message: string
  mode?: HiveMode
  model?: string
  conversation_id?: string
  use_vectorize?: boolean
  workflow_preset?: string
}

export interface ChatWithFileResponse extends ChatResponse {
  retrieval_source?: string
  vector_hits?: number
  sql_fallback_hits?: number
  chunks_used?: number
}

export const files = {
  upload: (file: File, autoChunk = true, autoEmbed = false): Promise<UploadResult> => {
    const form = new FormData()
    form.append('file', file)
    form.append('auto_chunk', String(autoChunk))
    form.append('auto_embed', String(autoEmbed))
    return apiPostForm<UploadResult>('/v1/files/upload', form)
  },

  uploadText: (content: string, filename: string, autoChunk = true) =>
    apiPost<UploadResult>('/v1/files/upload-text', { content, filename, auto_chunk: autoChunk }),

  list: (limit = 50) =>
    apiGet<{ files: HiveFile[]; count: number }>('/v1/files/list', { limit }),

  chunk: (objectKey: string) =>
    apiPost<{ ok: boolean; chunk_count: number }>('/v1/files/chunk', { object_key: objectKey }),

  vectorize: (objectKey: string) =>
    apiPost<{ ok: boolean; upserted_count: number }>('/v1/files/vectorize', { object_key: objectKey }),

  chatWithFile: (req: ChatWithFileRequest) =>
    apiPost<ChatWithFileResponse>('/v1/chat/with-file', req),

  chatWithFileStream: (req: ChatWithFileRequest, signal?: AbortSignal) =>
    streamPost('/v1/chat/with-file', req, signal),

  vectorSearch: (objectKey: string, query: string, limit = 5) =>
    apiGet<{ ok: boolean; chunks: unknown[]; retrieval_source: string }>(
      '/v1/files/vector-search',
      { object_key: objectKey, query, limit },
    ),
}

// ── Skills ────────────────────────────────────────────────────────────────
export interface SkillSearchParams {
  q?: string
  repo?: string
  lane?: string
  risk?: string
  priority?: string
  limit?: number
}

export interface SkillRecommendRequest {
  query: string
  repo?: string
  workflow_preset?: string
  max_results?: number
  exclude_high_risk?: boolean
  include_parked?: boolean
}

export const skills = {
  search: (params: SkillSearchParams) =>
    apiGet<{ ok: boolean; results: SkillSearchResult[]; total: number; query?: string }>(
      '/v1/skills/search',
      params as Record<string, string | number | boolean>,
    ),

  list: (limit = 100, offset = 0) =>
    apiGet<{ ok: boolean; skills: SkillSearchResult[]; total: number }>(
      '/v1/skills/list',
      { limit, offset },
    ),

  get: (skillId: string) =>
    apiGet<SkillSearchResult>('/v1/skills/get', { skill_id: skillId }),

  byRepo: (repo: string, limit = 100) =>
    apiGet<{ ok: boolean; skills: SkillSearchResult[]; total: number }>(
      '/v1/skills/by-repo',
      { repo, limit },
    ),

  byRisk: (risk: string) =>
    apiGet<{ ok: boolean; skills: SkillSearchResult[]; total: number }>(
      '/v1/skills/by-risk',
      { risk },
    ),

  recommend: (req: SkillRecommendRequest) =>
    apiPost<{
      ok: boolean
      query: string
      recommendations: SkillRecommendation[]
      skipped_high_risk: SkillRecommendation[]
    }>('/v1/skills/recommend', req),

  categories: () =>
    apiGet<{ ok: boolean; categories: Record<string, number> }>('/v1/skills/categories'),

  status: () =>
    apiGet<{ ok: boolean; total: number; indexed: number; last_import?: string }>(
      '/v1/skills/status',
    ),

  integrity: () =>
    apiGet<{ ok: boolean; report: unknown }>('/v1/skills/integrity'),
}

// ── Ecosystem ─────────────────────────────────────────────────────────────
export const ecosystem = {
  status: () =>
    apiGet<{ ok: boolean; services: Record<string, unknown> }>('/v1/ecosystem/status'),

  recent: (limit = 10) =>
    apiGet<{ ok: boolean; items: unknown[] }>('/v1/ecosystem/recent', { limit }),
}

// ── Workflow graphs ───────────────────────────────────────────────────────
export const workflows = {
  templates: () =>
    apiGet<{ ok: boolean; templates: Array<{ id: string; name: string; description: string }> }>(
      '/v1/workflow-graphs/templates',
    ),

  build: (params: {
    task: string
    repo?: string
    workflow_preset?: string
    template?: string
    approval_state?: string
    limit?: number
  }) => apiPost<{ ok: boolean; graph: WorkflowGraph; step_statuses: unknown[] }>(
    '/v1/workflow-graphs/build',
    params,
  ),

  executionPreview: (params: {
    task: string
    repo?: string
    workflow_preset?: string
    approval_state?: string
    limit?: number
  }) => apiPost<{
    ok: boolean
    graph: WorkflowGraph
    step_statuses: unknown[]
    can_execute_now: boolean
    blocked_nodes: string[]
    next_required_actions: string[]
  }>('/v1/execution-preview', params),

  policies: () =>
    apiGet<{ ok: boolean; policies: Record<string, unknown> }>('/v1/execution-preview/policies'),
}

// ── Execution reviews ─────────────────────────────────────────────────────
export const executionReviews = {
  create: (params: {
    task: string
    repo?: string
    workflow_preset?: string
    policy_profile?: string
    dry_run?: boolean
  }) => apiPost<{ ok: boolean; plan: ExecutionReviewPlan }>('/v1/execution-reviews', params),

  list: (limit = 20, offset = 0) =>
    apiGet<{ ok: boolean; plans: ExecutionReviewPlan[]; total: number }>(
      '/v1/execution-reviews',
      { limit, offset },
    ),

  get: (planId: string) =>
    apiGet<{ ok: boolean; plan: ExecutionReviewPlan }>(`/v1/execution-reviews/${planId}`),

  decide: (planId: string, decision: string, reviewer?: string, notes?: string) =>
    apiPost<{ ok: boolean; plan: ExecutionReviewPlan }>(
      `/v1/execution-reviews/${planId}/decision`,
      { decision, reviewer, notes },
    ),

  auditTrail: (planId: string) =>
    apiGet<{ ok: boolean; audit_trail: unknown }>(`/v1/execution-reviews/${planId}/audit-trail`),

  evidencePack: (planId: string) =>
    apiGet<{ ok: boolean; evidence_pack: unknown }>(
      `/v1/execution-reviews/${planId}/evidence-pack`,
    ),
}

// ── System ────────────────────────────────────────────────────────────────
export const system = {
  repoHygiene: (dryRun = true) =>
    apiGet<RepoHygieneReport>('/v1/system/repo-hygiene', { dry_run: dryRun }),

  dbDiagnostics: () =>
    apiGet<{ ok: boolean }>('/v1/db/diagnostics'),

  dbPingWrite: () =>
    apiPost<{ ok: boolean; sql?: boolean; d1?: boolean }>('/v1/db/ping-write'),
}
