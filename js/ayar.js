// Bağlantı anahtarları ve tercihler: yalnızca bu cihazın tarayıcı deposunda tutulur.
const ANAHTAR = "studioflow-mobil-ayar";

function oku() {
  try { return JSON.parse(localStorage.getItem(ANAHTAR)) || {}; } catch { return {}; }
}

/** Geçerli ayarlar (yerinde güncellenir). Alanlar: gemini, cfHesap, cfToken, cfAraci, dil, ses, model… */
export const ayar = oku();

/** Değişiklikleri uygular ve kaydeder; boş değerli alanlar silinir. Kaydedilemezse `false`. */
export function ayarGuncelle(degisiklik) {
  for (const [ad, deger] of Object.entries(degisiklik)) {
    if (deger === "" || deger == null) delete ayar[ad];
    else ayar[ad] = deger;
  }
  try { localStorage.setItem(ANAHTAR, JSON.stringify(ayar)); return true; } catch { return false; }
}

export const cloudflareHazir = () => !!(ayar.cfHesap && ayar.cfToken && ayar.cfAraci);
