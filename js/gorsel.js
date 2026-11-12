// Görsel yardımcıları: dosyayı çözme, küçültme, depoya uygun biçime çevirme.

async function resimYukle(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const resim = new Image();
    resim.src = url;
    await resim.decode();
    return resim;
  } finally {
    // decode() bittiğinde piksel verisi bellektedir; adres hemen bırakılabilir.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function tuvalYap(resim, olcek) {
  const tuval = document.createElement("canvas");
  tuval.width = Math.max(1, Math.round(resim.naturalWidth * olcek));
  tuval.height = Math.max(1, Math.round(resim.naturalHeight * olcek));
  tuval.getContext("2d").drawImage(resim, 0, 0, tuval.width, tuval.height);
  return tuval;
}

/**
 * Galeriden gelen görseli depoya hazırlar: uzun kenar 1920'yi aşıyorsa küçültüp JPEG yapar
 * (12 MP fotoğraf telefonun belleğini ve deposunu gereksiz doldurur). Döner: `{ veri, tur }`.
 */
export async function depoyaHazirla(blob) {
  const resim = await resimYukle(blob);
  const uzun = Math.max(resim.naturalWidth, resim.naturalHeight);
  if (uzun <= 1920 && /^image\/(jpeg|png|webp)$/.test(blob.type)) {
    return { veri: await blob.arrayBuffer(), tur: blob.type };
  }
  const tuval = tuvalYap(resim, Math.min(1, 1920 / uzun));
  const kucuk = await new Promise((coz) => tuval.toBlob(coz, "image/jpeg", 0.9));
  tuval.width = tuval.height = 0;
  if (!kucuk) throw new Error("Görsel dönüştürülemedi.");
  return { veri: await kucuk.arrayBuffer(), tur: "image/jpeg" };
}

/** Depodaki görseli, videoda kaplayacağı boyuta yakın bir tuvale çizer (yakınlaşma payıyla). */
export async function videoTuvali(kayit, en, boy) {
  const resim = await resimYukle(new Blob([kayit.veri], { type: kayit.tur }));
  const kaplama = Math.max(en / resim.naturalWidth, boy / resim.naturalHeight) * 1.1;
  return tuvalYap(resim, Math.min(1, kaplama));
}

export const kayittanBlob = (kayit) => new Blob([kayit.veri], { type: kayit.tur });
