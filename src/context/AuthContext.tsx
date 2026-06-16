import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { apiFetch } from '../lib/api'
import { clearAccessKey, getAccessKey, setAccessKey } from '../lib/session'
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

  const logout = useCallback(() => {
    clearAccessKey()
    setHealth(null)
    setError(null)
    setStatus('signed-out')
  }, [])

  const refreshHealth = useCallback(async () => {
    const result = await apiFetch<HealthResponse>('/health')
    setHealth(result)
  }, [])

  const login = useCallback(async (accessKey: string) => {
    const cleanKey = accessKey.trim()
    if (!cleanKey) throw new Error('Enter the HIVE UI access key.')
    setAccessKey(cleanKey)
    setError(null)
    try {
      const result = await apiFetch<HealthResponse>('/health')
      setHealth(result)
      setStatus('signed-in')
    } catch (caught) {
      clearAccessKey()
      const message = caught instanceof Error ? caught.message : 'HIVE could not be reached.'
      setError(message)
      setStatus('signed-out')
      throw caught
    }
  }, [])

  useEffect(() => {
    const handleUnauthorised = () => logout()
    window.addEventListener('hive:unauthorised', handleUnauthorised)
    return () => window.removeEventListener('hive:unauthorised', handleUnauthorised)
  }, [logout])

  useEffect(() => {
    if (!getAccessKey()) {
      setStatus('signed-out')
      return
    }
    void refreshHealth()
      .then(() => setStatus('signed-in'))
      .catch((caught: unknown) => {
        clearAccessKey()
        setError(caught instanceof Error ? caught.message : 'HIVE could not be reached.')
        setStatus('signed-out')
      })
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
