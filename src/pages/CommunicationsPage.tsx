import { useState } from 'react'
import { LoaderCircle, RefreshCw } from 'lucide-react'

export function CommunicationsPage() {
  const [frameKey, setFrameKey] = useState(0)
  const [loaded, setLoaded] = useState(false)

  return (
    <section className="relative h-full min-h-0 bg-[#061126]" aria-label="AIMS Communications Interface">
      {!loaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#061126] text-sm text-slate-400">
          <LoaderCircle className="mr-2 h-5 w-5 animate-spin text-cyan-300" /> Opening AIMS Comms Hub
        </div>
      )}
      <iframe
        key={frameKey}
        title="AIMS Comms Hub"
        src="/api/auth/comms-handoff?embed=1"
        className="h-full w-full border-0 bg-[#061126]"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
      />
      <button
        type="button"
        onClick={() => { setLoaded(false); setFrameKey((value) => value + 1) }}
        className="absolute bottom-4 right-4 z-20 rounded-xl border border-white/10 bg-[#0a192d]/95 p-2.5 text-slate-300 shadow-xl backdrop-blur transition hover:border-cyan-300/30 hover:text-cyan-100"
        aria-label="Reload Communications Interface"
        title="Reload Communications Interface"
      >
        <RefreshCw className="h-4 w-4" />
      </button>
    </section>
  )
}
