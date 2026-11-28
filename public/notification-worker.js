/* Notification-only worker: no fetch interception, caching, credentials or background polling. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = event.notification.data?.workspace === 'communications' ? '/communications' : '/ops'
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
