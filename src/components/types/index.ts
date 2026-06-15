// ── Auth ─────────────────────────────────────────────────────────────────
export interface AuthState {
  token: string
  isValid: boolean
}

// ── Mode ─────────────────────────────────────────────────────────────────
export type HiveMode = 'auto' | 'brand' | 'general' | 'code' | 'audit' | 'file'

export const HIVE_MODES: Record<HiveMode, { label: string; description: string; icon: string }> = {
  auto:    { label: 'Auto',    description: 'HIVE selects the best mode',         icon: '✦' },
  brand:   { label: 'Brand',   description: 'Jonathan Harris voice & tone',        icon: '◈' },
  general: { label: 'General', description: 'General purpose assistant',           icon: '◇' },
  code:    { label: 'Code',    description: 'Code review & debugging',             icon: '⟨⟩' },
  audit:   { label: 'Audit',   description: 'Council reports & ecosystem audits',  icon: '⊞' },
  file:    { label: 'File',    description: 'Document analysis & RAG',             icon: '◱' },
}

// ── Models ────────────────────────────────────────────────────────────────
export interface HiveModel {
  id: string
  name: string
  context_length?: number
  pricing?: { prompt: string; completion: string }
}

// ── Conversations ─────────────────────────────────────────────────────────
export interface Conversation {
  conversation_id: string
  title: string
  mode: HiveMode
  created_at: string
  updated_at: string
  message_count: number
}

export interface Message {
  message_id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  model_used?: string
  created_at: string
  prompt_tokens?: number
  completion_tokens?: number
  cost_usd?: string
  source_metadata?: SourceMetadata
}

export interface ConversationDetail extends Conversation {
  messages: Message[]
}

// ── Source metadata (RAG) ─────────────────────────────────────────────────
export interface SourceMetadata {
  retrieval_source?: 'vectorize' | 'sql_fallback' | 'none'
  vector_hits?: number
  sql_fallback_hits?: number
  object_key?: string
  chunk_count?: number
  skill_routing?: SkillRoutingMeta
}

export interface SkillRoutingMeta {
  skill_id?: string
  skill_slug?: string
  routing_source?: 'explicit' | 'recommended' | 'preset' | 'none'
  confirmation_required?: boolean
}

// ── Files ─────────────────────────────────────────────────────────────────
export interface HiveFile {
  object_key: string
  filename: string
  size_bytes: number
  content_type?: string
  uploaded_at?: string
  chunk_count?: number
  vectorized?: boolean
}

// ── Skills ────────────────────────────────────────────────────────────────
export type SkillPriority = 'P0 - Foundation' | 'P1 - High' | 'P2 - Useful'
export type SkillRisk     = 'low' | 'medium' | 'high'
export type SkillStatus   = 'installed' | 'parked' | 'candidate'
export type SkillRepo     = 'AIMS' | 'RAMS' | 'HIVE' | 'WEBSITE' | 'MAST'

export interface Skill {
  skill_id: string
  slug: string
  name: string
  priority_tier: SkillPriority
  score: number
  hive_lane: string
  repos: SkillRepo[]
  repo_status: Record<string, SkillStatus>
  risk_level: SkillRisk
  tags: string[]
  object_key: string
  description?: {
    why_useful?: string
    primary_use_case?: string
    evidence_note?: string
  }
}

export interface SkillSearchResult extends Skill {
  search_score?: number
  score_breakdown?: Record<string, number>
  matched_terms?: string[]
  matched_fields?: string[]
}

export interface SkillRecommendation {
  rank: number
  skill_id: string
  slug: string
  priority_tier: SkillPriority
  repo_status: Record<string, SkillStatus>
  relevance_score: number
  relevance_source: string
  risk_level: SkillRisk
  ready_to_use: boolean
  confirmation_required: boolean
  recommendation_reason?: string
}

// ── Health ────────────────────────────────────────────────────────────────
export interface HealthResponse {
  ok: boolean
  build?: string
  app?: string
  env?: string
  storage?: { r2_configured: boolean; r2_bucket?: string }
  llm?: {
    openrouter_configured: boolean
    default_model?: string
    free_fallback_model?: string
    allow_paid_fallback?: boolean
  }
  database?: { configured: boolean; dialect?: string }
  d1?: { configured: boolean; database_name?: string }
  vectorize?: { configured: boolean; enabled: boolean; index_name?: string }
  embeddings?: { configured: boolean; enabled: boolean; model?: string; dimensions?: number }
}

// ── Workflow graphs ────────────────────────────────────────────────────────
export interface WorkflowNode {
  node_id: string
  label: string
  type: string
  description?: string
  status?: string
  blocked?: boolean
  blocked_reason?: string
}

export interface WorkflowEdge {
  from: string
  to: string
  label?: string
}

export interface WorkflowGraph {
  template?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

// ── Execution review ──────────────────────────────────────────────────────
export interface ExecutionReviewPlan {
  plan_id: string
  task: string
  repo?: string
  status: 'pending_review' | 'approved' | 'rejected' | 'needs_changes' | 'archived'
  created_at: string
  updated_at?: string
  policy_profile?: string
  can_execute_now: boolean
  dry_run: boolean
  workflow_preset?: string
}

// ── Repo hygiene ──────────────────────────────────────────────────────────
export interface RepoHygieneReport {
  ok: boolean
  build_stage_hint?: string
  duplicates?: Array<{ type: string; items: string[] }>
  orphans?: string[]
  generated_artifacts?: string[]
  deletion_manifest?: Array<{ path: string; reason: string }>
  summary?: { total_issues: number; critical: number; advisory: number }
}

// ── API error ─────────────────────────────────────────────────────────────
export interface ApiError {
  detail?: string
  message?: string
  status?: number
}

// ── Cost display ──────────────────────────────────────────────────────────
export interface CostSummary {
  total_messages: number
  total_prompt_tokens: number
  total_completion_tokens: number
  total_cost_usd: string
  period?: string
}
