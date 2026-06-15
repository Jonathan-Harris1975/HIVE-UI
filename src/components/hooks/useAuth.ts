import { useState, useEffect, useCallback } from 'react'
import { authStore } from '@/store/auth'
import { health } from '@/api/hive'

export function useAuth() {
  const [token, setToken] = useState(authStore.getToken())
  const [isValid, setIsValid] = useState(authStore.getIsValid())
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    return authStore.subscribe(() => {
      setToken(authStore.getToken())
      setIsValid(authStore.getIsValid())
    })
  }, [])

  const submit = useCallback(async (raw: string) => {
    authStore.setToken(raw)
    if (!raw.trim()) return
    setChecking(true)
    try {
      await health.ping()
      authStore.setValid(true)
    } catch {
      authStore.setValid(false)
    } finally {
      setChecking(false)
    }
  }, [])

  const clear = useCallback(() => {
    authStore.clear()
  }, [])

  return { token, isValid, checking, hasToken: authStore.hasToken(), submit, clear }
}
