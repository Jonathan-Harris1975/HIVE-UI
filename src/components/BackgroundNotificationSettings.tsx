import { useState } from 'react'
import { apiFetch } from '../lib/api'

const PATH = '/v1/system/background-push'
type DeviceStatus = { ok: boolean; registered?: boolean; publicKey?: string; expiresAt?: number; status?: string; accepted?: boolean }

function supportsPush() {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const worker = await navigator.serviceWorker.register('/notification-worker.js')
  if (worker.active) return worker
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Notification worker did not become ready.')), 15000) }),
    ])
  } finally { clearTimeout(timer) }
}

async function currentSubscription() {
  const worker = await navigator.serviceWorker.getRegistration()
  return worker ? worker.pushManager.getSubscription() : null
}

function deviceRequest(action: string, endpoint: string) {
  return apiFetch<DeviceStatus>(PATH + '/' + action, { method: 'POST', body: JSON.stringify({ endpoint }) })
}

function applicationKey(key: string) {
  return Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))
}

export function BackgroundNotificationSettings() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmAll, setConfirmAll] = useState(false)

  async function act(action: 'enable' | 'status' | 'test' | 'revoke' | 'all') {
    setBusy(true)
    setMessage('')
    try {
      if (action === 'all') {
        await apiFetch(PATH + '/devices', { method: 'DELETE' })
        if (supportsPush()) await (await currentSubscription())?.unsubscribe()
        setConfirmAll(false)
        setMessage('All registered devices revoked.')
        return
      }
      if (!supportsPush()) throw new Error('Background notifications are not supported by this browser.')
      if (action === 'enable') {
        if (await Notification.requestPermission() !== 'granted') throw new Error('Notification permission was not granted.')
        const key = await apiFetch<DeviceStatus>(PATH + '/key')
        if (!key.publicKey) throw new Error('Background notification service unavailable.')
        const worker = await registration()
        const existing = await worker.pushManager.getSubscription()
        const subscription = existing || await worker.pushManager.subscribe({
          userVisibleOnly: true, applicationServerKey: applicationKey(key.publicKey),
        })
        try {
          const result = await deviceRequest('register', subscription.endpoint)
          if (!result.registered) throw new Error('Device registration not confirmed.')
          setMessage('Device registered. Use Send background test to verify delivery.')
        } catch (error) {
          if (!existing) await subscription.unsubscribe()
          throw error
        }
        return
      }
      const subscription = await currentSubscription()
      if (!subscription) {
        setMessage('This browser has no background notification subscription.')
        return
      }
      if (action === 'revoke') {
        await deviceRequest('revoke', subscription.endpoint)
        await subscription.unsubscribe()
        setMessage('Background notifications disabled on this device.')
      } else {
        const result = await deviceRequest(action, subscription.endpoint)
        if (!result.registered) setMessage('Device registration expired or revoked. Enable again to renew.')
        else if (action === 'test') {
          setMessage(result.accepted ? 'Test accepted by push provider. Confirm that the device notification appears and sounds.' : 'Test delivery failed.')
        } else {
          const expiry = result.expiresAt ? new Date(result.expiresAt).toLocaleDateString('en-GB') : 'unknown'
          setMessage('Registered until ' + expiry + '. Delivery status: ' + (result.status || 'unknown').replace(/_/g, ' ') + '.')
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Background notification request failed.')
    } finally { setBusy(false) }
  }

  const button = 'min-h-11 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/5 disabled:opacity-50'

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <h3 className="text-sm font-semibold text-white">Background notifications</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        Opt in on a trusted device to receive critical and review alerts even after sign-out.
        Alerts contain no private content and use your device notification sound. Registration expires after 90 days.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={button} disabled={busy} onClick={() => void act('enable')}>Enable or renew on this device</button>
        <button className={button} disabled={busy} onClick={() => void act('status')}>Check device status</button>
        <button className={button} disabled={busy} onClick={() => void act('test')}>Send background test</button>
        <button className={button} disabled={busy} onClick={() => void act('revoke')}>Disable on this device</button>
        <button className={button} disabled={busy} onClick={() => setConfirmAll(true)}>Revoke all devices</button>
      </div>
      {confirmAll && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-300">Stop background alerts on every registered device?</span>
          <button className={button} disabled={busy} onClick={() => void act('all')}>Confirm revocation</button>
          <button className={button} disabled={busy} onClick={() => setConfirmAll(false)}>Cancel</button>
        </div>
      )}
      {message && <p role="status" className="mt-2 text-xs text-slate-300">{message}</p>}
    </div>
  )
}
