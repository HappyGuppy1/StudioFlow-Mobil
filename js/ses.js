// Ses yardımcıları: dosya çözme, WAV yazma, base64.

let _baglam = null;

/** Paylaşılan AudioContext. iOS'ta ilk çağrı bir dokunma olayının içinde yapılmalıdır. */
export function sesBaglami() {
  const Baglam = window.AudioContext || window.webkitAudioContext;
  if (!Baglam) return null;      // ses API'si olmayan tarayıcı: çağıran kendi hatasını verir
  if (!_baglam) _baglam = new Baglam();
  if (_baglam.state === "suspended") _baglam.resume().catch(() => {});
  return _baglam;
}

export function base64Coz(metin) {
  const ikili = atob(metin);
  const bayt = new Uint8Array(ikili.length);
  for (let i = 0; i < ikili.length; i++) bayt[i] = ikili.charCodeAt(i);
  return bayt;
}

/** Ses dosyasını (mp3, wav, m4a…) tek kanallı PCM'e çevirir: `{ pcm: Float32Array, hiz }`. */
export async function dosyadanSes(arrayBuffer) {
  const baglam = sesBaglami();
  if (!baglam) throw new Error("Bu tarayıcı ses dosyası çözmeyi desteklemiyor.");
  const tampon = await baglam.decodeAudioData(arrayBuffer);
  const pcm = new Float32Array(tampon.length);
  for (let k = 0; k < tampon.numberOfChannels; k++) {
    const kanal = tampon.getChannelData(k);
    for (let i = 0; i < pcm.length; i++) pcm[i] += kanal[i] / tampon.numberOfChannels;
  }
  return { pcm, hiz: tampon.sampleRate };
}

/** Tek kanallı PCM'i 16 bit WAV dosyasına çevirir (dinleme ve indirme için). */
export function wavBlob(pcm, hiz) {
  const veri = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const yaz = (konum, metin) => { for (let i = 0; i < metin.length; i++) veri.setUint8(konum + i, metin.charCodeAt(i)); };
  yaz(0, "RIFF"); veri.setUint32(4, 36 + pcm.length * 2, true); yaz(8, "WAVEfmt ");
  veri.setUint32(16, 16, true); veri.setUint16(20, 1, true); veri.setUint16(22, 1, true);
  veri.setUint32(24, hiz, true); veri.setUint32(28, hiz * 2, true);
  veri.setUint16(32, 2, true); veri.setUint16(34, 16, true);
  yaz(36, "data"); veri.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    veri.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([veri], { type: "audio/wav" });
}
