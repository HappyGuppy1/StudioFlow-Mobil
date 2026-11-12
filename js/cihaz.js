// Cihaz raporu: bu telefonun/tarayıcının uygulamanın ihtiyaç duyduğu özellikleri
// destekleyip desteklemediğini listeler.
import { videoAyari, sesAyari, kayitTuru } from "./disa_aktar.js";

export async function cihazRaporu() {
  const satirlar = [];
  const ekle = (ad, durum, not = "") => satirlar.push({ ad, durum, not });

  const kurulu = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  ekle("Ana ekrana kurulu", kurulu, kurulu ? "" : "Paylaş › Ana Ekrana Ekle ile kur");
  ekle("Çevrimdışı açılış", "serviceWorker" in navigator && !!navigator.serviceWorker.controller,
       "serviceWorker" in navigator ? "ilk açılıştan sonra etkinleşir" : "desteklenmiyor");

  const v720 = await videoAyari(720, 1280, 30);
  const v1080 = await videoAyari(1080, 1920, 30);
  ekle("Hızlı video kodlama 720p", !!v720, v720?.codec || "");
  ekle("Hızlı video kodlama 1080p", !!v1080, v1080?.codec || "");
  const s = await sesAyari();
  ekle("Hızlı ses kodlama (AAC)", !!s, s ? `${s.numberOfChannels} kanal` : "yoksa gerçek zamanlı kayıt kullanılır");
  const k = kayitTuru();
  ekle("Gerçek zamanlı kayıt (yedek)", !!k, k || "");

  ekle("Ekranı açık tutma", "wakeLock" in navigator);
  ekle("Dosya paylaşma / kaydetme", typeof navigator.canShare === "function");

  try {
    const d = await navigator.storage.estimate();
    ekle("Depolama", true, `${(d.usage / 1e6).toFixed(0)} MB kullanılıyor · ${(d.quota / 1e9).toFixed(1)} GB sınır`);
  } catch {
    ekle("Depolama", null, "ölçülemedi");
  }
  if (navigator.deviceMemory) ekle("Bellek", true, `${navigator.deviceMemory} GB (yaklaşık)`);
  ekle("Tarayıcı", true, navigator.userAgent);
  return satirlar;
}

export function raporMetni(satirlar, ekler = []) {
  const isaret = (d) => (d === true ? "✓" : d === false ? "✗" : "?");
  return ["StudioFlow Mobil · cihaz raporu",
          ...satirlar.map((s) => `${isaret(s.durum)} ${s.ad}${s.not ? ": " + s.not : ""}`),
          ...ekler].join("\n");
}
