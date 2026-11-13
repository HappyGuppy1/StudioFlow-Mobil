// Hugging Face ZeroGPU'daki LTX-2.3 Space'iyle görselden video (image-to-video).
// Gradio'nun HTTP API'si tarayıcıdan doğrudan çağrılır (Space'ler CORS'a izin verir):
//   1. /gradio_api/info       → uç noktanın parametre sırası (Space kopyaları ek alan taşıyabilir)
//   2. /gradio_api/upload     → kareyi yükle
//   3. /gradio_api/call/…     → işi başlat, olay akışından (SSE) sonucu bekle
// Masaüstü StudioFlow'daki `saglayicilar/video_ltx.py` ile aynı parametreler ve koruma eki.
import { zamanAsimi, hataKur, hizmetIstegi, kasaMi, anahtarBos } from "./ag.js";

export const RESMI_SPACE = "Lightricks/LTX-2-3";
export const SURE_ALT = 1, SURE_UST = 8;
const UC = "generate_video";
const BEKLEME_SINIRI = 600_000;          // 10 dakikada sonuç gelmezse vazgeçilir
// Space negatif prompt almaz; bu ek karenin (yüzler, sahne, stil) korunmasını sağlar.
const KORUMA = " The camera stays steady or moves only slightly. Keep exactly the same scene, the "
  + "same characters with the same faces and the same art style as the first frame; no new "
  + "characters, no cuts.";
export const VARSAYILAN_HAREKET = "Slow cinematic camera push in, subtle natural subject motion, gentle ambient movement.";

/** Çıktı ölçüsü (kenarlar 32'nin katı): güvenilir üst sınır 1280×704. */
export function olcuSec(dikey) {
  return dikey ? { en: 704, boy: 1280 } : { en: 1280, boy: 704 };
}

const spaceKisaAdi = (space) => space.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
const spaceAdresi = (space) => `https://${spaceKisaAdi(space)}.hf.space`;

function hataDuzenle(metin, space) {
  const sade = String(metin || "").replace(/hf_[A-Za-z0-9]+/g, "[gizli]").slice(0, 400);
  if (/quota|exceeded|gpu limit/i.test(sade)) return `LTX · ücretsiz GPU kotası doldu (${space}). ${sade}`;
  if (/no gpu|gpu.*(unavailable|not available)|waiting for a gpu/i.test(sade)) return `LTX · ${space} şu an GPU vermiyor. ${sade}`;
  if (/401|unauthorized|sign in|log in/i.test(sade)) return `LTX · Hugging Face token'ı reddedildi (${space}). ${sade}`;
  return `LTX hatası (${space}): ${sade || "Space ayrıntı vermedi; GPU kotası ya da süresi yetmemiş olabilir."}`;
}

/** Hata nesnesi: hesabın GPU kotası dolduysa `tur: "kota"`, token reddedildiyse `tur: "yetki"` (hesap havuzu sıradakine geçer). */
function ltxHatasi(metin, space) {
  const mesaj = hataDuzenle(metin, space);
  // ZeroGPU, hesabın GPU süresi yetmeyince çoğu kez ayrıntısız hata verir: hesap bekletilir ve sıradaki hesap denenir
  // (`belirsiz`: neden kesin değil; üst üste yinelenirse çağıran durur, bütün hesaplar boşa harcanmaz).
  if (/ayrıntı vermedi/.test(mesaj)) return hataKur(mesaj, { tur: "kota", bekleme: 1800, belirsiz: true });
  return hataKur(mesaj, /kotası doldu/.test(mesaj) ? { tur: "kota" } : /reddedildi/.test(mesaj) ? { tur: "yetki" } : {});
}

/** Hata başka bir Space'le yeniden denenebilir mi (Space GPU vermiyor ya da ulaşılamıyor)? Kota hesabın sorunudur, Space'in değil. */
const spaceSorunu = (hata) => !hata.tur && /GPU vermiyor|ulaşılamıyor|hazır değil/i.test(hata.message);

function urlBul(deger) {
  if (!deger || typeof deger !== "object") return null;
  if (typeof deger.url === "string" && /\.mp4(\?|$)/i.test(deger.url)) return deger.url;
  if (typeof deger.path === "string" && /\.mp4$/i.test(deger.path)) return { yol: deger.path };
  for (const alt of Array.isArray(deger) ? deger : Object.values(deger)) {
    const bulunan = urlBul(alt);
    if (bulunan) return bulunan;
  }
  return null;
}

/** Olay akışını (text/event-stream) okuyup her olay için `olay(ad, veri)` çağırır. */
async function akisOku(yanit, olay, iptal) {
  const okuyucu = yanit.body.getReader();
  const cozucu = new TextDecoder();
  let tampon = "";
  try {
    for (;;) {
      if (iptal?.()) throw new Error("Durduruldu.");
      const { value, done } = await okuyucu.read();
      if (done) return;
      tampon += cozucu.decode(value, { stream: true });
      let son;
      while ((son = tampon.search(/\r?\n\r?\n/)) >= 0) {
        const blok = tampon.slice(0, son);
        tampon = tampon.slice(son).replace(/^\r?\n\r?\n/, "");
        const ad = /^event:\s*(.*)$/m.exec(blok)?.[1]?.trim();
        const veri = [...blok.matchAll(/^data:\s?(.*)$/gm)].map((e) => e[1]).join("\n");
        if (ad && olay(ad, veri) === "bitti") return;
      }
    }
  } finally {
    okuyucu.cancel().catch(() => {});
  }
}

async function tekSpace({ space, erisim, token, gorsel, prompt, sure, dikey, bildir, iptal }) {
  const kok = spaceAdresi(space);
  const yetki = kasaMi(token) ? {} : { Authorization: `Bearer ${token}` };
  // Kasada istek `/hf/<space>/gradio_api/…` yolundan geçer; token'ı kasa ekler.
  const al = async (yol, secenek = {}, ms = 60_000) => {
    try {
      return await hizmetIstegi(token, `/hf/${spaceKisaAdi(space)}${yol}`, { adres: kok + yol, basliklar: yetki },
                                { ...secenek, signal: zamanAsimi(ms) });
    } catch (hata) {
      if (/^Kasa: /.test(hata.message)) throw hata;
      throw new Error(`LTX · ${space} Space'ine ulaşılamıyor (uykuda ya da kapalı olabilir).`);
    }
  };

  bildir?.(`LTX · ${space} hazırlanıyor…`);
  const bilgiYaniti = await al("/gradio_api/info");
  if (!bilgiYaniti.ok) throw new Error(`LTX · ${space} hazır değil (${bilgiYaniti.status}).`);
  const uc = (await bilgiYaniti.json())?.named_endpoints?.["/" + UC];
  if (!uc) throw new Error(`LTX · ${space} beklenen uç noktayı sunmuyor.`);

  const form = new FormData();
  form.append("files", gorsel, "input.jpg");
  const yukleme = await al("/gradio_api/upload", { method: "POST", body: form }, 120_000);
  if (!yukleme.ok) throw ltxHatasi(await yukleme.text().catch(() => yukleme.status), space);
  const yol = (await yukleme.json())?.[0];
  if (!yol) throw new Error(`LTX · ${space} kareyi kabul etmedi.`);

  const olcu = olcuSec(dikey);
  const degerler = {
    input_image: { path: yol, orig_name: "input.jpg", mime_type: "image/jpeg", meta: { _type: "gradio.FileData" } },
    prompt: prompt.trim() + KORUMA,
    duration: Math.max(SURE_ALT, Math.min(SURE_UST, Number(sure) || SURE_UST)),
    enhance_prompt: false,
    seed: Math.floor(Math.random() * 2 ** 31),
    randomize_seed: false,
    height: olcu.boy,
    width: olcu.en,
    erisim_anahtari: erisim || "",
  };
  const veri = uc.parameters.map((p) => (p.parameter_name in degerler ? degerler[p.parameter_name] : p.parameter_default));

  const baslat = await al(`/gradio_api/call/${UC}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: veri }) });
  const olayKimligi = (await baslat.json().catch(() => null))?.event_id;
  if (!baslat.ok || !olayKimligi) throw ltxHatasi(`iş başlatılamadı (${baslat.status})`, space);

  const basla = Date.now();
  const sayac = setInterval(() => bildir?.(`LTX · video üretiliyor • ${Math.round((Date.now() - basla) / 1000)} sn`), 2000);
  let sonuc = null, hata = null;
  try {
    const akis = await al(`/gradio_api/call/${UC}/${olayKimligi}`, {}, BEKLEME_SINIRI);
    if (!akis.ok) throw ltxHatasi(`sonuç akışı açılamadı (${akis.status})`, space);
    await akisOku(akis, (ad, govde) => {
      if (ad === "complete") { try { sonuc = JSON.parse(govde); } catch { sonuc = null; } return "bitti"; }
      if (ad === "error") {
        let mesaj = govde;
        try { const j = JSON.parse(govde); mesaj = j?.error || j?.message || j?.title || (typeof j === "string" ? j : ""); } catch { /* düz metin */ }
        hata = ltxHatasi(mesaj, space);
        return "bitti";
      }
      return null;
    }, iptal);
  } catch (h) {
    if (h?.name === "TimeoutError" || h?.name === "AbortError") throw new Error("LTX 10 dakika içinde sonuç vermedi.");
    throw h;
  } finally {
    clearInterval(sayac);
  }
  if (hata) throw hata;
  const bulunan = urlBul(sonuc);
  // Ölçüldü (masaüstü): GPU süresi yetmeyince Space hata değil boş sonuç döndürür.
  if (!bulunan) throw hataKur(`LTX video döndürmedi (${space}): hesabın GPU kotası yetmemiş olabilir.`, { tur: "kota", bekleme: 1800, belirsiz: true });
  const adres = typeof bulunan === "string" ? bulunan : `${kok}/gradio_api/file=${bulunan.yol}`;
  bildir?.("LTX · klip indiriliyor…");
  let dosya;
  try {
    dosya = adres.startsWith(kok)
      ? await al(adres.slice(kok.length), {}, 180_000)
      : await fetch(adres, { signal: zamanAsimi(180_000) });
  } catch (hata) {
    if (/^Kasa: |ulaşılamıyor/.test(hata.message)) throw hata;
    throw new Error("LTX · klip indirilemedi (bağlantı).");
  }
  if (!dosya.ok) throw new Error(`LTX · klip indirilemedi (${dosya.status}).`);
  return new Blob([await dosya.arrayBuffer()], { type: "video/mp4" });
}

/**
 * Görselden klip üretir ve MP4 `Blob` döndürür.
 *   gorsel  : JPEG `Blob` (uzun kenarı ≤ 1280)
 *   spaceler: kendi Space adların (isteğe bağlı, `erisim` anahtarıyla); sonda resmî Space denenir
 * Kendi Space GPU vermezse sıradaki denenir; son hata olduğu gibi yükselir.
 */
export async function videoUret({ token, spaceler = [], erisim = "", gorsel, prompt, sure, dikey, bildir, iptal }) {
  if (anahtarBos(token)) throw new Error("Hugging Face hesabı yok: API sayfasından ekle.");
  const kendi = erisim ? spaceler.map((s) => s.trim()).filter(Boolean) : [];
  const adaylar = [...kendi.map((space) => ({ space, erisim })), { space: RESMI_SPACE, erisim: "" }];
  let son = null;
  for (const [sira, aday] of adaylar.entries()) {
    if (iptal?.()) throw new Error("Durduruldu.");
    try {
      return await tekSpace({ ...aday, token: kasaMi(token) ? token : token.trim(), gorsel, prompt: (prompt || "").trim() || VARSAYILAN_HAREKET,
                              sure, dikey, bildir, iptal });
    } catch (hata) {
      son = hata;
      if (iptal?.() || !spaceSorunu(hata) || sira === adaylar.length - 1) throw hata;
      bildir?.(`${hata.message.slice(0, 120)} Sıradaki Space deneniyor…`);
    }
  }
  throw son;
}
