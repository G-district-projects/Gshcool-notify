
// --- Simple IndexedDB wrapper for notifications ---
function saveNotification(data) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("gschools-notifs", 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore("notifs", { keyPath: "timestamp" });
    };
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction("notifs", "readwrite");
      tx.objectStore("notifs").put(data);
      tx.oncomplete = resolve;
      tx.onerror = reject;
    };
    req.onerror = reject;
  });
}

async function getAllNotifications() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("gschools-notifs", 1);
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction("notifs", "readonly");
      const store = tx.objectStore("notifs");
      const getAll = store.getAll();
      getAll.onsuccess = () => resolve(getAll.result);
      getAll.onerror = reject;
    };
    req.onerror = reject;
  });
}

// --- Handle push events ---
self.addEventListener("push", event => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || "📢 G Schools";
  const body = data.body || "No message";
  const timestamp = Date.now();
  const payload = { title, body, timestamp };

  // Show system notification
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/static/favicon.png",
      badge: "/static/favicon.png"
    })
  );

  // Save for later replay
  event.waitUntil(saveNotification(payload));

  // Send to open clients
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: "window" })
      .then(clients => {
        for (const client of clients) {
          client.postMessage({ type: "PUSH_NOTIFICATION", ...payload });
        }
      })
  );
});

// --- Notification click ---
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});

// --- On client request, replay saved notifications ---
self.addEventListener("message", event => {
  if (event.data && event.data.type === "GET_SAVED_NOTIFS") {
    getAllNotifications().then(notifs => {
      event.source.postMessage({ type: "SAVED_NOTIFS", notifs });
    });
  }
});

// --- Cleanup logic (still clears every 2h) ---
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const now = Date.now();
    const cache = await caches.open("notif-reset");
    const stored = await cache.match("lastReset");
    let lastReset = 0;

    if (stored) lastReset = parseInt(await stored.text(), 10);

    if (now - lastReset >= 7200000) {
      // Clear IndexedDB
      const req = indexedDB.deleteDatabase("gschools-notifs");
      req.onsuccess = () => console.log("🧹 Cleared saved notifs DB");

      // Tell clients to clear feed
      const clientsList = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
      for (const client of clientsList) {
        client.postMessage({ type: "CLEAR_FEED" });
      }

      await cache.put("lastReset", new Response(now.toString()));
    }
  })());
});
