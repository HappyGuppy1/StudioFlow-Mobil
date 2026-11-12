// StudioFlow Mobil · KASA (Cloudflare Worker)
//
// API anahtarların telefonda değil, senin Cloudflare hesabındaki bu Worker'da durur. Telefondaki
// uygulama yalnızca kasa parolasını bilir; isteği kasaya gönderir, kasa doğru hesabın anahtarını
// ekleyip servise (Gemini, Cloudflare Workers AI, Hugging Face) iletir. Anahtarlar hiçbir yanıtta
// geri dönmez; telefon yalnızca hesap ADLARINI görür.
//
// Kasa yalnızca şu işleri yapar, başka hiçbir adrese istek iletmez:
//   · Gemini      : metin ve seslendirme (generateContent, interactions)
//   · Cloudflare  : Workers AI model çalıştırma (görsel)
//   · Hugging Face: bir Space'in Gradio API'si (görselden video)
//   · Hesap ekleme, silme ve hesap adlarının listesi
//
// Kurulum uygulamanın API › Kasa sayfasında adım adım anlatılır. Özet:
//   1. Bu dosyayı bir Worker'a yapıştır.
//   2. Bir KV depolaması oluştur ve Worker'a DEPO adıyla bağla (hesaplar buraya yazılır).
//   3. KASA_PAROLA adında bir Secret ekle (en az 16 karakter).
//
// Uygulamayı başka bir adreste yayınlıyorsan o kökeni aşağıdaki listeye ekle.

const IZINLI_KOKENLER = ["https://happyguppy1.github.io"];
const YEREL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const HIZMETLER = ["gemini", "cloudflare", "huggingface"];
// Eski kurulum: hesaplar Secret olarak eklenmişti (her satır `ad = değer`). İlk kayıtta depoya taşınır.
const ESKI_ONEK = { gemini: "GEMINI_HESAPLAR", cloudflare: "CLOUDFLARE_HESAPLAR", huggingface: "HF_HESAPLAR" };

function eskiHesaplar(env, hizmet) {
  const liste = {};
  for (const [degisken, metin] of Object.entries(env)) {
    if (!degisken.startsWith(ESKI_ONEK[hizmet]) || typeof metin !== "string") continue;
    for (const satir of metin.split(/\r?\n/)) {
      const s = satir.trim();
      const esit = s.indexOf("=");
      if (!s || s.startsWith("#") || esit < 1) continue;
      liste[s.slice(0, esit).trim()] = s.slice(esit + 1).trim();
    }
  }
  return liste;
}

/** Servisin hesapları: `{ ad: değer }`. Depo bağlıysa oradan, taşınmamış eski kayıtlar varsa onlarla birlikte. */
async function hesaplar(env, hizmet) {
  if (!env.DEPO) return eskiHesaplar(env, hizmet);
  const [tasindi, kayit] = await Promise.all([env.DEPO.get("tasindi"), env.DEPO.get("hesaplar:" + hizmet, "json")]);
  return { ...(tasindi ? {} : eskiHesaplar(env, hizmet)), ...(kayit || {}) };
}

/** Eski (Secret) hesapları bir kez depoya kopyalar; sonrasında yalnızca depo geçerlidir. */
async function tasi(env) {
  if (await env.DEPO.get("tasindi")) return;
  for (const hizmet of HIZMETLER) {
    const eski = eskiHesaplar(env, hizmet);
    if (!Object.keys(eski).length) continue;
    const kayit = (await env.DEPO.get("hesaplar:" + hizmet, "json")) || {};
    await env.DEPO.put("hesaplar:" + hizmet, JSON.stringify({ ...eski, ...kayit }));
  }
  await env.DEPO.put("tasindi", "1");
}

/** Anahtarı servise sorar: geçerliyse `null`, değilse hata metni. */
async function dogrula(hizmet, deger) {
  let yanit;
  try {
    if (hizmet === "gemini") {
      yanit = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { headers: { "x-goog-api-key": deger } });
    } else if (hizmet === "huggingface") {
      yanit = await fetch("https://huggingface.co/api/whoami-v2", { headers: { Authorization: `Bearer ${deger}` } });
    } else {
      const [kimlik, token] = deger.split(/\s+/);
      yanit = await fetch(`https://api.cloudflare.com/client/v4/accounts/${kimlik}/ai/models/search?per_page=1`, { headers: { Authorization: `Bearer ${token}` } });
    }
  } catch {
    return "Servise ulaşılamadı; biraz sonra yeniden dene.";
  }
  if (yanit.ok || yanit.status === 429) return null;       // 429: anahtar geçerli, kota dolu
  return `Servis bu anahtarı kabul etmedi (HTTP ${yanit.status}). Anahtarı ve izinlerini denetle.`;
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
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Kasa-Hesap",
      "Access-Control-Expose-Headers": "X-Kasa-Hata",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    const json = (govde, durum = 200, ek = {}) => new Response(JSON.stringify(govde), {
      status: durum, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store", ...ek } });
    // Kasanın kendi hataları `X-Kasa-Hata` başlığı taşır; uygulama bunları servis hatasından ayırır.
    const hata = (durum, mesaj) => json({ hata: mesaj }, durum, { "X-Kasa-Hata": "1" });
    if (istek.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (!env.KASA_PAROLA || env.KASA_PAROLA.length < 16) return hata(500, "Kasa parolası eklenmemiş: KASA_PAROLA adında, en az 16 karakterlik bir Secret ekle.");
    const verilen = (istek.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!(await ayniMi(verilen, env.KASA_PAROLA))) {
      await new Promise((coz) => setTimeout(coz, 800));       // parola denemelerini yavaşlat
      return hata(401, "Kasa parolası yanlış.");
    }

    const url = new URL(istek.url);
    const yol = url.pathname;
    const adlar = async () => Object.fromEntries(await Promise.all(HIZMETLER.map(async (h) => [h, Object.keys(await hesaplar(env, h))])));
    let es;

    // ── Hesap yönetimi ──────────────────────────────────────────────────────
    if (istek.method === "GET" && yol === "/hesaplar") return json({ ...(await adlar()), yazilabilir: !!env.DEPO });

    if ((es = /^\/hesap\/(gemini|cloudflare|huggingface)(?:\/([^/]+))?$/.exec(yol)) && (istek.method === "PUT" || istek.method === "DELETE")) {
      if (!env.DEPO) return hata(500, "Kasaya depolama bağlı değil: bir KV depolaması oluşturup Worker'a DEPO adıyla bağla.");
      const hizmet = es[1];
      await tasi(env);
      const kayit = (await env.DEPO.get("hesaplar:" + hizmet, "json")) || {};
      if (istek.method === "DELETE") {
        let ad;
        try { ad = decodeURIComponent(es[2] || ""); } catch { ad = ""; }
        if (!(ad in kayit)) return hata(404, `Kasada '${ad}' adlı hesap yok.`);
        delete kayit[ad];
      } else {
        const govde = await istek.json().catch(() => null);
        const ad = String(govde?.ad || "").trim(), deger = String(govde?.deger || "").trim();
        if (!ad || ad.length > 40 || /[=\r\n#]/.test(ad)) return hata(400, "Hesap adı 1-40 karakter olmalı; = ve # içeremez.");
        if (!deger || deger.length > 600 || /[^\x20-\x7e]/.test(deger)) return hata(400, "Anahtarda geçersiz karakter var; yeniden yapıştır.");
        if (hizmet === "cloudflare" && !/^[0-9a-f]{32}\s+\S+$/.test(deger)) return hata(400, "Cloudflare Account ID 32 karakterlik olmalı (0-9, a-f).");
        if (hizmet !== "cloudflare" && /\s/.test(deger)) return hata(400, "Anahtarda boşluk var; yeniden yapıştır.");
        if (Object.keys(kayit).length >= 200 && !(ad in kayit)) return hata(400, "Bir servise en fazla 200 hesap eklenebilir.");
        const sorun = await dogrula(hizmet, deger);
        if (sorun) return hata(400, sorun);
        kayit[ad] = deger;
      }
      await env.DEPO.put("hesaplar:" + hizmet, JSON.stringify(kayit));
      return json({ adlar: Object.keys(kayit) });      // depo okuması gecikmeli güncellenir; güncel liste buradan döner
    }

    // ── Servis istekleri: buradaki kalıplara uymayan hiçbir istek iletilmez ──
    let hizmet, hedef;
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
    const deger = (await hesaplar(env, hizmet))[ad];
    if (!deger) return hata(404, `Kasada '${ad}' adlı ${hizmet} hesabı yok.`);

    const basliklar = {};
    const tur = istek.headers.get("Content-Type");
    if (tur) basliklar["Content-Type"] = tur;
    if (hizmet === "gemini") {
      basliklar["x-goog-api-key"] = deger;
    } else if (hizmet === "cloudflare") {
      const [kimlik, token] = deger.split(/\s+/);
      if (!/^[0-9a-f]{32}$/.test(kimlik || "") || !token) return hata(500, `Kasadaki '${ad}' Cloudflare kaydı hatalı.`);
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
