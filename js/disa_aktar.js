// Video dışa aktarma: görseller + ses → MP4, tamamı cihazda.
//
// İki yol vardır:
//   hızlı        : WebCodecs (VideoEncoder + AudioEncoder) ile kare kare kodlama. Gerçek
//                  zamandan hızlıdır, sekme arka plana geçse de kareler atlanmaz.
//   gerçek zamanlı: Tuval + MediaRecorder. Video süresi kadar sürer; ses kodlayıcısı
//                  olmayan cihazlar (iOS 26 öncesi Safari) için yedektir.
import { Muxer, ArrayBufferTarget } from "../kitaplik/mp4-muxer.mjs";

const VIDEO_KODEKLERI = ["avc1.640028", "avc1.4d0028", "avc1.42e028", "avc1.42001f"];
const SES_HIZI = 48000;
const bekle = (ms) => new Promise((coz) => setTimeout(coz, ms));

function bitHizi(en, boy) {
  return en * boy >= 1920 * 1080 ? 8_000_000 : 4_500_000;
}

export async function videoAyari(en, boy, fps) {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return null;
  for (const codec of VIDEO_KODEKLERI) {
    const ayar = { codec, width: en, height: boy, bitrate: bitHizi(en, boy), framerate: fps };
    try {
      if ((await VideoEncoder.isConfigSupported(ayar)).supported) return ayar;
    } catch { /* bu kodek yok, sıradakini dene */ }
  }
  return null;
}

export async function sesAyari() {
  if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") return null;
  for (const kanal of [1, 2]) {
    const ayar = { codec: "mp4a.40.2", sampleRate: SES_HIZI, numberOfChannels: kanal, bitrate: 128_000 };
    try {
      if ((await AudioEncoder.isConfigSupported(ayar)).supported) return ayar;
    } catch { /* desteklenmiyor */ }
  }
  return null;
}

export function kayitTuru() {
  if (typeof MediaRecorder === "undefined") return null;
  const turler = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4",
                  "video/webm;codecs=vp9,opus", "video/webm"];
  return turler.find((t) => MediaRecorder.isTypeSupported(t)) || null;
}

/** `t` anındaki kareyi çizer: görsel tuvali kaplar, yavaşça yakınlaşır/uzaklaşır, geçişte erir. */
export function kareCiz(ctx, gorseller, t, sure, en, boy) {
  const n = gorseller.length;
  const dilim = sure / n;
  const i = Math.min(n - 1, Math.max(0, Math.floor(t / dilim)));
  const ciz = (k, alfa) => {
    const g = gorseller[k];
    const p = Math.min(1, Math.max(0, (t - k * dilim) / dilim));
    const yakinlik = 1 + 0.1 * (k % 2 ? 1 - p : p);
    const olcek = Math.max(en / g.width, boy / g.height) * yakinlik;
    const w = g.width * olcek, h = g.height * olcek;
    ctx.globalAlpha = alfa;
    ctx.drawImage(g, (en - w) / 2, (boy - h) / 2, w, h);
  };
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, en, boy);
  ciz(i, 1);
  const gecis = Math.min(0.5, dilim / 4);
  const kalan = (i + 1) * dilim - t;
  if (i < n - 1 && kalan < gecis) ciz(i + 1, 1 - kalan / gecis);
  ctx.globalAlpha = 1;
}

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

async function hizliAktar({ gorseller, ses, en, boy, fps, sure, ilerleme, iptal }, vAyar, sAyar) {
  const hedef = new ArrayBufferTarget();
  const muxer = new Muxer({
    target: hedef,
    video: { codec: "avc", width: en, height: boy, frameRate: fps },
    ...(sAyar ? { audio: { codec: "aac", numberOfChannels: sAyar.numberOfChannels, sampleRate: sAyar.sampleRate } } : {}),
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });
  let hata = null;
  const video = new VideoEncoder({
    output: (parca, bilgi) => muxer.addVideoChunk(parca, bilgi),
    error: (e) => { hata = e; },
  });
  video.configure(vAyar);
  const tuval = document.createElement("canvas");
  tuval.width = en;
  tuval.height = boy;
  const ctx = tuval.getContext("2d", { alpha: false });
  const kareSayisi = Math.max(1, Math.round(sure * fps));
  const kareSuresi = 1e6 / fps;
  try {
    for (let i = 0; i < kareSayisi; i++) {
      if (hata) throw hata;
      if (iptal?.()) throw new Error("İptal edildi.");
      kareCiz(ctx, gorseller, i / fps, sure, en, boy);
      const kare = new VideoFrame(tuval, { timestamp: Math.round(i * kareSuresi), duration: Math.round(kareSuresi) });
      video.encode(kare, { keyFrame: i % (fps * 2) === 0 });
      kare.close();
      while (video.encodeQueueSize > 3) await bekle(2);
      if (i % 5 === 0) {
        ilerleme?.(0.92 * i / kareSayisi, `Kare ${i + 1} / ${kareSayisi}`);
        await bekle(0);
      }
    }
    await video.flush();
    if (hata) throw hata;

    if (sAyar) {
      ilerleme?.(0.94, "Ses kodlanıyor");
      const pcm = await yenidenOrnekle(ses.pcm, ses.hiz, sAyar.sampleRate);
      const kodlayici = new AudioEncoder({
        output: (parca, bilgi) => muxer.addAudioChunk(parca, bilgi),
        error: (e) => { hata = e; },
      });
      kodlayici.configure(sAyar);
      const kanal = sAyar.numberOfChannels;
      const adim = sAyar.sampleRate;      // birer saniyelik parçalar
      const sinir = Math.min(pcm.length, Math.round(sure * sAyar.sampleRate));
      for (let b = 0; b < sinir; b += adim) {
        const parca = pcm.subarray(b, Math.min(sinir, b + adim));
        const veri = new Float32Array(parca.length * kanal);
        for (let k = 0; k < kanal; k++) veri.set(parca, k * parca.length);
        const blok = new AudioData({
          format: "f32-planar", sampleRate: sAyar.sampleRate, numberOfFrames: parca.length,
          numberOfChannels: kanal, timestamp: Math.round(b / sAyar.sampleRate * 1e6), data: veri,
        });
        kodlayici.encode(blok);
        blok.close();
      }
      await kodlayici.flush();
      kodlayici.close();
      if (hata) throw hata;
    }
  } finally {
    if (video.state !== "closed") video.close();
  }
  muxer.finalize();
  ilerleme?.(1, "Tamamlandı");
  return { blob: new Blob([hedef.buffer], { type: "video/mp4" }), uzanti: "mp4",
           yontem: `hızlı (WebCodecs, ${vAyar.codec}${sAyar ? " + AAC" : ", sessiz"})` };
}

async function gercekZamanliAktar({ gorseller, ses, en, boy, fps, sure, ilerleme, iptal, sesBaglami }) {
  const tur = kayitTuru();
  if (!tur) throw new Error("Bu cihazda video kaydı desteklenmiyor.");
  const tuval = document.createElement("canvas");
  tuval.width = en;
  tuval.height = boy;
  // Safari yalnızca belgeye bağlı tuvalden güvenilir akış verir; görünmez biçimde eklenir.
  tuval.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none";
  document.body.appendChild(tuval);
  const ctx = tuval.getContext("2d", { alpha: false });
  kareCiz(ctx, gorseller, 0, sure, en, boy);
  const akis = tuval.captureStream(fps);
  const Baglam = window.AudioContext || window.webkitAudioContext;
  const baglam = sesBaglami || (Baglam ? new Baglam() : null);
  if (!baglam) throw new Error("Bu tarayıcıda ses API'si yok; gerçek zamanlı kayıt yapılamıyor.");
  if (baglam.state === "suspended") await baglam.resume();
  let kaynak = null;
  if (ses) {
    const cikis = baglam.createMediaStreamDestination();
    const tampon = baglam.createBuffer(1, ses.pcm.length, ses.hiz);
    tampon.getChannelData(0).set(ses.pcm);
    kaynak = baglam.createBufferSource();
    kaynak.buffer = tampon;
    kaynak.connect(cikis);
    cikis.stream.getAudioTracks().forEach((iz) => akis.addTrack(iz));
  }
  const kayit = new MediaRecorder(akis, { mimeType: tur, videoBitsPerSecond: bitHizi(en, boy) });
  const parcalar = [];
  kayit.ondataavailable = (e) => { if (e.data.size) parcalar.push(e.data); };
  const durdu = new Promise((coz, red) => {
    kayit.onstop = coz;
    kayit.onerror = (e) => red(e.error || new Error("Kayıt hatası."));
  });
  try {
    kayit.start(1000);
    const t0 = baglam.currentTime;
    kaynak?.start();
    await new Promise((coz, red) => {
      const dongu = () => {
        const t = baglam.currentTime - t0;
        if (iptal?.()) return red(new Error("İptal edildi."));
        if (t >= sure) return coz();
        kareCiz(ctx, gorseller, t, sure, en, boy);
        ilerleme?.(t / sure, `Gerçek zamanlı kayıt: ${t.toFixed(0)} / ${sure.toFixed(0)} sn`);
        requestAnimationFrame(dongu);
      };
      dongu();
    });
    kayit.stop();
    await durdu;
  } finally {
    if (kayit.state !== "inactive") kayit.stop();
    try { kaynak?.stop(); } catch { /* zaten bitti */ }
    akis.getTracks().forEach((iz) => iz.stop());
    tuval.remove();
  }
  ilerleme?.(1, "Tamamlandı");
  const sade = tur.split(";")[0];
  return { blob: new Blob(parcalar, { type: sade }), uzanti: sade.includes("mp4") ? "mp4" : "webm",
           yontem: `gerçek zamanlı (MediaRecorder, ${sade})` };
}

/**
 * Görselleri ve sesi videoya çevirir.
 * `gorseller`: çizilebilir kaynaklar (tuval / ImageBitmap); `ses`: `{ pcm, hiz }` ya da `null`;
 * `sure`: saniye (ses varsa sesin süresi); `yontem`: "oto" | "hizli" | "gercek".
 * Döner: `{ blob, uzanti, yontem, gecen }` (`gecen`: saniye).
 */
export async function disaAktar(secenek) {
  const s = { fps: 30, yontem: "oto", ...secenek };
  if (!s.gorseller?.length) throw new Error("En az bir görsel gerekli.");
  if (s.ses) s.sure = s.ses.pcm.length / s.ses.hiz;
  if (!(s.sure > 0)) throw new Error("Video süresi belirlenemedi.");
  const basla = performance.now();
  let sonuc;
  const vAyar = s.yontem === "gercek" ? null : await videoAyari(s.en, s.boy, s.fps);
  const sAyar = vAyar && s.ses ? await sesAyari() : null;
  if (vAyar && (!s.ses || sAyar)) {
    sonuc = await hizliAktar(s, vAyar, sAyar);
  } else if (s.yontem === "hizli") {
    throw new Error("Hızlı dışa aktarma bu cihazda desteklenmiyor (" + (vAyar ? "ses" : "video") + " kodlayıcısı yok).");
  } else {
    sonuc = await gercekZamanliAktar(s);
  }
  sonuc.gecen = (performance.now() - basla) / 1000;
  sonuc.sure = s.sure;
  return sonuc;
}
