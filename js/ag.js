// Ağ yardımcıları.

/** `ms` sonra isteği kesen sinyal. Yanıt vermeden asılı kalan istek uygulamayı kilitlemesin. */
export function zamanAsimi(ms) {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const kesici = new AbortController();
  setTimeout(() => kesici.abort(), ms);
  return kesici.signal;
}

export const zamanAsimiMi = (hata) => hata?.name === "TimeoutError" || hata?.name === "AbortError";
