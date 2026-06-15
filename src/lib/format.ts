export function formatDate(value?: string | null): string {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatBytes(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return 'Unknown size'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size >= 10 || index === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`
}

export function formatCost(value?: number | string | null): string {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (parsed == null || Number.isNaN(parsed)) return '$0.0000'
  return `$${parsed.toFixed(4)}`
}

export function titleFromMessage(message: string): string {
  const clean = message.replace(/\s+/g, ' ').trim()
  if (clean.length <= 54) return clean || 'New conversation'
  return `${clean.slice(0, 53).trim()}…`
}
