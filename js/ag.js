// Ağ yardımcıları.

/** `ms` sonra isteği kesen sinyal. Yanıt vermeden asılı kalan istek uygulamayı kilitlemesin. */
export function zamanAsimi(ms) {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const kesici = new AbortController();
  setTimeout(() => kesici.abort(), ms);
  return kesici.signal;
}

/**
 * Hata nesnesi kurar. `tur`: "kota" (hesap havuzu sıradaki hesaba geçer ve bu hesabı bekletir) ya da
 * "yetki" (anahtar reddedildi; hesap bu oturumda atlanır). Kota için `gunluk` (günlük kota bitti)
 * ya da `bekleme` (saniye; dakikalık hız sınırı) verilebilir.
 */
export function hataKur(mesaj, ek = {}) {
  return Object.assign(new Error(mesaj), ek);
}

/** Gemini HTTP hatasını sınıflandırır (seslendirme ve metin ortak). */
export function geminiHatasi(durum, govde) {
  const mesaj = String(govde?.error?.message || "").slice(0, 400);
  if (durum === 429) {
    // Günlük kota ile dakikalık hız sınırı aynı kodu verir; ayrım ayrıntıdaki kota kimliğinden okunur.
    const ayrinti = JSON.stringify(govde?.error?.details || "");
    const gunluk = /PerDay/i.test(ayrinti) || /per.?day/i.test(mesaj);
    const sure = /"retryDelay":"([\d.]+)s"/.exec(ayrinti) || /retry in ([\d.]+)\s*s/i.exec(mesaj);
    return hataKur(`Gemini kotası doldu ya da hız sınırı aşıldı (429). ${mesaj}`,
                   { tur: "kota", gunluk, bekleme: !gunluk && sure ? Number(sure[1]) : undefined });
  }
  if ((durum === 400 && /API key/i.test(mesaj)) || durum === 401) return hataKur("Gemini anahtarı geçersiz. " + mesaj, { tur: "yetki" });
  if (durum === 403) return hataKur("Gemini anahtarı bu model için yetkisiz (403). " + mesaj, { tur: "yetki" });
  return hataKur(`Gemini hatası (${durum}). ${mesaj}`.trim());
}

/** Anahtar yerine kasa göndermesi mi geldi? (`{ kasa: { adres, parola, hesap } }`) */
export const kasaMi = (anahtar) => !!anahtar && typeof anahtar === "object" && !!anahtar.kasa;
export const anahtarBos = (anahtar) => !kasaMi(anahtar) && !String(anahtar || "").trim();

/**
 * Servis isteği: anahtar düz metinse doğrudan servise (`dogrudan`: `{ adres, basliklar }`), kasa göndermesiyse
 * kasaya (`kasaYolu`) gider; kasa anahtarı kendisi ekler. Kasanın kendi hatası (yanlış parola, bilinmeyen hesap)
 * servis hatasından ayrı olarak düz hata yükseltir; böylece hesap havuzu sağlam hesabı elemez.
 */
export async function hizmetIstegi(anahtar, kasaYolu, dogrudan, secenek = {}) {
  const kasa = kasaMi(anahtar);
  const basliklar = kasa
    ? { Authorization: `Bearer ${anahtar.kasa.parola}`, "X-Kasa-Hesap": encodeURIComponent(anahtar.kasa.hesap) }
    : dogrudan.basliklar;
  const yanit = await fetch(kasa ? anahtar.kasa.adres + kasaYolu : dogrudan.adres,
                            { ...secenek, headers: { ...(secenek.headers || {}), ...basliklar } });
  if (kasa && yanit.headers.get("X-Kasa-Hata")) {
    const govde = await yanit.json().catch(() => null);
    throw new Error("Kasa: " + (govde?.hata || `hata ${yanit.status}`));
  }
  return yanit;
}

export const zamanAsimiMi = (hata) => hata?.name === "TimeoutError" || hata?.name === "AbortError";
