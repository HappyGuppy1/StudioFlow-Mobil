// StudioFlow Mobil · KASA (Cloudflare Worker)
//
// Ne işe yarar: API anahtarların telefonda değil, senin Cloudflare hesabındaki bu Worker'da durur.
// Telefondaki uygulama yalnızca kasa parolasını bilir; isteği kasaya gönderir, kasa doğru hesabın
// anahtarını ekleyip servise (Gemini, Cloudflare Workers AI, Hugging Face) iletir. Anahtarlar
// hiçbir yanıtta geri dönmez; telefon yalnızca hesap ADLARINI görür.
//
// Kasa yalnızca aşağıdaki dört işi yapar, başka hiçbir adrese istek iletmez:
//   · Gemini      : metin ve seslendirme (generateContent, interactions)
//   · Cloudflare  : Workers AI model çalıştırma (görsel)
//   · Hugging Face: bir Space'in Gradio API'si (görselden video)
//   · Hesap adlarının listesi
//
// Kurulum: dash.cloudflare.com › Workers & Pages › Create › Worker › bu dosyayı yapıştır › Deploy.
// Sonra Settings › Variables and Secrets bölümüne şunları "Secret" türünde ekle:
//   KASA_PAROLA          uzun, rastgele bir parola (uygulamadaki Ayarlar › Kasa'ya da girilir)
//   GEMINI_HESAPLAR      her satır:  ad = anahtar
//   CLOUDFLARE_HESAPLAR  her satır:  ad = account_id token
//   HF_HESAPLAR          her satır:  ad = token
// Bir değişken en fazla 5 KB olabilir; sığmazsa devamını GEMINI_HESAPLAR_2 gibi adlarla ekle
// (aynı önekle başlayan bütün değişkenler okunur).
//
// Uygulamayı başka bir adreste yayınlıyorsan o kökeni aşağıdaki listeye ekle.

const IZINLI_KOKENLER = ["https://happyguppy1.github.io"];
const YEREL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const ONEKLER = { gemini: "GEMINI_HESAPLAR", cloudflare: "CLOUDFLARE_HESAPLAR", huggingface: "HF_HESAPLAR" };

/** `ad = değer` satırlarını okur; aynı önekle başlayan bütün değişkenler birleştirilir. */
function hesaplar(env, hizmet) {
  const liste = new Map();
  for (const [degisken, metin] of Object.entries(env)) {
    if (!degisken.startsWith(ONEKLER[hizmet]) || typeof metin !== "string") continue;
    for (const satir of metin.split(/\r?\n/)) {
      const s = satir.trim();
      const esit = s.indexOf("=");
      if (!s || s.startsWith("#") || esit < 1) continue;
      liste.set(s.slice(0, esit).trim(), s.slice(esit + 1).trim());
    }
  }
  return liste;
}

/** Sabit zamanlı karşılaştırma: parolanın ne kadarının tuttuğu yanıt süresinden anlaşılmasın. */
async function ayniMi(a, b) {
  const kod = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", kod.encode(a)), crypto.subtle.digest("SHA-256", kod.encode(b))]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let fark = 0;
  for (let i = 0; i < u.length; i++) fark |= u[i] ^ v[i];
  return fark === 0;
}

export default {
  async fetch(istek, env) {
    const koken = istek.headers.get("Origin") || "";
    if (!IZINLI_KOKENLER.includes(koken) && !YEREL.test(koken)) return new Response("Bu kökene izin yok.", { status: 403 });
    const cors = {
      "Access-Control-Allow-Origin": koken,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Kasa-Hesap",
      "Access-Control-Expose-Headers": "X-Kasa-Hata",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    // Kasanın kendi hataları `X-Kasa-Hata` başlığı taşır; uygulama bunları servis hatasından ayırır.
    const hata = (durum, mesaj) => new Response(JSON.stringify({ hata: mesaj }), {
      status: durum, headers: { ...cors, "Content-Type": "application/json", "X-Kasa-Hata": "1" } });
    if (istek.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (!env.KASA_PAROLA || env.KASA_PAROLA.length < 16) return hata(500, "Kasa kurulmamış: KASA_PAROLA (en az 16 karakter) tanımlı değil.");
    const verilen = (istek.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!(await ayniMi(verilen, env.KASA_PAROLA))) {
      await new Promise((coz) => setTimeout(coz, 800));       // parola denemelerini yavaşlat
      return hata(401, "Kasa parolası yanlış.");
    }

    const url = new URL(istek.url);
    const yol = url.pathname;
    if (istek.method === "GET" && yol === "/hesaplar") {
      const adlar = Object.fromEntries(Object.keys(ONEKLER).map((h) => [h, [...hesaplar(env, h).keys()]]));
      return new Response(JSON.stringify(adlar), { headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }

    // Yol → hizmet ve hedef adres. Buradaki kalıplara uymayan hiçbir istek iletilmez.
    let hizmet, hedef, es;
    if (istek.method === "POST" && (es = /^\/gemini(\/v1beta\/(?:models\/[\w.\-]+:generateContent|interactions))$/.exec(yol))) {
      hizmet = "gemini";
      hedef = "https://generativelanguage.googleapis.com" + es[1];
    } else if (istek.method === "POST" && (es = /^\/cloudflare\/ai\/run\/(@cf\/[\w.\-]+\/[\w.\-]+)$/.exec(yol))) {
      hizmet = "cloudflare";
      hedef = es[1];
    } else if ((istek.method === "GET" || istek.method === "POST")
               && (es = /^\/hf\/([a-z0-9][a-z0-9\-]*)(\/gradio_api\/(?:info|upload|call\/[\w\-]+(?:\/[\w\-]+)?|file=[^?#]+))$/.exec(yol))) {
      hizmet = "huggingface";
      hedef = `https://${es[1]}.hf.space${es[2]}${url.search}`;
    } else {
      return hata(404, "Kasa bu isteği iletmez.");
    }

    let ad;
    try { ad = decodeURIComponent(istek.headers.get("X-Kasa-Hesap") || ""); } catch { ad = ""; }
    const deger = hesaplar(env, hizmet).get(ad);
    if (!deger) return hata(404, `Kasada '${ad}' adlı ${hizmet} hesabı yok.`);

    const basliklar = {};
    const tur = istek.headers.get("Content-Type");
    if (tur) basliklar["Content-Type"] = tur;
    if (hizmet === "gemini") {
      basliklar["x-goog-api-key"] = deger;
    } else if (hizmet === "cloudflare") {
      const [kimlik, token] = deger.split(/\s+/);
      if (!/^[0-9a-f]{32}$/.test(kimlik || "") || !token) return hata(500, `Kasadaki '${ad}' Cloudflare kaydı hatalı (biçim: account_id token).`);
      hedef = `https://api.cloudflare.com/client/v4/accounts/${kimlik}/ai/run/${hedef}`;
      basliklar.Authorization = `Bearer ${token}`;
    } else {
      basliklar.Authorization = `Bearer ${deger}`;
    }

    let yanit;
    try {
      yanit = await fetch(hedef, { method: istek.method, headers: basliklar,
                                   body: istek.method === "POST" ? await istek.arrayBuffer() : undefined });
    } catch {
      return hata(502, "Kasa servise ulaşamadı.");
    }
    // Gövde olduğu gibi (akış olarak) aktarılır; servis başlıkları kopyalanmaz.
    return new Response(yanit.body, {
      status: yanit.status,
      headers: { ...cors, "Content-Type": yanit.headers.get("Content-Type") || "application/octet-stream", "Cache-Control": "no-store" },
    });
  },
};
