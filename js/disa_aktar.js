// Video dışa aktarma: zaman çizelgesi (görseller + ses + altyazı) → MP4, tamamı cihazda.
//
// İki yol vardır:
//   hızlı         : WebCodecs (VideoEncoder + AudioEncoder) ile kare kare kodlama. Gerçek
//                   zamandan hızlıdır, sekme arka plana geçse de kareler atlanmaz.
//   gerçek zamanlı: Tuval + MediaRecorder. Video süresi kadar sürer; ses kodlayıcısı
//                   olmayan cihazlar (iOS 26 öncesi Safari) için yedektir.
//
// Görseller ihtiyaç oldukça yüklenir ve en fazla birkaçı bellekte tutulur; böylece çok
// sahneli videolar telefonun belleğini doldurmaz.
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

/** Görselleri ihtiyaç oldukça yükleyen, en fazla `sinir` tanesini bellekte tutan önbellek. */
function gorselKaynagi(gorselAl, sinir = 3) {
  const hazir = new Map();
  const bekleyen = new Map();
  const birak = (g) => { if (g instanceof HTMLCanvasElement) g.width = g.height = 0; };
  return {
    al: (no) => hazir.get(no) || null,
    /** Yüklüyse `null`, değilse yüklenince çözülen söz döner. `koru`: atılmaması gerekenler. */
    hazirla(no, koru = []) {
      if (hazir.has(no)) return null;
      if (!bekleyen.has(no)) {
        bekleyen.set(no, gorselAl(no).then((g) => {
          hazir.set(no, g);
          for (const eski of [...hazir.keys()]) {
            if (hazir.size <= sinir) break;
            if (eski !== no && !koru.includes(eski)) { birak(hazir.get(eski)); hazir.delete(eski); }
          }
        }).finally(() => bekleyen.delete(no)));
      }
      return bekleyen.get(no);
    },
    bosalt() { for (const g of hazir.values()) birak(g); hazir.clear(); },
  };
}

function sirada(liste, t, ipucu) {
  let i = Math.min(ipucu, liste.length - 1);
  if (liste[i].bas > t) i = 0;
  while (i < liste.length - 1 && t >= liste[i].bit) i++;
  return i;
}

/** Tek satıra sığmayan altyazıyı iki dengeli satıra böler (sonda tek kelime kalmasın); olmuyorsa sırayla sarar. */
function satirlaraBol(ctx, metin, azami) {
  const genislik = (m) => ctx.measureText(m).width;
  if (genislik(metin) <= azami) return [metin];
  const kelimeler = metin.split(/\s+/);
  let enIyi = null;
  for (let i = 1; i < kelimeler.length; i++) {
    const ust = kelimeler.slice(0, i).join(" "), alt = kelimeler.slice(i).join(" ");
    const gu = genislik(ust), ga = genislik(alt);
    if (gu <= azami && ga <= azami && (!enIyi || Math.abs(gu - ga) < enIyi.fark)) enIyi = { fark: Math.abs(gu - ga), satirlar: [ust, alt] };
  }
  if (enIyi) return enIyi.satirlar;
  const satirlar = [];
  let satir = "";
  for (const kelime of kelimeler) {
    const aday = satir ? satir + " " + kelime : kelime;
    if (satir && genislik(aday) > azami) { satirlar.push(satir); satir = kelime; }
    else satir = aday;
  }
  if (satir) satirlar.push(satir);
  return satirlar;
}

function altyaziCiz(ctx, metin, en, boy) {
  const punto = Math.round(Math.min(en, boy) * 0.062);
  ctx.font = `700 ${punto}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const satirlar = satirlaraBol(ctx, metin, en * 0.86);
  const aralik = punto * 1.25;
  const y0 = boy * (en < boy ? 0.8 : 0.86) - (satirlar.length - 1) * aralik / 2;
  ctx.lineWidth = punto * 0.24;
  ctx.strokeStyle = "rgba(0, 0, 0, .92)";
  ctx.fillStyle = "#fff";
  satirlar.forEach((s, i) => {
    ctx.strokeText(s, en / 2, y0 + i * aralik);
    ctx.fillText(s, en / 2, y0 + i * aralik);
  });
}

/**
 * Kare çizici. Her dilimin görseli tuvali kaplar, dilim boyunca yavaşça yakınlaşır ya da
 * uzaklaşır, bir sonraki dilime eriyerek geçer; varsa o anın altyazısı üste yazılır.
 */
function kareCizici({ dilimler, altyazilar, en, boy, kaynak }) {
  let di = 0, ai = 0;
  const gecisSuresi = (d) => Math.min(0.5, (d.bit - d.bas) / 4);
  const dilimCiz = (ctx, k, t, alfa) => {
    const d = dilimler[k];
    const g = kaynak.al(d.gorselNo);
    if (!g) return;
    const p = Math.min(1, Math.max(0, (t - d.bas) / (d.bit - d.bas)));
    const yakinlik = 1 + 0.1 * (k % 2 ? 1 - p : p);
    const olcek = Math.max(en / g.width, boy / g.height) * yakinlik;
    const w = g.width * olcek, h = g.height * olcek;
    ctx.globalAlpha = alfa;
    ctx.drawImage(g, (en - w) / 2, (boy - h) / 2, w, h);
  };
  return {
    /** `t` anında çizilecek görsel numaraları (geçiş sırasında iki tane). */
    gerekenler(t) {
      di = sirada(dilimler, t, di);
      const d = dilimler[di];
      const liste = [d.gorselNo];
      if (di < dilimler.length - 1 && d.bit - t < gecisSuresi(d)) liste.push(dilimler[di + 1].gorselNo);
      return liste;
    },
    ciz(ctx, t) {
      di = sirada(dilimler, t, di);
      const d = dilimler[di];
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, en, boy);
      dilimCiz(ctx, di, t, 1);
      const kalan = d.bit - t;
      if (di < dilimler.length - 1 && kalan < gecisSuresi(d)) dilimCiz(ctx, di + 1, t, 1 - kalan / gecisSuresi(d));
      ctx.globalAlpha = 1;
      if (altyazilar.length) {
        ai = sirada(altyazilar, t, ai);
        const a = altyazilar[ai];
        if (t >= a.bas && t < a.bit) altyaziCiz(ctx, a.metin, en, boy);
      }
    },
  };
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

async function hizliAktar({ cizici, kaynak, ses, en, boy, fps, sure, ilerleme, iptal }, vAyar, sAyar) {
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
      const t = i / fps;
      const gerek = cizici.gerekenler(t);
      for (const no of gerek) {
        const yukleme = kaynak.hazirla(no, gerek);
        if (yukleme) await yukleme;
      }
      cizici.ciz(ctx, t);
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
        while (kodlayici.encodeQueueSize > 8) await bekle(2);
      }
      await kodlayici.flush();
      kodlayici.close();
      if (hata) throw hata;
    }
  } finally {
    if (video.state !== "closed") video.close();
    tuval.width = tuval.height = 0;
  }
  muxer.finalize();
  ilerleme?.(1, "Tamamlandı");
  return { blob: new Blob([hedef.buffer], { type: "video/mp4" }), uzanti: "mp4",
           yontem: `hızlı (WebCodecs, ${vAyar.codec}${sAyar ? " + AAC" : ", sessiz"})` };
}

async function gercekZamanliAktar({ cizici, kaynak, ses, en, boy, fps, sure, ilerleme, iptal, sesBaglami }) {
  const tur = kayitTuru();
  if (!tur) throw new Error("Bu cihazda video kaydı desteklenmiyor.");
  const Baglam = window.AudioContext || window.webkitAudioContext;
  const baglam = sesBaglami || (Baglam ? new Baglam() : null);
  if (!baglam) throw new Error("Bu tarayıcıda ses API'si yok; gerçek zamanlı kayıt yapılamıyor.");
  if (baglam.state === "suspended") await baglam.resume();
  const tuval = document.createElement("canvas");
  tuval.width = en;
  tuval.height = boy;
  // Safari yalnızca belgeye bağlı tuvalden güvenilir akış verir; görünmez biçimde eklenir.
  tuval.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none";
  document.body.appendChild(tuval);
  const ctx = tuval.getContext("2d", { alpha: false });
  for (const no of cizici.gerekenler(0)) await kaynak.hazirla(no);
  cizici.ciz(ctx, 0);
  const akis = tuval.captureStream(fps);
  let sesKaynagi = null;
  if (ses) {
    const cikis = baglam.createMediaStreamDestination();
    const tampon = baglam.createBuffer(1, ses.pcm.length, ses.hiz);
    tampon.getChannelData(0).set(ses.pcm);
    sesKaynagi = baglam.createBufferSource();
    sesKaynagi.buffer = tampon;
    sesKaynagi.connect(cikis);
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
    sesKaynagi?.start();
    await new Promise((coz, red) => {
      const dongu = () => {
        const t = baglam.currentTime - t0;
        if (iptal?.()) return red(new Error("İptal edildi."));
        if (t >= sure) return coz();
        // Sıradaki görsel arka planda yüklenir; gelmediyse o kare öncekiyle çizilir.
        const gerek = cizici.gerekenler(t);
        for (const no of gerek) kaynak.hazirla(no, gerek)?.catch(() => {});
        cizici.ciz(ctx, t);
        ilerleme?.(t / sure, `Gerçek zamanlı kayıt: ${t.toFixed(0)} / ${sure.toFixed(0)} sn`);
        requestAnimationFrame(dongu);
      };
      dongu();
    });
    kayit.stop();
    await durdu;
  } finally {
    if (kayit.state !== "inactive") kayit.stop();
    try { sesKaynagi?.stop(); } catch { /* zaten bitti */ }
    akis.getTracks().forEach((iz) => iz.stop());
    tuval.remove();
  }
  ilerleme?.(1, "Tamamlandı");
  const sade = tur.split(";")[0];
  return { blob: new Blob(parcalar, { type: sade }), uzanti: sade.includes("mp4") ? "mp4" : "webm",
           yontem: `gerçek zamanlı (MediaRecorder, ${sade})` };
}

/**
 * Zaman çizelgesini videoya çevirir.
 *   dilimler  : `[{ bas, bit, gorselNo }]` saniye cinsinden, sıralı ve bitişik
 *   gorselAl  : `async (gorselNo) => tuval | ImageBitmap` (ihtiyaç oldukça çağrılır)
 *   ses       : `{ pcm: Float32Array, hiz }` ya da `null`
 *   altyazilar: `[{ bas, bit, metin }]` (isteğe bağlı)
 *   yontem    : "oto" | "hizli" | "gercek"
 * Döner: `{ blob, uzanti, yontem, gecen, sure }` (süreler saniye).
 */
export async function disaAktar(secenek) {
  const s = { fps: 30, yontem: "oto", altyazilar: [], ...secenek };
  if (!s.dilimler?.length) throw new Error("En az bir görsel gerekli.");
  s.sure = s.dilimler[s.dilimler.length - 1].bit;
  if (!(s.sure > 0)) throw new Error("Video süresi belirlenemedi.");
  s.kaynak = gorselKaynagi(s.gorselAl);
  s.cizici = kareCizici(s);
  const basla = performance.now();
  let sonuc;
  try {
    const vAyar = s.yontem === "gercek" ? null : await videoAyari(s.en, s.boy, s.fps);
    const sAyar = vAyar && s.ses ? await sesAyari() : null;
    if (vAyar && (!s.ses || sAyar)) {
      sonuc = await hizliAktar(s, vAyar, sAyar);
    } else if (s.yontem === "hizli") {
      throw new Error("Hızlı dışa aktarma bu cihazda desteklenmiyor (" + (vAyar ? "ses" : "video") + " kodlayıcısı yok).");
    } else {
      sonuc = await gercekZamanliAktar(s);
    }
  } finally {
    s.kaynak.bosalt();
  }
  sonuc.gecen = (performance.now() - basla) / 1000;
  sonuc.sure = s.sure;
  return sonuc;
}
