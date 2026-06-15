import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw, ShieldAlert } from 'lucide-react'
import { HIVE_UI_BUILD, HIVE_UI_VERSION } from '../lib/build'
import { HiveLogo } from './HiveLogo'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('HIVE-UI render failure', { error, info, build: HIVE_UI_BUILD })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#061126] px-5 py-10 text-slate-100">
        <section className="w-full max-w-lg rounded-[28px] border border-rose-300/20 bg-[#0b1b31] p-7 text-center shadow-2xl shadow-black/30 sm:p-9">
          <div className="flex justify-center"><HiveLogo size="lg" showWordmark={false} /></div>
          <div className="mx-auto mt-6 flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-300/20 bg-rose-300/8 text-rose-200">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-white">The console hit a display fault</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Reload the page to restore the current HIVE-UI bundle. Persisted conversations and backend records are unaffected.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-300 px-5 text-sm font-semibold text-[#052035] hover:brightness-110"
          >
            <RefreshCw className="h-4 w-4" /> Reload console
          </button>
          <p className="mt-5 text-[10px] uppercase tracking-[0.16em] text-slate-600">HIVE-UI {HIVE_UI_VERSION} · {HIVE_UI_BUILD}</p>
        </section>
      </main>
    )
  }
}
