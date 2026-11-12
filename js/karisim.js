// Ses karışımı: konuşma (seslendirme ya da dublaj) + müzik. Müzikler işaretlendikleri sırayla art arda
// çalar (1. bitince 2. başlar), konuşmanın altına serilir; konuşma sırasında kısılır (ducking), istenirse
// videonun sonuna kadar baştan tekrarlanır. Her müzik kendi kırpması, seviyesi ve karartmasıyla girer.
import { yenidenOrnekle } from "./hizalama.js";

function sinirla(pcm, hiz) {
  for (let i = 0; i < pcm.length; i++) pcm[i] = pcm[i] > 1 ? 1 : pcm[i] < -1 ? -1 : pcm[i];
  return { pcm, hiz };
}

/** Müziğin kırpılmış süresi (sn). */
export const muzikSuresi = (m) => Math.max(0, Math.min(m.sure || 0, m.bit ?? m.sure ?? 0) - Math.max(0, m.bas || 0));

/**
 * Müziklerin video boyunca nerede çalacağı: `[{ bas, sure, sira }]` (`sira`: `muzikler` içindeki yer).
 * Zaman çizelgesi ve karışım aynı hesabı kullanır.
 */
export function muzikDilimleri(muzikler, sure, tekrarla) {
  const dilimler = [];
  const tur = muzikler.reduce((t, m) => t + muzikSuresi(m), 0);
  if (!(tur > 0.05)) return dilimler;
  for (let t = 0; t < sure - 0.01;) {
    muzikler.forEach((m, sira) => {
      const s = Math.min(muzikSuresi(m), sure - t);
      if (s > 0.01) dilimler.push({ bas: t, sure: s, sira });
      t += Math.max(0, s);
    });
    if (!tekrarla) break;
  }
  return dilimler;
}

/**
 * `konusma`: `{ pcm, hiz }` ya da `null`; `sure`: saniye; `konusmaSeviyesi`: konuşma düzeyi (%).
 * `muzikler`: `[{ pcm, hiz, sure, bas, bit, seviye, giris, cikis }]` (sırayla). `bas` / `bit`: kırpma (sn),
 * `seviye`: düzey (%; 100 = dosyanın kendi düzeyi), `giris` / `cikis`: karartma (sn). Video müziği yarıda
 * kesiyorsa bitiş karartması tam kesildiği yere uygulanır.
 * `ducking`: konuşurken müziği kıs, `tekrarla`: müzikler bitince baştan çal.
 * Döner: `{ pcm, hiz }` (tek kanal, `sure` uzunluğunda) ya da ses yoksa `null`.
 */
export async function karistir({ konusma, muzikler = [], sure, konusmaSeviyesi = 100, ducking = true, tekrarla = true }) {
  const dilimler = muzikDilimleri(muzikler, sure, tekrarla);
  if (!konusma && !dilimler.length) return null;
  const hiz = konusma?.hiz || 48000;
  const n = Math.max(1, Math.round(sure * hiz));
  const cikti = new Float32Array(n);
  const kk = Math.max(0, konusmaSeviyesi) / 100;
  if (konusma) {
    const k = Math.min(n, konusma.pcm.length);
    for (let i = 0; i < k; i++) cikti[i] = konusma.pcm[i] * kk;
  }
  if (!dilimler.length) return sinirla(cikti, hiz);

  const iz = new Float32Array(n);
  const hazir = new Map();        // sıra → hedef hızda, kırpılmış müzik
  for (const d of dilimler) {
    const m = muzikler[d.sira];
    if (!hazir.has(d.sira)) {
      const tam = yenidenOrnekle(m.pcm, m.hiz, hiz), ilk = Math.round(Math.max(0, m.bas || 0) * hiz);
      hazir.set(d.sira, tam.subarray(ilk, ilk + Math.round(muzikSuresi(m) * hiz)));
    }
    const kaynak = hazir.get(d.sira), bas = Math.round(d.bas * hiz);
    const uzunluk = Math.min(kaynak.length, Math.round(d.sure * hiz), n - bas);
    const kazanc = Math.max(0, m.seviye ?? 20) / 100;
    const g = Math.round(Math.min(m.giris || 0, d.sure / 2) * hiz), c = Math.round(Math.min(m.cikis || 0, d.sure / 2) * hiz);
    for (let i = 0; i < uzunluk; i++) {
      let carpan = kazanc;
      if (i < g) carpan *= i / g;
      if (i >= uzunluk - c) carpan *= (uzunluk - 1 - i) / c;
      iz[bas + i] = kaynak[i] * carpan;
    }
  }
  // Zarf: konuşmanın düzeyi; hızlı yükselir (20 ms), yavaş düşer (350 ms). Eşik üstünde müzik kısılır.
  const yuksel = 1 - Math.exp(-1 / (0.02 * hiz)), dus = 1 - Math.exp(-1 / (0.35 * hiz));
  let zarf = 0, kisma = 1;
  for (let i = 0; i < n; i++) {
    if (konusma && ducking) {
      const duzey = Math.abs(cikti[i]);
      zarf += (duzey - zarf) * (duzey > zarf ? yuksel : dus);
      const hedef = zarf > 0.03 ? 0.3 : 1;
      kisma += (hedef - kisma) * (hedef < kisma ? yuksel : dus);
    }
    cikti[i] += iz[i] * kisma;
  }
  return sinirla(cikti, hiz);
}
