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
    altyazi: false, hareketli: false, sahneler: [], sesSureleri: {}, sesZamanlari: {}, sesHiz: 0, sesTon: 0,
    gorselEn: 0, gorselBoy: 0, gorselAdim: 0, gorselGuidance: 0, onAyar: "", gorselOnay: "BEKLİYOR",
    diller: {}, muzikler: [], muzikSira: [], muzikAyar: { tekrarla: true, ducking: true },
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

/** Konuşma hızı çarpanı: `sesHiz` yüzdesi (−30 … +30). Ses üretildikten sonra uygulanır; süreler buna bölünür. */
export const hizCarpani = (proje) => Math.min(1.5, Math.max(0.6, 1 + (Number(proje.sesHiz) || 0) / 100));
const kelimeSay = (metin) => (metin || "").trim().split(/\s+/).filter(Boolean).length;
const HIZA_TAVAN = 1.3;        // sahneye sığdırırken dublajın en çok hızlandırılacağı kat
const HIZA_SON_TAVAN = 1.6;    // son sahnede: video süresini aşmamak için

/**
 * Görünümün kendi sesine göre sahne zamanları. Parçanın kelime zamanları varsa (`sesZamanlari`, whisper)
 * sahne sınırı sesteki gerçek yere oturur; yoksa parça süresi sahnelere karakter sayısıyla orantılı dağıtılır.
 * Ses hiç yoksa süre metin uzunluğundan tahmin edilir.
 */
function kendiZamanlama(proje) {
  const plan = sesPlani(proje);
  const sureler = proje.sesSureleri || {}, zamanlar = proje.sesZamanlari || {}, F = hizCarpani(proje);
  const hazir = plan.filter((p) => sureler[p.anahtar] > 0).length;
  const sesDurumu = !plan.length || hazir === 0 ? "yok" : hazir === plan.length ? "tam" : "eksik";
  const sure = new Map(), goreli = new Map();      // goreli: sahne id → [[bas, bit], …] (sahnenin başına göre)
  let zamanli = 0;
  for (const p of plan) {
    const toplam = p.uzunluklar.reduce((a, b) => a + b, 0);
    const parcaSuresi = (sesDurumu === "tam" ? sureler[p.anahtar] : toplam / SESSIZ_HIZ) / F;
    const sayilar = p.sahneler.map((id) => kelimeSay(proje.sahneler.find((s) => s.id === id)?.metin));
    const kz = sesDurumu === "tam" ? zamanlar[p.anahtar] : null;
    if (Array.isArray(kz) && kz.length && kz.length === 2 * sayilar.reduce((a, b) => a + b, 0)) {
      zamanli++;
      // Sahne sınırı: önceki sahnenin son kelimesiyle sonrakinin ilk kelimesinin ortası.
      const sinir = [0];
      let ilk = 0;
      for (let i = 1; i < sayilar.length; i++) {
        ilk += sayilar[i - 1];
        sinir.push(Math.min(parcaSuresi, Math.max(sinir[i - 1], (kz[2 * ilk - 1] + kz[2 * ilk]) / 2 / F)));
      }
      sinir.push(parcaSuresi);
      ilk = 0;
      p.sahneler.forEach((id, i) => {
        sure.set(id, sinir[i + 1] - sinir[i]);
        const liste = [];
        for (let k = ilk; k < ilk + sayilar[i]; k++) liste.push([Math.max(0, kz[2 * k] / F - sinir[i]), Math.max(0, kz[2 * k + 1] / F - sinir[i])]);
        goreli.set(id, liste);
        ilk += sayilar[i];
      });
    } else {
      p.sahneler.forEach((id, i) => sure.set(id, parcaSuresi * p.uzunluklar[i] / toplam));
    }
  }
  const sahneler = new Map(), kelimeler = new Map();
  let t = 0;
  for (const sahne of proje.sahneler) {
    // Metinsiz sahne (yalnızca görsel) sessiz videoda 3 sn görünür; sesli videoda yer almaz.
    const s = sure.has(sahne.id) ? Math.max(sure.get(sahne.id), sesDurumu === "tam" ? 0 : 2.5)
      : (sesDurumu === "tam" ? 0 : 3);
    sahneler.set(sahne.id, { bas: t, bit: t + s });
    if (goreli.has(sahne.id)) kelimeler.set(sahne.id, goreli.get(sahne.id).map(([a, b]) => [t + a, t + b]));
    t += s;
  }
  return { sahneler, kelimeler, toplam: t, sesDurumu, eksik: plan.length - hazir, parcaSayisi: plan.length,
           zamanliParca: zamanli, kesin: sesDurumu === "tam" && zamanli === plan.length };
}

/**
 * Sahne zamanları.
 * Döner: `{ sahneler: Map(id → { bas, bit }), kelimeler: Map(id → [[bas, bit], …]), toplam,
 *           sesDurumu: "tam" | "eksik" | "yok", eksik, parcaSayisi, zamanliParca, kesin, hiza }`.
 * `kesin`: bütün parçaların kelime zamanı var (altyazı sese oturuyor).
 *
 * "Sahnelere göre hizalı" dublajda (`proje.hizali`, bkz. `dilGorunumu`) sahneler asıl seslendirmenin zamanlarında
 * kalır; dublajın her sahnesi kendi sahnesinin başına yerleştirilir, sığmıyorsa hızlandırılır (`hiza`:
 * Map(id → { kaynakBas, kaynakBit, hedefBas, tempo })). Asıl ses ya da dublaj sesi tam değilse dublaj kendi zamanlarıyla kalır.
 */
export function zamanlama(proje) {
  const kendi = kendiZamanlama(proje);
  if (!proje.hizali || !proje.asil) return kendi;
  const asil = kendiZamanlama(proje.asil);
  if (asil.sesDurumu !== "tam" || kendi.sesDurumu !== "tam") return kendi;
  const sesli = proje.sahneler.filter((s) => { const a = kendi.sahneler.get(s.id); return a.bit > a.bas; });
  const hiza = new Map(), kelimeler = new Map();
  let onceki = 0;
  sesli.forEach((sahne, i) => {
    const kaynak = kendi.sahneler.get(sahne.id), yuva = asil.sahneler.get(sahne.id);
    const bas = Math.max(yuva.bas, onceki), uzunluk = kaynak.bit - kaynak.bas;
    const tempo = Math.min(i === sesli.length - 1 ? HIZA_SON_TAVAN : HIZA_TAVAN, Math.max(1, uzunluk / Math.max(0.2, yuva.bit - bas)));
    hiza.set(sahne.id, { kaynakBas: kaynak.bas, kaynakBit: kaynak.bit, hedefBas: bas, tempo });
    if (kendi.kelimeler.has(sahne.id)) {
      kelimeler.set(sahne.id, kendi.kelimeler.get(sahne.id).map(([a, b]) => [bas + (a - kaynak.bas) / tempo, bas + (b - kaynak.bas) / tempo]));
    }
    onceki = bas + uzunluk / tempo;
  });
  const toplam = Math.max(asil.toplam, onceki);
  const sahneler = new Map(asil.sahneler);
  const sonSahne = proje.sahneler[proje.sahneler.length - 1];
  if (sonSahne && toplam > asil.toplam) sahneler.set(sonSahne.id, { bas: sahneler.get(sonSahne.id).bas, bit: toplam });
  return { ...kendi, sahneler, kelimeler, toplam, hiza };
}

/**
 * Sahne metnini kısa altyazı bloklarına böler. `kelimeler` (o sahnenin kelime zamanları, `[[bas, bit], …]`)
 * verilirse her blok kendi ilk kelimesinde başlar, son kelimesinde biter; verilmezse süre `bas`–`bit`
 * arasına karakter sayısıyla orantılı dağıtılır (yaklaşık).
 */
export function altyaziBloklari(metin, bas, bit, azami = 34, kelimeler = null) {
  const sozcukler = (metin || "").trim().split(/\s+/).filter(Boolean);
  const bloklar = [];        // { metin, ilk, son }: kelime sıraları
  let satir = "", ilk = 0;
  sozcukler.forEach((kelime, i) => {
    if (satir && satir.length + 1 + kelime.length > azami) {
      bloklar.push({ metin: satir, ilk, son: i - 1 });
      satir = kelime;
      ilk = i;
    } else {
      satir = satir ? satir + " " + kelime : kelime;
    }
    if (/[.!?…]["'”’)]*$/.test(kelime) && satir.length > azami * 0.4) {
      bloklar.push({ metin: satir, ilk, son: i });
      satir = "";
      ilk = i + 1;
    }
  });
  if (satir) bloklar.push({ metin: satir, ilk, son: sozcukler.length - 1 });
  if (kelimeler && kelimeler.length === sozcukler.length) {
    return bloklar.map((b) => ({ bas: kelimeler[b.ilk][0], bit: Math.max(kelimeler[b.ilk][0], kelimeler[b.son][1]), metin: b.metin, kesin: true }));
  }
  const toplam = bloklar.reduce((a, b) => a + b.metin.length, 0) || 1;
  let t = bas;
  return bloklar.map((b) => {
    const s = (bit - bas) * b.metin.length / toplam;
    const blok = { bas: t, bit: t + s, metin: b.metin };
    t += s;
    return blok;
  });
}

/**
 * Bütün videonun altyazı blokları (sırayla). Kelime zamanlı bloklar okunabilir kalsın diye biraz ekranda tutulur:
 * sonraki blok hemen geliyorsa ona kadar, gelmiyorsa 0,4 sn daha; hiçbir blok sonrakiyle üst üste binmez.
 */
export function tumBloklar(gorunum, z = zamanlama(gorunum)) {
  const bloklar = gorunum.sahneler.flatMap((s) => {
    const a = z.sahneler.get(s.id), kelimeler = z.kelimeler?.get(s.id);
    if (!(s.metin || "").trim() || !(a.bit > a.bas || kelimeler)) return [];
    return altyaziBloklari(s.metin, a.bas, a.bit, 34, kelimeler);
  });
  bloklar.forEach((b, i) => {
    const sonraki = bloklar[i + 1]?.bas ?? z.toplam;
    if (b.kesin) b.bit = sonraki - b.bit < 0.8 ? sonraki : b.bit + 0.4;
    b.bit = Math.max(b.bas, Math.min(b.bit, sonraki));
  });
  return bloklar.filter((b) => b.bit > b.bas);
}

/** Görsel modeline giden son prompt: sahne tarifi + projenin stil katmanı. */
export function gorselPromptu(proje, sahne) {
  const tarif = (sahne.prompt || "").trim() || `Cinematic still frame illustrating: ${(sahne.metin || "").trim()}`;
  const stil = (proje.gorselStili || "").trim();
  return stil ? `${tarif.replace(/[.\s]+$/, "")}. ${stil}` : tarif;
}

/** Biçime göre varsayılan görsel üretim boyutu (dikey / yatay), masaüstündeki ölçüyle. */
export function varsayilanGorselBoyutu(proje) {
  const [en, boy] = (proje.boyut || "720x1280").split("x").map(Number);
  return en < boy ? { en: 768, boy: 1344 } : { en: 1344, boy: 768 };
}

/** Görsel üretim boyutu: Ayarlar'da elle verilmişse o, verilmemişse biçimin varsayılanı. */
export function uretimBoyutu(proje) {
  const v = varsayilanGorselBoyutu(proje);
  return { en: Number(proje.gorselEn) || v.en, boy: Number(proje.gorselBoy) || v.boy };
}

/** Dublaj kaydının adı: küçük harf, boşluk yerine tire. Boşsa dil kodu. */
export const dublajAdi = (isim, dil) => String(isim || "").trim().toLocaleLowerCase("tr").replace(/\s+/g, "-").replace(/[^\p{L}\p{N}\-_.]+/gu, "").slice(0, 30) || dil;

/**
 * Dublaj kaydı için proje görünümü: sahne metinleri o kaydın çevirileri; dil, ses, model ve süreler o kaydınkidir.
 * `sesPlani` ve `zamanlama` bu görünümle çağrılınca o dublajın planını ve zamanlamasını verir.
 * Süreler ve kelime zamanları nesneleri paylaşılır (kopyalanmaz): görünüme yazılan projeye de yazılmış olur.
 * `ad`: kaydın adı (eski kayıtlarda dil kodunun kendisi).
 */
export function dilGorunumu(proje, ad) {
  const dublaj = proje.diller?.[ad];
  if (!dublaj) return proje;
  dublaj.sesZamanlari ||= {};
  return { ...proje, dil: dublaj.dil || ad, ses: dublaj.ses || proje.ses, model: dublaj.model || proje.model,
           sesSureleri: dublaj.sesSureleri, sesZamanlari: dublaj.sesZamanlari, hizali: !!dublaj.hizali, asil: proje,
           sahneler: proje.sahneler.map((s) => ({ ...s, metin: dublaj.metinler[s.id] || "" })) };
}

/** Projenin bütün dillerindeki (asıl + dublajlar) geçerli ses parçası anahtarları. */
export function tumSesAnahtarlari(proje) {
  const anahtarlar = new Set(sesPlani(proje).map((p) => p.anahtar));
  for (const kod of Object.keys(proje.diller || {})) for (const p of sesPlani(dilGorunumu(proje, kod))) anahtarlar.add(p.anahtar);
  return anahtarlar;
}

/** Altyazı bloklarından SRT dosyası metni üretir. */
export function srtMetni(bloklar) {
  const zaman = (t) => {
    const ms = Math.max(0, Math.round(t * 1000));
    const iki = (n) => String(n).padStart(2, "0");
    return `${iki(Math.floor(ms / 3600000))}:${iki(Math.floor(ms / 60000) % 60)}:${iki(Math.floor(ms / 1000) % 60)},${String(ms % 1000).padStart(3, "0")}`;
  };
  return bloklar.map((b, i) => `${i + 1}\n${zaman(b.bas)} --> ${zaman(b.bit)}\n${b.metin}\n`).join("\n");
}
