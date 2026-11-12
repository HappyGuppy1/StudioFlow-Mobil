// Kalıcı depo (IndexedDB): projeler ve dosyaları (görsel, ses) telefonda saklanır.
//
//   projeler : proje kaydı (anahtar: id)
//   dosyalar : `<projeId>:gorsel:<sahneId>` → { veri: ArrayBuffer, tur }
//              `<projeId>:ses:<parçaAnahtarı>` → { veri: ArrayBuffer (16 bit PCM), hiz }
//              `<projeId>:video:<sahneId>` → { veri: ArrayBuffer (MP4), tur }
const AD = "studioflow-mobil";
let _vt = null;

function ac() {
  if (!_vt) {
    _vt = new Promise((coz, red) => {
      const istek = indexedDB.open(AD, 1);
      istek.onupgradeneeded = () => {
        istek.result.createObjectStore("projeler", { keyPath: "id" });
        istek.result.createObjectStore("dosyalar");
      };
      istek.onsuccess = () => coz(istek.result);
      istek.onerror = () => { _vt = null; red(istek.error); };
    });
  }
  return _vt;
}

async function islem(depo, kip, is) {
  const vt = await ac();
  return new Promise((coz, red) => {
    const t = vt.transaction(depo, kip);
    const istek = is(t.objectStore(depo));
    t.oncomplete = () => coz(istek?.result);
    t.onerror = t.onabort = () => red(t.error || new Error("Depolama hatası."));
  });
}

const onekAraligi = (onek) => IDBKeyRange.bound(onek, onek + "￿");

export const projeler = {
  hepsi: () => islem("projeler", "readonly", (d) => d.getAll()),
  al: (id) => islem("projeler", "readonly", (d) => d.get(id)),
  yaz: (proje) => islem("projeler", "readwrite", (d) => d.put(proje)),
  sil: (id) => islem("projeler", "readwrite", (d) => d.delete(id)),
};

export const dosyalar = {
  al: (anahtar) => islem("dosyalar", "readonly", (d) => d.get(anahtar)),
  yaz: (anahtar, deger) => islem("dosyalar", "readwrite", (d) => d.put(deger, anahtar)),
  sil: (anahtar) => islem("dosyalar", "readwrite", (d) => d.delete(anahtar)),
  anahtarlar: (onek) => islem("dosyalar", "readonly", (d) => d.getAllKeys(onekAraligi(onek))),
  onekSil: (onek) => islem("dosyalar", "readwrite", (d) => d.delete(onekAraligi(onek))),
};

/** Tarayıcıdan verileri kendiliğinden silmemesini ister (ana ekrana kurulu uygulamada genelde kabul edilir). */
export function kaliciIste() {
  navigator.storage?.persist?.().catch(() => {});
}

export const gorselAnahtari = (projeId, sahneId) => `${projeId}:gorsel:${sahneId}`;
export const sesAnahtari = (projeId, parca) => `${projeId}:ses:${parca}`;
export const videoAnahtari = (projeId, sahneId) => `${projeId}:video:${sahneId}`;
// İlk müzik (`ilk`) eski sürümlerdeki tek müzik anahtarında durur; sonrakiler kendi kimlikleriyle.
export const muzikAnahtari = (projeId, muzikId = "ilk") => (muzikId === "ilk" ? `${projeId}:muzik` : `${projeId}:muzik:${muzikId}`);
