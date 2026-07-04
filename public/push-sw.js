/* Push-Handler — wird per workbox.importScripts in den generierten Service Worker geladen. */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'QuizWise', {
      body: data.body || 'Zeit für eine kurze Lernsession.',
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      data: { url: data.url || '/' },
      tag: 'quizwise-reminder',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => 'focus' in w);
      if (existing) { existing.navigate(url); return existing.focus(); }
      return clients.openWindow(url);
    })
  );
});
