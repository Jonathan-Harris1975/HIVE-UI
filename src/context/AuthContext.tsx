import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ApiError,
  apiFetch,
  getUiSession,
  loginUi,
  logoutUi,
  recordUiActivity,
} from '../lib/api'
import { clearDevSession, getDevSession, setDevSession } from '../lib/session'
import type { HealthResponse } from '../types/api'

type AuthStatus = 'checking' | 'signed-out' | 'signed-in'

interface AuthContextValue {
  status: AuthStatus
  health: HealthResponse | null
  error: string | null
  login: (accessKey: string) => Promise<void>
  logout: () => void
  refreshHealth: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const DEFAULT_IDLE_TIMEOUT_SECONDS = 1_800
const ACTIVITY_HEARTBEAT_MIN_MS = 60_000
const HEALTH_WARMUP_ATTEMPTS = 18
const HEALTH_WARMUP_DELAY_MS = 2_000
const ACTIVITY_STORAGE_KEY = 'hive-ui-last-user-activity'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [idleTimeoutSeconds, setIdleTimeoutSeconds] = useState(DEFAULT_IDLE_TIMEOUT_SECONDS)
  const idleTimerRef = useRef<number | null>(null)
  const lastServerActivityRef = useRef(0)
  const logoutRef = useRef<() => void>(() => {})

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }, [])

  const clearLocalAuthState = useCallback(() => {
    clearIdleTimer()
    clearDevSession()
    setHealth(null)
    setError(null)
    setStatus('signed-out')
  }, [clearIdleTimer])

  const logout = useCallback(() => {
    clearLocalAuthState()
    if (!import.meta.env.DEV) {
      void logoutUi().catch(() => {
        // Local authentication is already cleared. The Worker will release HIVE
        // whenever the signed session is still available.
      })
    }
  }, [clearLocalAuthState])

  useEffect(() => {
    logoutRef.current = logout
  }, [logout])

  const scheduleIdleLogout = useCallback((timeoutSeconds = idleTimeoutSeconds) => {
    clearIdleTimer()
    idleTimerRef.current = window.setTimeout(() => {
      logoutRef.current()
    }, Math.max(300, timeoutSeconds) * 1000)
  }, [clearIdleTimer, idleTimeoutSeconds])

  const refreshHealth = useCallback(async () => {
    const result = await apiFetch<HealthResponse>('/health')
    setHealth(result)
    setError(null)
  }, [])

  const waitForHiveHealth = useCallback(async () => {
    let lastError: unknown = null
    for (let attempt = 0; attempt < HEALTH_WARMUP_ATTEMPTS; attempt += 1) {
      try {
        await refreshHealth()
        return
      } catch (caught) {
        lastError = caught
        if (attempt < HEALTH_WARMUP_ATTEMPTS - 1) await delay(HEALTH_WARMUP_DELAY_MS)
      }
    }
    throw lastError instanceof Error ? lastError : new Error('HIVE did not become ready in time.')
  }, [refreshHealth])

  const login = useCallback(async (accessKey: string) => {
    const cleanKey = accessKey.trim()
    if (!cleanKey) throw new Error('Enter the HIVE UI access key.')
    setError(null)

    try {
      let appliedIdleTimeout = DEFAULT_IDLE_TIMEOUT_SECONDS
      if (import.meta.env.DEV) {
        setDevSession()
      } else {
        const session = await loginUi(cleanKey)
        appliedIdleTimeout = session.idle_timeout_seconds ?? DEFAULT_IDLE_TIMEOUT_SECONDS
      }
      setIdleTimeoutSeconds(appliedIdleTimeout)
      setStatus('signed-in')
      lastServerActivityRef.current = Date.now()
      scheduleIdleLogout(appliedIdleTimeout)

      try {
        await waitForHiveHealth()
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'HIVE could not be reached.'
        setError(message)
      }
    } catch (caught) {
      clearDevSession()
      const message = caught instanceof Error ? caught.message : 'HIVE access could not be verified.'
      setError(message)
      setStatus('signed-out')
      throw caught
    }
  }, [scheduleIdleLogout, waitForHiveHealth])

  useEffect(() => {
    const handleUnauthorised = () => clearLocalAuthState()
    window.addEventListener('hive:unauthorised', handleUnauthorised)
    return () => window.removeEventListener('hive:unauthorised', handleUnauthorised)
  }, [clearLocalAuthState])

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      let restoredIdleTimeout = DEFAULT_IDLE_TIMEOUT_SECONDS
      if (import.meta.env.DEV) {
        if (!getDevSession()) {
          if (!cancelled) setStatus('signed-out')
          return
        }
      } else {
        try {
          const session = await getUiSession()
          restoredIdleTimeout = session.idle_timeout_seconds ?? DEFAULT_IDLE_TIMEOUT_SECONDS
        } catch (caught) {
          if (!cancelled) {
            if (!(caught instanceof ApiError && caught.status === 401)) {
              setError(caught instanceof Error ? caught.message : 'The HIVE UI session could not be restored.')
            }
            setStatus('signed-out')
          }
          return
        }
      }

      if (cancelled) return
      setIdleTimeoutSeconds(restoredIdleTimeout)
      setStatus('signed-in')
      lastServerActivityRef.current = Date.now()
      scheduleIdleLogout(restoredIdleTimeout)
      try {
        await refreshHealth()
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'HIVE could not be reached.')
        }
      }
    }

    void restoreSession()
    return () => {
      cancelled = true
    }
  }, [refreshHealth, scheduleIdleLogout])

  useEffect(() => {
    if (status !== 'signed-in') return undefined

    let disposed = false
    const markActivity = () => {
      if (disposed) return
      scheduleIdleLogout()
      const now = Date.now()
      try {
        localStorage.setItem(ACTIVITY_STORAGE_KEY, String(now))
      } catch {
        // Cross-tab synchronisation is a convenience; auth never depends on localStorage.
      }
      if (import.meta.env.DEV) return
      if (now - lastServerActivityRef.current < ACTIVITY_HEARTBEAT_MIN_MS) return
      lastServerActivityRef.current = now
      void recordUiActivity()
        .then((session) => {
          if (disposed) return
          if (session.idle_timeout_seconds) setIdleTimeoutSeconds(session.idle_timeout_seconds)
        })
        .catch((caught) => {
          if (caught instanceof ApiError && caught.status === 401) clearLocalAuthState()
        })
    }

    const handleStorageActivity = (event: StorageEvent) => {
      if (event.key === ACTIVITY_STORAGE_KEY && event.newValue) scheduleIdleLogout()
    }
    const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'popstate']
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, markActivity, { passive: true })
    }
    window.addEventListener('storage', handleStorageActivity)
    scheduleIdleLogout()

    return () => {
      disposed = true
      for (const eventName of activityEvents) window.removeEventListener(eventName, markActivity)
      window.removeEventListener('storage', handleStorageActivity)
    }
  }, [clearLocalAuthState, scheduleIdleLogout, status])

  const value = useMemo<AuthContextValue>(() => ({
    status,
    health,
    error,
    login,
    logout,
    refreshHealth,
  }), [status, health, error, login, logout, refreshHealth])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
