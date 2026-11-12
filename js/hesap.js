// Hesap havuzu: her servis için birden çok hesap; kotası biten hesap atlanır, sıradakine geçilir.
// Masaüstü StudioFlow'daki `saglayicilar/hesap_havuzu.py` ve `kota_listesi.py` ile aynı mantık:
//   · her servisin bir "aktif" hesabı vardır; denemeler ondan başlar, çalışan hesap aktif olur
//   · kota uyarısı veren hesap, kotası yenilenene kadar hiçbir üretimde kullanılmaz (kalıcı liste)
//   · anahtarı reddedilen hesap bu oturum boyunca atlanır
// Hesaplar ve kota listesi yalnızca bu cihazın tarayıcı deposunda durur.
import { ayar, ayarGuncelle } from "./ayar.js";
import { ozet } from "./sahne.js";

const DEPO = "studioflow-mobil-hesaplar";
const KOTA = "studioflow-mobil-kota";
const KASA = "studioflow-mobil-kasa";      // kasadaki hesap ADLARI (anahtar değil) ve aktif seçimleri
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

const veri = oku(DEPO);                 // { hizmet: { aktif, liste: [{ ad, degerler }] } }
const elenen = new Set();               // bu oturumda anahtarı reddedilenler: "hizmet|ad"
for (const hizmet of Object.keys(HIZMETLER)) veri[hizmet] ||= { aktif: "", liste: [] };

// Tek hesaplı eski sürümden geçiş: Ayarlar'daki anahtarlar ilk hesap olur.
(function eskidenTasi() {
  const eski = { gemini: ayar.gemini && { gemini_key: ayar.gemini },
                 cloudflare: ayar.cfHesap && ayar.cfToken && { cf_account_id: ayar.cfHesap, cf_token: ayar.cfToken },
                 huggingface: ayar.hfToken && { hf_token: ayar.hfToken } };
  let tasindi = false;
  for (const [hizmet, degerler] of Object.entries(eski)) {
    if (degerler && !veri[hizmet].liste.length) {
      veri[hizmet] = { aktif: "telefon", liste: [{ ad: "telefon", degerler }] };
      tasindi = true;
    }
  }
  if (tasindi && yaz(DEPO, veri)) ayarGuncelle({ gemini: "", cfHesap: "", cfToken: "", hfToken: "" });
})();

const kaydet = () => yaz(DEPO, veri);

// ── Kasa kipi ───────────────────────────────────────────────────────────────
// Kasa bağlıysa (Ayarlar › Kasa) anahtarlar kullanıcının kendi Cloudflare Worker'ında durur; telefonda
// yalnızca kasa adresi, kasa parolası ve hesap adları bulunur. Servis modüllerine anahtar yerine
// `{ kasa: { adres, parola, hesap } }` gider ve istek kasadan geçer (bkz. ag.js `hizmetIstegi`).
const kasaVerisi = oku(KASA);           // { adlar: { hizmet: [ad…] }, aktif: { hizmet: ad } }
kasaVerisi.adlar ||= {};
kasaVerisi.aktif ||= {};
export const kasaAcik = () => !!(ayar.kasaAdres && ayar.kasaParola);
const kasaAdresi = (adres) => String(adres || "").trim().replace(/\/+$/, "");

function kasaHesabi(hizmet, ad) {
  const gonderme = { kasa: { adres: kasaAdresi(ayar.kasaAdres), parola: ayar.kasaParola, hesap: ad } };
  const degerler = hizmet === "cloudflare" ? { cf_account_id: "kasa", cf_token: gonderme }
    : { [HIZMETLER[hizmet].alanlar[0][0]]: gonderme };
  return { ad, degerler, kasada: true };
}

/** Kasaya bağlanır: parolayı sınar, hesap adlarını alır ve kaydeder. Döner: `{ gemini: n, … }`. */
export async function kasaBaglan(adres, parola) {
  adres = kasaAdresi(adres);
  parola = String(parola || "").trim();
  if (!/^https:\/\/[^\s/]+/.test(adres) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(adres)) throw new Error("Kasa adresi https:// ile başlamalı.");
  if (!parola) throw new Error("Kasa parolasını gir.");
  let yanit;
  try {
    yanit = await fetch(adres + "/hesaplar", { headers: { Authorization: `Bearer ${parola}` } });
  } catch {
    throw new Error("Kasaya ulaşılamadı: adresi ve kasadaki izinli kökeni denetle.");
  }
  const govde = await yanit.json().catch(() => null);
  if (!yanit.ok || !govde) throw new Error("Kasa: " + (govde?.hata || `hata ${yanit.status}`));
  kasaVerisi.adlar = Object.fromEntries(Object.keys(HIZMETLER).map((h) => [h, Array.isArray(govde[h]) ? govde[h].map(String) : []]));
  yaz(KASA, kasaVerisi);
  if (!ayarGuncelle({ kasaAdres: adres, kasaParola: parola })) throw new Error("Kaydedilemedi: tarayıcı depolamayı engelliyor.");
  elenen.clear();
  return Object.fromEntries(Object.keys(HIZMETLER).map((h) => [h, kasaVerisi.adlar[h].length]));
}

/** Kasa bağlantısını bu cihazdan kaldırır (kasadaki anahtarlara dokunmaz). */
export function kasaAyril() {
  ayarGuncelle({ kasaAdres: "", kasaParola: "" });
  kasaVerisi.adlar = {};
  kasaVerisi.aktif = {};
  yaz(KASA, kasaVerisi);
  elenen.clear();
}
const iz = (degerler) => ozet(JSON.stringify(Object.entries(degerler).sort(), (anahtar, deger) => (deger && deger.kasa ? "kasa:" + deger.kasa.hesap : deger)));
const kotaAnahtari = (hizmet, ad) => `${hizmet}|${ad}`;

/** Kota bekleyenler (süresi dolanlar atılır): `{ "hizmet|ad": { acilis, iz, sebep } }`. */
function kotaOku() {
  const liste = oku(KOTA);
  let degisti = false;
  for (const [anahtar, kayit] of Object.entries(liste)) {
    if (!(kayit.acilis > Date.now())) { delete liste[anahtar]; degisti = true; }
  }
  if (degisti) yaz(KOTA, liste);
  return liste;
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

/** Servisin hesapları, aktif olan başta. */
export function hesapListesi(hizmet) {
  if (kasaAcik()) {
    const adlar = kasaVerisi.adlar[hizmet] || [], secili = kasaVerisi.aktif[hizmet];
    return [...adlar.filter((ad) => ad === secili), ...adlar.filter((ad) => ad !== secili)].map((ad) => kasaHesabi(hizmet, ad));
  }
  const { aktif, liste } = veri[hizmet];
  return [...liste.filter((h) => h.ad === aktif), ...liste.filter((h) => h.ad !== aktif)];
}
export const hesapVar = (hizmet) => hesapListesi(hizmet).length > 0;
export const aktifHesap = (hizmet) => (kasaAcik() ? kasaVerisi.aktif[hizmet] || (kasaVerisi.adlar[hizmet] || [])[0] || "" : veri[hizmet].aktif);
/** Telefonda (kasasız) kayıtlı hesaplar; Ayarlar ekranı için. */
export const yerelHesaplar = (hizmet) => veri[hizmet].liste.map((h) => h.ad);

/** Hesap kota bekliyorsa açılış anı (ms), değilse `null`. Anahtarı değişen hesabın kaydı sayılmaz. */
export function kotaBekliyor(hizmet, hesap, liste = kotaOku()) {
  const kayit = liste[kotaAnahtari(hizmet, hesap.ad)];
  return kayit && kayit.iz === iz(hesap.degerler) ? kayit.acilis : null;
}

/** Ayarlar ekranı için özet: `{ toplam, bekleyen, enErken }`. */
export function hizmetOzeti(hizmet) {
  const kota = kotaOku();
  const liste = hesapListesi(hizmet);
  const acilislar = liste.map((h) => kotaBekliyor(hizmet, h, kota)).filter(Boolean);
  return { toplam: liste.length, bekleyen: acilislar.length, enErken: acilislar.length ? Math.min(...acilislar) : null };
}

export function hesapEkle(hizmet, ad, degerler) {
  ad = (ad || "").trim();
  const temiz = {};
  for (const [alan] of HIZMETLER[hizmet].alanlar) {
    temiz[alan] = String(degerler[alan] || "").trim();
    if (!temiz[alan]) throw new Error("Bütün alanları doldur.");
    // Anahtarlar yalnızca ASCII'dir; kopyalarken karışan Türkçe harf isteği başlıkta bozar.
    if (/[^\x21-\x7e]/.test(temiz[alan])) throw new Error("Anahtarda geçersiz karakter var (boşluk ya da Türkçe harf); yeniden yapıştır.");
  }
  if (!ad) throw new Error("Hesaba bir ad ver.");
  const liste = veri[hizmet].liste;
  const mevcut = liste.find((h) => h.ad === ad);
  if (mevcut) mevcut.degerler = temiz; else liste.push({ ad, degerler: temiz });
  if (!veri[hizmet].aktif) veri[hizmet].aktif = ad;
  elenen.delete(kotaAnahtari(hizmet, ad));
  if (!kaydet()) throw new Error("Kaydedilemedi: tarayıcı depolamayı engelliyor.");
}

export function hesapSil(hizmet, ad) {
  veri[hizmet].liste = veri[hizmet].liste.filter((h) => h.ad !== ad);
  if (veri[hizmet].aktif === ad) veri[hizmet].aktif = veri[hizmet].liste[0]?.ad || "";
  kaydet();
}

export function aktifYap(hizmet, ad) {
  if (kasaAcik()) {
    if ((kasaVerisi.adlar[hizmet] || []).includes(ad)) { kasaVerisi.aktif[hizmet] = ad; yaz(KASA, kasaVerisi); }
  } else if (veri[hizmet].liste.some((h) => h.ad === ad)) {
    veri[hizmet].aktif = ad;
    kaydet();
  }
}

export function tumunuSil() {
  for (const hizmet of Object.keys(HIZMETLER)) veri[hizmet] = { aktif: "", liste: [] };
  kaydet();
  yaz(KOTA, {});
  elenen.clear();
}

/** Kota bekleme listesini temizler (kotası erken açılan hesaplar için). */
export function kotaTemizle(hizmet) {
  const liste = kotaOku();
  for (const anahtar of Object.keys(liste)) if (!hizmet || anahtar.startsWith(hizmet + "|")) delete liste[anahtar];
  yaz(KOTA, liste);
  elenen.clear();
}

/**
 * Masaüstündeki `api-hesaplari.txt` içeriğini içe aktarır (`hizmet.hesap_adı.alan = değer`,
 * `hizmet.aktif = ad`). Yalnızca mobilin kullandığı servisler alınır; aynı adlı hesap güncellenir.
 * Döner: `{ gemini: n, cloudflare: n, huggingface: n, atlanan: n }`.
 */
export function iceAktar(metin) {
  const toplanan = {}, aktifler = {};
  for (const ham of String(metin || "").replace(/^﻿/, "").split(/\r?\n/)) {
    const satir = ham.trim();
    if (!satir || satir.startsWith("#") || !satir.includes("=")) continue;
    const esit = satir.indexOf("=");
    const sol = satir.slice(0, esit).trim(), deger = satir.slice(esit + 1).trim();
    const ilk = sol.indexOf("."), son = sol.lastIndexOf(".");
    if (ilk < 0) continue;
    const hizmet = sol.slice(0, ilk);
    if (!HIZMETLER[hizmet]) continue;
    if (ilk === son) { if (sol.slice(ilk + 1) === "aktif") aktifler[hizmet] = deger; continue; }
    const ad = sol.slice(ilk + 1, son), alan = sol.slice(son + 1);
    if (!ad || !deger) continue;
    ((toplanan[hizmet] ||= {})[ad] ||= {})[alan] = deger;
  }
  const sonuc = { gemini: 0, cloudflare: 0, huggingface: 0, atlanan: 0 };
  for (const [hizmet, hesaplar] of Object.entries(toplanan)) {
    for (const [ad, degerler] of Object.entries(hesaplar)) {
      try { hesapEkle(hizmet, ad, degerler); sonuc[hizmet]++; } catch { sonuc.atlanan++; }
    }
    if (aktifler[hizmet]) aktifYap(hizmet, aktifler[hizmet]);
  }
  return sonuc;
}

/**
 * `is(degerler, ad)` işini servisin hesaplarıyla dener: aktif hesaptan başlar; kota hatasında hesabı
 * bekleme listesine alıp sıradakine geçer, yetki hatasında hesabı bu oturumda atlar. Başka hatalar
 * (bağlantı, içerik, sunucu) hesabın suçu değildir ve olduğu gibi yükselir. Bütün hesaplar kısa süreli
 * (dakikalık) sınırdaysa süre dolana kadar bekleyip yeniden dener.
 */
export async function hesaplarla(hizmet, is, { bildir, iptal } = {}) {
  const tanim = HIZMETLER[hizmet];
  if (!hesapVar(hizmet)) throw new Error(`${tanim.ad} hesabı yok: Ayarlar bölümünden ekle.`);
  let son = null;
  for (let tur = 0; tur < 4; tur++) {
    const kota = kotaOku();
    for (const hesap of hesapListesi(hizmet)) {
      const anahtar = kotaAnahtari(hizmet, hesap.ad);
      if (elenen.has(anahtar) || kotaBekliyor(hizmet, hesap, kota)) continue;
      if (iptal?.()) throw new Error("Durduruldu. Tamamlanan adımlar kaydedildi.");
      try {
        const sonuc = await is(hesap.degerler, hesap.ad);
        if (aktifHesap(hizmet) !== hesap.ad) aktifYap(hizmet, hesap.ad);
        return sonuc;
      } catch (hata) {
        if (hata.tur === "kota") {
          const liste = kotaOku();
          liste[anahtar] = { acilis: acilisZamani(hizmet, hata), iz: iz(hesap.degerler), sebep: String(hata.message).slice(0, 200) };
          yaz(KOTA, liste);
        } else if (hata.tur === "yetki") {
          elenen.add(anahtar);
        } else {
          throw hata;
        }
        son = hata;
        bildir?.(`${tanim.ad} '${hesap.ad}': ${hata.tur === "kota" ? "kota doldu" : "anahtar reddedildi"}; sıradaki hesap deneniyor…`);
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
