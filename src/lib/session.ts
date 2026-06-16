const DEV_SESSION_STORAGE = 'hive-ui-dev-session'

export function getDevSession(): boolean {
  return sessionStorage.getItem(DEV_SESSION_STORAGE) === '1'
}

export function setDevSession(): void {
  sessionStorage.setItem(DEV_SESSION_STORAGE, '1')
}

export function clearDevSession(): void {
  sessionStorage.removeItem(DEV_SESSION_STORAGE)
}
