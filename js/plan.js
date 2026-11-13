// Sahne planı: anlatımı sahnelere bölme ve sahneleri gerçek konuşmaya hizalama.
// Masaüstü StudioFlow'daki `proje/sahneleme.py` ve `proje/akis_sahne.py` (sahneleri_zamanla) ile aynı kurallar:
// yapay zekâ ardışık cümleleri sahnelere gruplar ve her sahneye süre verir; plan toplam süreyi karşılayacak
// biçimde dengelenir; sonra her sahne sesteki ilk kelimesinin söylendiği ana oturtulur. Tavanı aşan sahne
// dilbilgisine uygun bir yerden bölünür, çok kısa sahne komşusuyla birleşir.
import { sozcukler, cumlelereBol, KELIME_HIZI, ozet } from "./sahne.js";

/** Ses yokken süre tahmini (kelime sayısından). */
export function tahminiSure(metin) {
  const n = sozcukler(metin).length;
  return n ? Math.max(n / KELIME_HIZI, 1) : 0;
}

const yarim = (saniye) => Math.ceil(saniye * 2) / 2;      // yarım saniyenin katına yukarı: video anlatımdan kısa kalmasın
const kirp = (deger, alt, ust) => { const n = Number(deger); return Math.min(ust, Math.max(alt, Number.isFinite(n) ? n : alt)); };

/** Sahne sayısı tavanı: verilen tavan, ama anlatımı kapsayacak kadar büyük (en az ⌈2 × süre / üst⌉). */
export const sahneTavani = (azami, sure, ust) => Math.max(1, Math.floor(azami), ust > 0 ? Math.ceil(2 * (sure || 0) / ust) : 0);

/** Tavanı aşan planı metin atmadan küçültür: toplam süresi en kısa komşu çift birleşir. */
function tavanaIndir(sahneler, azami) {
  const liste = sahneler.map((s) => ({ ...s }));
  while (liste.length > Math.max(1, azami)) {
    let k = 1;
    for (let i = 2; i < liste.length; i++) if (liste[i - 1].saniye + liste[i].saniye < liste[k - 1].saniye + liste[k].saniye) k = i;
    liste.splice(k - 1, 2, { text: `${liste[k - 1].text} ${liste[k].text}`.trim(), saniye: liste[k - 1].saniye + liste[k].saniye });
  }
  return liste;
}

// Bir parça asılı kalan bir işlev kelimesiyle bitmez; bağlaç ve ilgi kelimeleri sonraki parçayı başlatır.
const ASILI = new Set(("a an the of to in on at by for with from into onto over under about through across toward towards without "
  + "his her its their my your our this that these those and or but nor so as than if when while until because "
  + "who whom whose which where was were is are be been had has have would could should will can not very no "
  + "ve ile ya veya ama fakat ki bir bu şu çok en").split(" "));
const BAGLAC = new Set("and but or so then until when while because where who which after before as if though although still ama fakat çünkü sonra ve".split(" "));
const yalin = (kelime) => kelime.replace(/^["'”’)\]}(“‘[{]+|["'”’)\]}(“‘[{]+$/g, "").replace(/[.,;:!?…—–]+$/, "").toLocaleLowerCase("tr");

/**
 * İki kelime arasından kesmenin uygunluğu: küçük daha iyi, `null` yasak.
 * 0 cümle sonu · 1 virgül / noktalı virgül / iki nokta / tire · 2 bağlacın önü · 3 sıradan kelime sınırı.
 */
export function bolmePuani(onceki, sonraki) {
  const bitis = onceki.replace(/["'”’)\]}]+$/, "");
  if (/[.!?…]$/.test(bitis)) return 0;
  if (/[,;:—–]$/.test(bitis)) return 1;
  if (ASILI.has(yalin(onceki))) return null;
  if (BAGLAC.has(yalin(sonraki))) return 2;
  return 3;
}

/** "Number four." · "Numara sekiz." gibi bölüm başlığı mı? Başlık sonraki bölümün ilk sahnesine aittir. */
export function bolumBasligiMi(metin) {
  const kelimeler = sozcukler(metin);
  if (!kelimeler.length || kelimeler.length > 6) return false;
  const ilkler = kelimeler.slice(0, 4).map(yalin);
  return ilkler.includes("number") || ilkler.includes("numara");
}

/** Sahneyi ikiye bölecek kelime sırası: en iyi puanlı sınır, eşitlikte ortaya en yakın. İki yanda en az iki kelime kalır. */
function bolmeNoktasi(kelimeler) {
  const orta = kelimeler.length / 2;
  let secilen = null;
  for (let k = 2; k < kelimeler.length - 1; k++) {
    const puan = bolmePuani(kelimeler[k - 1], kelimeler[k]);
    if (puan === null) continue;
    const aday = [puan, Math.abs(k - orta), k];
    if (!secilen || aday[0] < secilen[0] || (aday[0] === secilen[0] && aday[1] < secilen[1])) secilen = aday;
  }
  return secilen ? secilen[2] : Math.floor(kelimeler.length / 2);
}

/**
 * Sahne sürelerini aralığa kırpar ve toplamı anlatım süresini karşılayacak hâle getirir. Süreler içeriğe göre
 * değişken kalır. Okunması tavanı aşan sahne ortaya en yakın uygun yerden bölünür; kalan eksik, boşluğu olan
 * sahnelere oransal dağıtılır.
 */
function planNormalize(sahneler, toplamSure, alt, ust, azamiSahne = 60) {
  const hedef = Math.max(toplamSure || 0, 0), azami = sahneTavani(azamiSahne, hedef, ust);
  for (const s of sahneler) s.saniye = kirp(s.saniye, alt, ust);
  for (let tur = 0; tur < 400; tur++) {
    const toplam = sahneler.reduce((a, s) => a + s.saniye, 0);
    if (!sahneler.length || hedef <= 0 || toplam + 1e-6 >= hedef) break;
    const kelime = sahneler.map((s) => Math.max(1, sozcukler(s.text).length));
    const birim = hedef / kelime.reduce((a, b) => a + b, 0);
    // %15 pay: tavanı azıcık aşan sahne bölünmez (kırıntı üretir); kırpılması yeter.
    const uzun = kelime.map((k, i) => (k * birim > ust * 1.15 && k >= 4 ? i : -1)).filter((i) => i >= 0);
    if (uzun.length && sahneler.length < azami) {
      const sira = uzun.reduce((a, b) => (kelime[b] > kelime[a] ? b : a));
      const kelimeler = sozcukler(sahneler[sira].text), orta = bolmeNoktasi(kelimeler);
      sahneler.splice(sira, 1, { text: kelimeler.slice(0, orta).join(" ") }, { text: kelimeler.slice(orta).join(" ") });
      kelime.splice(sira, 1, orta, kelimeler.length - orta);
      sahneler.forEach((s, i) => { s.saniye = kirp(kelime[i] * birim, alt, ust); });
      continue;
    }
    const pay = sahneler.map((s) => Math.max(0, ust - s.saniye)), havuz = pay.reduce((a, b) => a + b, 0);
    if (havuz <= 1e-6) break;
    const eksik = hedef - toplam;
    sahneler.forEach((s, i) => { s.saniye += Math.min(pay[i], eksik * pay[i] / havuz); });
  }
  for (const s of sahneler) s.saniye = kirp(yarim(s.saniye), alt, ust);
  return sahneler;
}

/**
 * Yapay zekâ olmadan içerik tabanlı sahne planı (yedek): bir cümle = bir sahne, süresi kelime sayısına göre.
 * Tavanı aşan uzun cümle kelime düzeyinde parçalara bölünür.
 */
export function icerikSahneleri(metin, toplamSure, alt, ust, azamiSahne = 60) {
  const cumleler = cumlelereBol(metin);
  if (!cumleler.length) return [];
  if (!(toplamSure > 0)) toplamSure = tahminiSure(metin);
  const toplamKelime = cumleler.reduce((a, c) => a + sozcukler(c).length, 0) || 1;
  const birim = Math.max(toplamSure, alt) / toplamKelime;
  const sahneler = [];
  for (const cumle of cumleler) {
    const kelimeler = sozcukler(cumle), dogal = kelimeler.length * birim;
    if (dogal > ust) {
      const adet = Math.max(2, Math.ceil(dogal / ust)), boy = Math.max(1, Math.ceil(kelimeler.length / adet));
      for (let i = 0; i < kelimeler.length; i += boy) {
        const parca = kelimeler.slice(i, i + boy);
        sahneler.push({ text: parca.join(" "), saniye: Math.max(alt, parca.length * birim) });
      }
    } else {
      sahneler.push({ text: cumle, saniye: Math.max(alt, dogal) });
    }
  }
  const tavan = sahneTavani(azamiSahne, toplamSure, ust);
  return planNormalize(tavanaIndir(sahneler, tavan), toplamSure, alt, ust, tavan);
}

/**
 * Yapay zekânın planını (`[{ cumleler: [no…], saniye }]`) sahne listesine çevirir: `[{ text, saniye }]`.
 * Numaralar eksik, tekrarlı ya da sırasızsa plan atılmaz, gruplama niyeti korunarak onarılır: her grubun ilk
 * cümlesi bir sahne başlangıcı sayılır. Okunamazsa `null`.
 */
export function planKur(kayitlar, metin, toplamSure, alt, ust) {
  const cumleler = cumlelereBol(metin);
  if (!Array.isArray(kayitlar) || !kayitlar.length || !cumleler.length) return null;
  const gruplar = [];
  for (const oge of kayitlar) {
    const idler = Array.isArray(oge?.cumleler) ? oge.cumleler.map(Number) : null;
    if (!idler?.length || idler.some((i) => !Number.isInteger(i) || i < 1 || i > cumleler.length)) return null;
    gruplar.push({ idler, saniye: oge.saniye });
  }
  const kapsanan = gruplar.flatMap((g) => g.idler);
  let sahneler;
  if (kapsanan.length === cumleler.length && kapsanan.every((no, i) => no === i + 1)) {
    sahneler = gruplar.map((g) => ({ text: g.idler.map((i) => cumleler[i - 1]).join(" "), saniye: g.saniye }));
  } else {
    const baslar = new Map();
    for (const g of gruplar) { const bas = Math.min(...g.idler); if (!baslar.has(bas)) baslar.set(bas, g.saniye); }
    if (!baslar.has(1)) baslar.set(1, gruplar[0].saniye);
    const sirali = [...baslar.keys()].sort((a, b) => a - b);
    sahneler = sirali.map((bas, k) => ({ text: cumleler.slice(bas - 1, (sirali[k + 1] ?? cumleler.length + 1) - 1).join(" "), saniye: baslar.get(bas) }));
  }
  if (!(toplamSure > 0)) toplamSure = tahminiSure(metin);
  const tavan = sahneTavani(60, toplamSure, ust);
  return planNormalize(tavanaIndir(sahneler.map((s) => ({ ...s, saniye: kirp(s.saniye, alt, ust) })), tavan), toplamSure, alt, ust, tavan);
}

/** Planı anlatıma ve tavana bağlayan kısa iz: metin ya da tavan değişirse kayıtlı plan kullanılmaz. */
export const planIzi = (metin, ust) => ozet(sozcukler(metin).join(" ") + "\n" + ust);

/**
 * Sahneleri gerçek konuşmanın kelime zamanlarına hizalar. `kz`: anlatımın bütün kelimelerinin `[bas, bit]`
 * zamanları (bkz. `sahne.zamanlama`), `sure`: sesin süresi. Her sahne ilk kelimesinin söylendiği anda başlar.
 * `ust` saniyeyi aşan sahne en iyi puanlı (cümle sonu < virgül < bağlaç önü < kelime sınırı), iki parçayı en
 * eşit yapan yerden bölünür; `alt` saniyeden kısa sahne komşusuyla birleşir (bölüm başlığı sonrakine katılır).
 * Döner: sahnelerin kelime aralıkları `[[kb, ks], …]` ya da sahne metinleri anlatımı kapsamıyorsa `null`.
 */
export function sahneleriZamanla(metin, sahneler, kz, sure, alt, ust, azamiSahne = 60) {
  const asil = sozcukler(metin);
  if (!sahneler?.length || !asil.length || !(sure > 0) || kz.length !== asil.length) return null;
  const adetler = sahneler.map((s) => sozcukler(s.text).length);
  if (adetler.some((a) => !a) || adetler.reduce((a, b) => a + b, 0) !== asil.length) return null;
  const baslar = kz.map((k) => k[0]), bitisler = kz.map((k) => k[1]);
  const sinir = (k) => (k === 0 ? 0 : k === baslar.length ? sure : baslar[k]);
  const bol = (i, son) => {
    if (son - i <= 1 || sinir(son) - sinir(i) <= ust + 1e-6) return [[i, son]];
    const orta = (sinir(i) + sinir(son)) / 2;
    let secilen = null;
    const kucukMu = (a, b) => { for (let n = 0; n < 3; n++) if (a[n] !== b[n]) return a[n] < b[n]; return false; };      // sözlük sırası
    const dene = (aday) => { if (!secilen || kucukMu(aday, secilen)) secilen = aday; };
    for (let k = i + 1; k < son; k++) {
      const puan = bolmePuani(asil[k - 1], asil[k]);
      if (puan === null) continue;
      const yeterli = sinir(k) - sinir(i) >= alt && sinir(son) - sinir(k) >= alt;
      dene([yeterli ? 0 : 1, puan, Math.abs(sinir(k) - orta), k]);
    }
    if (!secilen) for (let k = i + 1; k < son; k++) dene([0, 9, Math.abs(sinir(k) - orta), k]);      // her sınır yasak: ortadan kes
    return [...bol(i, secilen[3]), ...bol(secilen[3], son)];
  };
  let gruplar = [], konum = 0;
  for (const adet of adetler) { gruplar.push(...bol(konum, konum + adet)); konum += adet; }
  const baslik = (g) => bolumBasligiMi(asil.slice(g[0], g[1]).join(" "));
  const soylenme = (g) => bitisler[g[1] - 1] - baslar[g[0]];
  for (let i = 0; i < gruplar.length;) {
    const kisa = soylenme(gruplar[i]) < alt;
    if (kisa && baslik(gruplar[i]) && i + 1 < gruplar.length && sinir(gruplar[i + 1][1]) - sinir(gruplar[i][0]) <= ust) {
      gruplar[i][1] = gruplar[i + 1][1];
      gruplar.splice(i + 1, 1);
      continue;
    }
    if (kisa && i > 0 && !baslik(gruplar[i]) && sinir(gruplar[i][1]) - sinir(gruplar[i - 1][0]) <= ust) {
      gruplar[i - 1][1] = gruplar[i][1];
      gruplar.splice(i, 1);
      continue;
    }
    i++;
  }
  // Bölmenin ürettiği fazlalık geri birleşir; bölüm sınırı geçilmez.
  while (gruplar.length > Math.max(1, azamiSahne) && gruplar.length > 1) {
    let k = -1;
    for (let t = 1; t < gruplar.length; t++) {
      if (baslik(gruplar[t]) || sinir(gruplar[t][1]) - sinir(gruplar[t - 1][0]) > ust) continue;
      if (k < 0 || soylenme(gruplar[t]) < soylenme(gruplar[k])) k = t;
    }
    if (k < 0) break;
    gruplar[k - 1][1] = gruplar[k][1];
    gruplar.splice(k, 1);
  }
  return gruplar;
}
