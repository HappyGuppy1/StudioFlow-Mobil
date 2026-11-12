// StudioFlow Mobil · arayüz. Tüm işlem cihazda yapılır; sunucu yoktur.
import * as gemini from "./gemini.js";
import * as cloudflare from "./cloudflare.js";
import { disaAktar } from "./disa_aktar.js";
import { cihazRaporu, raporMetni } from "./cihaz.js";
import { sesBaglami, dosyadanSes, wavBlob } from "./ses.js";

const SURUM = "0.1.0";
const AYAR_ANAHTARI = "studioflow-mobil-ayar";
const el = (kimlik) => document.getElementById(kimlik);

const durum = {
  ses: null,          // { pcm, hiz }
  gorseller: [],      // [{ tuval, url }]
  video: null,        // { blob, uzanti }
  iptal: false,
  sonAktarim: "",
};

// ── Ayarlar (yalnızca bu cihazda) ───────────────────────────────────────────
function ayarOku() {
  try { return JSON.parse(localStorage.getItem(AYAR_ANAHTARI)) || {}; } catch { return {}; }
}
function ayarYaz(ayar) {
  try { localStorage.setItem(AYAR_ANAHTARI, JSON.stringify(ayar)); return true; } catch { return false; }
}
let ayar = ayarOku();

function yaz(hedef, metin, tur = "") {
  hedef.textContent = metin;
  hedef.className = "durum" + (tur ? " " + tur : "");
}

function baglantiOzeti() {
  const var_ = [ayar.gemini && "Gemini", ayar.cfToken && ayar.cfAraci && "Cloudflare"].filter(Boolean);
  el("baglanti-ozet").textContent = var_.length ? var_.join(" + ") : "anahtar yok";
}

async function mesgul(dugme, is) {
  const eski = dugme.textContent;
  dugme.disabled = true;
  let kilit = null;
  try {
    kilit = await navigator.wakeLock?.request("screen").catch(() => null);
    await is();
  } finally {
    dugme.disabled = false;
    dugme.textContent = eski;
    kilit?.release().catch(() => {});
  }
}

// ── Seslendirme ─────────────────────────────────────────────────────────────
function sesAta(ses, aciklama) {
  durum.ses = ses;
  const oynatici = el("ses-oynatici");
  if (oynatici.src) URL.revokeObjectURL(oynatici.src);
  oynatici.src = URL.createObjectURL(wavBlob(ses.pcm, ses.hiz));
  oynatici.hidden = false;
  yaz(el("ses-durum"), `${aciklama} · ${(ses.pcm.length / ses.hiz).toFixed(1)} sn`, "tamam");
  videoOzeti();
}

async function seslendir() {
  sesBaglami();
  await mesgul(el("seslendir"), async () => {
    el("seslendir").textContent = "Seslendiriliyor…";
    yaz(el("ses-durum"), "Gemini'den ses bekleniyor…");
    const basla = performance.now();
    try {
      const ses = await gemini.seslendir({
        anahtar: ayar.gemini, model: el("model").value, ses: el("ses").value,
        dil: el("dil").value, stil: el("stil").value, metin: el("metin").value,
      });
      sesAta(ses, `Seslendirme hazır (${((performance.now() - basla) / 1000).toFixed(1)} sn'de üretildi)`);
    } catch (hata) {
      yaz(el("ses-durum"), hata.message, "hata");
    }
  });
}

async function sesDosyasi(olay) {
  const dosya = olay.target.files[0];
  olay.target.value = "";
  if (!dosya) return;
  sesBaglami();
  yaz(el("ses-durum"), "Ses dosyası okunuyor…");
  try {
    sesAta(await dosyadanSes(await dosya.arrayBuffer()), `Ses dosyası: ${dosya.name}`);
  } catch (hata) {
    yaz(el("ses-durum"), /desteklemiyor/.test(hata.message) ? hata.message : "Bu ses dosyası okunamadı.", "hata");
  }
}

// ── Görseller ───────────────────────────────────────────────────────────────
async function gorselEkle(blob) {
  const url = URL.createObjectURL(blob);
  const resim = new Image();
  resim.src = url;
  await resim.decode();
  // Büyük fotoğraflar (12 MP+) telefonda belleği doldurur; uzun kenar 1920'ye indirilir.
  const olcek = Math.min(1, 1920 / Math.max(resim.naturalWidth, resim.naturalHeight));
  const tuval = document.createElement("canvas");
  tuval.width = Math.max(1, Math.round(resim.naturalWidth * olcek));
  tuval.height = Math.max(1, Math.round(resim.naturalHeight * olcek));
  tuval.getContext("2d").drawImage(resim, 0, 0, tuval.width, tuval.height);
  durum.gorseller.push({ tuval, url });
  gorselleriCiz();
}

function gorselleriCiz() {
  const izgara = el("gorsel-izgara");
  izgara.replaceChildren(...durum.gorseller.map((g, i) => {
    const kutu = document.createElement("div");
    kutu.className = "gorsel";
    const resim = document.createElement("img");
    resim.src = g.url;
    resim.alt = `Görsel ${i + 1}`;
    const sira = document.createElement("span");
    sira.className = "sira";
    sira.textContent = i + 1;
    const sil = document.createElement("button");
    sil.type = "button";
    sil.textContent = "×";
    sil.setAttribute("aria-label", `Görsel ${i + 1} sil`);
    sil.onclick = () => {
      URL.revokeObjectURL(g.url);
      durum.gorseller.splice(i, 1);
      gorselleriCiz();
    };
    kutu.append(resim, sira, sil);
    return kutu;
  }));
  videoOzeti();
}

function boyut() {
  const [en, boy] = el("boyut").value.split("x").map(Number);
  return { en, boy };
}

async function gorselUret() {
  await mesgul(el("gorsel-uret"), async () => {
    el("gorsel-uret").textContent = "Üretiliyor…";
    yaz(el("gorsel-durum"), "Cloudflare'den görsel bekleniyor…");
    const basla = performance.now();
    try {
      const blob = await cloudflare.gorselUret({
        araci: ayar.cfAraci, hesap: ayar.cfHesap, token: ayar.cfToken,
        model: el("gorsel-model").value, prompt: el("prompt").value, ...boyut(),
      });
      await gorselEkle(blob);
      yaz(el("gorsel-durum"), `Görsel eklendi (${((performance.now() - basla) / 1000).toFixed(1)} sn).`, "tamam");
    } catch (hata) {
      yaz(el("gorsel-durum"), hata.message, "hata");
    }
  });
}

async function gorselDosyalari(olay) {
  const dosyalar = [...olay.target.files];
  olay.target.value = "";
  let eklenen = 0;
  for (const dosya of dosyalar) {
    try { await gorselEkle(dosya); eklenen++; } catch { /* okunamayan dosya atlanır */ }
  }
  const atlanan = dosyalar.length - eklenen;
  yaz(el("gorsel-durum"), `${eklenen} görsel eklendi` + (atlanan ? `, ${atlanan} dosya okunamadı.` : "."),
      atlanan ? "hata" : "tamam");
}

// ── Video ───────────────────────────────────────────────────────────────────
function videoOzeti() {
  const n = durum.gorseller.length;
  const sure = durum.ses ? durum.ses.pcm.length / durum.ses.hiz : n * 4;
  el("video-ozet").textContent = n
    ? `${n} görsel · ${sure.toFixed(1)} sn` + (durum.ses ? " (ses süresi)" : " (sessiz, görsel başına 4 sn)")
    : "Ses ve en az bir görsel ekleyince video oluşturabilirsin. Ses yoksa görsel başına 4 saniye kullanılır.";
}

async function videoOlustur() {
  if (!durum.gorseller.length) return yaz(el("video-durum"), "Önce en az bir görsel ekle.", "hata");
  const baglam = sesBaglami();
  durum.iptal = false;
  const cubuk = el("video-ilerleme");
  cubuk.value = 0;
  cubuk.hidden = false;
  el("video-iptal").hidden = false;
  el("video-kaydet").hidden = true;
  await mesgul(el("video-olustur"), async () => {
    el("video-olustur").textContent = "Oluşturuluyor…";
    try {
      const { en, boy } = boyut();
      const sonuc = await disaAktar({
        gorseller: durum.gorseller.map((g) => g.tuval), ses: durum.ses, en, boy,
        sure: durum.gorseller.length * 4, yontem: el("yontem").value, sesBaglami: baglam,
        iptal: () => durum.iptal,
        ilerleme: (oran, metin) => { cubuk.value = oran; yaz(el("video-durum"), metin); },
      });
      durum.video = sonuc;
      const oynatici = el("video-oynatici");
      if (oynatici.src) URL.revokeObjectURL(oynatici.src);
      oynatici.src = URL.createObjectURL(sonuc.blob);
      oynatici.hidden = false;
      el("video-kaydet").hidden = false;
      durum.sonAktarim = `Son dışa aktarma: ${en}×${boy}, ${sonuc.sure.toFixed(1)} sn video, `
        + `${sonuc.gecen.toFixed(1)} sn'de (${(sonuc.sure / sonuc.gecen).toFixed(1)}× hız), `
        + `${(sonuc.blob.size / 1e6).toFixed(1)} MB, yöntem: ${sonuc.yontem}`;
      yaz(el("video-durum"), durum.sonAktarim.replace("Son dışa aktarma: ", "Video hazır: "), "tamam");
    } catch (hata) {
      yaz(el("video-durum"), hata.message || String(hata), "hata");
      durum.sonAktarim = `Son dışa aktarma HATA: ${hata.message || hata}`;
    }
  });
  cubuk.hidden = true;
  el("video-iptal").hidden = true;
}

async function videoKaydet() {
  if (!durum.video) return;
  const ad = `studioflow-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${durum.video.uzanti}`;
  const dosya = new File([durum.video.blob], ad, { type: durum.video.blob.type });
  if (navigator.canShare?.({ files: [dosya] })) {
    try {
      await navigator.share({ files: [dosya] });
      return;
    } catch (hata) {
      if (hata.name === "AbortError") return;   // kullanıcı paylaşımı kapattı
    }
  }
  const bag = document.createElement("a");
  bag.href = URL.createObjectURL(dosya);
  bag.download = ad;
  bag.click();
  setTimeout(() => URL.revokeObjectURL(bag.href), 60_000);
}

// ── Cihaz raporu ────────────────────────────────────────────────────────────
let raporSatirlari = [];
async function raporuYenile() {
  raporSatirlari = await cihazRaporu();
  el("rapor-liste").replaceChildren(...raporSatirlari.map((s) => {
    const satir = document.createElement("li");
    const isaret = document.createElement("span");
    isaret.textContent = s.durum === true ? "✓" : s.durum === false ? "✗" : "?";
    isaret.className = s.durum === true ? "var" : s.durum === false ? "yok" : "bilinmiyor";
    const govde = document.createElement("div");
    govde.textContent = s.ad;
    if (s.not) {
      const not = document.createElement("div");
      not.className = "not";
      not.textContent = s.not;
      govde.append(not);
    }
    satir.append(isaret, govde);
    return satir;
  }));
}

async function raporuKopyala() {
  const metin = raporMetni(raporSatirlari, [`Sürüm: ${SURUM}`, durum.sonAktarim].filter(Boolean));
  try {
    await navigator.clipboard.writeText(metin);
    yaz(el("rapor-durum"), "Rapor panoya kopyalandı.", "tamam");
  } catch {
    yaz(el("rapor-durum"), metin);
  }
}

// ── Açılış ──────────────────────────────────────────────────────────────────
function secenekDoldur(secim, ogeler, secili) {
  secim.replaceChildren(...ogeler.map(([deger, etiket]) => new Option(etiket, deger, false, deger === secili)));
}

function baslat() {
  el("surum").textContent = SURUM;
  secenekDoldur(el("dil"), Object.keys(gemini.DILLER).map((k) => [k, k.toUpperCase() + " · " + gemini.DILLER[k]]), ayar.dil || "tr");
  secenekDoldur(el("ses"), gemini.SESLER.map((s) => [s, s]), ayar.ses || "Charon");
  secenekDoldur(el("model"), gemini.MODELLER.map((m) => [m, m]), ayar.model);
  secenekDoldur(el("gorsel-model"), cloudflare.MODELLER.map((m) => [m.kimlik, m.ad]), ayar.gorselModel);
  el("gemini-anahtar").value = ayar.gemini || "";
  el("cf-hesap").value = ayar.cfHesap || "";
  el("cf-token").value = ayar.cfToken || "";
  el("cf-araci").value = ayar.cfAraci || "";
  baglantiOzeti();
  if (!ayar.gemini) el("baglantilar").open = true;

  el("baglanti-kaydet").onclick = () => {
    ayar = { ...ayar, gemini: el("gemini-anahtar").value.trim(), cfHesap: el("cf-hesap").value.trim(),
             cfToken: el("cf-token").value.trim(), cfAraci: el("cf-araci").value.trim() };
    const oldu = ayarYaz(ayar);
    yaz(el("baglanti-durum"), oldu ? "Kaydedildi (yalnızca bu cihazda)." : "Kaydedilemedi: tarayıcı depolamayı engelliyor.",
        oldu ? "tamam" : "hata");
    baglantiOzeti();
  };
  el("baglanti-sil").onclick = () => {
    for (const k of ["gemini", "cfHesap", "cfToken", "cfAraci"]) delete ayar[k];
    ayarYaz(ayar);
    for (const k of ["gemini-anahtar", "cf-hesap", "cf-token", "cf-araci"]) el(k).value = "";
    yaz(el("baglanti-durum"), "Anahtarlar bu cihazdan silindi.", "tamam");
    baglantiOzeti();
  };
  for (const [kimlik, alan] of [["dil", "dil"], ["ses", "ses"], ["model", "model"], ["gorsel-model", "gorselModel"]]) {
    el(kimlik).onchange = () => { ayar[alan] = el(kimlik).value; ayarYaz(ayar); };
  }
  el("seslendir").onclick = seslendir;
  el("ses-dosya").onchange = sesDosyasi;
  el("gorsel-uret").onclick = gorselUret;
  el("gorsel-dosya").onchange = gorselDosyalari;
  el("video-olustur").onclick = videoOlustur;
  el("video-iptal").onclick = () => { durum.iptal = true; };
  el("video-kaydet").onclick = videoKaydet;
  el("rapor-kopyala").onclick = raporuKopyala;

  raporuYenile();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).then(raporuYenile).catch(() => {});
  }
}

baslat();
