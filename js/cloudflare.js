// Cloudflare Workers AI: görsel üretimi ve konuşma tanıma (whisper).
// api.cloudflare.com tarayıcıdan gelen isteklere (CORS) izin vermez; istekler kasadan geçer (bkz. araci/kasa.js).
import { base64Coz } from "./ses.js";
import { zamanAsimi, zamanAsimiMi, hataKur, hizmetIstegi, kasaMi } from "./ag.js";

// `adim`: boyutun oturtulduğu kat. `alanlar`: modelin kabul ettiği ek ayarlar (masaüstündeki `CF_MODELS` ile aynı
// adlar ve aralıklar). FLUX.2 klein adım ve guidance'ı yok sayar; bu yüzden onda alan yoktur.
export const MODELLER = [
  { kimlik: "@cf/black-forest-labs/flux-2-klein-4b", ad: "FLUX.2 klein 4B (önerilen)", cokParcali: true, adim: 16, alanlar: [] },
  { kimlik: "@cf/black-forest-labs/flux-1-schnell", ad: "FLUX.1 schnell (1024×1024 sabit)", sabitBoyut: true,
    alanlar: [{ ad: "steps", tur: "adim", min: 1, max: 8, varsayilan: 4 }] },
  { kimlik: "@cf/bytedance/stable-diffusion-xl-lightning", ad: "SDXL Lightning", adim: 64, ikili: true, negatif: true, kelime: 55,
    alanlar: [{ ad: "num_steps", tur: "adim", min: 1, max: 20, varsayilan: 4 }, { ad: "guidance", tur: "guidance", min: 1, max: 15, varsayilan: 7.5 }] },
];
export const BOYUT_ALT = 256, BOYUT_UST = 2048;
export const modelTanimi = (kimlik) => MODELLER.find((m) => m.kimlik === kimlik) || MODELLER[0];
const DINLEME_MODELI = "@cf/openai/whisper-large-v3-turbo";

function gorselTuru(bayt) {
  if (bayt[0] === 0x89 && bayt[1] === 0x50) return "image/png";
  if (bayt[0] === 0xff && bayt[1] === 0xd8) return "image/jpeg";
  if (bayt[0] === 0x52 && bayt[8] === 0x57) return "image/webp";
  return "image/png";
}

/** Workers AI modelini çalıştırır; başarılı yanıtı döndürür, hatayı türüyle (kota / yetki) yükseltir. */
async function calistir(model, { araci, hesap, token }, istek, sureSiniri = 300_000) {
  const kasa = kasaMi(token);     // kasada Account ID de kasadadır; aracı gerekmez
  if (!kasa && !(araci || "").trim()) throw new Error("Cloudflare isteği için kasa ya da aracı adresi gerekli.");
  if (!kasa && (!(hesap || "").trim() || !(token || "").trim())) throw new Error("Cloudflare hesabı yok: API sayfasından ekle.");
  // Model adı yolda kodlanmadan yazılır; `%2F` ile kodlanırsa Cloudflare yolu bulamaz.
  const dogrudan = kasa ? null : {
    adres: `${araci.trim().replace(/\/+$/, "")}/client/v4/accounts/${encodeURIComponent(hesap.trim())}/ai/run/${model}`,
    basliklar: { Authorization: `Bearer ${token.trim().replace(/^bearer\s+/i, "")}` } };
  let yanit;
  try {
    yanit = await hizmetIstegi(token, `/cloudflare/ai/run/${model}`, dogrudan, { ...istek, signal: zamanAsimi(sureSiniri) });
  } catch (hata) {
    if (/^Kasa: /.test(hata.message)) throw hata;
    if (zamanAsimiMi(hata)) throw new Error(`Cloudflare ${Math.round(sureSiniri / 60000)} dakikada yanıt vermedi. Yeniden dene.`);
    throw new Error("Aracıya bağlanılamadı. Aracı adresini ve izinli kökeni denetle.");
  }
  if (!yanit.ok) {
    let ayrinti = "";
    try {
      const veri = await yanit.json();
      ayrinti = (veri.errors || []).map((h) => h.message || h.code).join(" · ");
    } catch { /* gövde JSON değil */ }
    const ipucu = { 401: "Token reddedildi.", 403: "Token'da Workers AI izni yok ya da köken izinli değil.",
                    404: "Account ID ya da model bulunamadı.", 429: "Kota ya da hız sınırı aşıldı." }[yanit.status] || "";
    // Günlük ücretsiz nöron kotası (4006) ve 429 hesabı bekletir; 401 ve 403 anahtar sorunudur.
    const gunluk = /daily free allocation|4006/i.test(ayrinti);
    const hataTuru = gunluk || yanit.status === 429 ? "kota" : yanit.status === 401 || yanit.status === 403 ? "yetki" : undefined;
    throw hataKur(`Cloudflare hatası (${yanit.status}). ${ipucu} ${ayrinti}`.trim(), { durum: yanit.status, tur: hataTuru, gunluk });
  }
  return yanit;
}

/** Görsel üretir ve `Blob` döndürür. `adim` ve `guidance` yalnızca modelin kabul ettiği alanlara yazılır. */
export async function gorselUret({ araci, hesap, token, model, prompt, negatif, en, boy, adim, guidance }) {
  if (!(prompt || "").trim()) throw new Error("Görsel için bir tarif yaz.");
  const tanim = modelTanimi(model);
  const alanlar = { prompt: prompt.trim() };
  if (tanim.negatif && (negatif || "").trim()) alanlar.negative_prompt = negatif.trim();
  if (!tanim.sabitBoyut) {
    const oturt = (d) => Math.max(BOYUT_ALT, Math.min(BOYUT_UST, Math.round(d / tanim.adim) * tanim.adim));
    alanlar.width = oturt(en);
    alanlar.height = oturt(boy);
  }
  for (const alan of tanim.alanlar) {
    const verilen = Number(alan.tur === "adim" ? adim : guidance);
    if (!Number.isFinite(verilen) || verilen <= 0) continue;       // boşsa modelin kendi varsayılanı
    const deger = Math.max(alan.min, Math.min(alan.max, verilen));
    alanlar[alan.ad] = alan.tur === "adim" ? Math.round(deger) : deger;
  }
  const istek = { method: "POST", headers: {} };
  if (tanim.cokParcali) {
    istek.body = new FormData();
    for (const [ad, deger] of Object.entries(alanlar)) istek.body.append(ad, String(deger));
  } else {
    istek.headers["Content-Type"] = "application/json";
    istek.body = JSON.stringify(alanlar);
  }
  const yanit = await calistir(tanim.kimlik, { araci, hesap, token }, istek);
  if ((yanit.headers.get("Content-Type") || "").toLowerCase().includes("json")) {
    const veri = await yanit.json();
    const b64 = veri?.result?.image;
    if (!b64) throw new Error("Cloudflare yanıtında görsel yok.");
    const bayt = base64Coz(b64);
    return new Blob([bayt], { type: gorselTuru(bayt) });
  }
  return await yanit.blob();
}

/**
 * Sesi whisper ile dinler; yanıtın `result` nesnesini döndürür (`segments[].words[]`: kelime zamanları).
 * `ses`: base64 ses dosyası. Metin ipucu (`initial_prompt`) bilinçli olarak gönderilmez: model ipucunu
 * "zaten yazılmış" sanıp sesi çözmeyi bırakıyor (masaüstünde ölçüldü).
 */
export async function konusmaTani({ araci, hesap, token, ses, dil }) {
  const govde = { audio: ses };
  if (dil) govde.language = dil;
  const yanit = await calistir(DINLEME_MODELI, { araci, hesap, token },
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde) });
  const veri = await yanit.json().catch(() => null);
  if (!veri?.result || typeof veri.result !== "object") throw new Error("Cloudflare boş yanıt döndürdü (konuşma tanıma).");
  return veri.result;
}
