import type { AiCouncilRunReport } from '../types/api'

export function isCouncilRunVerified(run: AiCouncilRunReport | null | undefined): boolean {
  return run?.completion_status === 'completed'
    && run.downstream_sync?.enabled === true
    && run.downstream_sync?.ok === true
}
