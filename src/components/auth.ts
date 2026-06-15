/**
 * Auth store — in-memory token management.
 * Token is entered once per session, never persisted to localStorage
 * (HIVE is a personal tool on a private device; session-only is sufficient).
 */

type Listener = () => void

let _token = ''
let _isValid = false
const _listeners = new Set<Listener>()

function notify() {
  _listeners.forEach(l => l())
}

export const authStore = {
  getToken(): string {
    return _token
  },

  getIsValid(): boolean {
    return _isValid
  },

  setToken(token: string) {
    _token = token.trim()
    _isValid = false // validated on first request
    notify()
  },

  setValid(valid: boolean) {
    _isValid = valid
    notify()
  },

  clear() {
    _token = ''
    _isValid = false
    notify()
  },

  subscribe(listener: Listener): () => void {
    _listeners.add(listener)
    return () => _listeners.delete(listener)
  },

  hasToken(): boolean {
    return _token.length > 0
  },
}
