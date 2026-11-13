// StudioFlow Mobil · kabuk: yönlendirme ve ortak üst/alt çubuk. Tüm işlem cihazda yapılır.
import { kutuphaneGorunumu } from "./gorunum/kutuphane.js";
import { projeGorunumu } from "./gorunum/proje.js";
import { ayarlarGorunumu } from "./gorunum/ayarlar.js";
import { apiGorunumu } from "./gorunum/api.js";

const SURUM = "0.11.2";
const el = (kimlik) => document.getElementById(kimlik);
const kok = el("gorunum");

const kabuk = {
  /** Üst çubuk: proje içindeyken başlık ve geri düğmesi, değilse marka. */
  baslik(metin, geri) {
    el("geri").hidden = !geri;
    el("marka").hidden = !!geri;
    el("ust-baslik").hidden = !geri;
    el("ust-baslik").textContent = metin || "";
    document.title = metin ? `${metin} · StudioFlow` : "StudioFlow Mobil";
  },
};

let kapat = null;
let sira = 0;

async function yonlendir() {
  const benim = ++sira;
  try { kapat?.(); } catch { /* görünüm kapanırken hata uygulamayı durdurmasın */ }
  kapat = null;
  kok.replaceChildren();
  const [, yol, id] = location.hash.split("/");
  el("sek-projeler").classList.toggle("secili", yol !== "ayarlar" && yol !== "api");
  el("sek-api").classList.toggle("secili", yol === "api");
  el("sek-ayarlar").classList.toggle("secili", yol === "ayarlar");
  window.scrollTo(0, 0);
  let kapatici = null;
  try {
    if (yol === "proje" && id) kapatici = await projeGorunumu(kok, decodeURIComponent(id), kabuk);
    else if (yol === "api") kapatici = await apiGorunumu(kok, kabuk);
    else if (yol === "ayarlar") kapatici = await ayarlarGorunumu(kok, kabuk, SURUM);
    else kapatici = await kutuphaneGorunumu(kok, kabuk);
  } catch (hata) {
    const kutu = document.createElement("p");
    kutu.className = "durum hata sayfa";
    kutu.textContent = "Bu ekran açılamadı: " + (hata?.message || hata)
      + " (Tarayıcı özel sekmede ya da depolama kapalıysa projeler kaydedilemez.)";
    kok.replaceChildren(kutu);
  }
  if (benim !== sira) { try { kapatici?.(); } catch { /* yoksay */ } return; }   // bu arada başka ekrana geçildi
  kapat = kapatici;
}

el("geri").onclick = () => { location.hash = "#/"; };
window.addEventListener("hashchange", yonlendir);
yonlendir();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
