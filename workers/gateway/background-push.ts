// Payload-free Web Push (RFC 8030 / RFC 8292). The browser receives no
// operational data, message subjects, account identifiers or session credentials.
const encoder = new TextEncoder()
const INTERVAL = 120_000
const DEVICE_TTL = 90 * 24 * 60 * 60 * 1000
const MAX_DEVICES = 5
const MAX_ATTEMPTS = 3
const MAX_WINDOW = 24 * 60 * 60 * 1000
const OVERLAP = 5 * 60 * 1000

type Source = 'operations' | 'communications'
type PushStatus = 'registered' | 'accepted' | 'retrying' | 'delivery_failed' | 'source_unavailable'
interface KeyPair { publicKey: string; privateKey: JsonWebKey }
interface Device {
  endpoint: string
  generation: string
  registeredAt: number
  expiresAt: number
  cursor: Record<Source, number>
  seen: string[]
  attempts: number
  status: PushStatus
  lastAcceptedAt?: number
  lastTestAt?: number
}
interface PushEnv {
  PUSH_HIVE_DB?: D1Database
  PUSH_AIMS_DB?: D1Database
  HIVE_COMMS_ACTOR?: string
  HIVE_COMMS_ROLE?: string
}
interface SourceRows { source: Source; ids: string[]; cutoff: number }

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function allowedPushEndpoint(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 2048) return null
  try {
    const url = new URL(input)
    const host = url.hostname.toLowerCase()
    const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com', 'web.push.apple.com'].includes(host)
      || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com')
    if (!allowed || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || url.pathname === '/') return null
    return url.href
  } catch { return null }
}

async function deviceKey(endpoint: string): Promise<string> {
  return 'device:' + base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(endpoint))))
}

export async function generatePushKeys(): Promise<KeyPair> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const publicKey = base64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
  return { publicKey, privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey) }
}

export async function vapidAuthorization(keys: KeyPair, endpoint: string, now = Date.now()): Promise<string> {
  if (!allowedPushEndpoint(endpoint)) throw new Error('Unsupported push service')
  const key = await crypto.subtle.importKey('jwk', keys.privateKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const header = base64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = {
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 3600,
    sub: 'https://hive.jonathan-harris.online',
  }
  const body = base64url(encoder.encode(JSON.stringify(claims)))
  const token = header + '.' + body
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(token))
  return 'vapid t=' + token + '.' + base64url(new Uint8Array(signature)) + ', k=' + keys.publicKey
}

async function sendPush(keys: KeyPair, endpoint: string, topic: string): Promise<'accepted' | 'expired' | 'failed'> {
  if (!allowedPushEndpoint(endpoint)) return 'expired'
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      headers: {
        authorization: await vapidAuthorization(keys, endpoint),
        TTL: '300',
        Urgency: 'high',
        Topic: topic,
      },
    })
    await response.body?.cancel()
    if (response.status === 404 || response.status === 410) return 'expired'
    return response.ok ? 'accepted' : 'failed'
  } catch { return 'failed' }
}

// Only IDs and timestamps are read. Match the AIMS verified owner system inbox
// while keeping other actors' private notifications excluded.
export async function readAlertSource(env: PushEnv, source: Source, after: number, cutoff: number): Promise<SourceRows> {
  const db = source === 'operations' ? env.PUSH_HIVE_DB : env.PUSH_AIMS_DB
  if (!db) throw new Error('Alert source unavailable')
  const start = new Date(after).toISOString()
  const end = new Date(cutoff).toISOString()
  const actor = env.HIVE_COMMS_ACTOR?.trim() || 'hive-owner'
  const includeOwnerSystem = actor === 'hive-owner' && env.HIVE_COMMS_ROLE?.trim().toLowerCase() === 'admin'
  const recipient = includeOwnerSystem
    ? `(actor = ? OR (actor = 'admin' AND type IN (
        'system','failure','human_handoff_requested','human_callback','content_quality_review','sla_warning','sla_breach','escalation'
      )))`
    : 'actor = ?'
  const query = source === 'operations' ? `
    SELECT id, created_at FROM hive_ecosystem_metadata
    WHERE lane = 'ops_events' AND created_at >= ?
      AND julianday(created_at) >= julianday(?) AND julianday(created_at) <= julianday(?)
      AND CASE WHEN json_valid(metadata_json) THEN
        json_extract(metadata_json,'$.severity') = 'critical'
        OR lower(source_type) IN ('review_required','service_blocked')
        OR json_extract(metadata_json,'$.details.requires_action') = 1 ELSE 0 END
    ORDER BY created_at DESC, id DESC LIMIT 100
  ` : `
    SELECT id, created_at FROM comms_hub_notifications
    WHERE ${recipient} AND status = 'unread' AND created_at >= ?
      AND julianday(created_at) >= julianday(?) AND julianday(created_at) <= julianday(?)
      AND (severity = 'critical' OR instr(lower(type),'urgent') > 0 OR instr(lower(type),'review') > 0
        OR CASE WHEN json_valid(metadata_json) THEN json_extract(metadata_json,'$.requires_action') = 1 ELSE 0 END)
    ORDER BY created_at DESC, id DESC LIMIT 100
  `
  const args = [start.slice(0, 19), start, end]
  const params = source === 'operations' ? args : [actor, ...args]
  const result = await db.prepare(query).bind(...params).all<{ id: string; created_at: string }>()
  if (!result.success) throw new Error('Alert source unavailable')
  return { source, ids: result.results.map(row => source + ':' + row.id), cutoff }
}

function reply(data: Record<string, unknown>, status = 200): Response {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } })
}

export class NotificationPushHub {
  constructor(private readonly state: DurableObjectState, private readonly env: PushEnv) {}

  private async keys(): Promise<KeyPair> {
    return this.state.blockConcurrencyWhile(async () => {
      const saved = await this.state.storage.get<KeyPair>('vapid')
      if (saved) return saved
      const keys = await generatePushKeys()
      await this.state.storage.put('vapid', keys)
      return keys
    })
  }

  private async activeDevices(now: number): Promise<Map<string, Device>> {
    const devices = await this.state.storage.list<Device>({ prefix: 'device:' })
    for (const [key, device] of devices) {
      if (device.expiresAt <= now) {
        await this.state.storage.delete(key)
        devices.delete(key)
      }
    }
    return devices
  }

  private async schedule(): Promise<void> {
    if ((await this.activeDevices(Date.now())).size) {
      if (await this.state.storage.getAlarm() === null) await this.state.storage.setAlarm(Date.now() + INTERVAL)
    } else await this.state.storage.deleteAlarm()
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname
    if (!this.env.PUSH_HIVE_DB || !this.env.PUSH_AIMS_DB) return reply({ ok: false, detail: 'Alert sources unavailable.' }, 503)
    if (path === '/key' && request.method === 'GET') return reply({ ok: true, publicKey: (await this.keys()).publicKey })
    if (path === '/devices' && request.method === 'DELETE') {
      const devices = await this.activeDevices(Date.now())
      for (const key of devices.keys()) await this.state.storage.delete(key)
      await this.state.storage.deleteAlarm()
      return reply({ ok: true })
    }
    if (request.method !== 'POST' || !['/register', '/status', '/revoke', '/test'].includes(path)) {
      return reply({ ok: false, detail: 'Unknown notification operation.' }, 404)
    }
    const body = await request.text()
    if (body.length > 4096) return reply({ ok: false, detail: 'Invalid notification request.' }, 400)
    let input: { endpoint?: unknown }
    try { input = JSON.parse(body) } catch { return reply({ ok: false, detail: 'Invalid notification request.' }, 400) }
    const endpoint = allowedPushEndpoint(input?.endpoint)
    if (!endpoint) return reply({ ok: false, detail: 'Unsupported browser push endpoint.' }, 400)
    const key = await deviceKey(endpoint)
    const now = Date.now()
    let device = await this.state.storage.get<Device>(key)
    if (device && device.expiresAt <= now) {
      await this.state.storage.delete(key)
      device = undefined
    }
    if (path === '/revoke') {
      await this.state.storage.delete(key)
      await this.schedule()
      return reply({ ok: true, registered: false })
    }
    if (path === '/register') {
      if (!device && (await this.activeDevices(now)).size >= MAX_DEVICES) {
        return reply({ ok: false, detail: 'Device limit reached. Revoke an old registration first.' }, 409)
      }
      const next: Device = device ? { ...device, expiresAt: now + DEVICE_TTL } : {
        endpoint, generation: crypto.randomUUID(), registeredAt: now, expiresAt: now + DEVICE_TTL,
        cursor: { operations: now, communications: now }, seen: [], attempts: 0, status: 'registered',
      }
      await this.state.storage.put(key, next)
      await this.schedule()
      return reply({ ok: true, registered: true, expiresAt: next.expiresAt })
    }
    if (!device) return reply({ ok: true, registered: false })
    if (path === '/test') {
      if (device.lastTestAt && now - device.lastTestAt < 60_000) return reply({ ok: false, detail: 'Wait before sending another test.' }, 429)
      device = { ...device, lastTestAt: now }
      await this.state.storage.put(key, device)
      const result = await sendPush(await this.keys(), endpoint, 'hive-device-test')
      const current = await this.state.storage.get<Device>(key)
      if (current?.generation === device.generation) {
        if (result === 'expired') await this.state.storage.delete(key)
        else await this.state.storage.put(key, {
          ...current, status: result === 'accepted' ? 'accepted' : 'delivery_failed',
          ...(result === 'accepted' ? { lastAcceptedAt: now } : {}),
        })
      }
      await this.schedule()
      return reply({ ok: result === 'accepted', accepted: result === 'accepted', registered: result !== 'expired' }, result === 'accepted' ? 200 : 502)
    }
    return reply({
      ok: true, registered: true, expiresAt: device.expiresAt,
      status: device.status, lastAcceptedAt: device.lastAcceptedAt ?? null,
    })
  }

  async alarm(): Promise<void> {
    const now = Date.now()
    try {
      const devices = await this.activeDevices(now)
      if (!devices.size) return
      const keys = await this.keys()
      for (const [key, device] of devices) {
        await this.processDevice(key, device, keys, now)
      }
    } finally {
      // Never extend an interactive HIVE/AIMS session or wake either backend.
      if ((await this.activeDevices(Date.now())).size) await this.state.storage.setAlarm(Date.now() + INTERVAL)
      else await this.state.storage.deleteAlarm()
    }
  }

  private async processDevice(key: string, device: Device, keys: KeyPair, now: number): Promise<void> {
    const sources: Source[] = ['operations', 'communications']
    const results = await Promise.allSettled(sources.map(source => readAlertSource(
      this.env, source, Math.max(device.registeredAt, now - MAX_WINDOW, device.cursor[source] - OVERLAP), now,
    )))
    const snapshots = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
    const ids = [...new Set(snapshots.flatMap(result => result.ids))]
    const fresh = ids.filter(id => !device.seen.includes(id))
    const current = await this.state.storage.get<Device>(key)
    if (!current || current.generation !== device.generation) return
    let next: Device = { ...current }
    if (snapshots.length < sources.length) next.status = 'source_unavailable'
    else if (next.status === 'source_unavailable') next.status = next.lastAcceptedAt ? 'accepted' : 'registered'
    const advance = () => {
      for (const snapshot of snapshots) next.cursor[snapshot.source] = snapshot.cutoff
      next.seen = [...new Set([...next.seen, ...ids])].slice(-400)
      next.attempts = 0
    }
    if (!fresh.length) advance()
    else {
      // Coalesce attention alerts within the interval; stable topic suppresses
      // queued duplicates during retry. No event details enter the push service.
      const topic = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(fresh.sort().join('\n'))))).slice(0, 32)
      const outcome = await sendPush(keys, device.endpoint, topic)
      if (outcome === 'expired') {
        const latest = await this.state.storage.get<Device>(key)
        if (latest?.generation === device.generation) await this.state.storage.delete(key)
        return
      }
      if (outcome === 'accepted') {
        next.status = 'accepted'
        next.lastAcceptedAt = now
        advance()
      } else {
        next.attempts += 1
        next.status = next.attempts >= MAX_ATTEMPTS ? 'delivery_failed' : 'retrying'
        if (next.attempts >= MAX_ATTEMPTS) advance()
      }
    }
    const latest = await this.state.storage.get<Device>(key)
    if (latest?.generation === device.generation) {
      // Preserve a concurrent user renewal or test, and never resurrect revocation.
      next = { ...next, expiresAt: latest.expiresAt, lastTestAt: latest.lastTestAt }
      await this.state.storage.put(key, next)
    }
  }
}
