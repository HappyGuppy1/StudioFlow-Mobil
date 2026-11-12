// Kasa bağlantısı ve hesap havuzu.
//
// API anahtarları yalnızca kasada (kullanıcının kendi Cloudflare Worker'ı, bkz. araci/kasa.js) durur.
// Telefonda yalnızca kasa adresi, kasa parolası ve hesap ADLARI bulunur. Servis modüllerine anahtar
// yerine `{ kasa: { adres, parola, hesap } }` gider ve istek kasadan geçer (bkz. ag.js `hizmetIstegi`).
//
// Havuz mantığı masaüstü StudioFlow ile aynıdır: denemeler aktif hesaptan başlar, çalışan hesap aktif
// olur; kota uyarısı veren hesap kotası yenilenene kadar kullanılmaz, anahtarı reddedilen hesap bu
// oturumda atlanır.
import { ayar, ayarGuncelle } from "./ayar.js";

const KASA = "studioflow-mobil-kasa";      // { adlar: { hizmet: [ad…] }, aktif: { hizmet: ad }, yazilabilir }
const KOTA = "studioflow-mobil-kota";      // { "hizmet|ad": { acilis, sebep } }
const DAKIKA = 60_000, SAAT = 3_600_000;

export const HIZMETLER = {
  gemini: { ad: "Gemini", alanlar: [["gemini_key", "API anahtarı"]] },
  cloudflare: { ad: "Cloudflare", alanlar: [["cf_account_id", "Account ID"], ["cf_token", "API token"]] },
  huggingface: { ad: "Hugging Face", alanlar: [["hf_token", "Token"]] },
};
// Servis mesajı açılış saati vermezse günlük kotanın sıfırlanma saati (UTC).
const GUNLUK_SIFIRLANMA_UTC = { cloudflare: 0, gemini: 8 };

function oku(anahtar) {
  try { return JSON.parse(localStorage.getItem(anahtar)) || {}; } catch { return {}; }
}
function yaz(anahtar, deger) {
  try { localStorage.setItem(anahtar, JSON.stringify(deger)); return true; } catch { return false; }
}

const kasa = oku(KASA);
kasa.adlar ||= {};
kasa.aktif ||= {};
const elenen = new Set();               // bu oturumda anahtarı reddedilenler: "hizmet|ad"
const kotaAnahtari = (hizmet, ad) => `${hizmet}|${ad}`;
const adresDuzelt = (adres) => String(adres || "").trim().replace(/\/+$/, "");

// ── Kasa bağlantısı ─────────────────────────────────────────────────────────
export const kasaAcik = () => !!(ayar.kasaAdres && ayar.kasaParola);
export const kasaYazilabilir = () => kasa.yazilabilir !== false;

/** Uzun, rastgele bir kasa parolası üretir (43 karakter). */
export function parolaUret() {
  const bayt = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bayt)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function kasaIstegi(yol, secenek = {}, baglanti = { adres: ayar.kasaAdres, parola: ayar.kasaParola }) {
  let yanit;
  try {
    yanit = await fetch(adresDuzelt(baglanti.adres) + yol, { ...secenek,
      headers: { ...(secenek.headers || {}), Authorization: `Bearer ${baglanti.parola}` } });
  } catch {
    throw new Error("Kasaya ulaşılamadı: adresi ve internet bağlantısını denetle.");
  }
  const govde = await yanit.json().catch(() => null);
  if (!yanit.ok || !govde) throw new Error(govde?.hata || `Kasa yanıt vermedi (${yanit.status}). Adres doğru mu, kasa kodu yapıştırıldı mı?`);
  return govde;
}

function adlariIsle(govde) {
  kasa.adlar = Object.fromEntries(Object.keys(HIZMETLER).map((h) => [h, Array.isArray(govde[h]) ? govde[h].map(String) : []]));
  kasa.yazilabilir = govde.yazilabilir !== false;
  yaz(KASA, kasa);
}

/** Kasaya bağlanır: parolayı sınar, hesap adlarını alır; adres ve parola bu cihazda hatırlanır. */
export async function kasaBaglan(adres, parola) {
  adres = adresDuzelt(adres);
  parola = String(parola || "").trim();
  if (adres && !/^https?:\/\//.test(adres)) adres = "https://" + adres;
  if (!/^https:\/\/[^\s/]+\.[^\s/]+$/.test(adres)) throw new Error("Kasa adresini yaz (ör. https://studioflow-kasa.adin.workers.dev).");
  if (!parola) throw new Error("Kasa parolasını yaz.");
  adlariIsle(await kasaIstegi("/hesaplar", {}, { adres, parola }));
  if (!ayarGuncelle({ kasaAdres: adres, kasaParola: parola })) throw new Error("Kaydedilemedi: tarayıcı depolamayı engelliyor.");
  elenen.clear();
}

/** Hesap adlarını kasadan yeniden alır (uygulama açılışında ve API sayfasında). */
export async function kasaYenile() {
  if (kasaAcik()) adlariIsle(await kasaIstegi("/hesaplar"));
}

/** Kasa bağlantısını bu cihazdan kaldırır (kasadaki anahtarlara dokunmaz). */
export function kasaAyril() {
  ayarGuncelle({ kasaAdres: "", kasaParola: "" });
  kasa.adlar = {};
  kasa.aktif = {};
  yaz(KASA, kasa);
  elenen.clear();
}

/** Hesabı kasaya yazar; kasa anahtarı kaydetmeden önce servise sorarak dener. */
export async function hesapEkle(hizmet, ad, degerler) {
  ad = String(ad || "").trim();
  if (!ad) throw new Error("Hesaba bir ad ver (ör. kişisel).");
  const parcalar = HIZMETLER[hizmet].alanlar.map(([alan]) => String(degerler[alan] || "").trim());
  if (parcalar.some((p) => !p)) throw new Error("Bütün alanları doldur.");
  const govde = await kasaIstegi(`/hesap/${hizmet}`, { method: "PUT", headers: { "Content-Type": "application/json" },
                                                       body: JSON.stringify({ ad, deger: parcalar.join(" ") }) });
  kasa.adlar[hizmet] = govde.adlar.map(String);
  yaz(KASA, kasa);
  elenen.delete(kotaAnahtari(hizmet, ad));
  const kota = oku(KOTA);
  delete kota[kotaAnahtari(hizmet, ad)];
  yaz(KOTA, kota);
}

export async function hesapSil(hizmet, ad) {
  const govde = await kasaIstegi(`/hesap/${hizmet}/${encodeURIComponent(ad)}`, { method: "DELETE" });
  kasa.adlar[hizmet] = govde.adlar.map(String);
  if (kasa.aktif[hizmet] === ad) delete kasa.aktif[hizmet];
  yaz(KASA, kasa);
}

// ── Hesap sırası ve kota listesi ────────────────────────────────────────────
function kasaHesabi(hizmet, ad) {
  const gonderme = { kasa: { adres: adresDuzelt(ayar.kasaAdres), parola: ayar.kasaParola, hesap: ad } };
  const degerler = hizmet === "cloudflare" ? { cf_account_id: "kasa", cf_token: gonderme }
    : { [HIZMETLER[hizmet].alanlar[0][0]]: gonderme };
  return { ad, degerler };
}

export const hesapAdlari = (hizmet) => (kasaAcik() ? kasa.adlar[hizmet] || [] : []);
export const aktifHesap = (hizmet) => {
  const adlar = hesapAdlari(hizmet);
  return adlar.includes(kasa.aktif[hizmet]) ? kasa.aktif[hizmet] : adlar[0] || "";
};
export const hesapVar = (hizmet) => hesapAdlari(hizmet).length > 0;

export function aktifYap(hizmet, ad) {
  if (hesapAdlari(hizmet).includes(ad)) { kasa.aktif[hizmet] = ad; yaz(KASA, kasa); }
}

/** Kota bekleyenler (süresi dolanlar atılır). */
function kotaOku() {
  const liste = oku(KOTA);
  let degisti = false;
  for (const [anahtar, kayit] of Object.entries(liste)) {
    if (!(kayit.acilis > Date.now())) { delete liste[anahtar]; degisti = true; }
  }
  if (degisti) yaz(KOTA, liste);
  return liste;
}

/** Hesap kota bekliyorsa açılış anı (ms), değilse `null`. */
export function kotaBekliyor(hizmet, ad, liste = kotaOku()) {
  return liste[kotaAnahtari(hizmet, ad)]?.acilis || null;
}

/** Özet: `{ toplam, bekleyen, enErken }`. */
export function hizmetOzeti(hizmet) {
  const kota = kotaOku();
  const acilislar = hesapAdlari(hizmet).map((ad) => kotaBekliyor(hizmet, ad, kota)).filter(Boolean);
  return { toplam: hesapAdlari(hizmet).length, bekleyen: acilislar.length, enErken: acilislar.length ? Math.min(...acilislar) : null };
}

/** Kota bekleme listesini temizler (kotası erken açılan hesaplar için). */
export function kotaTemizle(hizmet) {
  const liste = kotaOku();
  for (const anahtar of Object.keys(liste)) if (!hizmet || anahtar.startsWith(hizmet + "|")) delete liste[anahtar];
  yaz(KOTA, liste);
  elenen.clear();
}

function gunlukSifirlanma(hizmet) {
  const saat = GUNLUK_SIFIRLANMA_UTC[hizmet];
  if (saat == null) return Date.now() + 24 * SAAT;
  const an = new Date();
  an.setUTCHours(saat, 0, 0, 0);
  if (an.getTime() <= Date.now()) an.setUTCDate(an.getUTCDate() + 1);
  return an.getTime() + 2 * DAKIKA;
}

/** Kota hatasından hesabın yeniden açılacağı an (ms). Önce servisin verdiği süre, yoksa günlük sıfırlanma. */
function acilisZamani(hizmet, hata) {
  const mesaj = String(hata.message || "").toLowerCase();
  if (hata.gunluk) return gunlukSifirlanma(hizmet);
  if (hata.bekleme > 0) return Date.now() + (hata.bekleme + 2) * 1000;
  if (hizmet === "huggingface") {
    const s = /try again in (?:(\d+) days?,\s*)?(\d+):(\d{1,2}):(\d{1,2})/.exec(mesaj);
    if (s) return Date.now() + ((Number(s[1] || 0) * 24 + Number(s[2])) * 60 + Number(s[3])) * DAKIKA + Number(s[4]) * 1000 + 2 * DAKIKA;
    return Date.now() + 24 * SAAT;
  }
  if (hizmet === "cloudflare") return /daily free allocation|4006/.test(mesaj) ? gunlukSifirlanma(hizmet) : Date.now() + 90_000;
  if (/per.?minute|rate limit|rpm/.test(mesaj)) return Date.now() + 65_000;
  return gunlukSifirlanma(hizmet);
}

export const saatYaz = (ms) => {
  const an = new Date(ms);
  const saat = an.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return an.toDateString() === new Date().toDateString() ? saat : `${an.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" })} ${saat}`;
};

/**
 * `is(degerler, ad)` işini servisin hesaplarıyla dener: aktif hesaptan başlar; kota hatasında hesabı
 * bekleme listesine alıp sıradakine geçer, yetki hatasında hesabı bu oturumda atlar. Başka hatalar
 * (bağlantı, içerik, sunucu, kasa) hesabın suçu değildir ve olduğu gibi yükselir. Bütün hesaplar kısa
 * süreli (dakikalık) sınırdaysa süre dolana kadar bekleyip yeniden dener.
 */
export async function hesaplarla(hizmet, is, { bildir, iptal } = {}) {
  const tanim = HIZMETLER[hizmet];
  if (!kasaAcik()) throw new Error("Kasa bağlı değil: API sayfasından kasaya bağlan.");
  if (!hesapVar(hizmet)) throw new Error(`${tanim.ad} hesabı yok: API sayfasından ekle.`);
  for (let tur = 0; tur < 4; tur++) {
    const kota = kotaOku();
    const aktif = aktifHesap(hizmet);
    const sira = [aktif, ...hesapAdlari(hizmet).filter((ad) => ad !== aktif)];
    for (const ad of sira) {
      const anahtar = kotaAnahtari(hizmet, ad);
      if (elenen.has(anahtar) || kotaBekliyor(hizmet, ad, kota)) continue;
      if (iptal?.()) throw new Error("Durduruldu. Tamamlanan adımlar kaydedildi.");
      try {
        const sonuc = await is(kasaHesabi(hizmet, ad).degerler, ad);
        if (aktif !== ad) aktifYap(hizmet, ad);
        return sonuc;
      } catch (hata) {
        if (hata.tur === "kota") {
          const liste = kotaOku();
          liste[anahtar] = { acilis: acilisZamani(hizmet, hata), sebep: String(hata.message).slice(0, 200) };
          yaz(KOTA, liste);
        } else if (hata.tur === "yetki") {
          elenen.add(anahtar);
        } else {
          throw hata;
        }
        bildir?.(`${tanim.ad} '${ad}': ${hata.tur === "kota" ? "kota doldu" : "anahtar reddedildi"}; sıradaki hesap deneniyor…`);
      }
    }
    // Kalan tek engel kısa bir hız sınırıysa (≤ 90 sn) beklenir; günlük kota ise beklenmez.
    const { enErken } = hizmetOzeti(hizmet);
    const kalan = enErken ? enErken - Date.now() : Infinity;
    if (!(kalan <= 90_000)) break;
    bildir?.(`${tanim.ad}: hız sınırı, ${Math.ceil(kalan / 1000)} sn bekleniyor…`);
    for (let gecen = 0; gecen < kalan + 500; gecen += 500) {
      if (iptal?.()) throw new Error("Durduruldu. Tamamlanan adımlar kaydedildi.");
      await new Promise((coz) => setTimeout(coz, 500));
    }
  }
  const o = hizmetOzeti(hizmet);
  throw new Error(`${tanim.ad}: kullanılabilir hesap kalmadı (${o.toplam} hesap, ${o.bekleyen} tanesi kota bekliyor`
    + (o.enErken ? `; en erken ${saatYaz(o.enErken)}` : "") + ").");
}
