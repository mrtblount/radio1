// Minimal service worker: enables PWA install. The app is live-audio only,
// so there is deliberately no offline caching — stale shells would mislead.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // network passthrough
});
