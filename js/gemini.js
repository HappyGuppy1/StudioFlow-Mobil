// Gemini TTS: tarayıcıdan doğrudan REST çağrısı (Google bu API'de CORS'a izin verir).
// Masaüstü StudioFlow'daki `saglayicilar/ses_gemini.py` ile aynı istek biçimi.
import { base64Coz, dosyadanSes } from "./ses.js";
import { zamanAsimi, zamanAsimiMi, geminiHatasi, hizmetIstegi, anahtarBos } from "./ag.js";

const KOK = "https://generativelanguage.googleapis.com/v1beta";

export const MODELLER = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];
export const SESLER = ("Kore Puck Charon Zephyr Fenrir Leda Orus Aoede Callirrhoe Autonoe Enceladus "
  + "Iapetus Umbriel Algieba Despina Erinome Algenib Rasalgethi Laomedeia Achernar Alnilam Schedar "
  + "Gacrux Pulcherrima Achird Zubenelgenubi Vindemiatrix Sadachbia Sadaltager Sulafat").split(" ");
export const DILLER = {
  tr: "Turkish", en: "English", de: "German", es: "Spanish", fr: "French",
  pt: "Portuguese", it: "Italian", ar: "Arabic", ru: "Russian", ja: "Japanese",
};

/** Yönetmen notu ile okunacak metin ayrı, etiketli bloklardadır; not asla seslendirilmez. */
function istemKur(metin, dil, stil) {
  const ilk = metin.trim().split(/\s+/).slice(0, 3).join(" ");
  return "Synthesize speech. Speak ONLY the transcript between TRANSCRIPT BEGIN and "
    + "TRANSCRIPT END, exactly as written. Do not translate, summarize or add words.\n"
    + "VOICE DIRECTION (never spoken; it only describes how to sound):\n"
    + `[${(stil || "").trim() || "Natural, conversational narration"}]\n`
    + `Language: ${DILLER[dil] || "English"}. The first spoken words are: "${ilk}".\n`
    + `TRANSCRIPT BEGIN\n${metin}\nTRANSCRIPT END`;
}

const SES_ALANLARI = ["outputaudio", "inlinedata", "audio", "audiodata"];

/** Yanıtın biçimine bakmadan (camelCase / snake_case, iç içe) base64 ses bloklarını toplar. */
function sesBloklari(deger, anahtar = "") {
  let bloklar = [];
  if (Array.isArray(deger)) {
    for (const oge of deger) bloklar = bloklar.concat(sesBloklari(oge, anahtar));
  } else if (deger && typeof deger === "object") {
    const tur = String(deger.mimeType || deger.mime_type || "");
    const sesMi = /audio|l16/i.test(tur) || SES_ALANLARI.includes(anahtar.replace(/_/g, "").toLowerCase());
    if (typeof deger.data === "string" && deger.data && sesMi) {
      bloklar.push({ veri: deger.data, tur: tur || "audio/pcm;rate=24000" });
    } else {
      for (const [ad, oge] of Object.entries(deger)) bloklar = bloklar.concat(sesBloklari(oge, ad));
    }
  }
  return bloklar;
}

/** Metni seslendirir: `{ pcm: Float32Array, hiz }` (tek kanal). */
export async function seslendir({ anahtar, model, ses, dil, stil, metin }) {
  if (anahtarBos(anahtar)) throw new Error("Gemini hesabı yok: Ayarlar bölümünden ekle.");
  if (!(metin || "").trim()) throw new Error("Seslendirilecek metni yaz.");
  const istem = istemKur(metin, dil, stil);
  let yol, govde;
  if (model === "gemini-3.1-flash-tts-preview") {
    yol = "/interactions";
    govde = { model, input: istem, store: false, response_format: { type: "audio" },
              generation_config: { speech_config: [{ voice: ses }] } };
  } else {
    yol = `/models/${model}:generateContent`;
    govde = { contents: [{ parts: [{ text: istem }] }], generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: ses } } } } };
  }
  let yanit;
  try {
    yanit = await hizmetIstegi(anahtar, "/gemini/v1beta" + yol,
      { adres: KOK + yol, basliklar: { "x-goog-api-key": String(anahtar).trim() } },
      { method: "POST", body: JSON.stringify(govde), signal: zamanAsimi(240_000), headers: { "Content-Type": "application/json" } });
  } catch (hata) {
    if (/^Kasa: /.test(hata.message)) throw hata;
    if (zamanAsimiMi(hata)) throw new Error("Gemini 4 dakikada yanıt vermedi. Biraz sonra yeniden dene; tamamlanan parçalar kayıtlı.");
    throw new Error("Gemini'ye bağlanılamadı (internet bağlantısını denetle).");
  }
  const veri = await yanit.json().catch(() => null);
  if (!yanit.ok) throw geminiHatasi(yanit.status, veri);
  const bloklar = sesBloklari(veri);
  if (!bloklar.length) throw new Error("Gemini ses verisi döndürmedi; metin reddedilmiş olabilir.");

  const parcalar = [];
  let hiz = null;
  for (const blok of bloklar) {
    const ham = base64Coz(blok.veri);
    let parca;
    const riff = ham[0] === 0x52 && ham[1] === 0x49 && ham[2] === 0x46 && ham[3] === 0x46;
    if (!riff && /^audio\/(pcm|l16)/i.test(blok.tur)) {
      const oran = /rate=(\d+)/.exec(blok.tur);
      const ornek = new Int16Array(ham.buffer, 0, Math.floor(ham.length / 2));
      const pcm = new Float32Array(ornek.length);
      for (let i = 0; i < ornek.length; i++) pcm[i] = ornek[i] / 32768;
      parca = { pcm, hiz: oran ? Number(oran[1]) : 24000 };
    } else {
      parca = await dosyadanSes(ham.buffer);
    }
    if (hiz !== null && parca.hiz !== hiz) throw new Error("Gemini ses parçalarının örnekleme hızları farklı.");
    hiz = parca.hiz;
    parcalar.push(parca.pcm);
  }
  const pcm = new Float32Array(parcalar.reduce((t, p) => t + p.length, 0));
  let konum = 0;
  for (const p of parcalar) { pcm.set(p, konum); konum += p.length; }
  return { pcm, hiz };
}

// Gemini uzun okumalarda ara sıra "The audio stream could not be completed" der; geçicidir.
const GECICI = /could not be completed|please retry|\((500|502|503|504)\)|internal error|overloaded|unavailable/i;

/** Metni ortasına en yakın cümle (yoksa kelime) sınırından ikiye böler. */
function ikiyeBol(metin) {
  const m = metin.trim();
  const orta = m.length / 2;
  const bul = (desen) => [...m.matchAll(desen)].map((e) => e.index + e[0].length).filter((s) => s > 0 && s < m.length);
  let sinirlar = bul(/[.!?。！？](?:\s+|$)|\n/g);
  if (!sinirlar.length) sinirlar = bul(/\s+/g);
  if (!sinirlar.length) return [m];
  const kes = sinirlar.reduce((a, b) => (Math.abs(b - orta) < Math.abs(a - orta) ? b : a));
  return [m.slice(0, kes).trim(), m.slice(kes).trim()];
}

/**
 * `seslendir` gibi; Gemini okumayı yarıda keserse metni cümle sınırından ikiye bölüp yarıları
 * ayrı okur ve birleştirir (en fazla iki kez iç içe). Kota ve yetki hataları olduğu gibi yükselir.
 */
export async function seslendirDayanikli(secenek, derinlik = 0) {
  try {
    return await seslendir(secenek);
  } catch (hata) {
    const yarilar = ikiyeBol(secenek.metin || "");
    if (!GECICI.test(hata.message) || derinlik >= 2 || yarilar.length < 2) throw hata;
    const [a, b] = [await seslendirDayanikli({ ...secenek, metin: yarilar[0] }, derinlik + 1),
                    await seslendirDayanikli({ ...secenek, metin: yarilar[1] }, derinlik + 1)];
    if (a.hiz !== b.hiz) throw new Error("Gemini ses parçalarının örnekleme hızları farklı.");
    const pcm = new Float32Array(a.pcm.length + b.pcm.length);
    pcm.set(a.pcm);
    pcm.set(b.pcm, a.pcm.length);
    return { pcm, hiz: a.hiz };
  }
}
