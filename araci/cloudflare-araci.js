// StudioFlow Mobil · Cloudflare aracısı (Worker)
//
// Neden gerekli: api.cloudflare.com tarayıcıdan gelen isteklere (CORS) izin vermez.
// Bu küçük Worker, telefondaki uygulamanın Workers AI isteğini Cloudflare API'sine
// aynen iletir ve yanıta CORS başlıklarını ekler. Token'ı saklamaz, kaydetmez;
// yalnızca görsel üretim yoluna (/ai/run/@cf/…) ve izinli kökenlere açıktır.
//
// Kurulum (ücretsiz, bir kez):
//   1. dash.cloudflare.com › Workers & Pages › Create › Worker › "Hello World" ile oluştur.
//   2. "Edit code" ile bu dosyanın tamamını yapıştır, Deploy'a bas.
//   3. Verilen adresi (https://<ad>.<hesap>.workers.dev) uygulamadaki
//      Bağlantılar › Aracı adresi alanına yaz.
//
// Uygulamayı başka bir adreste yayınlıyorsan o kökeni aşağıdaki listeye ekle.

const IZINLI_KOKENLER = ["https://happyguppy1.github.io"];
const YEREL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const IZINLI_YOL = /^\/client\/v4\/accounts\/[0-9a-f]{32}\/ai\/run\/@cf\/[\w.\-]+\/[\w.\-]+$/;

export default {
  async fetch(istek) {
    const koken = istek.headers.get("Origin") || "";
    if (!IZINLI_KOKENLER.includes(koken) && !YEREL.test(koken)) {
      return new Response("Bu kökene izin yok.", { status: 403 });
    }
    const cors = {
      "Access-Control-Allow-Origin": koken,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    if (istek.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const yol = new URL(istek.url).pathname;
    if (istek.method !== "POST" || !IZINLI_YOL.test(yol)) {
      return new Response("Yalnızca Workers AI üretim isteği iletilir.", { status: 404, headers: cors });
    }
    const basliklar = { Authorization: istek.headers.get("Authorization") || "" };
    const tur = istek.headers.get("Content-Type");
    if (tur) basliklar["Content-Type"] = tur;
    const yanit = await fetch("https://api.cloudflare.com" + yol, {
      method: "POST", headers: basliklar, body: await istek.arrayBuffer(),
    });
    return new Response(yanit.body, {
      status: yanit.status,
      headers: { ...cors, "Content-Type": yanit.headers.get("Content-Type") || "application/json" },
    });
  },
};
