// Kelime zamanlaması: ses Cloudflare whisper ile dinlenir, duyulan kelimeler metnin kelimeleriyle
// eşlenir. Böylece sahne geçişleri ve altyazı, sesin gerçek akışına oturur (masaüstündeki
// `altyazi/hizalama.py` ile aynı model ve aynı yaklaşım).
import { konusmaTani } from "./cloudflare.js";

const DINLEME_HIZI = 16000;       // whisper'a gönderilen örnekleme hızı
const PENCERE = 45;               // tek istekte dinlenen en uzun süre (sn)
const EN_AZ_ORAN = 0.5;           // eşleşen kelime oranı bunun altındaysa dinleme güvenilmez sayılır

/** Tek kanallı sesi doğrusal aradeğerlemeyle `hedef` hızına çevirir. */
export function yenidenOrnekle(pcm, hiz, hedef) {
  if (hiz === hedef || !pcm.length) return pcm;
  const n = Math.max(1, Math.round(pcm.length * hedef / hiz));
  const cikti = new Float32Array(n), oran = (pcm.length - 1) / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const x = i * oran, k = Math.floor(x), f = x - k;
    cikti[i] = pcm[k] * (1 - f) + (pcm[Math.min(pcm.length - 1, k + 1)] || 0) * f;
  }
  return cikti;
}

/** Kesim noktasını hedefin çevresindeki en sessiz pencereye kaydırır: kelime bölünmesin. */
export function sessizKesim(pcm, hiz, hedefSn, pencere = 0.08, arama = 2.5) {
  const adim = Math.max(1, Math.round(hiz * pencere));
  const alt = Math.max(0, Math.round((hedefSn - arama) * hiz));
  const ust = Math.min(Math.round((hedefSn + arama) * hiz), Math.max(0, pcm.length - adim));
  if (ust <= alt) return Math.max(0, Math.min(pcm.length, Math.round(hedefSn * hiz)));
  let konum = alt, enerji = Infinity;
  for (let bas = alt; bas < ust; bas += Math.max(1, adim >> 1)) {
    let e = 0;
    for (let i = bas; i < bas + adim; i++) e += pcm[i] * pcm[i];
    if (e < enerji) { enerji = e; konum = bas; }
  }
  return konum + (adim >> 1);
}

/** 16 bit tek kanallı WAV dosyasını base64 metin olarak verir. */
export function wavBase64(pcm, hiz) {
  const bayt = new Uint8Array(44 + pcm.length * 2), veri = new DataView(bayt.buffer);
  const yaz = (konum, metin) => { for (let i = 0; i < metin.length; i++) bayt[konum + i] = metin.charCodeAt(i); };
  yaz(0, "RIFF"); veri.setUint32(4, 36 + pcm.length * 2, true); yaz(8, "WAVEfmt ");
  veri.setUint32(16, 16, true); veri.setUint16(20, 1, true); veri.setUint16(22, 1, true);
  veri.setUint32(24, hiz, true); veri.setUint32(28, hiz * 2, true);
  veri.setUint16(32, 2, true); veri.setUint16(34, 16, true);
  yaz(36, "data"); veri.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    veri.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let ikili = "";
  for (let i = 0; i < bayt.length; i += 0x8000) ikili += String.fromCharCode.apply(null, bayt.subarray(i, i + 0x8000));
  return btoa(ikili);
}

/** Sesin kaç whisper isteğiyle dinleneceği (onay metinleri için). */
export const istekSayisi = (sureSn) => Math.max(1, Math.ceil(sureSn / PENCERE));

/**
 * Sesi dinler ve duyulan kelimeleri döndürür: `[[bas, bit, kelime], …]` (saniye, sesin başına göre).
 * 45 saniyeden uzun ses sessiz noktalardan parçalara bölünür. `hesap`: `{ hesap, token, araci }`.
 */
export async function dinle({ hesap, pcm, hiz, dil, iptal }) {
  const mono = yenidenOrnekle(pcm, hiz, DINLEME_HIZI);
  const kelimeler = [];
  let bas = 0;
  while (bas < mono.length) {
    if (iptal?.()) throw new Error("Durduruldu.");
    let bit = Math.min(bas + PENCERE * DINLEME_HIZI, mono.length);
    if (bit < mono.length) bit = Math.max(sessizKesim(mono, DINLEME_HIZI, bit / DINLEME_HIZI), bas + 1);
    const sonuc = await konusmaTani({ ...hesap, ses: wavBase64(mono.subarray(bas, bit), DINLEME_HIZI), dil });
    const taban = bas / DINLEME_HIZI;
    const liste = (sonuc.segments || []).flatMap((s) => s.words || []).concat(sonuc.segments?.length ? [] : sonuc.words || []);
    for (const k of liste) {
      const metin = String(k.word || "").trim();
      if (metin) kelimeler.push([taban + (Number(k.start) || 0), taban + (Number(k.end) || 0), metin]);
    }
    bas = bit;
  }
  return kelimeler;
}

/** Karşılaştırma için sade biçim: küçük harf, aksansız, yalnızca harf ve rakam. */
export const sade = (kelime) => String(kelime).toLocaleLowerCase("tr").normalize("NFD").replace(/\p{M}+/gu, "").replace(/ı/g, "i")
  .replace(/[^\p{L}\p{N}]+/gu, "");
// Whisper çekim ekini ya da son harfi farklı duyabilir: kelimeler ilk dört harfiyle karşılaştırılır.
const esMi = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4));

export const metinKelimeleri = (metin) => String(metin || "").trim().split(/\s+/).filter(Boolean);

/**
 * Metnin her kelimesine sesteki zamanını verir. `duyulan`: `dinle` çıktısı, `sure`: sesin süresi (sn).
 * Metin kelimeleri duyulanlarla sıra hizalamasıyla (en uzun ortak alt dizi) eşlenir; eşleşmeyen kelimelerin
 * zamanı iki yanındaki eşleşmelerin arasına harf sayısıyla orantılı dağıtılır.
 * Döner: `[bas0, bit0, bas1, bit1, …]` (kelime başına iki sayı) ya da dinleme güvenilmezse `null`.
 */
export function kelimeZamanlari(metin, duyulan, sure) {
  const kelimeler = metinKelimeleri(metin);
  const a = kelimeler.map(sade);
  const d = duyulan.filter((k) => sade(k[2])).map((k) => [Math.max(0, Math.min(sure, k[0])), Math.max(0, Math.min(sure, Math.max(k[0], k[1]))), sade(k[2])]);
  const n = a.length, m = d.length;
  if (!n || !m) return null;
  // En uzun ortak alt dizi (dinamik programlama), sondan başa.
  const en = m + 1, tablo = new Uint16Array((n + 1) * en);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      tablo[i * en + j] = a[i] && esMi(a[i], d[j][2]) ? tablo[(i + 1) * en + j + 1] + 1 : Math.max(tablo[(i + 1) * en + j], tablo[i * en + j + 1]);
    }
  }
  const es = new Array(n).fill(-1);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] && esMi(a[i], d[j][2])) { es[i] = j; i++; j++; }
    else if (tablo[(i + 1) * en + j] >= tablo[i * en + j + 1]) i++;
    else j++;
  }
  const eslesen = es.filter((j) => j >= 0).length;
  if (eslesen < n * EN_AZ_ORAN) return null;

  const zaman = new Float64Array(n * 2);
  let i = 0, oncekiBit = 0;
  while (i < n) {
    if (es[i] >= 0) {
      zaman[i * 2] = Math.max(oncekiBit, d[es[i]][0]);
      zaman[i * 2 + 1] = oncekiBit = Math.max(zaman[i * 2], d[es[i]][1]);
      i++;
      continue;
    }
    let son = i;                                  // eşleşmeyen kelime dizisi: [i, son)
    while (son < n && es[son] < 0) son++;
    const bit = son < n ? Math.max(oncekiBit, d[es[son]][0]) : Math.max(oncekiBit, sure);
    const harf = kelimeler.slice(i, son).reduce((t, k) => t + k.length + 1, 0);
    let t = oncekiBit;
    for (let k = i; k < son; k++) {
      zaman[k * 2] = t;
      t += (bit - oncekiBit) * (kelimeler[k].length + 1) / harf;
      zaman[k * 2 + 1] = t;
    }
    oncekiBit = bit;
    i = son;
  }
  return Array.from(zaman, (t) => Math.round(t * 100) / 100);
}
