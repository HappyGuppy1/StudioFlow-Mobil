// Gemini ile metin üretimi: senaryo yazımı ve sahne başına görsel prompt'u.
import { DILLER } from "./gemini.js";
import { cumlelereBol, VARSAYILAN_NEGATIF } from "./sahne.js";
import { zamanAsimi, zamanAsimiMi, geminiHatasi, hizmetIstegi, anahtarBos } from "./ag.js";

const KOK = "https://generativelanguage.googleapis.com/v1beta";
// Sırayla denenir: model kapatılmışsa (404), yoğunsa (503) ya da SURE_SINIRI içinde yanıt
// vermezse sıradakine geçilir. Yoğun saatlerde bir model 503 yerine yanıtsız asılı kalabiliyor.
export const MODELLER = ["gemini-flash-latest", "gemini-3.6-flash", "gemini-flash-lite-latest"];
const SURE_SINIRI = 75_000;
const GRUP = 6;     // tek istekte prompt'u yazılan sahne sayısı

/** `anahtar`: Gemini anahtarı ya da hesap havuzu sarmalayıcısı `(is) => hesaplarla("gemini", is)`. */
async function uret(anahtar, sistem, kullanici, json, tercih = "") {
  if (typeof anahtar === "function") return anahtar((degerler) => uret(degerler.gemini_key, sistem, kullanici, json, tercih));
  // Seçili prompt modeli ilk denenir; yoğunsa ya da kapalıysa sıradakilere geçilir.
  const modeller = MODELLER.includes(tercih) ? [tercih, ...MODELLER.filter((x) => x !== tercih)] : MODELLER;
  if (anahtarBos(anahtar)) throw new Error("Gemini hesabı yok: API sayfasından ekle.");
  let son = "";
  // Dört tur: Gemini yoğun saatlerde bütün modellerde 503 ("high demand") verebiliyor; turlar arasında
  // giderek uzayan beklemelerle (8, 20, 40 sn) yeniden denenir.
  const BEKLEMELER = [0, 8000, 20000, 40000];
  for (const [sira, model] of BEKLEMELER.flatMap(() => modeller).entries()) {
    if (sira % MODELLER.length === 0 && sira) await new Promise((coz) => setTimeout(coz, BEKLEMELER[sira / MODELLER.length]));
    let yanit;
    try {
      const yol = `/models/${model}:generateContent`;
      yanit = await hizmetIstegi(anahtar, "/gemini/v1beta" + yol, { adres: KOK + yol, basliklar: { "x-goog-api-key": String(anahtar).trim() } }, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sistem }] },
          contents: [{ parts: [{ text: kullanici }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 32768,
                              ...(json ? { responseMimeType: "application/json" } : {}) },
        }),
        signal: zamanAsimi(SURE_SINIRI),
      });
    } catch (hata) {
      if (zamanAsimiMi(hata)) { son = `${model}: ${SURE_SINIRI / 1000} sn içinde yanıt vermedi`; continue; }
      if (/^Kasa: /.test(hata.message)) throw hata;
      throw new Error("Gemini'ye bağlanılamadı (internet bağlantısını denetle).");
    }
    const veri = await yanit.json().catch(() => null);
    if (yanit.ok) {
      const metin = (veri?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      if (metin.trim()) return metin;
      // İçerik filtresi: aynı istek yeniden denense de reddedilir; kota harcamadan hemen bildirilir.
      const bitis = veri?.candidates?.[0]?.finishReason || "";
      const engel = veri?.promptFeedback?.blockReason || (/SAFETY|PROHIBITED|BLOCK/.test(bitis) ? bitis : "");
      if (engel) {
        const hata = new Error(`Gemini içerik filtresi bu isteği reddetti (${engel}). Bu bir kota ya da bağlantı hatası değil: `
          + "metindeki bir ifade Google'ın filtresine takıldı. Metni değiştirip yeniden dene.");
        hata.tur = "filtre";
        throw hata;
      }
      son = "Gemini boş yanıt döndürdü.";
      continue;
    }
    const mesaj = veri?.error?.message || "";
    if (yanit.status === 404 || yanit.status === 503 || /not found|no longer available|high demand|overloaded/i.test(mesaj)) {
      son = `${model}: ${mesaj || yanit.status}`;
      continue;
    }
    throw geminiHatasi(yanit.status, veri);
  }
  throw new Error("Gemini şu an çok yoğun, yanıt vermiyor. Birkaç dakika sonra yeniden dene; tamamlanan adımlar kayıtlı. " + son);
}

function jsonCoz(metin) {
  const sade = metin.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(sade); } catch { /* aşağıda dizi aranır */ }
  const bas = sade.indexOf("["), son = sade.lastIndexOf("]");
  if (bas >= 0 && son > bas) {
    try { return JSON.parse(sade.slice(bas, son + 1)); } catch { /* geçersiz */ }
  }
  return null;
}

const SENARYO_SISTEM =
  "You write narration scripts for short documentary-style videos (YouTube, Shorts). Rules:\n"
  + "- Write ONLY the narration text that will be read aloud, in the requested language. No title, "
  + "no headings, no scene labels, no stage directions, no emojis, no markdown.\n"
  + "- Open with a strong hook in the first sentence: a surprising fact, a question or a tense moment.\n"
  + "- Use simple, everyday words and short sentences. Build a clear dramatic arc: hook, rising "
  + "tension, turning point, payoff. End with a closing line that lands.\n"
  + "- Be factually careful: do not invent names, dates or numbers. If unsure, stay general.\n"
  + "- Use wording that is safe for YouTube (no graphic violence or explicit terms).\n"
  + "- Separate natural beats with a blank line (one short paragraph per beat).";

/** Konudan anlatım senaryosu yazar (düz metin, paragraflı). */
export async function senaryoYaz({ anahtar, konu, dil, saniye }) {
  if (!(konu || "").trim()) throw new Error("Önce konuyu yaz.");
  const kelime = Math.round(saniye * 2.2);
  const istek = `Language: ${DILLER[dil] || "English"}\nTopic: ${konu.trim()}\n`
    + `Target length: about ${kelime} words (roughly ${saniye} seconds when read aloud).`;
  return (await uret(anahtar, SENARYO_SISTEM, istek, false)).trim();
}

// Kare kuralları: görsel modeli her kelimeyi olduğu gibi çizer.
const KARE_KURALLARI =
  "Image models draw every word literally, so:\n"
  + "- One main subject group in the foreground doing ONE clearly visible action; at most one "
  + "secondary group, placed explicitly ('behind them', 'in the background').\n"
  + "- The first sentence names the location and whether it is inside or outside.\n"
  + "- Describe the ground, vegetation and sky concretely. Never rely on season words alone.\n"
  + "- Describe garments by shape, not only colour.\n"
  + "- Use one lighting that matches the time of day.\n"
  + "- If the narration is abstract (a comment, a question, a summary), still show one concrete, "
  + "filmable moment that carries its meaning; never a copy of the previous frame.\n"
  + "- Image models ignore negation and DRAW everything a prompt names. Never write what is "
  + "absent or hidden ('no text', 'without hats'). Describe only what IS visible.\n"
  + "- The picture fills the whole frame edge to edge: never a border, frame, caption or panel.\n";

/**
 * Görsel prompt'u sistem mesajı. Katmanlar masaüstündeki gibidir: genel video brief'i, görsel stil,
 * (model destekliyorsa) varsayılan negatif prompt, anlatımın tamamı, önceki sahnelerin prompt'ları ve yazılacak
 * sahneler (zaman aralıklarıyla). `kelimeSiniri`: görsel modeli yalnızca ilk bu kadar kelimeyi okuyorsa (SDXL).
 */
function promptSistemi(negatifli, kelimeSiniri) {
  const uzunluk = kelimeSiniri
    ? `aim for about ${Math.round(kelimeSiniri * 0.8)} words (hard maximum ${kelimeSiniri}; the image model reads only the first ${kelimeSiniri} words, so start with the main subject and its action, then setting, lighting and camera)`
    : "35 to 70 words in plain descriptive sentences (main subject and its action, then setting, lighting, camera framing)";
  return "You are an expert film director and prompt engineer for AI image generators. You write the image prompts "
    + "for ONE narrated video, scene by scene, from these layers: 1) an overall video brief (story, cast, world, "
    + "continuity rules) that holds for the whole video, 2) an overall visual style, "
    + (negatifli ? "3) a default negative prompt, " : "")
    + "then the full narration for context, the prompts already written for other scenes, and the scenes to write "
    + "now, each with its own time range.\n"
    + "Every prompt must belong to the brief and the style; the scene's narration decides only WHAT happens in that "
    + "scene, never the world, look or cast. If no brief is given, infer one from the narration and stay consistent with it.\n"
    + `For each scene write image_prompt in English: one still frame that illustrates the scene, ${uzunluk}. `
    + "Do not repeat the visual style keywords; the app appends the style itself.\n"
    + KARE_KURALLARI
    + (negatifli ? "Also write negative_prompt for each scene: a comma-separated list that includes every item of the default "
      + "negative prompt, then defects specific to this frame. Never put into it anything this frame must SHOW.\n" : "")
    + "Scene 1 is the hook of the video: make its image the most striking frame of the video.\n"
    + "Keep continuity across scenes: same characters, wardrobe, palette, location and era as the brief and the previous "
    + "scenes; advance the visible action with each scene; consecutive scenes never repeat the same pose and framing.\n"
    + "Reply ONLY with a JSON array. Every element must be exactly: "
    + (negatifli ? '{"index": <int>, "image_prompt": "<string>", "negative_prompt": "<string>"}.' : '{"index": <int>, "image_prompt": "<string>"}.');
}

/**
 * Bir sahne grubunu tek istekte yazdırır. Gemini içerik filtresi grubu reddederse sahneler tek tek denenir;
 * tek sahne de reddedilirse `sadeIstek` (bağlamı azaltılmış istek) ile bir kez daha denenir.
 * Döner: `{ kayitlar: [{ index, … }], reddedilen: [index…] }`. Filtre dışındaki hatalar yükselir.
 */
async function gruplaYaz(anahtar, sistem, grup, istek, sadeIstek, bicimHatasi, model = "") {
  const dene = async (liste, kur) => {
    const kayitlar = jsonCoz(await uret(anahtar, sistem, kur(liste), true, model));
    if (!Array.isArray(kayitlar)) throw new Error(bicimHatasi);
    return kayitlar;
  };
  const filtreyse = (hata) => { if (hata.tur !== "filtre") throw hata; return null; };
  const hepsi = await dene(grup, istek).catch(filtreyse);
  if (hepsi) return { kayitlar: hepsi, reddedilen: [] };
  const kayitlar = [], reddedilen = [];
  for (const s of grup) {
    let tek = grup.length > 1 ? await dene([s], istek).catch(filtreyse) : null;
    if (!tek) tek = await dene([s], sadeIstek).catch(filtreyse);
    if (tek?.[0]) kayitlar.push({ ...tek[0], index: s.index }); else reddedilen.push(s.index);
  }
  return { kayitlar, reddedilen };
}

/**
 * Sahneler için görsel prompt'ları yazar. `sahneler`: `[{ index, metin, bas, bit }]` (yazılacaklar);
 * `onceki`: daha önce yazılmış `[{ index, prompt }]` (süreklilik için). `genel`: genel video brief'i, `stil`:
 * görsel stil katmanı, `negatif`: varsayılan negatif (yalnızca `negatifDestekli` ise istenir).
 * `bildir(sahne, prompt, negatif)` her grup bittikçe çağrılır, böylece yarıda kesilse de yazılanlar kalır.
 * Döner: içerik filtresi yüzünden yazılamayan sahne numaraları.
 */
export async function promptlariYaz({ anahtar, sahneler, dil, stil, genel = "", negatif = "", negatifDestekli = false, kelimeSiniri = 0,
                                      tamMetin, onceki = [], model = "", bildir, iptal }) {
  const yazilan = [...onceki], reddedilen = [];
  const sistem = promptSistemi(negatifDestekli, kelimeSiniri);
  const brief = (genel || "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < sahneler.length; i += GRUP) {
    if (iptal?.()) throw new Error("Durduruldu.");
    const grup = sahneler.slice(i, i + GRUP);
    const son = yazilan.slice(-4);
    // `sade`: yalnızca sahnenin kendi metni (bütün anlatım ve önceki prompt'lar gönderilmez).
    const istek = (sade) => (liste) => {
      const bloklar = [
        `Narration language: ${DILLER[dil] || "English"}`,
        "Overall video brief (applies to every segment): " + (brief || "not given — infer a consistent brief from the narration"),
        `Overall visual style (appended by the app, do not repeat): ${stil || "cinematic, photorealistic, consistent lighting"}`];
      if (negatifDestekli) bloklar.push("Default negative prompt (include all of these in every negative_prompt): " + ((negatif || "").replace(/\s+/g, " ").trim() || VARSAYILAN_NEGATIF));
      if (!sade) {
        bloklar.push("Full narration (context only; write prompts only for the segments listed below): " + tamMetin.replace(/\s+/g, " ").trim());
        if (son.length) {
          bloklar.push("Prompts already written for other segments of this same video (keep continuity with them):");
          for (const k of son) bloklar.push(`Segment ${k.index} image: ${k.prompt.replace(/\s+/g, " ")}`);
        }
      }
      bloklar.push(`There are ${liste.length} segments; write a prompt for each one.`, "");
      for (const s of liste) bloklar.push(`Segment ${s.index}${s.bit > s.bas ? ` (${s.bas.toFixed(1)}-${s.bit.toFixed(1)}s)` : ""}: ${s.metin}`);
      return bloklar.join("\n");
    };
    const sonuc = await gruplaYaz(anahtar, sistem, grup, istek(false), istek(true), "Gemini prompt'ları beklenen biçimde döndürmedi. Yeniden dene.", model);
    reddedilen.push(...sonuc.reddedilen);
    grup.forEach((s, sira) => {
      if (sonuc.reddedilen.includes(s.index)) return;
      const kayit = sonuc.kayitlar.find((k) => k && String(k.index) === String(s.index)) || (sonuc.kayitlar.length === grup.length ? sonuc.kayitlar[sira] : null);
      const prompt = String(kayit?.image_prompt || "").trim();
      if (prompt) {
        yazilan.push({ index: s.index, prompt });
        bildir?.(s, prompt, negatifDestekli ? String(kayit?.negative_prompt || "").trim() : "");
      }
    });
  }
  return reddedilen;
}

// Sahne planı: masaüstündeki `sahneleme.SAHNE_DETAY_SISTEM` ile aynı kurallar.
const sahneSistemi = (alt, ust) =>
  "You are a video editor planning the scene structure of ONE narrated video. "
  + "The video is generated scene by scene: every scene is a single clip made from one "
  + "still frame, and the narration is spoken over the scene in order. "
  + "You receive the narration split into NUMBERED SENTENCES, its spoken language and the "
  + "estimated spoken duration. Group CONSECUTIVE sentences into scenes and give each "
  + "scene its OWN duration in seconds. Rules:\n"
  + "- every sentence must be used exactly once and in order; a scene covers one or more "
  + "consecutive sentences (never split a sentence),\n"
  + `- each scene duration must stay between ${alt} and ${ust} seconds,\n`
  + "- let the duration follow the content and pace: a slow descriptive sentence gets more "
  + "time, a short punchy line less; do NOT give every scene the same duration,\n"
  + "- the sum of all scene durations must be >= the estimated spoken duration, so the "
  + "video never ends before the narration,\n"
  + "- prefer fewer, coherent scenes over many tiny ones,\n"
  + "- a sentence that shows nothing new on screen (a comment, feeling, thought or short "
  + "punchline such as 'They call it duty.') never gets its own scene: group it with the "
  + "neighbouring sentence that has a visible action or place,\n"
  + "- start a new scene when the narration moves to a new place or a new visible action.\n"
  + "Reply ONLY with a JSON array, without markdown fences and without extra keys: "
  + '[{"cumleler": [<sentence numbers>], "saniye": <number>}, ...]';

/**
 * Anlatımın sahne planını yapay zekâya yazdırır: ardışık cümleleri sahnelere gruplar ve her sahneye süre verir.
 * Döner: ham kayıtlar `[{ cumleler: [no…], saniye }]` ya da okunamadıysa `null` (bkz. `plan.planKur`).
 */
export async function sahnePlaniYaz({ anahtar, metin, dil, alt, ust, toplamSure, model = "" }) {
  const istek = `Narration language: ${DILLER[dil] || dil}\n`
    + `Estimated spoken duration: ${toplamSure.toFixed(1)} seconds\n`
    + `Allowed scene duration: ${alt}-${ust} seconds\n`
    + "Numbered sentences:\n" + cumlelereBol(metin).map((c, i) => `${i + 1}. ${c}`).join("\n");
  return jsonCoz(await uret(anahtar, sahneSistemi(alt, ust), istek, true, model));
}
const HAREKET_SISTEM =
  "You write motion prompts for an image-to-video model. For each segment you receive the narration and the "
  + "description of its still frame. Write video_prompt in English, 15 to 35 words: how that exact frame comes "
  + "alive over about five seconds. Include one camera move (slow push in, pull back, pan, tilt, orbit or a "
  + "locked-off shot), the natural action of the main subject, and the ambient motion around it (wind, water, "
  + "light, cloth, leaves).\n"
  + "- Describe only motion that is visible in the frame. Everything already in the frame stays as it is.\n"
  + "- Keep the pace calm and continuous; one action per clip.\n"
  + "- Write only what moves and how. Never write what is absent.\n"
  + "Reply ONLY with a JSON array. Every element must be exactly: "
  + '{"index": <int>, "video_prompt": "<string>"}.';

/**
 * Sahnelerin video prompt'larını (görselden videoya hareket tarifi) yazar. `sahneler`: `[{ index, metin, prompt }]`;
 * `bildir(sahne, hareket)` her grup bittikçe çağrılır. Görsel tarifinden ayrı bir istektir: biri reddedilirse
 * öbürü etkilenmez. Döner: içerik filtresi yüzünden yazılamayan sahne numaraları.
 */
export async function hareketleriYaz({ anahtar, sahneler, model = "", bildir, iptal }) {
  const reddedilen = [];
  for (let i = 0; i < sahneler.length; i += 12) {
    if (iptal?.()) throw new Error("Durduruldu.");
    const grup = sahneler.slice(i, i + 12);
    // `sade`: anlatım gönderilmez, yalnızca karenin tarifi (video prompt'u için kare yeterlidir).
    const istek = (sade) => (liste) => {
      const bloklar = [`There are ${liste.length} segments; write a video_prompt for each one.`, ""];
      for (const s of liste) {
        if (!sade) bloklar.push(`Segment ${s.index} narration: ${s.metin.replace(/\s+/g, " ").trim()}`);
        bloklar.push(`Segment ${s.index} still frame: ${(s.prompt || "").replace(/\s+/g, " ").trim()}`, "");
      }
      return bloklar.join("\n");
    };
    const sonuc = await gruplaYaz(anahtar, HAREKET_SISTEM, grup, istek(false), istek(true), "Gemini video prompt'larını beklenen biçimde döndürmedi. Yeniden dene.", model);
    reddedilen.push(...sonuc.reddedilen);
    grup.forEach((s, sira) => {
      if (sonuc.reddedilen.includes(s.index)) return;
      const kayit = sonuc.kayitlar.find((k) => k && String(k.index) === String(s.index)) || (sonuc.kayitlar.length === grup.length ? sonuc.kayitlar[sira] : null);
      const hareket = String(kayit?.video_prompt || "").replace(/\s+/g, " ").trim();
      if (hareket) bildir?.(s, hareket);
    });
  }
  return reddedilen;
}

const CEVIRI_SISTEM =
  "You translate narration for video dubbing. For each segment write the target-language version as natural "
  + "spoken narration: keep the meaning, tone and order, keep roughly the same length, and use the names that "
  + "are customary in the target language. Do not add or drop information. Do not add notes.\n"
  + "Reply ONLY with a JSON array. Every element must be exactly: "
  + '{"index": <int>, "text": "<string>"}.';

/**
 * Sahne anlatımlarını hedef dile çevirir. `sahneler`: `[{ index, metin }]`; `bildir(sahne, ceviri)`
 * her grup bittikçe çağrılır.
 */
export async function cevir({ anahtar, kaynakDil, hedefDil, sahneler, bildir, iptal }) {
  for (let i = 0; i < sahneler.length; i += 12) {
    if (iptal?.()) throw new Error("Durduruldu.");
    const grup = sahneler.slice(i, i + 12);
    const istek = [`Source language: ${DILLER[kaynakDil] || kaynakDil}`, `Target language: ${DILLER[hedefDil] || hedefDil}`,
                   `There are ${grup.length} segments; translate each one.`, "",
                   ...grup.map((s) => `Segment ${s.index}: ${s.metin}`)].join("\n");
    const kayitlar = jsonCoz(await uret(anahtar, CEVIRI_SISTEM, istek, true));
    if (!Array.isArray(kayitlar)) throw new Error("Gemini çeviriyi beklenen biçimde döndürmedi. Yeniden dene.");
    grup.forEach((s, sira) => {
      const kayit = kayitlar.find((k) => k && String(k.index) === String(s.index)) || kayitlar[sira];
      const metin = String(kayit?.text || "").trim();
      if (metin) bildir?.(s, metin);
    });
  }
}
