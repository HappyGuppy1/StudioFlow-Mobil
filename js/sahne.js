// Proje modeli ve saf mantık: sahnelere bölme, seslendirme planı, zamanlama, altyazı blokları.
import { ayar } from "./ayar.js";
import { MODELLER as SES_MODELLERI } from "./gemini.js";
import { MODELLER as GORSEL_MODELLERI } from "./cloudflare.js";

export const VARSAYILAN_STIL = "Natural, warm documentary narration with varied emphasis and a relaxed pace.";
export const VARSAYILAN_GORSEL_STIL = "Photorealistic film still, shot on 35mm film, sharp focus, "
  + "natural skin texture, available light, high detail";
export const SES_PARCA_SINIRI = 1600;   // Gemini TTS isteği başına karakter (masaüstüyle aynı)
const SAHNE_HEDEF = 120;                // sahne başına hedef karakter (~8 sn anlatım; LTX klibi en fazla 8 sn)
const SESSIZ_HIZ = 14;                  // ses yokken süre tahmini: saniyede karakter

export const kimlik = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Kısa, kararlı metin özeti (cyrb53). Seslendirme parçasının değişip değişmediğini anlamak için. */
export function ozet(metin) {
  let a = 0xdeadbeef, b = 0x41c6ce57;
  for (let i = 0; i < metin.length; i++) {
    const k = metin.charCodeAt(i);
    a = Math.imul(a ^ k, 2654435761);
    b = Math.imul(b ^ k, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36);
}

export function yeniProje() {
  return {
    id: kimlik(), ad: "Yeni proje", olusturma: Date.now(), guncelleme: Date.now(),
    konu: "", hedefSaniye: 60, senaryo: "",
    dil: ayar.dil || "tr", ses: ayar.ses || "Charon", model: ayar.model || SES_MODELLERI[0], stil: VARSAYILAN_STIL,
    gorselStili: VARSAYILAN_GORSEL_STIL, gorselModel: ayar.gorselModel || GORSEL_MODELLERI[0].kimlik, boyut: ayar.boyut || "720x1280",
    altyazi: false, hareketli: false, sahneler: [], sesSureleri: {},
  };
}

export const yeniSahne = (metin = "") => ({
  id: kimlik(), metin, prompt: "", hareket: "", gorselVar: false, gorselSurum: 0, videoVar: false, videoSurum: 0 });

function cumleler(paragraf) {
  const sonuc = [];
  const desen = /[^.!?…。！？]+[.!?…。！？]+["'”’)\]]*\s*|[^.!?…。！？]+$/g;
  for (const es of paragraf.matchAll(desen)) {
    const c = es[0].trim();
    if (c) sonuc.push(c);
  }
  return sonuc;
}

/** Senaryoyu sahnelere böler: paragraf sınırı her zaman sahne sınırıdır, cümleler bölünmez. */
export function sahnelereBol(senaryo, hedef = SAHNE_HEDEF) {
  const sahneler = [];
  for (const paragraf of (senaryo || "").split(/\n\s*\n|\r\n\s*\r\n/)) {
    let biriken = "";
    for (const cumle of cumleler(paragraf.replace(/\s+/g, " ").trim())) {
      if (biriken && biriken.length + 1 + cumle.length > hedef) {
        sahneler.push(biriken);
        biriken = cumle;
      } else {
        biriken = biriken ? biriken + " " + cumle : cumle;
      }
    }
    if (biriken) sahneler.push(biriken);
  }
  // Tek başına kalan çok kısa parça (ör. "Ama neden?") önceki sahneye eklenir.
  const birlesik = [];
  for (const s of sahneler) {
    if (birlesik.length && s.length < 40 && birlesik[birlesik.length - 1].length + s.length <= hedef * 1.15) {
      birlesik[birlesik.length - 1] += " " + s;
    } else {
      birlesik.push(s);
    }
  }
  return birlesik.map((metin) => yeniSahne(metin));
}

/**
 * Seslendirme planı: art arda sahneler tek isteğe sığdığı kadar gruplanır.
 * Her parça `{ anahtar, metin, sahneler: [id…] }`; anahtar metin ve ses ayarlarından türetilir,
 * yani bir sahnenin metni değişince yalnızca o parça yeniden seslendirilir.
 */
export function sesPlani(proje) {
  const parcalar = [];
  let gecerli = null;
  for (const sahne of proje.sahneler) {
    const metin = (sahne.metin || "").trim();
    if (!metin) continue;
    if (!gecerli || gecerli.metin.length + 1 + metin.length > SES_PARCA_SINIRI) {
      gecerli = { metin: "", sahneler: [], uzunluklar: [] };
      parcalar.push(gecerli);
    }
    gecerli.metin += (gecerli.metin ? " " : "") + metin;
    gecerli.sahneler.push(sahne.id);
    gecerli.uzunluklar.push(metin.length);
  }
  for (const p of parcalar) {
    p.anahtar = ozet(JSON.stringify([p.metin, proje.dil, proje.ses, proje.model, proje.stil]));
  }
  return parcalar;
}

/**
 * Sahne zamanları. Ses hazırsa parça süresi sahnelere karakter sayısıyla orantılı dağıtılır
 * (yaklaşık zamanlama); ses hiç yoksa süre metin uzunluğundan tahmin edilir.
 * Döner: `{ sahneler: Map(id → { bas, bit }), toplam, sesDurumu: "tam" | "eksik" | "yok", eksik }`.
 */
export function zamanlama(proje) {
  const plan = sesPlani(proje);
  const sureler = proje.sesSureleri || {};
  const hazir = plan.filter((p) => sureler[p.anahtar] > 0).length;
  const sesDurumu = !plan.length || hazir === 0 ? "yok" : hazir === plan.length ? "tam" : "eksik";
  const sure = new Map();
  for (const p of plan) {
    const toplam = p.uzunluklar.reduce((a, b) => a + b, 0);
    const parcaSuresi = sesDurumu === "tam" ? sureler[p.anahtar] : toplam / SESSIZ_HIZ;
    p.sahneler.forEach((id, i) => sure.set(id, parcaSuresi * p.uzunluklar[i] / toplam));
  }
  const sahneler = new Map();
  let t = 0;
  for (const sahne of proje.sahneler) {
    // Metinsiz sahne (yalnızca görsel) sessiz videoda 3 sn görünür; sesli videoda yer almaz.
    const s = sure.has(sahne.id) ? Math.max(sure.get(sahne.id), sesDurumu === "tam" ? 0 : 2.5)
      : (sesDurumu === "tam" ? 0 : 3);
    sahneler.set(sahne.id, { bas: t, bit: t + s });
    t += s;
  }
  return { sahneler, toplam: t, sesDurumu, eksik: plan.length - hazir, parcaSayisi: plan.length };
}

/** Sahne metnini kısa altyazı bloklarına böler; süre karakter sayısıyla orantılı dağıtılır. */
export function altyaziBloklari(metin, bas, bit, azami = 34) {
  const bloklar = [];
  let satir = "";
  for (const kelime of (metin || "").trim().split(/\s+/).filter(Boolean)) {
    if (satir && satir.length + 1 + kelime.length > azami) {
      bloklar.push(satir);
      satir = kelime;
    } else {
      satir = satir ? satir + " " + kelime : kelime;
    }
    if (/[.!?…]["'”’)]*$/.test(kelime) && satir.length > azami * 0.4) {
      bloklar.push(satir);
      satir = "";
    }
  }
  if (satir) bloklar.push(satir);
  const toplam = bloklar.reduce((a, b) => a + b.length, 0) || 1;
  let t = bas;
  return bloklar.map((b) => {
    const s = (bit - bas) * b.length / toplam;
    const blok = { bas: t, bit: t + s, metin: b };
    t += s;
    return blok;
  });
}

/** Görsel modeline giden son prompt: sahne tarifi + projenin stil katmanı. */
export function gorselPromptu(proje, sahne) {
  const tarif = (sahne.prompt || "").trim() || `Cinematic still frame illustrating: ${(sahne.metin || "").trim()}`;
  const stil = (proje.gorselStili || "").trim();
  return stil ? `${tarif.replace(/[.\s]+$/, "")}. ${stil}` : tarif;
}

/** Görsel üretim boyutu: çıktı biçimine göre (dikey / yatay), masaüstündeki ölçüyle. */
export function uretimBoyutu(proje) {
  const [en, boy] = (proje.boyut || "720x1280").split("x").map(Number);
  return en < boy ? { en: 768, boy: 1344 } : { en: 1344, boy: 768 };
}
