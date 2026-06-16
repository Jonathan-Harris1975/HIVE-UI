import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  ApiError,
  apiFetch,
  getUiSession,
  loginUi,
  logoutUi,
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const clearLocalAuthState = useCallback(() => {
    clearDevSession()
    setHealth(null)
    setError(null)
    setStatus('signed-out')
  }, [])

  const logout = useCallback(() => {
    clearLocalAuthState()
    if (!import.meta.env.DEV) {
      void logoutUi().catch(() => {
        // The local UI state is already cleared. An expired or unreachable server session needs no further action.
      })
    }
  }, [clearLocalAuthState])

  const refreshHealth = useCallback(async () => {
    const result = await apiFetch<HealthResponse>('/health')
    setHealth(result)
    setError(null)
  }, [])

  const login = useCallback(async (accessKey: string) => {
    const cleanKey = accessKey.trim()
    if (!cleanKey) throw new Error('Enter the HIVE UI access key.')
    setError(null)

    try {
      if (import.meta.env.DEV) {
        setDevSession()
      } else {
        await loginUi(cleanKey)
      }
      setStatus('signed-in')

      try {
        await refreshHealth()
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
  }, [refreshHealth])

  useEffect(() => {
    const handleUnauthorised = () => clearLocalAuthState()
    window.addEventListener('hive:unauthorised', handleUnauthorised)
    return () => window.removeEventListener('hive:unauthorised', handleUnauthorised)
  }, [clearLocalAuthState])

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      if (import.meta.env.DEV) {
        if (!getDevSession()) {
          if (!cancelled) setStatus('signed-out')
          return
        }
      } else {
        try {
          await getUiSession()
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
      setStatus('signed-in')
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
  }, [refreshHealth])

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
