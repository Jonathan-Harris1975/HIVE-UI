const ACCESS_KEY_STORAGE = 'hive-ui-access-key'

export function getAccessKey(): string {
  return sessionStorage.getItem(ACCESS_KEY_STORAGE) ?? ''
}

export function setAccessKey(value: string): void {
  sessionStorage.setItem(ACCESS_KEY_STORAGE, value.trim())
}

export function clearAccessKey(): void {
  sessionStorage.removeItem(ACCESS_KEY_STORAGE)
}
