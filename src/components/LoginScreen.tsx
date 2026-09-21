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
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-hive-canvas px-5 py-10 text-slate-100">
      <div
        className={
          "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(36,200,240,0" +
          ".12),transparent_34%),radial-gradient(circle_at_80%_80%,rgba(69,230,176,0.08),transparent_28" +
          "%)]"
        }
      />
      <section className="relative w-full max-w-md rounded-hive-lg bg-hive-surface p-7 shadow-hive sm:p-9">
        <div className="mb-8 flex justify-center">
          <HiveLogo size="lg" showWordmark={false} />
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Enter HIVE</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-hive-muted">Private operator console</p>
        </div>

        <form onSubmit={handleSubmit} aria-busy={submitting} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-medium text-hive-muted">
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
              className={
                "h-12 w-full rounded-hive bg-hive-raised px-4 text-sm text-white " +
                "outline-none transition placeholder:text-slate-400 focus:border-cyan-300/60 focus:ring-4 " +
                "focus:ring-cyan-300/10"
              }
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
            className={
              "group flex h-12 w-full items-center justify-center gap-2 rounded-hive bg-hive-accent " +
              "px-4 font-semibold text-slate-950 transition " +
              "hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            }
          >
            {submitting ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-5 w-5" aria-hidden="true" />}
            Unlock console
            {!submitting && <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
          </button>
        </form>

      </section>
    </main>
  )
}
