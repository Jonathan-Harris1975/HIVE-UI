import { useState, type FormEvent } from 'react'
import { ArrowRight, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { HiveLogo } from './HiveLogo'

export function LoginScreen() {
  const { login, error } = useAuth()
  const [accessKey, setAccessKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setLocalError(null)
    try {
      await login(accessKey)
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : 'Access could not be verified.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-hive-canvas px-5 py-10 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(36,200,240,0.12),transparent_34%),radial-gradient(circle_at_80%_80%,rgba(69,230,176,0.08),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(148,163,184,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.04)_1px,transparent_1px)] [background-size:42px_42px]" />

      <section className="relative w-full max-w-md rounded-[28px] border border-white/10 bg-hive-panel-deep/90 p-7 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-9">
        <div className="mb-8 flex justify-center">
          <HiveLogo size="lg" showWordmark={false} />
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Private access</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Enter the HIVE</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-400">
            Your operational command room for chat, files, skills and controlled workflows.
          </p>
          <p className="mt-2 text-xs text-slate-500">HIVE is a private AI operations console. Access is restricted to its operator.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
              <KeyRound className="h-4 w-4" /> UI access key
            </span>
            <input
              type="password"
              name="hive-access-key"
              autoComplete="current-password"
              autoFocus
              spellCheck={false}
              aria-invalid={Boolean(localError || error)}
              aria-describedby={localError || error ? 'hive-login-error' : undefined}
              value={accessKey}
              onChange={(event) => {
                setAccessKey(event.target.value)
                setLocalError(null)
              }}
              placeholder="Enter access key"
              className="h-12 w-full rounded-xl border border-white/10 bg-hive-surface px-4 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10"
            />
          </label>

          {(localError || error) && (
            <div id="hive-login-error" role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {localError || error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !accessKey.trim()}
            className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 font-semibold text-hive-accent-deep transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
            Unlock console
            {!submitting && <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-5 text-slate-400">
          Your access key is exchanged once for a signed, HttpOnly session cookie. Neither the UI key nor the HIVE backend bearer token is stored in the browser bundle.
        </p>
      </section>
    </main>
  )
}
