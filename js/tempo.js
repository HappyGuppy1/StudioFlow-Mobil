// Konuşma hızı ve ton: Gemini TTS'te bu ayarlar yoktur; ses üretildikten sonra burada işlenir (kota harcamaz).
// Hız, ton değişmeden değişir (WSOLA: örtüşen pencereler, en uyumlu yere kaydırılarak eklenir).
// Ton, önce süre uzatılıp/kısaltılıp sonra yeniden örneklenerek değişir; süre aynı kalır.

/** Sesi `tempo` kat hızlandırır (1'den küçükse yavaşlatır); ton değişmez. Çıktı `round(n / tempo)` örnektir. */
export function tempoDegistir(x, hiz, tempo) {
  const n = x.length, hedef = Math.max(1, Math.round(n / tempo));
  if (Math.abs(tempo - 1) < 0.004 || n < hiz * 0.1) return uzunlugaGetir(x, hedef);
  const N = Math.round(hiz * 0.03) & ~1, H = N >> 1, ara = Math.round(hiz * 0.012);
  const pencere = new Float32Array(N);
  for (let i = 0; i < N; i++) pencere[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / N);
  const y = new Float32Array(hedef + N);
  let onceki = 0;
  for (let k = 0; k * H < hedef; k++) {
    let konum = Math.round(k * H * tempo);
    if (k > 0) {
      // Doğal devam `x[onceki + H …]`; hedefin çevresinde ona en çok benzeyen yer aranır.
      const dogal = onceki + H;
      let enIyi = -Infinity, secilen = konum;
      for (let kayma = -ara; kayma <= ara; kayma += 3) {
        const aday = konum + kayma;
        if (aday < 0 || aday + N >= n || dogal + N >= n) continue;
        let benzerlik = 0;
        for (let i = 0; i < N; i += 6) benzerlik += x[aday + i] * x[dogal + i];
        if (benzerlik > enIyi) { enIyi = benzerlik; secilen = aday; }
      }
      konum = secilen;
    }
    konum = Math.max(0, Math.min(Math.max(0, n - N), konum));
    const taban = k * H;
    for (let i = 0; i < N && konum + i < n; i++) y[taban + i] += x[konum + i] * pencere[i];
    onceki = konum;
  }
  for (let i = 0; i < H && i < hedef; i++) y[i] /= Math.max(0.2, pencere[i]);      // ilk yarım pencere tek katmandır
  return y.slice(0, hedef);
}

function uzunlugaGetir(x, hedef) {
  if (x.length === hedef) return x;
  const y = new Float32Array(hedef);
  y.set(x.subarray(0, Math.min(hedef, x.length)));
  return y;
}

/**
 * Hız ve tonu birlikte uygular. `tempo`: hız çarpanı (1 = aynı), `yariTon`: ton kayması (yarım ton; 0 = aynı).
 * Çıktı her zaman `round(n / tempo)` örnektir; böylece zamanlama hesapla birebir tutar.
 */
export function hizTon(x, hiz, tempo = 1, yariTon = 0) {
  const hedef = Math.max(1, Math.round(x.length / tempo));
  const oran = Math.pow(2, (Number(yariTon) || 0) / 12);
  if (Math.abs(oran - 1) < 0.002) return tempoDegistir(x, hiz, tempo);
  const uzun = tempoDegistir(x, hiz, tempo / oran);          // süre `oran` kat uzar; yeniden örnekleme geri kısaltır
  const y = new Float32Array(hedef);
  for (let i = 0; i < hedef; i++) {
    const k = i * oran, a = Math.floor(k), f = k - a;
    if (a + 1 < uzun.length) y[i] = uzun[a] * (1 - f) + uzun[a + 1] * f;
    else if (a < uzun.length) y[i] = uzun[a];
  }
  return y;
}
