// TalentClip Service Worker — Cache + Background Notifications

const CACHE = 'talentclip-v2';
const OFFLINE_PAGE = 'index.html';

// ── Install: cache the app shell ──────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([OFFLINE_PAGE, 'manifest.json']))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache, fall back to network ─────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('firestore') || e.request.url.includes('cloudinary')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});

// ── Background notifications ───────────────────────────────────
const REMINDER_MESSAGES = [
  { title: '🔥 TalentClip is waiting!', body: "Your feed is heating up — come see what's trending in Zambia right now!" },
  { title: '🎬 Don\'t miss out!', body: "Creators are posting fresh content. Tap to keep inspiring and be inspired!" },
  { title: '🌟 Zambia\'s talent is live!', body: "New videos just dropped. Come show some love and get discovered!" },
  { title: '💫 Your fans miss you!', body: "It's been a while — your followers are waiting. Come post something epic!" },
  { title: '🚀 TalentClip is poppin\'!', body: "Big things are happening on TalentClip. Don't be the last to see it!" },
  { title: '🎤 Inspire the world today!', body: "Show your talent — someone out there needs to see exactly what you've got!" },
];

let _notifInterval = null;

function sendReminderNotif() {
  self.clients.matchAll().then(clients => {
    // Only notify if no window is visible
    const anyVisible = clients.some(c => c.visibilityState === 'visible');
    if (anyVisible) return;

    const msg = REMINDER_MESSAGES[Math.floor(Math.random() * REMINDER_MESSAGES.length)];
    self.registration.showNotification(msg.title, {
      body: msg.body,
      icon: 'icon-192.png',
      badge: 'icon-96.png',
      tag: 'talentclip-reminder',
      renotify: true,
      vibrate: [200, 100, 200],
      actions: [
        { action: 'open', title: '🔥 Open TalentClip' },
        { action: 'dismiss', title: 'Later' }
      ],
      data: { url: '/' }
    });
  });
}

// Start periodic notifications (every 3 hours when app is closed)
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') { self.skipWaiting(); return; }

  if (e.data?.type === 'START_PERIODIC_NOTIF') {
    if (_notifInterval) clearInterval(_notifInterval);
    // First reminder after 2 hours, then every 3 hours
    _notifInterval = setInterval(sendReminderNotif, 3 * 60 * 60 * 1000);
    console.log('[SW] Periodic notifications started');
  }

  if (e.data?.type === 'SEND_NOTIF') {
    // Immediate notification request from app (new video, follow, like)
    const { title, body, icon, tag } = e.data;
    self.registration.showNotification(title, {
      body, icon: icon || 'icon-192.png', badge: 'icon-96.png',
      tag: tag || 'talentclip-notif', renotify: true,
      vibrate: [150, 50, 150],
      data: { url: '/' }
    });
  }
});

// Notification click — open the app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow(e.notification.data?.url || '/');
    })
  );
});
