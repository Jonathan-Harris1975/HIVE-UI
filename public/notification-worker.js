/* Notification-only worker: no fetch interception, caching or credentials. */
self.addEventListener('push', (event) => {
  // A payload-free push contains no private content and cannot supply a URL.
  event.waitUntil(self.registration.showNotification('HIVE', {
    body: 'An update needs your attention. Open HIVE to review it.',
    tag: 'hive-background-attention', renotify: true,
    data: { workspace: 'overview' },
  }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const workspace = event.notification.data?.workspace
  const path = workspace === 'communications' ? '/communications' : workspace === 'overview' ? '/overview' : '/ops'
  const target = new URL(path, self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find((client) => client.url === target)
    if (existing) {
      await existing.focus()
      return
    }
    await self.clients.openWindow(target)
  })())
})
