// Küçük DOM yardımcıları. Kullanıcı metni her zaman textContent ile yazılır (HTML olarak değil).

/** Öğe kurar: `h("button", { class: "dugme", onclick: f }, "Metin")`. */
export function h(etiket, ozellik, ...cocuklar) {
  const e = document.createElement(etiket);
  let deger;
  for (const [ad, d] of Object.entries(ozellik || {})) {
    if (d == null || d === false) continue;
    if (ad === "value") deger = d;
    else if (ad === "class") e.className = d;
    else if (ad.startsWith("on")) e.addEventListener(ad.slice(2), d);
    else if (d === true) e.setAttribute(ad, "");
    else e.setAttribute(ad, d);
  }
  for (const c of cocuklar.flat(Infinity)) if (c != null && c !== false) e.append(c);
  if (deger !== undefined) e.value = deger;     // select'te seçenekler eklendikten sonra
  return e;
}

export function secenekler(liste, secili) {
  return liste.map(([deger, etiket]) => h("option", { value: deger, selected: deger === secili }, etiket));
}

export function durumYaz(hedef, metin, tur = "") {
  hedef.textContent = metin;
  hedef.className = "durum" + (tur ? " " + tur : "");
}

/** Çağrıları `ms` kadar geciktirip birleştirir; `.simdi()` bekleyeni hemen çalıştırır. */
export function geciktir(is, ms) {
  let sayac = null;
  const f = () => { clearTimeout(sayac); sayac = setTimeout(() => { sayac = null; is(); }, ms); };
  f.simdi = () => { if (sayac !== null) { clearTimeout(sayac); sayac = null; is(); } };
  return f;
}

/** Uzun işlem boyunca ekranı açık tutar (telefon kilitlenirse tarayıcı işi durdurur). */
export async function ekranAcik(is) {
  let kilit = null;
  try {
    kilit = await navigator.wakeLock?.request("screen").catch(() => null);
    return await is();
  } finally {
    kilit?.release().catch(() => {});
  }
}

export function sureYaz(saniye) {
  const s = Math.max(0, Math.round(saniye));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
