// Ses karışımı: konuşma (seslendirme ya da dublaj) + müzik. Müzik konuşmanın altına serilir;
// konuşma sırasında kısılır (ducking), istenirse videonun sonuna kadar tekrarlanır, başta ve sonda karartılır.

async function yenidenOrnekle(pcm, hiz, hedef) {
  if (hiz === hedef) return pcm;
  const Baglam = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const baglam = new Baglam(1, Math.ceil(pcm.length * hedef / hiz), hedef);
  const tampon = baglam.createBuffer(1, pcm.length, hiz);
  tampon.getChannelData(0).set(pcm);
  const kaynak = baglam.createBufferSource();
  kaynak.buffer = tampon;
  kaynak.connect(baglam.destination);
  kaynak.start();
  return (await baglam.startRendering()).getChannelData(0);
}

function sinirla(pcm, hiz) {
  for (let i = 0; i < pcm.length; i++) pcm[i] = pcm[i] > 1 ? 1 : pcm[i] < -1 ? -1 : pcm[i];
  return { pcm, hiz };
}

/**
 * `konusma`: `{ pcm, hiz }` ya da `null`; `muzik`: `{ pcm, hiz }` ya da `null`; `sure`: saniye.
 * `seviye`: müzik düzeyi (%; 100 = dosyanın kendi düzeyi), `konusmaSeviyesi`: konuşma düzeyi (%),
 * `ducking`: konuşurken müziği kıs, `tekrarla`: müzik kısaysa baştan çal, `giris` / `cikis`: karartma (sn).
 * Döner: `{ pcm, hiz }` (tek kanal, `sure` uzunluğunda) ya da ikisi de yoksa `null`.
 */
export async function karistir({ konusma, muzik, sure, seviye = 20, konusmaSeviyesi = 100, ducking = true, tekrarla = true, giris = 1.5, cikis = 1.5 }) {
  if (!konusma && !muzik) return null;
  const hiz = konusma?.hiz || 48000;
  const n = Math.max(1, Math.round(sure * hiz));
  const cikti = new Float32Array(n);
  const kk = Math.max(0, konusmaSeviyesi) / 100;
  if (konusma) {
    const k = Math.min(n, konusma.pcm.length);
    for (let i = 0; i < k; i++) cikti[i] = konusma.pcm[i] * kk;
  }
  if (!muzik) return sinirla(cikti, hiz);
  const m = await yenidenOrnekle(muzik.pcm, muzik.hiz, hiz);
  if (!m.length) return sinirla(cikti, hiz);
  const kazanc = Math.max(0, seviye) / 100;
  const son = tekrarla ? n : Math.min(n, m.length);          // müziğin bittiği örnek
  const g = Math.max(1, Math.round(Math.min(giris, sure / 2) * hiz));
  const c = Math.max(1, Math.round(Math.min(cikis, sure / 2) * hiz));
  // Zarf: konuşmanın düzeyi; hızlı yükselir (20 ms), yavaş düşer (350 ms). Eşik üstünde müzik kısılır.
  const yuksel = 1 - Math.exp(-1 / (0.02 * hiz)), dus = 1 - Math.exp(-1 / (0.35 * hiz));
  let zarf = 0, kisma = 1;
  for (let i = 0; i < son; i++) {
    let carpan = kazanc;
    if (konusma && ducking) {
      const duzey = Math.abs(cikti[i]);
      zarf += (duzey - zarf) * (duzey > zarf ? yuksel : dus);
      const hedef = zarf > 0.03 ? 0.3 : 1;
      kisma += (hedef - kisma) * (hedef < kisma ? yuksel : dus);
      carpan *= kisma;
    }
    if (giris > 0 && i < g) carpan *= i / g;
    if (cikis > 0 && i >= son - c) carpan *= (son - 1 - i) / c;
    cikti[i] += m[i % m.length] * carpan;
  }
  return sinirla(cikti, hiz);
}
