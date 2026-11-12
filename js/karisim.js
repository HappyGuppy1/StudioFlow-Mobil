// Ses karışımı: anlatım + müzik. Müzik anlatımın altına serilir; konuşma sırasında kısılır (ducking),
// videodan kısaysa baştan tekrarlanır, başta ve sonda karartılır.

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

/**
 * `anlatim`: `{ pcm, hiz }` ya da `null` (sessiz video); `muzik`: `{ pcm, hiz }`; `sure`: saniye.
 * `seviye`: müzik düzeyi (0-100); `ducking`: konuşurken müziği kıs; `karartma`: baş/son karartma (sn).
 * Döner: `{ pcm, hiz }` (tek kanal, `sure` uzunluğunda).
 */
export async function karistir({ anlatim, muzik, sure, seviye = 20, ducking = true, karartma = 1.5 }) {
  const hiz = anlatim?.hiz || 48000;
  const n = Math.max(1, Math.round(sure * hiz));
  const cikis = new Float32Array(n);
  if (anlatim) cikis.set(anlatim.pcm.subarray(0, Math.min(n, anlatim.pcm.length)));
  const m = await yenidenOrnekle(muzik.pcm, muzik.hiz, hiz);
  if (!m.length) return { pcm: cikis, hiz };
  const kazanc = Math.max(0, Math.min(100, seviye)) / 100;
  const k = Math.max(1, Math.round(Math.min(karartma, sure / 2) * hiz));
  // Zarf: konuşmanın düzeyi; hızlı yükselir (20 ms), yavaş düşer (350 ms). Eşik üstünde müzik kısılır.
  const yuksel = 1 - Math.exp(-1 / (0.02 * hiz)), dus = 1 - Math.exp(-1 / (0.35 * hiz));
  let zarf = 0, kisma = 1;
  for (let i = 0; i < n; i++) {
    let carpan = kazanc;
    if (anlatim && ducking) {
      const duzey = Math.abs(cikis[i]);
      zarf += (duzey - zarf) * (duzey > zarf ? yuksel : dus);
      const hedef = zarf > 0.03 ? 0.3 : 1;
      kisma += (hedef - kisma) * (hedef < kisma ? yuksel : dus);
      carpan *= kisma;
    }
    if (i < k) carpan *= i / k;
    if (i >= n - k) carpan *= (n - 1 - i) / k;
    const ornek = cikis[i] + m[i % m.length] * carpan;
    cikis[i] = ornek > 1 ? 1 : ornek < -1 ? -1 : ornek;
  }
  return { pcm: cikis, hiz };
}
