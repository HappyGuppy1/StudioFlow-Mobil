// Çevrimdışı açılış: uygulama dosyaları önbelleğe alınır.
// Strateji "önce ağ": bağlantı varsa her zaman güncel dosya gelir, yoksa önbellekteki açılır.
// Yalnızca aynı kökenden GET istekleri ele alınır; API çağrılarına (Gemini, aracı) dokunulmaz.
const ONBELLEK = "studioflow-mobil-v21";
const DOSYALAR = [
  "./", "index.html", "app.css", "manifest.webmanifest",
  "js/app.js", "js/ag.js", "js/dom.js", "js/ayar.js", "js/hesap.js", "js/depo.js", "js/sahne.js", "js/metin.js", "js/gorsel.js",
  "js/ses.js", "js/gemini.js", "js/cloudflare.js", "js/disa_aktar.js", "js/karisim.js", "js/hizalama.js", "js/plan.js", "js/tempo.js", "js/video_ltx.js", "js/cihaz.js",
  "js/gorunum/kutuphane.js", "js/gorunum/proje.js", "js/gorunum/ayarlar.js", "js/gorunum/api.js", "araci/kasa.js",
  "kitaplik/mp4-muxer.mjs", "ikon/ikon-180.png", "ikon/ikon-192.png", "ikon/ikon-512.png",
];

self.addEventListener("install", (olay) => {
  olay.waitUntil(caches.open(ONBELLEK).then((depo) => depo.addAll(DOSYALAR)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (olay) => {
  olay.waitUntil(
    caches.keys()
      .then((adlar) => Promise.all(adlar.filter((ad) => ad !== ONBELLEK).map((ad) => caches.delete(ad))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (olay) => {
  const istek = olay.request;
  if (istek.method !== "GET" || new URL(istek.url).origin !== self.location.origin) return;
  olay.respondWith(
    fetch(istek, { cache: "no-cache" })      // tarayıcı önbelleği güncellemeyi geciktirmesin
      .then((yanit) => {
        if (yanit.ok) {
          const kopya = yanit.clone();
          caches.open(ONBELLEK).then((depo) => depo.put(istek, kopya));
        }
        return yanit;
      })
      .catch(() => caches.match(istek, { ignoreSearch: true }).then((kayit) => kayit || caches.match("index.html"))),
  );
});
