self.addEventListener("push", event => {
  const data = event.data ? event.data.text() : "No data";

  // Show the system notification
  event.waitUntil(
    self.registration.showNotification("📢 G Schools", {
      body: data,
      icon: "/static/favicon.png",
      badge: "/static/favicon.png"
    })
  );

  // Also forward the notification to all open pages (for the feed)
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: "window" })
      .then(clients => {
        for (const client of clients) {
          client.postMessage({
            type: "PUSH_NOTIFICATION",
            title: "📢 G Schools",
            body: data
          });
        }
      })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      if (clients.openWindow) {
        await clients.openWindow("/");
      }
    })()
  );
});
