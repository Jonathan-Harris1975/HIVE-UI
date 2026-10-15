import { useState, type ReactNode } from 'react'

type Preferences = {
  enabled: boolean
  weekly: boolean
  review: boolean
  critical: boolean
  confirmation: boolean
  volume: number
}

type HIVEOperationalEvent = {
  event_id: string
  source?: string
  event_type?: string
  severity?: string
  details?: Record<string, unknown> | null
  title?: string
  summary?: string
  occurred_at?: string | null
}

type SharedNotification = {
  notification_id: string
  source: string
  severity: 'info' | 'review_required' | 'critical' | 'resolved'
  category: string
  title: string
  summary: string
  requires_action: boolean
  action_url: string | null
  created_at: string | null
  acknowledged_at: string | null
  resolved_at: string | null
}

const KEY = 'hive-audio-notification-preferences-v1'
const defaults: Preferences = {
  enabled: true,
  weekly: false,
  review: true,
  critical: true,
  confirmation: false,
  volume: 0.65,
}
const sounds = {
  weekly: '/audio/hive/hive_1_weekly_report_ready.mp3',
  review: '/audio/hive/hive_2_review_required.mp3',
  critical: '/audio/hive/hive_3_critical.mp3',
  confirmation: '/audio/hive/hive_4_confirmation.mp3',
}

function loadPreferences(): Preferences {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return defaults
  }
}

export function AudioNotificationSettings() {
  const [prefs, setPrefs] = useState<Preferences>(loadPreferences)
  const [message, setMessage] = useState('')

  function update(next: Partial<Preferences>) {
    const value = { ...prefs, ...next }
    setPrefs(value)
    try {
      localStorage.setItem(KEY, JSON.stringify(value))
    } catch {
      setMessage('Preferences are available for this session only.')
    }
  }

  async function testSound() {
    try {
      const audio = new Audio(sounds.review)
      audio.volume = prefs.volume
      await audio.play()
      setMessage('Review sound played.')
    } catch {
      setMessage('Audio could not play. Interact with the page and check browser audio settings.')
    }
  }

  async function enableBrowserNotifications() {
    if (!('Notification' in window)) {
      setMessage('Browser notifications are not supported here.')
      return
    }
    try {
      const permission = await Notification.requestPermission()
      setMessage(`Browser notification permission: ${permission}.`)
    } catch {
      setMessage('Browser notification permission is unavailable.')
    }
  }

  return (
    <section
      className="mt-3 rounded-2xl border border-white/8 bg-hive-panel/60 p-4"
      aria-labelledby="audio-notifications-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="audio-notifications-title" className="text-sm font-semibold text-white">
            Audio notifications
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Only review-required and critical alerts can sound. Routine activity stays silent.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void testSound()}
          className="rounded-lg border border-cyan-200/20 px-3 py-2 text-xs text-cyan-100 hover:bg-cyan-200/10"
        >
          Test Sound
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <PreferenceCheckbox checked={prefs.enabled} onChange={(enabled) => update({ enabled })}>
          Sound on
        </PreferenceCheckbox>
        <PreferenceCheckbox checked={prefs.weekly} onChange={(weekly) => update({ weekly })}>
          Weekly report ready sound
        </PreferenceCheckbox>
        <PreferenceCheckbox checked={prefs.review} onChange={(review) => update({ review })}>
          Review required sound
        </PreferenceCheckbox>
        <PreferenceCheckbox checked={prefs.critical} onChange={(critical) => update({ critical })}>
          Critical sound
        </PreferenceCheckbox>
        <PreferenceCheckbox
          checked={prefs.confirmation}
          onChange={(confirmation) => update({ confirmation })}
        >
          Confirmation sound
        </PreferenceCheckbox>
      </div>
      <label className="mt-4 flex items-center gap-3 text-xs text-slate-300">
        Volume
        <input
          aria-label="Notification volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={prefs.volume}
          onChange={(event) => update({ volume: Number(event.target.value) })}
        />
        <span>{Math.round(prefs.volume * 100)}%</span>
      </label>
      <button
        type="button"
        onClick={() => void enableBrowserNotifications()}
        className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
      >
        Enable browser notifications
      </button>
      {message && <p role="status" className="mt-2 text-xs text-slate-400">{message}</p>}
    </section>
  )
}

function PreferenceCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-200">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {children}
    </label>
  )
}

export function toSharedNotification(item: HIVEOperationalEvent): SharedNotification {
  const kind = String(item.event_type || 'operational_event').toLowerCase()
  const required =
    item.details?.requires_action === true || kind === 'review_required' || kind === 'service_blocked'
  const severity =
    kind === 'resolved'
      ? 'resolved'
      : item.severity === 'critical' || kind === 'service_blocked'
        ? 'critical'
        : required
          ? 'review_required'
          : 'info'
  const actionUrl = item.details?.action_url
  return {
    notification_id: item.event_id,
    source: item.source || 'HIVE',
    severity,
    category: kind,
    title: item.title || 'Operational event',
    summary: item.summary || '',
    requires_action: required,
    action_url: typeof actionUrl === 'string' ? actionUrl : null,
    created_at: item.occurred_at || null,
    acknowledged_at: null,
    resolved_at: severity === 'resolved' ? item.occurred_at || null : null,
  }
}

export function notifyNewHIVEEvents(items: HIVEOperationalEvent[], options: { playAudio?: boolean } = {}) {
  const playAudio = options.playAudio !== false
  const prefs = loadPreferences()
  const seenStorageName = 'hive-notification-seen-v1'
  const acknowledgedStorageName = 'hive-notification-acknowledged-v1'
  let seen: string[] = []
  let acknowledged: string[] = []
  try {
    seen = JSON.parse(localStorage.getItem(seenStorageName) || '[]')
  } catch {
    seen = []
  }
  try {
    acknowledged = JSON.parse(localStorage.getItem(acknowledgedStorageName) || '[]')
  } catch {
    acknowledged = []
  }

  const unseen = items
    .map((item) => toSharedNotification(item))
    .filter((event) => {
      const soundEvent = event.category === 'weekly_report_ready' || event.severity === 'resolved'
      return (
        (event.requires_action || soundEvent) &&
        !seen.includes(event.notification_id) &&
        !acknowledged.includes(event.notification_id)
      )
    })
  if (!unseen.length) return

  const ids = unseen.map((event) => event.notification_id)
  try {
    localStorage.setItem(seenStorageName, JSON.stringify([...seen, ...ids].slice(-200)))
  } catch {
    // Sound is best effort and must never block the visible event.
  }

  for (const event of unseen) {
    const critical = event.severity === 'critical'
    const sound = event.category === 'weekly_report_ready'
      ? 'weekly'
      : event.severity === 'resolved'
        ? 'confirmation'
        : critical
          ? 'critical'
          : 'review'
    const enabled = prefs.enabled && (sound === 'weekly'
      ? prefs.weekly
      : sound === 'confirmation'
        ? prefs.confirmation
        : sound === 'critical'
          ? prefs.critical
          : prefs.review)
    if (playAudio && enabled) {
      try {
        const audio = new Audio(sounds[sound])
        audio.volume = prefs.volume
        void audio.play().catch(() => undefined)
      } catch {
        // Audio failure leaves the visible event and review action available.
      }
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notification = new Notification(event.title, { body: event.summary })
        notification.onclick = () => {
          acknowledgeHIVENotification(event.notification_id)
          notification.close()
        }
      } catch {
        // The dashboard card remains the visible fallback.
      }
    }
  }
}

export function acknowledgeHIVENotification(eventId: string) {
  const acknowledgementStorageName = 'hive-notification-acknowledged-v1'
  try {
    const current: string[] = JSON.parse(localStorage.getItem(acknowledgementStorageName) || '[]')
    localStorage.setItem(acknowledgementStorageName, JSON.stringify([...new Set([...current, eventId])].slice(-200)))
  } catch {
    // Acknowledgement persistence is best effort.
  }
}
