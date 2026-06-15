import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Spinner } from '@/components/shared'

export function TokenGate({ children }: { children: React.ReactNode }) {
  const { isValid, hasToken, checking, submit } = useAuth()
  const [input, setInput] = useState('')
  const [touched, setTouched] = useState(false)

  if (isValid) return <>{children}</>

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (input.trim()) submit(input)
  }

  return (
    <div className="min-h-screen bg-hive-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-hive bg-hive-surface border border-hive-border flex items-center justify-center shadow-accent">
            <svg viewBox="0 0 32 32" className="w-8 h-8">
              <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="#7c75ed" opacity="0.9"/>
              <polygon points="16,7 23,11 23,21 16,25 9,21 9,11" fill="#1c2a3e"/>
              <circle cx="16" cy="16" r="4" fill="#7c75ed"/>
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-hive-text tracking-tight">HIVE</h1>
            <p className="text-xs text-hive-textDim mt-0.5">Harris Intelligent Virtual Entity</p>
          </div>
        </div>

        {/* Token form */}
        <form onSubmit={handleSubmit} className="hive-card flex flex-col gap-4">
          <div>
            <label className="hive-section-title block mb-2">Bearer Token</label>
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              placeholder="Enter your HIVE admin token"
              value={input}
              onChange={e => setInput(e.target.value)}
              className="hive-input"
              aria-describedby={touched && hasToken && !isValid ? 'token-error' : undefined}
            />
            {touched && hasToken && !isValid && !checking && (
              <p id="token-error" className="text-xs text-hive-error mt-1.5">
                Token invalid — check your HIVE_ADMIN_BEARER_TOKEN
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!input.trim() || checking}
            className="hive-btn-primary justify-center py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checking ? (
              <><Spinner size="sm" /> Checking…</>
            ) : 'Connect to HIVE'}
          </button>
        </form>

        <p className="text-center text-2xs text-hive-textDim mt-4">
          Token is held in memory only — not stored
        </p>
      </div>
    </div>
  )
}
