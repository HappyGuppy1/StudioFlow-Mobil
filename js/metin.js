// Gemini ile metin üretimi: senaryo yazımı ve sahne başına görsel prompt'u.
import { DILLER } from "./gemini.js";
import { zamanAsimi, zamanAsimiMi, geminiHatasi, hizmetIstegi, anahtarBos } from "./ag.js";

const KOK = "https://generativelanguage.googleapis.com/v1beta";
// Sırayla denenir: model kapatılmışsa (404), yoğunsa (503) ya da SURE_SINIRI içinde yanıt
// vermezse sıradakine geçilir. Yoğun saatlerde bir model 503 yerine yanıtsız asılı kalabiliyor.
const MODELLER = ["gemini-flash-latest", "gemini-3.6-flash", "gemini-flash-lite-latest"];
const SURE_SINIRI = 75_000;
const GRUP = 6;     // tek istekte prompt'u yazılan sahne sayısı

/** `anahtar`: Gemini anahtarı ya da hesap havuzu sarmalayıcısı `(is) => hesaplarla("gemini", is)`. */
async function uret(anahtar, sistem, kullanici, json) {
  if (typeof anahtar === "function") return anahtar((degerler) => uret(degerler.gemini_key, sistem, kullanici, json));
  if (anahtarBos(anahtar)) throw new Error("Gemini hesabı yok: API sayfasından ekle.");
  let son = "";
  // Dört tur: Gemini yoğun saatlerde bütün modellerde 503 ("high demand") verebiliyor; turlar arasında
  // giderek uzayan beklemelerle (8, 20, 40 sn) yeniden denenir.
  const BEKLEMELER = [0, 8000, 20000, 40000];
  for (const [sira, model] of BEKLEMELER.flatMap(() => MODELLER).entries()) {
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

const PROMPT_SISTEM =
  "You are an expert film director and prompt engineer for AI image generators. You receive "
  + "consecutive narration segments of one video plus its visual style. For each segment write "
  + "image_prompt in English: one still frame that illustrates the segment, 35 to 70 words "
  + "(subject, action, setting, lighting, camera framing). Do not repeat the visual style "
  + "keywords; the app appends the style itself.\n"
  + "Image models draw every word literally, so:\n"
  + "- One main subject group in the foreground doing ONE clearly visible action; at most one "
  + "secondary group, placed explicitly ('behind them', 'in the background').\n"
  + "- The first sentence names the location and whether it is inside or outside.\n"
  + "- Describe the ground, vegetation and sky concretely. Never rely on season words alone.\n"
  + "- Describe garments by shape, not only colour. Every person is fully clothed.\n"
  + "- Use one lighting that matches the time of day.\n"
  + "- If the narration is abstract (a comment, a question, a summary), still show one concrete, "
  + "filmable moment that carries its meaning; never a copy of the previous frame.\n"
  + "- Image models ignore negation and DRAW everything a prompt names. Never write what is "
  + "absent or hidden ('no text', 'without hats'). Describe only what IS visible.\n"
  + "- The picture fills the whole frame edge to edge: never a border, frame, caption or panel.\n"
  + "Keep continuity across segments: same characters, wardrobe, palette, location and era; "
  + "advance the visible action with each segment.\n"
  + "Also write video_prompt in English for each segment: an image-to-video motion prompt of 15 to "
  + "30 words describing how that same still frame moves for a few seconds (one subject action, "
  + "one gentle camera move, pace). It must not introduce new subjects or change the scene.\n"
  + "Reply ONLY with a JSON array. Every element must be exactly: "
  + '{"index": <int>, "image_prompt": "<string>", "video_prompt": "<string>"}.';

/**
 * Sahneler için görsel prompt'ları yazar. `sahneler`: `[{ index, metin }]` (yazılacaklar);
 * `onceki`: daha önce yazılmış `[{ index, prompt }]` (süreklilik için). `bildir(sahne, prompt, hareket)`
 * her grup bittikçe çağrılır, böylece yarıda kesilse de yazılanlar kalır.
 */
export async function promptlariYaz({ anahtar, sahneler, dil, stil, tamMetin, onceki = [], bildir, iptal }) {
  const yazilan = [...onceki];
  for (let i = 0; i < sahneler.length; i += GRUP) {
    if (iptal?.()) throw new Error("Durduruldu.");
    const grup = sahneler.slice(i, i + GRUP);
    const bloklar = [
      `Narration language: ${DILLER[dil] || "English"}`,
      `Overall visual style (appended by the app, do not repeat): ${stil || "cinematic, photorealistic"}`,
      "Full narration (context only; write prompts only for the segments listed below): "
        + tamMetin.replace(/\s+/g, " ").trim(),
    ];
    const son = yazilan.slice(-4);
    if (son.length) {
      bloklar.push("Prompts already written for other segments of this same video (keep continuity):");
      for (const k of son) bloklar.push(`Segment ${k.index} image: ${k.prompt.replace(/\s+/g, " ")}`);
    }
    bloklar.push(`There are ${grup.length} segments; write a prompt for each one.`, "");
    for (const s of grup) bloklar.push(`Segment ${s.index}: ${s.metin}`);
    const kayitlar = jsonCoz(await uret(anahtar, PROMPT_SISTEM, bloklar.join("\n"), true));
    if (!Array.isArray(kayitlar)) throw new Error("Gemini prompt'ları beklenen biçimde döndürmedi. Yeniden dene.");
    grup.forEach((s, sira) => {
      const kayit = kayitlar.find((k) => k && String(k.index) === String(s.index)) || kayitlar[sira];
      const prompt = String(kayit?.image_prompt || "").trim();
      if (prompt) {
        yazilan.push({ index: s.index, prompt });
        bildir?.(s, prompt, String(kayit?.video_prompt || "").trim());
      }
    });
  }
}
