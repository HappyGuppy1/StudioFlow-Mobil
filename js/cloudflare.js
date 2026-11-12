// Cloudflare Workers AI ile görsel üretimi.
// api.cloudflare.com tarayıcıdan gelen isteklere (CORS) izin vermez; bu yüzden istek
// kullanıcının kendi Cloudflare Worker aracısından geçer (bkz. araci/cloudflare-araci.js).
import { base64Coz } from "./ses.js";
import { zamanAsimi, zamanAsimiMi, hataKur, hizmetIstegi, kasaMi } from "./ag.js";

export const MODELLER = [
  { kimlik: "@cf/black-forest-labs/flux-2-klein-4b", ad: "FLUX.2 klein 4B (önerilen)", cokParcali: true, adim: 16 },
  { kimlik: "@cf/black-forest-labs/flux-1-schnell", ad: "FLUX.1 schnell (1024×1024 sabit)", sabitBoyut: true },
  { kimlik: "@cf/bytedance/stable-diffusion-xl-lightning", ad: "SDXL Lightning", adim: 64, ikili: true },
];

function gorselTuru(bayt) {
  if (bayt[0] === 0x89 && bayt[1] === 0x50) return "image/png";
  if (bayt[0] === 0xff && bayt[1] === 0xd8) return "image/jpeg";
  if (bayt[0] === 0x52 && bayt[8] === 0x57) return "image/webp";
  return "image/png";
}

/** Görsel üretir ve `Blob` döndürür. */
export async function gorselUret({ araci, hesap, token, model, prompt, en, boy }) {
  const kasa = kasaMi(token);     // kasada Account ID de kasadadır; aracı gerekmez
  if (!kasa && !(araci || "").trim()) throw new Error("Cloudflare isteği için kasa ya da aracı adresi gerekli.");
  if (!kasa && (!(hesap || "").trim() || !(token || "").trim())) throw new Error("Cloudflare hesabı yok: API sayfasından ekle.");
  if (!(prompt || "").trim()) throw new Error("Görsel için bir tarif yaz.");
  const tanim = MODELLER.find((m) => m.kimlik === model) || MODELLER[0];
  const alanlar = { prompt: prompt.trim() };
  if (!tanim.sabitBoyut) {
    const oturt = (d) => Math.max(256, Math.min(2048, Math.round(d / tanim.adim) * tanim.adim));
    alanlar.width = oturt(en);
    alanlar.height = oturt(boy);
  }
  // Model adı yolda kodlanmadan yazılır; `%2F` ile kodlanırsa Cloudflare yolu bulamaz.
  const dogrudan = kasa ? null : {
    adres: `${araci.trim().replace(/\/+$/, "")}/client/v4/accounts/${encodeURIComponent(hesap.trim())}/ai/run/${tanim.kimlik}`,
    basliklar: { Authorization: `Bearer ${token.trim().replace(/^bearer\s+/i, "")}` } };
  const istek = { method: "POST", headers: {} };
  if (tanim.cokParcali) {
    istek.body = new FormData();
    for (const [ad, deger] of Object.entries(alanlar)) istek.body.append(ad, String(deger));
  } else {
    istek.headers["Content-Type"] = "application/json";
    istek.body = JSON.stringify(alanlar);
  }
  let yanit;
  try {
    yanit = await hizmetIstegi(token, `/cloudflare/ai/run/${tanim.kimlik}`, dogrudan, { ...istek, signal: zamanAsimi(300_000) });
  } catch (hata) {
    if (/^Kasa: /.test(hata.message)) throw hata;
    if (zamanAsimiMi(hata)) throw new Error("Cloudflare 5 dakikada yanıt vermedi. Yeniden dene.");
    throw new Error("Aracıya bağlanılamadı. Aracı adresini ve izinli kökeni denetle.");
  }
  const tur = (yanit.headers.get("Content-Type") || "").toLowerCase();
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
  if (tur.includes("json")) {
    const veri = await yanit.json();
    const b64 = veri?.result?.image;
    if (!b64) throw new Error("Cloudflare yanıtında görsel yok.");
    const bayt = base64Coz(b64);
    return new Blob([bayt], { type: gorselTuru(bayt) });
  }
  return await yanit.blob();
}
