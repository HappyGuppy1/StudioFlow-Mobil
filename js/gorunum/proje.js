// Proje ekranı (düzenleyici): yatay ekranda, masaüstü StudioFlow'daki düzenle.
//   üst çubuk · [şerit | panel | önizleme | sahne paneli] · alt zaman çizelgesi
// Zaman çizelgesindeki izler masaüstüyle aynıdır (Video, Seslendirme, Dublaj, Müzik, Altyazı). Her izin
// başında 👁 göz (önizlemede görünsün/duyulsun) ve ☑ işaret (dışa aktarılan videoya girsin) vardır.
import { h, secenekler, durumYaz, geciktir, ekranAcik, sureYaz } from "../dom.js";
import * as depo from "../depo.js";
import { ayar, ayarGuncelle, ltxSpaceleri } from "../ayar.js";
import * as havuz from "../hesap.js";
import * as ltx from "../video_ltx.js";
import * as gemini from "../gemini.js";
import * as cloudflare from "../cloudflare.js";
import * as metinAI from "../metin.js";
import { sahnelereBol, sesPlani, zamanlama, altyaziBloklari, gorselPromptu, uretimBoyutu, yeniSahne,
         dilGorunumu, tumSesAnahtarlari, srtMetni, SES_PARCA_SINIRI } from "../sahne.js";
import { depoyaHazirla, videoTuvali, kayittanBlob, ltxKaresi, klipOgesi } from "../gorsel.js";
import { sesBaglami, wavBlob, dosyadanSes } from "../ses.js";
import { karistir } from "../karisim.js";
import { disaAktar, YAZI_TIPLERI } from "../disa_aktar.js";

const BOYUTLAR = [["720x1280", "Dikey 720 × 1280"], ["1080x1920", "Dikey 1080 × 1920"],
                  ["1280x720", "Yatay 1280 × 720"], ["1920x1080", "Yatay 1920 × 1080"]];
const SURELER = [30, 45, 60, 90, 120, 180, 300];
// Sol şerit: masaüstündeki bölümler, aynı sıra ve simgelerle. `yok`: mobilde henüz karşılığı olmayan bölüm.
const RAY = [["sahneler", "🎞", "Sahneler"], ["ayarlar", "⚙", "Ayarlar"], ["uretim", "▶", "Üretim"], ["metin", "📝", "Metin"],
             ["karakterler", "👥", "Karakter", "yok"], ["seslendirme", "🎙", "Seslendirme"], ["dublaj", "🌐", "Dublaj"],
             ["muzik", "🎵", "Müzik"], ["altyazi", "💬", "Altyazı"], ["efekt", "🔊", "Efekt", "yok"], ["izler", "🎚", "Karışım"],
             ["bilgi", "ⓘ", "Bilgi"]];
const IZLER = [{ anahtar: "video", ad: "Video" }, { anahtar: "seslendirme", ad: "Seslendirme" }, { anahtar: "dublaj", ad: "Dublaj" },
               { anahtar: "muzik", ad: "Müzik" }, { anahtar: "altyazi", ad: "Altyazı" }];
const GOZ_ACIK = "M12 5C6.5 5 2.7 9.2 1.5 12c1.2 2.8 5 7 10.5 7s9.3-4.2 10.5-7C21.3 9.2 17.5 5 12 5zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-2.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z";
const GOZ_KAPALI = "M2.3 3.7 3.7 2.3l18 18-1.4 1.4-3.3-3.3A11.7 11.7 0 0 1 12 19C6.5 19 2.7 14.8 1.5 12a13 13 0 0 1 3.9-4.9L2.3 3.7zM12 5c5.5 0 9.3 4.2 10.5 7a13.2 13.2 0 0 1-2.7 3.8l-3.5-3.5A4.5 4.5 0 0 0 11.7 7.5L9 4.9c1-.2 2-.4 3-.4z";
const bekle = (ms) => new Promise((coz) => setTimeout(coz, ms));

function gozIkonu(acik) {
  const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg"), yol = document.createElementNS(ns, "path");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  yol.setAttribute("d", acik ? GOZ_ACIK : GOZ_KAPALI);
  svg.append(yol);
  return svg;
}

export async function projeGorunumu(kok, id, kabuk) {
  const P = await depo.projeler.al(id);
  if (!P) { location.replace("#/"); return null; }
  kabuk.baslik(P.ad, true);
  const dikeyMi = () => { const [en, boy] = P.boyut.split("x").map(Number); return en < boy; };

  // Eski kayıtları yeni alanlara taşı.
  P.diller ||= {};                   // dublajlar: { kod: { metinler: { sahneId: çeviri }, sesSureleri: {} } }
  P.dublajSecili = P.diller[P.dublajSecili] ? P.dublajSecili : (P.diller[P.etkinDil] ? P.etkinDil : Object.keys(P.diller)[0] || "");
  P.isaret ||= { video: true, seslendirme: true, dublaj: !!P.diller[P.etkinDil], muzik: true, altyazi: !!P.altyazi };
  P.isaret.video = true;
  P.altyaziStil ||= { boyut: dikeyMi() ? 3.5 : 4.5, seviye: dikeyMi() ? 18 : 10, renk: "#ffffff", kalin: true, golge: true, font: "sans" };
  P.sesSeviye ??= 100;
  if (P.muzik) { P.muzik.giris ??= P.muzik.karartma ?? 1.5; P.muzik.cikis ??= P.muzik.karartma ?? 1.5; P.muzik.tekrarla ??= true; }

  const kaydet = geciktir(() => { if (silindi) return; P.guncelleme = Date.now(); depo.projeler.yaz(P).catch(() => {}); }, 400);
  const gizlenince = () => { if (document.hidden) kaydet.simdi(); };
  document.addEventListener("visibilitychange", gizlenince);

  const kucukler = new Map();        // sahne id → { adres, surum }
  const klipler = new Map();         // sahne id → { adres, surum }
  const adresler = new Set();        // serbest bırakılacak nesne adresleri
  const is = { calisiyor: false, iptal: false };
  let panel = P.sahneler.length ? "sahneler" : "metin";
  let secili = 0;
  let sonVideo = null;
  let muzikPcm = null;               // çözülmüş müzik: { pcm, hiz } (bellekte)
  let imlec = 0;                     // oynatma çizgisinin konumu (saniye)
  let zcOlcek = 20;                  // zaman çizelgesi ölçeği: saniye başına piksel
  let zcAcik = ayar.zcAcik !== "kapali";      // çizelge büyük mü (bütün izler görünür)
  const IZ_SOL = 134;                // iz başlığı sütununun genişliği (piksel)

  // Göz (önizleme) bu cihazda saklanır, işaret (dışa aktarma) projeyle birlikte.
  const GOZ_ANAHTARI = `studioflow-mobil-goz:${P.id}`;
  let goz = null;
  try { goz = JSON.parse(localStorage.getItem(GOZ_ANAHTARI)); } catch { /* bozuk kayıt */ }
  goz = Object.fromEntries(IZLER.map((i) => [i.anahtar, goz?.[i.anahtar] ?? !!P.isaret[i.anahtar]]));
  const gozYaz = () => { try { localStorage.setItem(GOZ_ANAHTARI, JSON.stringify(goz)); } catch { /* özel sekme */ } };

  // Konuşma sesi tektir: dublaj açıksa dublaj, değilse seslendirme. Önizleme göze, dışa aktarma işarete bakar.
  const dublajVar = () => !!P.diller[P.dublajSecili];
  const onizlemeDili = () => (goz.dublaj && dublajVar() ? P.dublajSecili : "");
  const aktarimDili = () => (P.isaret.dublaj && dublajVar() ? P.dublajSecili : "");
  const gorunumAl = (kod) => (kod ? dilGorunumu(P, kod) : P);
  const G = () => gorunumAl(onizlemeDili());
  const dilAdi = (kod) => (kod || P.dil).toUpperCase();

  // ── İskelet ─────────────────────────────────────────────────────────────────
  const isDurumu = h("p", { class: "durum", role: "status" });
  const isCubugu = h("progress", { max: "1", hidden: true });
  const durdur = h("button", { class: "dugme kucuk", hidden: true, onclick: () => {
    is.iptal = true;
    durumYaz(isDurumu, "Durduruluyor… (süren istek bitince durur)");
  } }, "⏹ Durdur");
  const isKapat = h("button", { class: "ed-ikon", "aria-label": "Mesajı kapat", onclick: () => { isAlani.hidden = true; } }, "✕");
  const isAlani = h("div", { class: "ed-is", hidden: true }, isDurumu, durdur, isKapat, isCubugu);

  const adEtiketi = h("h1", { class: "ed-ad" }, P.ad);
  const uretDugmesi = h("button", { class: "dugme birincil kucuk is-dugme", onclick: () => tumunuUret() }, "▶ Kaldığın yerden devam et");
  const ustCubuk = h("header", { class: "ed-ust" },
    h("button", { class: "ed-ikon", "aria-label": "Projelere dön", onclick: () => { location.hash = "#/"; } }, "‹"),
    adEtiketi, h("span", { class: "ed-ozet" }), h("span", { class: "bosluk" }), uretDugmesi,
    h("button", { class: "dugme kucuk", onclick: () => { panel = "izler"; cizPanel(); } }, "Dışa aktar"));
  const ray = h("nav", { class: "ed-ray", "aria-label": "Bölümler" });
  const panelKutusu = h("aside", { class: "ed-panel" });
  const tuval = h("div", { class: "ed-tuval" });
  const zamanEtiketi = h("span", { class: "ed-zaman" }, "0:00 / 0:00");
  const oynatDugmesi = h("button", { class: "dugme ikon birincil", "aria-label": "Oynat / duraklat", onclick: () => oynat() }, "▶");
  const sahneAlani = h("main", { class: "ed-sahne" },
    h("div", { class: "ed-tuval-kap" }, tuval),
    h("div", { class: "ed-kontrol" },
      h("button", { class: "dugme ikon", "aria-label": "Önceki sahne", onclick: () => sec(secili - 1) }, "⏮"),
      oynatDugmesi,
      h("button", { class: "dugme ikon", "aria-label": "Sonraki sahne", onclick: () => sec(secili + 1) }, "⏭"),
      zamanEtiketi));
  const denetci = h("aside", { class: "ed-denetci" });
  const zamanCizelgesi = h("section", { class: "ed-zc", "aria-label": "Zaman çizelgesi" });
  const cevir = h("div", { class: "ed-cevir" },
    h("p", { class: "ed-cevir-ikon", "aria-hidden": "true" }, "⟳"),
    h("p", null, "Düzenleyici yatay ekranda çalışır."),
    h("p", { class: "soluk" }, "Telefonu yan çevir ya da aşağıdaki düğmeye bas."),
    h("button", { class: "dugme birincil", onclick: () => yatayaGec(true) }, "Yatay ekrana geç"),
    h("button", { class: "dugme", onclick: () => { location.hash = "#/"; } }, "‹ Projelere dön"));
  const editor = h("div", { class: "editor" }, ustCubuk, isAlani,
    h("div", { class: "ed-calisma" }, ray, panelKutusu, sahneAlani, denetci), zamanCizelgesi, cevir);
  document.body.classList.add("editor-acik");
  kok.append(editor);

  // Yatay kilit: Android'de kurulu uygulamada doğrudan, tarayıcıda tam ekranla çalışır. iOS desteklemez;
  // orada dik tutulunca "yan çevir" uyarısı görünür.
  let tamEkranBizden = false;
  async function yatayaGec(tamEkran) {
    try {
      if (tamEkran && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
        tamEkranBizden = true;
      }
      await screen.orientation?.lock?.("landscape");
    } catch { /* desteklenmiyor: uyarı ekranı kalır */ }
  }
  yatayaGec(false);

  // ── Form parçaları (masaüstündeki sınıf adlarıyla) ──────────────────────────
  const grup = (baslik, ...cocuklar) => h("fieldset", { class: "grup" }, h("legend", null, baslik), cocuklar);
  const aciklama = (metin) => h("p", { class: "soluk aciklama" }, metin);
  const alanKutu = (etiket, oge) => h("label", { class: "alan" }, h("span", { class: "alan-ad" }, etiket), oge);
  function alan(etiket, ad, ogeTuru, { degisti, ...ozellik } = {}, cocuklar = []) {
    const oge = h(ogeTuru, { ...ozellik, value: P[ad] ?? "", oninput: () => { P[ad] = oge.value; kaydet(); degisti?.(); } }, cocuklar);
    return alanKutu(etiket, oge);
  }
  const secim = (etiket, liste, deger, yaz) => alanKutu(etiket, h("select", { onchange: (o) => yaz(o.target.value) }, secenekler(liste, String(deger))));
  const onay = (etiket, deger, degisti) => {
    const kutu = h("input", { type: "checkbox", onchange: () => degisti(kutu.checked) });
    kutu.checked = !!deger;
    return h("label", { class: "alan satir-alan" }, kutu, h("span", null, etiket));
  };
  /** Sürgü + yazılabilir sayı kutusu: ikisi birbirini günceller (masaüstündeki `aralikSatiri`). */
  function aralikSatiri(etiket, min, max, adim, deger, yaz) {
    const sinirla = (v) => Math.min(max, Math.max(min, v));
    const surgu = h("input", { type: "range", min: String(min), max: String(max), step: String(adim), value: String(deger),
      oninput: () => { kutu.value = surgu.value; }, onchange: () => yaz(Number(surgu.value)) });
    const kutu = h("input", { type: "number", min: String(min), max: String(max), step: String(adim), value: String(deger), class: "aralik-sayi", inputmode: "decimal",
      onchange: () => {
        const v = Number(kutu.value);
        const son = kutu.value === "" || !Number.isFinite(v) ? Number(surgu.value) : sinirla(v);
        kutu.value = String(son);
        surgu.value = String(son);
        yaz(son);
      } });
    return h("div", { class: "alan" }, h("span", { class: "alan-ad" }, etiket), h("div", { class: "aralik-satir" }, surgu, kutu));
  }
  const tercih = (ad) => () => ayarGuncelle({ [ad]: P[ad] });

  // Tam ekran yazı düzenleyici: yatayda klavye ekranı kapladığı için uzun yazılar ayrı açılır.
  function yaziAlani(etiket, deger, { yerTutucu = "", satir = 2, degisti, veri = {} } = {}) {
    const kutu = h("textarea", { rows: String(satir), readonly: true, placeholder: yerTutucu, value: deger || "", class: "ed-yazi", ...veri,
      onclick: () => {
        const yazi = h("textarea", { class: "yazi-alan", placeholder: yerTutucu, value: kutu.value });
        const kapat = () => { kutu.value = yazi.value; degisti?.(yazi.value); kaplama.remove(); };
        const kaplama = h("div", { class: "yazi-kaplama" },
          h("div", { class: "yazi-ust" }, h("strong", null, etiket), h("span", { class: "bosluk" }),
            h("button", { class: "dugme birincil kucuk", onclick: kapat }, "Tamam")),
          yazi);
        document.body.append(kaplama);
        yazi.focus();
      } });
    return alanKutu(etiket, kutu);
  }

  // ── İş yürütme ──────────────────────────────────────────────────────────────
  const adim = (metin, oran) => {
    durumYaz(isDurumu, metin);
    if (oran == null) isCubugu.removeAttribute("value"); else isCubugu.value = oran;
  };
  const durduysa = () => { if (is.iptal) throw new Error("Durduruldu. Tamamlanan adımlar kaydedildi."); };
  // Hesap havuzu: kotası biten hesap atlanır, sıradakiyle sürer; geçişler iş satırına yazılır.
  const hesapla = (hizmet) => (isi) => havuz.hesaplarla(hizmet, isi, { bildir: (mesaj) => adim(mesaj), iptal: () => is.iptal });
  const kilitle = (durum) => editor.querySelectorAll(".is-dugme").forEach((d) => { d.disabled = durum; });      // iş bitince `ciz()` gerçek durumları geri yazar

  async function calistir(is_) {
    if (is.calisiyor) return;
    oynatmayiDurdur();
    is.calisiyor = true;
    is.iptal = false;
    isAlani.hidden = false;
    isCubugu.hidden = false;
    durdur.hidden = false;
    isKapat.hidden = true;
    kilitle(true);
    try {
      const mesaj = await ekranAcik(is_);
      durumYaz(isDurumu, mesaj || "Tamamlandı.", "tamam");
    } catch (hata) {
      durumYaz(isDurumu, hata.message || String(hata), "hata");
    } finally {
      is.calisiyor = false;
      isCubugu.hidden = true;
      durdur.hidden = true;
      isKapat.hidden = false;
      kaydet();
      kaydet.simdi();
      ciz();
    }
  }
  const tekIs = (etiket, isi, sinif = "dugme kucuk is-dugme") => h("button", { class: sinif, disabled: is.calisiyor, onclick: () => calistir(isi) }, etiket);
  const geminiGerek = () => { if (!havuz.hesapVar("gemini")) throw new Error("Gemini hesabı yok: API sayfasından kasaya bağlanıp ekle."); };

  // ── Üretim adımları ─────────────────────────────────────────────────────────
  async function promptAdimi(hedefler) {
    const liste = hedefler.filter((s) => s.metin.trim());
    if (!liste.length) return 0;
    const sira = new Map(P.sahneler.map((s, i) => [s.id, i + 1]));
    const hedefNo = new Set(liste.map((s) => sira.get(s.id)));
    let yazilan = 0;
    adim(`Görsel tarifleri yazılıyor: 0 / ${liste.length}`, 0);
    await metinAI.promptlariYaz({
      anahtar: hesapla("gemini"), dil: P.dil, stil: P.gorselStili,
      tamMetin: P.sahneler.map((s) => s.metin).join(" "),
      sahneler: liste.map((s) => ({ index: sira.get(s.id), metin: s.metin })),
      onceki: P.sahneler.map((s, i) => ({ index: i + 1, prompt: s.prompt || "" }))
        .filter((k) => k.prompt.trim() && !hedefNo.has(k.index)),
      iptal: () => is.iptal,
      bildir: (kayit, prompt, hareket) => {
        const sahne = P.sahneler[kayit.index - 1];
        sahne.prompt = prompt;
        if (hareket) sahne.hareket = hareket;
        kaydet();
        if (P.sahneler[secili] === sahne) cizDenetci();
        adim(`Görsel tarifleri yazılıyor: ${++yazilan} / ${liste.length}`, yazilan / liste.length);
      },
    });
    return yazilan;
  }

  /** Bir ses parçasını okutup kaydeder; var olan parçanın üzerine ancak yenisi gelince yazılır. */
  async function parcayiSeslendir(gorunum, parca) {
    const ses = await hesapla("gemini")((hesap) => gemini.seslendirDayanikli({
      anahtar: hesap.gemini_key, model: P.model, ses: P.ses, dil: gorunum.dil, stil: P.stil, metin: parca.metin }));
    const ornek = new Int16Array(ses.pcm.length);
    for (let i = 0; i < ornek.length; i++) ornek[i] = Math.max(-32768, Math.min(32767, Math.round(ses.pcm[i] * 32767)));
    await depo.dosyalar.yaz(depo.sesAnahtari(P.id, parca.anahtar), { veri: ornek.buffer, hiz: ses.hiz });
    gorunum.sesSureleri[parca.anahtar] = ses.pcm.length / ses.hiz;
    oynatma.sesAnahtari = "";          // önizleme sesi yeniden kurulsun
    await depo.projeler.yaz(P);
  }

  /** Verilen dilin (varsayılan: asıl dil) eksik ses parçalarını üretir. */
  async function sesAdimi(kod = "") {
    const gorunum = gorunumAl(kod);
    const plan = sesPlani(gorunum);
    const eksik = plan.filter((p) => !(gorunum.sesSureleri[p.anahtar] > 0));
    const onek = kod ? `${dilAdi(kod)} dublajı` : "Seslendirme";
    let biten = 0;
    for (const parca of eksik) {
      durduysa();
      adim(`${onek}: parça ${biten + 1} / ${eksik.length}`, biten / eksik.length);
      await parcayiSeslendir(gorunum, parca);
      biten++;
    }
    // Metni değişen parçaların eski sesleri silinir (öbür dillerin sesleri korunur).
    const buDil = new Set(plan.map((p) => p.anahtar));
    for (const anahtar of Object.keys(gorunum.sesSureleri)) if (!buDil.has(anahtar)) delete gorunum.sesSureleri[anahtar];
    await artikSesleriSil();
    return biten;
  }
  async function artikSesleriSil() {
    const gecerli = tumSesAnahtarlari(P);
    for (const dosya of await depo.dosyalar.anahtarlar(`${P.id}:ses:`)) {
      if (!gecerli.has(dosya.split(":").pop())) await depo.dosyalar.sil(dosya);
    }
  }

  /** Dublaj dilinde çevirisi olmayan sahneleri çevirir. */
  async function ceviriAdimi(kod) {
    const dublaj = P.diller[kod];
    const eksik = P.sahneler.map((s, i) => ({ sahne: s, index: i + 1 }))
      .filter((k) => k.sahne.metin.trim() && !(dublaj.metinler[k.sahne.id] || "").trim());
    if (!eksik.length) return 0;
    let biten = 0;
    adim(`${dilAdi(kod)} çevirisi: 0 / ${eksik.length}`, 0);
    await metinAI.cevir({
      anahtar: hesapla("gemini"), kaynakDil: P.dil, hedefDil: kod,
      sahneler: eksik.map((k) => ({ index: k.index, metin: k.sahne.metin })), iptal: () => is.iptal,
      bildir: (kayit, ceviri) => {
        dublaj.metinler[P.sahneler[kayit.index - 1].id] = ceviri;
        kaydet();
        adim(`${dilAdi(kod)} çevirisi: ${++biten} / ${eksik.length}`, biten / eksik.length);
      },
    });
    return biten;
  }

  async function gorselKaydet(sahne, kayit) {
    await depo.dosyalar.yaz(depo.gorselAnahtari(P.id, sahne.id), kayit);
    sahne.gorselVar = true;
    sahne.gorselSurum = (sahne.gorselSurum || 0) + 1;
    if (sahne.videoVar) {       // görsel değişti: eski klip artık bu kareye ait değil
      await depo.dosyalar.sil(depo.videoAnahtari(P.id, sahne.id));
      sahne.videoVar = false;
    }
    kaydet();
    await kucukYukle(sahne);
    if (P.sahneler[secili] === sahne) { cizTuval(); cizDenetci(); }
  }

  /** Sahnenin görselini LTX ile hareketli klibe çevirir; klip sahne süresine göre istenir. */
  async function klipUret(sahne, bildir) {
    const kayit = await depo.dosyalar.al(depo.gorselAnahtari(P.id, sahne.id));
    if (!kayit) throw new Error("Önce bu sahnenin görselini üret.");
    const zaman = zamanlama(P).sahneler.get(sahne.id);
    const sahneSuresi = zaman ? zaman.bit - zaman.bas : 0;
    const kare = await ltxKaresi(kayit);
    const klip = await hesapla("huggingface")((hesap) => ltx.videoUret({
      token: hesap.hf_token, spaceler: ltxSpaceleri(), erisim: ayar.ltxErisim || "",
      gorsel: kare, prompt: sahne.hareket, dikey: dikeyMi(),
      sure: Math.min(ltx.SURE_UST, Math.max(2, Math.ceil((sahneSuresi || 5) * 2) / 2)),
      bildir, iptal: () => is.iptal }));
    await depo.dosyalar.yaz(depo.videoAnahtari(P.id, sahne.id), { veri: await klip.arrayBuffer(), tur: "video/mp4" });
    sahne.videoVar = true;
    sahne.videoSurum = (sahne.videoSurum || 0) + 1;
    await depo.projeler.yaz(P);
    if (P.sahneler[secili] === sahne) cizTuval();
  }

  async function klipAdimi(hedefler) {
    let biten = 0;
    for (const sahne of hedefler) {
      durduysa();
      const onek = `Klip ${biten + 1} / ${hedefler.length}`;
      adim(`${onek} üretiliyor…`, biten / hedefler.length);
      await klipUret(sahne, (mesaj) => adim(`${onek} · ${mesaj.replace(/^LTX · /, "")}`, biten / hedefler.length));
      biten++;
    }
    return biten;
  }

  async function gorselUret(sahne) {
    const boyut = uretimBoyutu(P);
    for (let deneme = 1; ; deneme++) {
      try {
        const blob = await hesapla("cloudflare")((hesap) => cloudflare.gorselUret({
          hesap: hesap.cf_account_id, token: hesap.cf_token,
          model: P.gorselModel, prompt: gorselPromptu(P, sahne), ...boyut }));
        await gorselKaydet(sahne, { veri: await blob.arrayBuffer(), tur: blob.type || "image/jpeg" });
        return;
      } catch (hata) {
        // Cloudflare'in geçici sunucu hataları (5xx) birkaç saniye sonra yeniden denenir.
        if (!(hata.durum >= 500) || deneme >= 3) throw hata;
        await bekle(4000 * deneme);
      }
    }
  }

  async function gorselAdimi(hedefler) {
    let biten = 0;
    for (const sahne of hedefler) {
      durduysa();
      adim(`Görsel üretiliyor: ${biten + 1} / ${hedefler.length}`, biten / hedefler.length);
      await gorselUret(sahne);
      biten++;
    }
    return biten;
  }

  const tumunuUret = () => {
    if (is.calisiyor) return;
    if (P.sahneler.length && !confirm("Kaldığın yerden devam edilsin mi?\n\nEksik görsel tarifleri, seslendirme, görseller"
      + (P.hareketli ? ", klipler" : "") + (Object.keys(P.diller).length ? " ve dublajlar" : "") + " üretilir; hazır olanlara dokunulmaz. Kota harcar.")) return;
    return calistir(tumunuIsi);
  };
  const tumunuIsi = async () => {
    if (!P.sahneler.length) throw new Error("Önce Metin bölümünde senaryoyu yazıp sahnelere böl.");
    geminiGerek();
    const ozet = [];
    const promptsuz = P.sahneler.filter((s) => !(s.prompt || "").trim());
    if (promptsuz.length) ozet.push(`${await promptAdimi(promptsuz)} görsel tarifi`);
    durduysa();
    const ses = await sesAdimi();
    if (ses) ozet.push(`${ses} ses parçası`);
    const gorselsiz = P.sahneler.filter((s) => !s.gorselVar);
    const cloudflareVar = havuz.hesapVar("cloudflare");
    if (gorselsiz.length && cloudflareVar) ozet.push(`${await gorselAdimi(gorselsiz)} görsel`);
    let not = gorselsiz.length && !cloudflareVar
      ? " Görseller için Cloudflare hesabı yok (API sayfası); galeriden ekleyebilirsin." : "";
    if (P.hareketli) {
      const klipsiz = P.sahneler.filter((s) => s.gorselVar && !s.videoVar && s.metin.trim());
      if (klipsiz.length && havuz.hesapVar("huggingface")) ozet.push(`${await klipAdimi(klipsiz)} klip`);
      else if (klipsiz.length) not += " Klipler için Hugging Face hesabı yok: API sayfasından ekle.";
    }
    for (const kod of Object.keys(P.diller)) {          // dublajların eksik çevirisi ve sesi
      durduysa();
      const n = (await ceviriAdimi(kod)) + (await sesAdimi(kod));
      if (n) ozet.push(`${dilAdi(kod)} dublajı`);
    }
    return (ozet.length ? `Üretildi: ${ozet.join(", ")}.` : "Her şey zaten hazır.") + not;
  };

  // ── Görsel ve klip adresleri ────────────────────────────────────────────────
  async function kucukYukle(sahne) {
    const eski = kucukler.get(sahne.id);
    if (eski?.surum === sahne.gorselSurum) return eski.adres;
    const kayit = await depo.dosyalar.al(depo.gorselAnahtari(P.id, sahne.id));
    if (!kayit) return null;
    if (eski) { URL.revokeObjectURL(eski.adres); adresler.delete(eski.adres); }
    const adres = URL.createObjectURL(kayittanBlob(kayit));
    adresler.add(adres);
    kucukler.set(sahne.id, { adres, surum: sahne.gorselSurum });
    for (const oge of editor.querySelectorAll(`[data-kucuk="${sahne.id}"]`)) oge.style.backgroundImage = `url("${adres}")`;
    return adres;
  }

  async function klipAdresi(sahne) {
    const eski = klipler.get(sahne.id);
    if (eski?.surum === sahne.videoSurum) return eski.adres;
    const kayit = await depo.dosyalar.al(depo.videoAnahtari(P.id, sahne.id));
    if (!kayit) return null;
    if (eski) { URL.revokeObjectURL(eski.adres); adresler.delete(eski.adres); }
    const adres = URL.createObjectURL(new Blob([kayit.veri], { type: "video/mp4" }));
    adresler.add(adres);
    klipler.set(sahne.id, { adres, surum: sahne.videoSurum });
    return adres;
  }

  // ── Ses: konuşma (seslendirme ya da dublaj) + müzik ─────────────────────────
  async function sesiTopla(gorunum) {
    const plan = sesPlani(gorunum);
    const parcalar = [];
    let hiz = null;
    for (const p of plan) {
      const kayit = await depo.dosyalar.al(depo.sesAnahtari(P.id, p.anahtar));
      if (!kayit) throw new Error("Ses dosyası eksik: “Kaldığın yerden devam et”e bas.");
      if (hiz !== null && kayit.hiz !== hiz) throw new Error("Ses parçalarının örnekleme hızları farklı; sesi yeniden üret.");
      hiz = kayit.hiz;
      parcalar.push(new Int16Array(kayit.veri));
    }
    if (!parcalar.length) return null;
    const pcm = new Float32Array(parcalar.reduce((t, p) => t + p.length, 0));
    let konum = 0;
    for (const p of parcalar) {
      for (let i = 0; i < p.length; i++) pcm[konum + i] = p[i] / 32768;
      konum += p.length;
    }
    return { pcm, hiz };
  }

  async function muzigiCoz() {
    if (!P.muzik) return null;
    if (!muzikPcm) {
      const kayit = await depo.dosyalar.al(depo.muzikAnahtari(P.id));
      if (!kayit) return null;
      muzikPcm = await dosyadanSes(kayit.veri.slice(0));
    }
    return muzikPcm;
  }

  /** `kod` dilinin sesi: `konusmali` ise konuşma, `muzikli` ise müzik karışır. Hiçbiri yoksa `null`. */
  async function sesKur(kod, konusmali, muzikli) {
    const gorunum = gorunumAl(kod), z = zamanlama(gorunum);
    const konusma = konusmali && z.sesDurumu === "tam" ? await sesiTopla(gorunum) : null;
    const muzik = muzikli ? await muzigiCoz().catch(() => null) : null;
    return karistir({ konusma, muzik, sure: z.toplam, seviye: P.muzik?.seviye, konusmaSeviyesi: P.sesSeviye,
                      ducking: P.muzik?.ducking, tekrarla: P.muzik?.tekrarla, giris: P.muzik?.giris, cikis: P.muzik?.cikis });
  }
  const onizlemeSesi = () => sesKur(onizlemeDili(), onizlemeDili() ? true : goz.seslendirme, goz.muzik && !!P.muzik);
  const sesImzasi = () => JSON.stringify([onizlemeDili(), goz.seslendirme, goz.muzik, sesPlani(G()).map((p) => p.anahtar), P.muzik, P.sesSeviye]);

  // ── Önizleme ve oynatma ─────────────────────────────────────────────────────
  const altyaziKutusu = h("div", { class: "ed-altyazi", hidden: true });
  function altyaziStiliniUygula() {
    const s = P.altyaziStil, boy = tuval.getBoundingClientRect().height || 200;
    Object.assign(altyaziKutusu.style, { bottom: `${s.seviye}%`, color: s.renk, fontWeight: s.kalin ? "700" : "500",
      fontSize: `${Math.max(7, boy * s.boyut / 100)}px`, fontFamily: YAZI_TIPLERI[s.font] || YAZI_TIPLERI.sans,
      textShadow: s.golge ? "0 0 3px #000, 0 1px 4px #000" : "0 0 2px #000" });
  }
  function altyaziGoster(gorunum, z, sira, t) {
    if (!goz.altyazi || sira < 0) { altyaziKutusu.hidden = true; return; }
    const a = z.sahneler.get(gorunum.sahneler[sira].id);
    const blok = altyaziBloklari(gorunum.sahneler[sira].metin, a.bas, a.bit).find((b) => t >= b.bas && t < b.bit);
    altyaziKutusu.textContent = blok?.metin || "";
    altyaziKutusu.hidden = !blok;
  }

  let tuvalSirasi = 0;
  async function cizTuval() {
    const benim = ++tuvalSirasi;
    const [en, boy] = P.boyut.split("x").map(Number);
    tuval.style.aspectRatio = `${en} / ${boy}`;
    const sahne = P.sahneler[secili];
    const etiket = () => h("span", { class: "ed-etiket" }, `Sahne ${secili + 1}${onizlemeDili() ? " · " + dilAdi(onizlemeDili()) : ""}`);
    if (!sahne) return tuval.replaceChildren(h("p", { class: "ed-bos" }, "Sahne yok"));
    if (!goz.video) { tuval.replaceChildren(h("p", { class: "ed-bos" }, "Video izi gizli (👁)"), altyaziKutusu, etiket()); return altyaziStiliniUygula(); }
    let icerik;
    const gorselAdresi = sahne.gorselVar ? await kucukYukle(sahne) : null;
    if (P.hareketli && sahne.videoVar) {
      const adres = await klipAdresi(sahne);
      if (adres) {
        // LTX klibe kendi müziğini ekler: önizleme klibi her zaman sessizdir. `muted` özniteliği sonradan
        // oluşturulan öğede sesi kapatmaz; özelliğin kendisi atanır.
        icerik = h("video", { src: adres, playsinline: true, preload: "auto", poster: gorselAdresi });
        icerik.muted = true;
        icerik.defaultMuted = true;
        icerik.volume = 0;
        icerik.loop = true;
      }
    }
    if (!icerik && gorselAdresi) icerik = h("img", { src: gorselAdresi, alt: `Sahne ${secili + 1}` });
    if (benim !== tuvalSirasi) return;          // bu arada başka sahne seçildi
    if (icerik?.tagName === "VIDEO" && oynatma.calisiyor) icerik.play().catch(() => {});      // klip yalnızca oynatırken oynar
    tuval.replaceChildren(icerik || h("p", { class: "ed-bos" }, "Görsel yok"), altyaziKutusu, etiket());
    altyaziStiliniUygula();
  }

  const oynatma = { calisiyor: false, ses: null, sesAnahtari: "", kare: 0 };
  function oynatmayiDurdur() {
    if (!oynatma.calisiyor) return;
    oynatma.calisiyor = false;
    cancelAnimationFrame(oynatma.kare);
    oynatma.ses?.pause();
    tuval.querySelector("video")?.pause();
    oynatDugmesi.textContent = "▶";
  }

  async function oynat() {
    if (oynatma.calisiyor) return oynatmayiDurdur();
    const gorunum = G();
    const z = zamanlama(gorunum);
    if (!P.sahneler.length || !(z.toplam > 0)) return;
    let bas = imlec;                    // oynatma çizgisinin durduğu yerden başlar
    if (bas >= z.toplam - 0.05) bas = 0;
    let saat;
    const imza = sesImzasi();
    if (oynatma.sesAnahtari !== imza) {
      const ses = await onizlemeSesi().catch(() => null);
      oynatma.ses = null;
      if (ses) {
        const adres = URL.createObjectURL(wavBlob(ses.pcm, ses.hiz));
        adresler.add(adres);
        oynatma.ses = new Audio(adres);
      }
      oynatma.sesAnahtari = imza;
    }
    if (oynatma.ses) {
      oynatma.ses.currentTime = bas;
      try {
        await oynatma.ses.play();
        saat = () => oynatma.ses.currentTime;
      } catch { /* tarayıcı sesi başlatmadı: aşağıda sessiz saatle oynatılır */ }
    }
    const sesli = !!saat;
    if (!saat) {
      const t0 = performance.now();
      saat = () => bas + (performance.now() - t0) / 1000;
    }
    oynatma.calisiyor = true;
    oynatDugmesi.textContent = "⏸";
    tuval.querySelector("video")?.play().catch(() => {});
    const dongu = () => {
      if (!oynatma.calisiyor) return;
      const t = saat();
      if (t >= z.toplam || (sesli && oynatma.ses.ended)) return oynatmayiDurdur();
      const sira = gorunum.sahneler.findIndex((s) => { const a = z.sahneler.get(s.id); return t >= a.bas && t < a.bit; });
      if (sira >= 0 && sira !== secili) sec(sira, true);
      imleciKoy(t, true);
      zamanEtiketi.textContent = `${sureYaz(t)} / ${sureYaz(z.toplam)}`;
      altyaziGoster(gorunum, z, sira, t);
      oynatma.kare = requestAnimationFrame(dongu);
    };
    dongu();
  }

  /** Sahneyi seçer; `oynatirken` ise oynatma kesilmez. */
  function sec(sira, oynatirken = false) {
    if (!P.sahneler.length) return;
    secili = Math.max(0, Math.min(P.sahneler.length - 1, sira));
    if (!oynatirken) oynatmayiDurdur();
    for (const oge of editor.querySelectorAll("[data-sira]")) oge.classList.toggle("secili", Number(oge.dataset.sira) === secili);
    zamanCizelgesi.querySelector(".ed-zc-oge.secili")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    cizTuval();
    cizDenetci();
    if (!oynatirken) {
      altyaziKutusu.hidden = true;
      imleciKoy(zamanlama(G()).sahneler.get(P.sahneler[secili].id)?.bas || 0);
      zamaniYaz();
    }
  }

  // Oynatma çizgisi: zaman çizelgesinde `imlec` anını gösteren dikey çizgi.
  const imlecCizgi = h("div", { class: "ed-imlec", "aria-hidden": "true" });
  function imleciKoy(t, izle = false) {
    imlec = Math.max(0, t);
    const x = IZ_SOL + imlec * zcOlcek;
    imlecCizgi.style.left = `${x}px`;
    if (izle) {         // oynatırken çizgi görünür alanda kalsın
      const sol = zamanCizelgesi.scrollLeft, gen = zamanCizelgesi.clientWidth;
      if (x > sol + gen - 30 || x < sol + IZ_SOL) zamanCizelgesi.scrollLeft = Math.max(0, x - IZ_SOL - (gen - IZ_SOL) / 3);
    }
  }

  /** Parmakla gezinme: önizleme, zaman, altyazı ve klip `t` anına gelir (oynatma durur). */
  function gez(t) {
    oynatmayiDurdur();
    const gorunum = G(), z = zamanlama(gorunum);
    t = Math.max(0, Math.min(Math.max(0, z.toplam - 0.02), t));
    imleciKoy(t);
    zamanEtiketi.textContent = `${sureYaz(t)} / ${sureYaz(z.toplam)}`;
    const sira = gorunum.sahneler.findIndex((s) => { const a = z.sahneler.get(s.id); return t >= a.bas && t < a.bit; });
    if (sira < 0) return;
    if (sira !== secili) {
      secili = sira;
      for (const oge of editor.querySelectorAll("[data-sira]")) oge.classList.toggle("secili", Number(oge.dataset.sira) === secili);
      cizTuval();
      cizDenetci();
    } else {
      const klip = tuval.querySelector("video");          // aynı sahnede: klip o ana götürülür
      if (klip?.duration) klip.currentTime = Math.min(klip.duration - 0.05, t - z.sahneler.get(gorunum.sahneler[sira].id).bas);
    }
    altyaziGoster(gorunum, z, sira, t);
  }

  function zamaniYaz() {
    const z = zamanlama(G());
    zamanEtiketi.textContent = `${sureYaz(Math.min(imlec, z.toplam))} / ${sureYaz(z.toplam)}`;
  }

  // ── Göz ve işaret ───────────────────────────────────────────────────────────
  function gozuDegistir(iz) {
    oynatmayiDurdur();
    goz[iz] = !goz[iz];
    gozYaz();
    ciz();
  }
  function isaretle(iz, acik) {
    oynatmayiDurdur();
    P.isaret[iz] = acik;
    if (acik) goz[iz] = true;           // videoya giren iz önizlemede de açılır (masaüstündeki gibi)
    gozYaz();
    kaydet();
    ciz();
  }
  function dublajSec(kod) {
    P.dublajSecili = kod;
    kaydet();
    oynatmayiDurdur();
    ciz();
  }

  // ── Paneller ────────────────────────────────────────────────────────────────
  function sahnelerPaneli() {
    if (!P.sahneler.length) {
      return [h("h2", null, "Sahneler"), aciklama("Henüz sahne yok. Metin bölümünde senaryoyu yazıp sahnelere böl."),
              h("button", { class: "dugme kucuk", onclick: () => { panel = "metin"; cizPanel(); } }, "Metne git")];
    }
    return [
      h("h2", null, `Sahneler (${P.sahneler.length})`),
      h("div", { class: "ed-izgara" }, P.sahneler.map((s, i) => h("button", {
        class: "ed-kare" + (i === secili ? " secili" : ""), "data-sira": i, "data-kucuk": s.id,
        style: kucukler.get(s.id) ? `background-image:url("${kucukler.get(s.id).adres}")` : null,
        "aria-label": `Sahne ${i + 1}`, onclick: () => sec(i),
      }, h("span", null, String(i + 1)), P.hareketli && s.videoVar ? h("i", null, "▶") : null))),
      h("button", { class: "dugme kucuk", onclick: () => { P.sahneler.push(yeniSahne()); kaydet(); secili = P.sahneler.length - 1; ciz(); } }, "＋ Sahne ekle"),
    ];
  }

  function ayarlarPaneli() {
    return [
      h("h2", null, "Ayarlar"),
      grup("Çıktı · biçim",
        alan("Biçim", "boyut", "select", { degisti: () => { tercih("boyut")(); cizTuval(); } }, secenekler(BOYUTLAR, P.boyut))),
      grup("Görsel · model · stil",
        alan("Görsel modeli", "gorselModel", "select", { degisti: tercih("gorselModel") }, secenekler(cloudflare.MODELLER.map((m) => [m.kimlik, m.ad]), P.gorselModel)),
        yaziAlani("Görsel stili (her tarife eklenir)", P.gorselStili, { degisti: (v) => { P.gorselStili = v; kaydet(); } })),
      grup("Video · hareket",
        onay("Görselleri hareketlendir (LTX)", P.hareketli, (v) => { P.hareketli = v; kaydet(); ciz(); }),
        aciklama("Her görsel birkaç saniyelik klibe çevrilir; klip başına yaklaşık 40 sn sürer ve Hugging Face kotasından düşer.")),
    ];
  }

  function uretimPaneli() {
    const z = zamanlama(P), n = P.sahneler.length;
    const satir = (ad, biten, toplam) => h("div", { class: "iz-kayit" }, h("span", null, ad),
      h("span", { class: "ekli" + (toplam && biten >= toplam ? "" : " eksik") }, toplam ? `${biten} / ${toplam}` : "—"));
    return [
      h("h2", null, "Üretim"),
      grup("Durum",
        satir("Görsel tarifleri", P.sahneler.filter((s) => (s.prompt || "").trim()).length, n),
        satir("Seslendirme parçaları", z.parcaSayisi - z.eksik, z.parcaSayisi),
        satir("Görseller", P.sahneler.filter((s) => s.gorselVar).length, n),
        P.hareketli ? satir("Klipler", P.sahneler.filter((s) => s.videoVar).length, P.sahneler.filter((s) => s.gorselVar).length) : null,
        Object.keys(P.diller).map((kod) => { const d = zamanlama(dilGorunumu(P, kod)); return satir(`${dilAdi(kod)} dublajı`, d.parcaSayisi - d.eksik, d.parcaSayisi); })),
      h("div", { class: "dugme-satiri" },
        h("button", { class: "dugme birincil genis-dugme is-dugme", disabled: is.calisiyor, onclick: tumunuUret }, "▶ Kaldığın yerden devam et")),
      aciklama("Sırayla eksik görsel tariflerini, seslendirmeyi, görselleri" + (P.hareketli ? ", klipleri" : "") + " ve dublajları üretir. Yarıda kalırsa kaldığı yerden sürer."),
    ];
  }

  function metinPaneli() {
    const durum = h("p", { class: "durum", role: "status" });
    const sayac = h("small", { class: "alan-not soluk" });
    const sayaciYaz = () => {
      const n = P.senaryo.trim().length;
      sayac.textContent = n ? `${n} karakter · yaklaşık ${sureYaz(n / 14)} · ${Math.ceil(n / SES_PARCA_SINIRI)} ses isteği` : "Yaz, yapıştır ya da Gemini'ye yazdır.";
    };
    sayaciYaz();
    return [
      h("h2", null, "Metin"),
      alan("Proje adı", "ad", "input", { type: "text", degisti: () => { adEtiketi.textContent = P.ad; kabuk.baslik(P.ad, true); } }),
      grup("Senaryoyu yapay zekâ yazsın · konu · dil · süre",
        yaziAlani("Konu", P.konu, { yerTutucu: "Örn. Vatoz balıkları bir nehri nasıl ele geçirdi?", degisti: (v) => { P.konu = v; kaydet(); } }),
        h("div", { class: "izgara-2" },
          alan("Dil", "dil", "select", { degisti: tercih("dil") }, secenekler(Object.keys(gemini.DILLER).map((k) => [k, `${k.toUpperCase()} · ${gemini.DILLER[k]}`]), P.dil)),
          alan("Hedef süre", "hedefSaniye", "select", {}, secenekler(SURELER.map((s) => [String(s), s < 60 ? `${s} sn` : `${s / 60} dk`]), String(P.hedefSaniye)))),
        h("button", { class: "dugme kucuk is-dugme", disabled: is.calisiyor, onclick: () => {
          if (P.senaryo.trim() && !confirm("Mevcut senaryonun üzerine yazılsın mı?")) return;
          calistir(async () => {
            adim("Gemini senaryoyu yazıyor…");
            P.senaryo = await metinAI.senaryoYaz({ anahtar: hesapla("gemini"), konu: P.konu, dil: P.dil, saniye: Number(P.hedefSaniye) || 60 });
            return "Senaryo yazıldı. Okuyup düzelt, sonra sahnelere böl.";
          });
        } }, "Senaryoyu Gemini yazsın")),
      grup("Anlatım metni",
        yaziAlani("Senaryo", P.senaryo, { yerTutucu: "Anlatım metni…", satir: 4, veri: { "data-senaryo": "" },
                                        degisti: (v) => { P.senaryo = v; kaydet(); sayaciYaz(); } }),
        sayac,
        h("button", { class: "dugme birincil genis-dugme is-dugme", disabled: is.calisiyor, onclick: async () => {
          if (!P.senaryo.trim()) return durumYaz(durum, "Önce senaryoyu yaz.", "hata");
          if (P.sahneler.length && !confirm(`Mevcut ${P.sahneler.length} sahne, görselleri, sesi ve dublajları silinip senaryo yeniden bölünsün mü?`)) return;
          oynatmayiDurdur();
          for (const tur of ["gorsel", "video", "ses"]) await depo.dosyalar.onekSil(`${P.id}:${tur}:`);      // müzik korunur
          P.sahneler = sahnelereBol(P.senaryo);
          P.sesSureleri = {};
          P.diller = {};
          P.dublajSecili = "";
          P.isaret.dublaj = goz.dublaj = false;
          gozYaz();
          kaydet(); kaydet.simdi();
          panel = "sahneler";
          secili = 0;
          ciz();
        } }, P.sahneler.length ? "Sahnelere yeniden böl" : "Sahnelere böl"),
        durum),
    ];
  }

  const yokPaneli = (baslik, metin) => () => [h("h2", null, baslik), aciklama(metin)];

  function seslendirmePaneli() {
    const z = zamanlama(P);
    const oynatici = h("audio", { controls: true, class: "dinle", hidden: true });
    return [
      h("h2", null, "Seslendirme"),
      grup("Ses · model · anlatım tarzı",
        alan("Gemini sesi", "ses", "select", { degisti: tercih("ses") }, secenekler(gemini.SESLER.map((s) => [s, s]), P.ses)),
        alan("Gemini modeli", "model", "select", { degisti: tercih("model") }, secenekler(gemini.MODELLER.map((m) => [m, m]), P.model)),
        yaziAlani("Anlatım tarzı", P.stil, { degisti: (v) => { P.stil = v; kaydet(); } }),
        aciklama("Ses, model ya da anlatım tarzı değişirse seslendirme (dublajlar dahil) yeniden üretilir.")),
      grup("Seslendirme",
        h("p", { class: "soluk aciklama" }, !z.parcaSayisi ? "Metin yok." : z.sesDurumu === "tam" ? `Ses hazır · ${sureYaz(z.toplam)}`
          : z.sesDurumu === "eksik" ? `Ses eksik: ${z.eksik} / ${z.parcaSayisi} parça üretilecek` : `Ses yok · ${z.parcaSayisi} istek · tahmini ${sureYaz(z.toplam)}`),
        z.sesDurumu === "tam" ? h("button", { class: "dugme kucuk", onclick: async () => {
          const ses = await sesiTopla(P).catch(() => null);
          if (!ses) return;
          const adres = URL.createObjectURL(wavBlob(ses.pcm, ses.hiz));
          adresler.add(adres);
          oynatici.src = adres;
          oynatici.hidden = false;
          oynatici.play().catch(() => {});
        } }, "Dinle") : null,
        oynatici,
        aralikSatiri("Konuşma ses seviyesi (%)", 25, 400, 5, P.sesSeviye, (v) => { P.sesSeviye = v; kaydet(); }),
        tekIs("Seslendirmeyi üret", async () => {
          geminiGerek();
          const n = await sesAdimi();
          return n ? `${n} ses parçası üretildi.` : "Ses zaten hazır.";
        }, "dugme birincil genis-dugme is-dugme")),
    ];
  }

  function dublajPaneli() {
    const eklenebilir = Object.keys(gemini.DILLER).filter((k) => k !== P.dil);
    const form = { dil: eklenebilir.find((k) => !P.diller[k]) || eklenebilir[0] };
    const kodlar = Object.keys(P.diller);
    return [
      h("h2", null, "Dublaj"),
      grup("Dublaj üret ve kaydet · dil · çeviri",
        secim("Hedef dil", eklenebilir.map((k) => [k, `${k.toUpperCase()} · ${gemini.DILLER[k]}`]), form.dil, (v) => { form.dil = v; }),
        aciklama("Anlatım hedef dile çevrilir ve seslendirme ayarlarındaki sesle okunur; görseller ortaktır. Çeviri (12 sahnede 1 istek) ve ses Gemini kotasından düşer."),
        h("button", { class: "dugme birincil genis-dugme is-dugme", disabled: is.calisiyor || !P.sahneler.length, onclick: () => {
          const kod = form.dil;
          calistir(async () => {
            geminiGerek();
            P.diller[kod] ||= { metinler: {}, sesSureleri: {} };
            const cevrilen = await ceviriAdimi(kod);
            durduysa();
            const ses = await sesAdimi(kod);
            P.dublajSecili = kod;
            return `${dilAdi(kod)} dublajı kaydedildi: ${cevrilen} sahne çevrildi, ${ses} ses parçası üretildi.`;
          });
        } }, "Dublajı kaydet")),
      grup("Kayıtlı dublajlar · videoya ekle",
        kodlar.length ? h("div", { class: "kayit-listesi" }, kodlar.map((kod) => {
          const gorunum = dilGorunumu(P, kod), z = zamanlama(gorunum);
          const oynatici = h("audio", { controls: true, class: "dinle", hidden: true });
          const radyo = h("input", { type: "radio", name: "dublaj-secim", onchange: () => dublajSec(kod) });
          radyo.checked = P.dublajSecili === kod;
          return h("div", { class: "kayit" + (P.dublajSecili === kod ? " secili" : ""), "data-dublaj": kod },
            h("label", { class: "kayit-sec" }, radyo, h("b", null, dilAdi(kod)),
              h("span", { class: "soluk" }, ` · ${z.sesDurumu === "tam" ? "ses ✓ · " + sureYaz(z.toplam) : z.sesDurumu === "eksik" ? "ses eksik" : "ses yok"}`)),
            oynatici,
            h("div", { class: "kayit-islem" },
              z.sesDurumu === "tam" ? h("button", { class: "dugme kucuk", onclick: async () => {
                const ses = await sesiTopla(gorunum).catch(() => null);
                if (!ses) return;
                const adres = URL.createObjectURL(wavBlob(ses.pcm, ses.hiz));
                adresler.add(adres);
                oynatici.src = adres;
                oynatici.hidden = false;
                oynatici.play().catch(() => {});
              } }, "dinle") : null,
              h("button", { class: "dugme kucuk", onclick: () => srtIndir(kod) }, "altyazı"),
              h("button", { class: "dugme kucuk tehlike", "aria-label": `${dilAdi(kod)} dublajını sil`, onclick: async () => {
                if (!confirm(`${dilAdi(kod)} dublajı (çeviri ve ses) silinsin mi?`)) return;
                delete P.diller[kod];
                if (P.dublajSecili === kod) P.dublajSecili = Object.keys(P.diller)[0] || "";
                if (!dublajVar()) { P.isaret.dublaj = goz.dublaj = false; gozYaz(); }
                await artikSesleriSil();
                kaydet();
                ciz();
              } }, "🗑")));
        })) : aciklama("Kayıtlı dublaj yok: dil seç ve Dublajı kaydet'e bas."),
        kodlar.length ? h("div", { class: "dugme-satiri" },
          P.isaret.dublaj && dublajVar()
            ? h("button", { class: "dugme tehlike", onclick: () => { P.isaret.dublaj = goz.dublaj = false; gozYaz(); kaydet(); ciz(); } }, "Dublajı videodan çıkar")
            : h("button", { class: "dugme birincil", disabled: !dublajVar(), onclick: () => isaretle("dublaj", true) }, "Seçili dublajı videoya ekle")) : null,
        kodlar.length ? aciklama(P.isaret.dublaj && dublajVar()
          ? `Videoda ${dilAdi(P.dublajSecili)} dublajı var: konuşma sesi, altyazı ve süre bu dile göre kurulur.`
          : "Videoda asıl seslendirme var.") : null),
    ];
  }

  function muzikPaneli() {
    const durum = h("p", { class: "durum", role: "status" });
    const dosya = h("input", { type: "file", accept: "audio/*", hidden: true, onchange: async () => {
      const secilen = dosya.files[0];
      dosya.value = "";
      if (!secilen) return;
      durumYaz(durum, "Müzik okunuyor…");
      try {
        const veri = await secilen.arrayBuffer();
        sesBaglami();
        const cozulen = await dosyadanSes(veri.slice(0));        // çözülebildiğini doğrula
        await depo.dosyalar.yaz(depo.muzikAnahtari(P.id), { veri, tur: secilen.type });
        muzikPcm = cozulen;
        P.muzik = { ad: secilen.name.replace(/\.[^.]+$/, ""), sure: cozulen.pcm.length / cozulen.hiz, seviye: P.muzik?.seviye ?? 20,
                    ducking: P.muzik?.ducking ?? true, tekrarla: P.muzik?.tekrarla ?? true, giris: P.muzik?.giris ?? 1.5, cikis: P.muzik?.cikis ?? 1.5 };
        P.isaret.muzik = goz.muzik = true;
        gozYaz();
        oynatmayiDurdur();
        kaydet();
        ciz();
      } catch {
        durumYaz(durum, "Bu ses dosyası okunamadı.", "hata");
      }
    } });
    const yukle = h("div", { class: "dugme-satiri" }, h("label", { class: "dugme dosya" }, "📁 Müzik dosyası yükle", dosya));
    if (!P.muzik) {
      return [h("h2", null, "Müzik"),
              grup("Müzik kaydet · yükle · seviye · karartma", yukle, aciklama("Henüz dosya yok: telefonundan bir müzik dosyası yükle."), durum),
              grup("Kayıtlı müzikler · videoya ekle", aciklama("Kaydedilmiş müzik yok."))];
    }
    const m = P.muzik;
    const oynatici = h("audio", { controls: true, class: "dinle", preload: "none" });
    depo.dosyalar.al(depo.muzikAnahtari(P.id)).then((kayit) => {
      if (!kayit) return;
      const adres = URL.createObjectURL(new Blob([kayit.veri], { type: kayit.tur || "audio/mpeg" }));
      adresler.add(adres);
      oynatici.src = adres;
    }).catch(() => {});
    const degis = (ad) => (v) => { m[ad] = v; oynatmayiDurdur(); kaydet(); cizZaman(); };
    const isaretKutusu = h("input", { type: "checkbox", onchange: () => isaretle("muzik", isaretKutusu.checked) });
    isaretKutusu.checked = !!P.isaret.muzik;
    return [
      h("h2", null, "Müzik"),
      grup("Müzik kaydet · yükle · seviye · karartma",
        yukle,
        h("p", { class: "soluk aciklama" }, `Dosya: ${m.ad} · ${sureYaz(m.sure)}`),
        oynatici,
        aralikSatiri("Başlangıç karartma (sn)", 0, 10, 0.5, m.giris, degis("giris")),
        aralikSatiri("Bitiş karartma (sn)", 0, 10, 0.5, m.cikis, degis("cikis")),
        aralikSatiri("Ses seviyesi (%)", 0, 200, 5, m.seviye, degis("seviye")),
        aciklama("100 = dosyanın kendi seviyesi. Anlatımın altında duyulması için %20–40 dene."),
        durum),
      grup("Kayıtlı müzikler · videoya ekle",
        h("div", { class: "kayit-listesi" }, h("div", { class: "kayit" + (P.isaret.muzik ? " secili" : "") },
          h("label", { class: "kayit-sec muzik-sec" }, isaretKutusu,
            h("span", { class: "secim-rozet" + (P.isaret.muzik ? " acik" : "") }, P.isaret.muzik ? "✓ videoya girecek" : "Videoya girsin mi? İşaretle"),
            h("b", null, m.ad), h("span", { class: "soluk" }, ` · ${sureYaz(m.sure)} · %${m.seviye}`)),
          h("div", { class: "kayit-islem" }, h("button", { class: "dugme kucuk tehlike", "aria-label": "Müziği sil", onclick: async () => {
            if (!confirm(`${m.ad} silinsin mi?`)) return;
            await depo.dosyalar.sil(depo.muzikAnahtari(P.id));
            P.muzik = null;
            muzikPcm = null;
            oynatmayiDurdur();
            kaydet();
            ciz();
          } }, "🗑")))),
        onay("Müzik kısa kalırsa video sonuna kadar tekrarla", m.tekrarla, degis("tekrarla")),
        onay("Anlatım konuşurken müziği otomatik kıs (ducking)", m.ducking, degis("ducking"))),
    ];
  }

  // Altyazı: sahne metni kısa bloklara bölünür; süreler metin uzunluğuna göre paylaştırılır (yaklaşık).
  function tumAltyazilar(gorunum = G()) {
    const z = zamanlama(gorunum);
    return gorunum.sahneler.flatMap((s) => {
      const a = z.sahneler.get(s.id);
      return s.metin.trim() && a.bit > a.bas ? altyaziBloklari(s.metin, a.bas, a.bit) : [];
    });
  }
  const dosyaAdi = () => (P.ad || "studioflow").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "studioflow";
  function srtIndir(kod) {
    const adres = URL.createObjectURL(new Blob([srtMetni(tumAltyazilar(gorunumAl(kod)))], { type: "application/x-subrip" }));
    adresler.add(adres);
    h("a", { href: adres, download: `${dosyaAdi()}-${kod || P.dil}.srt` }).click();
  }

  function altyaziPaneli() {
    const s = P.altyaziStil;
    const stilDegisti = (ad) => (v) => { s[ad] = v; kaydet(); altyaziStiliniUygula(); onizle(); };
    // Canlı önizleme: yazı, dışa aktarmadaki oranlarla küçük bir karede gösterilir.
    const ornek = h("span", null, "Örnek altyazı satırı");
    const kare = h("div", { class: "onizleme-kare" }, ornek);
    const onizle = () => {
      kare.style.aspectRatio = P.boyut.replace("x", " / ");
      Object.assign(ornek.style, { bottom: `${s.seviye}%`, color: s.renk, fontWeight: s.kalin ? "700" : "500",
        fontSize: `${Math.max(6, (kare.getBoundingClientRect().height || 150) * s.boyut / 100)}px`, fontFamily: YAZI_TIPLERI[s.font],
        textShadow: s.golge ? "0 0 3px #000, 0 1px 4px #000" : "0 0 2px #000" });
    };
    requestAnimationFrame(onizle);
    const diller = ["", ...Object.keys(P.diller)];
    const blokSayisi = P.sahneler.length ? tumAltyazilar().length : 0;
    return [
      h("h2", null, "Altyazı"),
      grup("Görünüm ve üretim · yazı tipi, renk, seviye",
        onay("Altyazıyı videoya göm", P.isaret.altyazi, (v) => isaretle("altyazi", v)),
        kare,
        secim("Yazı tipi · videoya gömülürken", [["sans", "Düz (sans-serif)"], ["serif", "Tırnaklı (serif)"], ["mono", "Eş aralıklı"]], s.font, stilDegisti("font")),
        alanKutu("Yazı rengi", h("input", { type: "color", value: s.renk, oninput: (o) => stilDegisti("renk")(o.target.value) })),
        onay("Kalın", s.kalin, stilDegisti("kalin")),
        aralikSatiri("Seviye · yazının alttan yüksekliği (%)", 2, 80, 1, s.seviye, stilDegisti("seviye")),
        aralikSatiri("Boyut · yazı yüksekliği (tuvalin %'si)", 2, 8, 0.5, s.boyut, stilDegisti("boyut")),
        onay("Arka gölge", s.golge, stilDegisti("golge"))),
      grup("Kayıtlı altyazılar · dile göre ayrı altyazı",
        blokSayisi ? h("div", { class: "kayit-listesi" }, diller.map((kod) => h("div", { class: "kayit" + (onizlemeDili() === kod ? " secili" : "") },
          h("div", { class: "kayit-sec" }, h("b", null, dilAdi(kod)), h("span", { class: "soluk" }, ` · ${tumAltyazilar(gorunumAl(kod)).length} blok${kod ? "" : " · asıl dil"}`)),
          h("div", { class: "kayit-islem" }, h("button", { class: "dugme kucuk", onclick: () => srtIndir(kod) }, "srt")))))
          : aciklama("Sahneler oluşunca altyazılar burada listelenir."),
        aciklama("Videoya, o an videoda olan konuşmanın (seslendirme ya da seçili dublaj) altyazısı gömülür. Süreler metin uzunluğuna göre paylaştırılır (yaklaşık).")),
    ];
  }

  // Karışım: dışa aktarılacak izler ve dışa aktarma.
  function cizelge(gorunum, z) {
    // Görseli olmayan sahne, kendinden önceki (yoksa sonraki) en yakın görseli kullanır.
    const gorselli = P.sahneler.map((s, i) => (s.gorselVar ? i : -1)).filter((i) => i >= 0);
    const dilimler = [];
    gorunum.sahneler.forEach((sahne, i) => {
      const { bas, bit } = z.sahneler.get(sahne.id);
      if (bit - bas <= 0) return;
      if (P.hareketli && sahne.videoVar) {
        dilimler.push({ bas, bit, tur: "video", no: i });
      } else {
        const onceki = gorselli.filter((g) => g <= i).pop();
        const no = onceki ?? gorselli[0];
        const son = dilimler[dilimler.length - 1];
        if (son && son.tur === "gorsel" && son.no === no) son.bit = bit; else dilimler.push({ bas, bit, tur: "gorsel", no });
      }
    });
    return dilimler;
  }

  function videoyuGoster() {
    if (!sonVideo) return;
    oynatmayiDurdur();
    const kaplama = h("div", { class: "video-kaplama" },
      h("video", { src: sonVideo.adres, controls: true, playsinline: true, autoplay: true }),
      h("div", { class: "satir" },
        h("button", { class: "dugme birincil", onclick: videoKaydet }, "Kaydet / Paylaş"),
        h("button", { class: "dugme", onclick: () => kaplama.remove() }, "Kapat")));
    document.body.append(kaplama);
  }

  function izlerPaneli() {
    const kod = aktarimDili();
    const gorunum = gorunumAl(kod), z = zamanlama(gorunum);
    const gorselli = P.sahneler.filter((s) => s.gorselVar).length;
    const konusmali = kod ? true : P.isaret.seslendirme;
    const durum = h("p", { class: "durum", role: "status" });
    const cubuk = h("progress", { max: "1", value: "0", hidden: true });
    const yontem = h("select", null, secenekler([["oto", "Otomatik"], ["hizli", "Hızlı"], ["gercek", "Gerçek zamanlı"]], "oto"));
    const iptal = h("button", { class: "dugme kucuk", hidden: true, onclick: () => { is.iptal = true; } }, "İptal");
    const izle = h("button", { class: "dugme kucuk", hidden: !sonVideo, onclick: videoyuGoster }, "İzle");
    const paylas = h("button", { class: "dugme kucuk", hidden: !sonVideo, onclick: videoKaydet }, "Kaydet / Paylaş");
    const hazirlik = !P.sahneler.length ? "Önce sahneleri oluştur."
      : !gorselli ? "En az bir sahnenin görseli olmalı."
      : z.sesDurumu === "eksik" ? "Ses eksik: “Kaldığın yerden devam et”e bas."
      : kod && z.sesDurumu !== "tam" ? `${dilAdi(kod)} dublajının sesi yok: Dublaj bölümünden üret.` : "";
    const ne = { video: `${P.sahneler.length} sahne · ${gorselli} görsel`,
      seslendirme: kod ? "dublaj videoda olduğu için girmez" : zamanlama(P).sesDurumu === "tam" ? `${dilAdi("")} · ${sureYaz(zamanlama(P).toplam)}` : "ses yok",
      dublaj: dublajVar() ? `${dilAdi(P.dublajSecili)}` : "kayıtlı dublaj yok", muzik: P.muzik ? `${P.muzik.ad} · %${P.muzik.seviye}` : "müzik yok",
      altyazi: `${tumAltyazilar(gorunum).length} blok · ${dilAdi(kod)}` };
    const olustur = h("button", { class: "dugme birincil genis-dugme is-dugme", disabled: is.calisiyor || !!hazirlik, onclick: async () => {
      if (is.calisiyor) return;
      oynatmayiDurdur();
      const baglam = sesBaglami();        // iOS: dokunma olayının içinde açılmalı
      is.calisiyor = true;
      is.iptal = false;
      kilitle(true);
      cubuk.hidden = false;
      iptal.hidden = false;
      try {
        await ekranAcik(async () => {
          const [en, boy] = P.boyut.split("x").map(Number);
          durumYaz(durum, "Ses hazırlanıyor…");
          const ses = await sesKur(kod, konusmali, P.isaret.muzik && !!P.muzik);
          const sonuc = await disaAktar({
            dilimler: cizelge(gorunum, z), altyazilar: P.isaret.altyazi ? tumAltyazilar(gorunum) : [], altyaziStili: P.altyaziStil,
            ses, en, boy, yontem: yontem.value, sesBaglami: baglam,
            gorselAl: async (no) => videoTuvali(await depo.dosyalar.al(depo.gorselAnahtari(P.id, P.sahneler[no].id)), en, boy),
            videoAl: async (no) => {
              const kayit = await depo.dosyalar.al(depo.videoAnahtari(P.id, P.sahneler[no].id));
              if (!kayit) throw new Error(`Sahne ${no + 1} klibi eksik; yeniden üret.`);
              return klipOgesi(kayit);
            },
            iptal: () => is.iptal,
            ilerleme: (oran, metin) => { cubuk.value = oran; durumYaz(durum, metin); },
          });
          if (sonVideo) { URL.revokeObjectURL(sonVideo.adres); adresler.delete(sonVideo.adres); }
          sonVideo = { ...sonuc, dil: kod, adres: URL.createObjectURL(sonuc.blob) };
          adresler.add(sonVideo.adres);
          izle.hidden = paylas.hidden = false;
          const ozet = `${en}×${boy}, ${sonuc.sure.toFixed(1)} sn video, ${sonuc.gecen.toFixed(1)} sn'de `
            + `(${(sonuc.sure / sonuc.gecen).toFixed(1)}× hız), ${(sonuc.blob.size / 1e6).toFixed(1)} MB, yöntem: ${sonuc.yontem}`;
          try { sessionStorage.setItem("son-aktarim", "Son dışa aktarma: " + ozet); } catch { /* özel sekme */ }
          durumYaz(durum, "Video hazır: " + ozet, "tamam");
        });
      } catch (hata) {
        durumYaz(durum, hata.message || String(hata), "hata");
        try { sessionStorage.setItem("son-aktarim", "Son dışa aktarma HATA: " + (hata.message || hata)); } catch { /* özel sekme */ }
      } finally {
        is.calisiyor = false;
        kilitle(false);
        cubuk.hidden = true;
        iptal.hidden = true;
      }
    } }, "Videoyu oluştur");
    return [
      h("h2", null, "Dışa aktarma karışımı"),
      aciklama("☑ işaretli izler videoya girer. İşaretleri buradan ya da zaman çizelgesindeki iz başlıklarından değiştir."),
      h("div", { class: "iz-listesi" }, IZLER.map((i) => {
        const kutu = h("input", { type: "checkbox", disabled: i.anahtar === "video", onchange: () => isaretle(i.anahtar, kutu.checked) });
        kutu.checked = !!P.isaret[i.anahtar];
        return h("label", { class: "iz-kayit" + (P.isaret[i.anahtar] ? "" : " disarida") }, kutu, h("b", null, i.ad), h("span", { class: "soluk" }, ne[i.anahtar]));
      })),
      h("p", { class: "soluk aciklama", "data-ozet": "" }, `Süre: ${sureYaz(z.toplam)} · konuşma: ${konusmali && z.sesDurumu === "tam" ? dilAdi(kod) : "yok"}`),
      alanKutu("Yöntem", yontem),
      hazirlik ? h("p", { class: "durum hata" }, hazirlik) : null,
      h("div", { class: "dugme-satiri" }, olustur, iptal),
      cubuk, durum,
      h("div", { class: "dugme-satiri" }, izle, paylas),
    ];
  }

  async function videoKaydet() {
    if (!sonVideo) return;
    const ad = `${dosyaAdi()}${sonVideo.dil ? "-" + sonVideo.dil : ""}.${sonVideo.uzanti}`;
    const dosya = new File([sonVideo.blob], ad, { type: sonVideo.blob.type });
    if (navigator.canShare?.({ files: [dosya] })) {
      try {
        await navigator.share({ files: [dosya] });
        return;
      } catch (hata) {
        if (hata.name === "AbortError") return;      // kullanıcı paylaşımı kapattı
      }
    }
    h("a", { href: sonVideo.adres, download: ad }).click();
  }

  function bilgiPaneli() {
    const z = zamanlama(P);
    const satir = (ad, deger) => [h("dt", null, ad), h("dd", null, deger)];
    return [
      h("h2", null, "Proje"),
      h("dl", { class: "bilgi-listesi" },
        satir("Ad", P.ad), satir("Oluşturma", new Date(P.olusturma).toLocaleString("tr-TR")),
        satir("Son değişiklik", new Date(P.guncelleme).toLocaleString("tr-TR")),
        satir("Biçim", P.boyut.replace("x", " × ")), satir("Dil", dilAdi("")),
        satir("Sahne", String(P.sahneler.length)), satir("Süre", sureYaz(z.toplam) + (z.sesDurumu === "tam" ? "" : " (tahmini)")),
        satir("Dublajlar", Object.keys(P.diller).map(dilAdi).join(", ") || "yok"), satir("Müzik", P.muzik?.ad || "yok")),
      aciklama("Proje ve dosyaları bu telefonun tarayıcı deposunda durur."),
      h("button", { class: "dugme tehlike genis-dugme", onclick: async () => {
        if (!confirm(`"${P.ad}" projesi ve tüm dosyaları bu telefondan silinsin mi? Geri alınamaz.`)) return;
        oynatmayiDurdur();
        await depo.dosyalar.onekSil(`${P.id}:`);
        await depo.projeler.sil(P.id);
        try { localStorage.removeItem(GOZ_ANAHTARI); } catch { /* özel sekme */ }
        silindi = true;
        location.hash = "#/";
      } }, "🗑 Projeyi sil"),
    ];
  }
  let silindi = false;

  // ── Sağ panel: seçili sahne ─────────────────────────────────────────────────
  function cizDenetci() {
    const sahne = P.sahneler[secili];
    if (!sahne) return denetci.replaceChildren(h("h2", null, "Sahne"), h("p", { class: "soluk" }, "Sahne seçilmedi."));
    const no = secili + 1;
    const kod = onizlemeDili();
    const z = zamanlama(G());
    const a = z.sahneler.get(sahne.id);
    const dosya = h("input", { type: "file", accept: "image/*", hidden: true, onchange: async () => {
      const secilen = dosya.files[0];
      dosya.value = "";
      if (!secilen) return;
      try { await gorselKaydet(sahne, await depoyaHazirla(secilen)); cizZaman(); cizPanel(); } catch { alert("Bu görsel okunamadı."); }
    } });
    const metinDegisti = () => { kaydet(); cizZaman(); cizUst(); zamaniYaz(); };
    // Ses birkaç sahnelik parçalar halinde okunur: bu sahnenin parçası ve içindeki sahne numaraları.
    const sesGorunumu = G();
    const sesParcasi = sesPlani(sesGorunumu).find((p) => p.sahneler.includes(sahne.id)) || null;
    const sesVar = !!sesParcasi && sesGorunumu.sesSureleri[sesParcasi.anahtar] > 0;
    const parcaNolari = sesParcasi ? sesParcasi.sahneler.map((sid) => P.sahneler.findIndex((x) => x.id === sid) + 1).join(", ") : "";
    /** Sahne düğmesi: `soru()` metin döndürürse önce onay ister; iş sürerken ve `etkin` değilken kapalıdır. */
    const sahneIsi = (etiket, etkin, soru, isi) => h("button", { class: "dugme kucuk is-dugme", disabled: is.calisiyor || !etkin, "data-etkin": etkin ? "" : null,
      onclick: () => { const metin = soru(); if (metin && !confirm(metin)) return; calistir(isi); } }, etiket);
    denetci.replaceChildren(...[
      h("div", { class: "ed-denetci-ust" },
        h("h2", null, `Sahne ${no}`),
        h("span", { class: "soluk" }, a && a.bit > a.bas ? `${sureYaz(a.bas)} – ${sureYaz(a.bit)}${z.sesDurumu === "tam" ? "" : " (tahmini)"}` : ""),
        h("span", { class: "bosluk" }),
        h("button", { class: "ed-ikon", "aria-label": `Sahne ${no} sil`, onclick: async () => {
          if (!confirm(`Sahne ${no} silinsin mi?`)) return;
          await depo.dosyalar.sil(depo.gorselAnahtari(P.id, sahne.id));
          await depo.dosyalar.sil(depo.videoAnahtari(P.id, sahne.id));
          P.sahneler = P.sahneler.filter((s) => s !== sahne);
          for (const dublaj of Object.values(P.diller)) delete dublaj.metinler[sahne.id];
          secili = Math.max(0, Math.min(secili, P.sahneler.length - 1));
          kaydet();
          ciz();
        } }, "🗑")),
      kod
        ? yaziAlani(`Anlatım (${dilAdi(kod)} çevirisi)`, P.diller[kod].metinler[sahne.id], { satir: 3, veri: { "data-anlatim": "" },
            yerTutucu: "Çeviri yok: Dublaj bölümünden üret ya da buraya yaz.", degisti: (v) => { P.diller[kod].metinler[sahne.id] = v; metinDegisti(); } })
        : yaziAlani("Anlatım", sahne.metin, { satir: 3, veri: { "data-anlatim": "" }, degisti: (v) => { sahne.metin = v; metinDegisti(); } }),
      yaziAlani("Görsel tarifi (İngilizce)", sahne.prompt, { satir: 3, yerTutucu: "Boş bırakırsan anlatımdan üretilir.", veri: { "data-prompt": "" },
                                                           degisti: (v) => { sahne.prompt = v; kaydet(); } }),
      P.hareketli ? yaziAlani("Hareket tarifi (İngilizce)", sahne.hareket, { yerTutucu: ltx.VARSAYILAN_HAREKET, veri: { "data-hareket": "" },
                                                                          degisti: (v) => { sahne.hareket = v; kaydet(); } }) : null,
      // Sahne işlemleri: masaüstündeki gibi her biri önce ne olacağını sorar, yalnızca bu sahneyi etkiler.
      h("p", { class: "soluk aciklama", "data-sahne-durum": "" }, [
        `tarif ${(sahne.prompt || "").trim() ? "✓" : "—"}`, `ses ${sesVar ? "✓" : "—"}`,
        `görsel ${sahne.gorselVar ? "✓" : "—"}`, P.hareketli ? `klip ${sahne.videoVar ? "✓" : "—"}` : ""].filter(Boolean).join(" · ")),
      h("div", { class: "ed-islemler" },
        sahneIsi(sesVar ? "🎙 Sesi yeniden üret" : "🎙 Ses üret", !!sesParcasi,
          () => !sesVar ? "" : `Sahne ${no} sesi yeniden üretilsin mi?\n\n${sesParcasi.sahneler.length > 1
            ? `Ses, ${sesParcasi.sahneler.length} sahnelik tek parça halinde okunuyor; bu sahnenin içinde olduğu parça (sahne ${parcaNolari}) yeniden okunur.`
            : "Bu sahnenin sesi yeniden okunur."} 1 Gemini seslendirme isteği harcar${kod ? ` (${dilAdi(kod)} dublajı)` : ""}. Yenisi gelene kadar eski ses durur.`,
          async () => {
            geminiGerek();
            adim(`Sahne ${no} sesi yeniden üretiliyor…`);
            await parcayiSeslendir(sesGorunumu, sesParcasi);
            return `Sahne ${no} sesi ${sesVar ? "yenilendi" : "hazır"}${sesParcasi.sahneler.length > 1 ? ` (sahne ${parcaNolari} birlikte)` : ""}.`;
          }),
        sahneIsi((sahne.prompt || "").trim() ? "📝 Tarifi yeniden yaz" : "📝 Tarif yaz", !!sahne.metin.trim(),
          () => ((sahne.prompt || "").trim()
            ? `Sahne ${no} görsel tarifi yeniden yazılsın mı?\n\nŞimdiki tarifin üzerine yazılır (1 Gemini isteği). Görsel değişmez; yeni tarifle görsel için sonra “Görseli yeniden üret”e bas.` : ""),
          async () => {
            geminiGerek();
            await promptAdimi([sahne]);
            return `Sahne ${no} görsel tarifi yazıldı.` + (sahne.gorselVar ? " Görsel eski tarifle duruyor; yenilemek için “Görseli yeniden üret”e bas." : "");
          }),
        sahneIsi(sahne.gorselVar ? "🖼 Görseli yeniden üret" : "🖼 Görsel üret", true,
          () => (sahne.gorselVar
            ? `Sahne ${no} görseli yenilensin mi?\n\nGörsel${sahne.videoVar ? " ve klibi" : ""} silinir, aynı tarifle yenisi üretilir (görsel kotası harcar).` : ""),
          async () => {
            if (!havuz.hesapVar("cloudflare")) throw new Error("Cloudflare hesabı yok: API sayfasından ekle ya da galeriden görsel seç.");
            const klipVardi = sahne.videoVar;
            adim(`Sahne ${no} görseli üretiliyor…`);
            await gorselUret(sahne);
            return `Sahne ${no} görseli hazır.` + (klipVardi ? " Eski klip silindi; “Klibi yeniden üret” ya da “Kaldığın yerden devam et” ile yenilenir." : "");
          }),
        P.hareketli ? sahneIsi(sahne.videoVar ? "🎬 Klibi yeniden üret" : "🎬 Klip üret", sahne.gorselVar,
          () => (sahne.videoVar
            ? `Sahne ${no} klibi yeniden üretilsin mi?\n\nYalnızca bu sahnenin klibi yenilenir, aynı görselden üretilir (video kotası harcar). Yenisi gelene kadar eski klip durur.` : ""),
          async () => {
            if (!havuz.hesapVar("huggingface")) throw new Error("Hugging Face hesabı yok: API sayfasından ekle.");
            adim(`Sahne ${no} klibi üretiliyor…`);
            await klipUret(sahne, (mesaj) => adim(`Sahne ${no} · ${mesaj.replace(/^LTX · /, "")}`));
            return `Sahne ${no} klibi hazır.`;
          }) : null,
        h("label", { class: "dugme kucuk dosya" }, "📁 Galeriden görsel", dosya))].filter(Boolean));
  }

  // ── Çizim ───────────────────────────────────────────────────────────────────
  function cizUst() {
    const kod = onizlemeDili();
    const z = zamanlama(G());
    const gorselli = P.sahneler.filter((s) => s.gorselVar).length;
    const ses = !z.parcaSayisi ? "" : z.sesDurumu === "tam" ? "ses ✓" : z.sesDurumu === "eksik" ? "ses eksik" : "ses yok";
    ustCubuk.querySelector(".ed-ozet").textContent = P.sahneler.length
      ? [kod ? dilAdi(kod) : "", `${P.sahneler.length} sahne`, `${gorselli} görsel`,
         P.hareketli ? `${P.sahneler.filter((s) => s.videoVar).length} klip` : "", ses, sureYaz(z.toplam)].filter(Boolean).join(" · ")
      : "";
    uretDugmesi.disabled = is.calisiyor;
  }

  const PANELLER = {
    sahneler: sahnelerPaneli, ayarlar: ayarlarPaneli, uretim: uretimPaneli, metin: metinPaneli, seslendirme: seslendirmePaneli,
    dublaj: dublajPaneli, muzik: muzikPaneli, altyazi: altyaziPaneli, izler: izlerPaneli, bilgi: bilgiPaneli,
    karakterler: yokPaneli("Karakterler", "Sabit karakter kadrosu mobil sürümde henüz yok. Karakterli projeleri masaüstü StudioFlow'da hazırla."),
    efekt: yokPaneli("Ses efektleri", "Ses efektleri mobil sürümde henüz yok."),
  };
  function cizPanel() {
    ray.replaceChildren(...RAY.map(([ad, ikon, etiket, yok]) => h("button", {
      class: "ed-ray-oge" + (panel === ad ? " secili" : "") + (yok ? " pasif" : ""), "aria-pressed": String(panel === ad), "data-panel": ad,
      onclick: () => { if (panel !== ad) { kaydet.simdi(); panel = ad; cizPanel(); } },
    }, h("span", { "aria-hidden": "true" }, ikon), etiket)));
    panelKutusu.replaceChildren(...PANELLER[panel]().flat(Infinity).filter(Boolean));
    panelKutusu.scrollTop = 0;
  }

  /**
   * Zaman çizelgesi: cetvel + izler aynı ölçekle alt alta durur. Sol sütunda iz başlıkları (göz, işaret, ad)
   * sabit kalır. Küçükken yalnızca cetvel ve video izi görünür. Cetvelde parmak sürüklenince önizleme o ana gider.
   */
  function cizZaman() {
    if (!P.sahneler.length) return zamanCizelgesi.replaceChildren(h("p", { class: "soluk" }, "Zaman çizelgesi: sahneler burada görünür."));
    const kod = onizlemeDili(), gorunum = G(), z = zamanlama(gorunum);
    const sureler = gorunum.sahneler.map((s) => { const a = z.sahneler.get(s.id); return a.bit - a.bas; }).filter((s) => s > 0);
    zcOlcek = Math.min(40, Math.max(16, 46 / Math.min(...sureler, 3)));
    const px = (t) => `${Math.round(t * zcOlcek)}px`;
    const genislik = px(z.toplam);
    const bosIz = (metin, hedef) => h("button", { class: "iz-bos", onclick: () => { panel = hedef; cizPanel(); } }, metin);
    const blok = (sinif, bas, sure, metin) => h("span", { class: "ed-blok " + sinif, style: `left:${px(bas)};width:${px(sure)}`, title: metin }, metin);

    const baslik = (i) => {
      const acik = !!goz[i.anahtar], isaretli = !!P.isaret[i.anahtar];
      const kutu = h("input", { type: "checkbox", class: "isaret", disabled: i.anahtar === "video",
        title: isaretli ? `${i.ad} dışa aktarılan videoya girer` : `${i.ad} dışa aktarılan videoya girmez`,
        "aria-label": `${i.ad} videoya girsin`, onchange: () => isaretle(i.anahtar, kutu.checked) });
      kutu.checked = isaretli;
      const dublajlar = Object.keys(P.diller);
      return h("div", { class: `ed-zc-ad${acik ? "" : " gizli"}${isaretli ? "" : " disarida"}`, "data-iz": i.anahtar },
        h("button", { class: "goz" + (acik ? "" : " kapali"), "aria-pressed": String(acik),
          "aria-label": acik ? `${i.ad} önizlemede açık · kapatmak için dokun` : `${i.ad} önizlemede kapalı · açmak için dokun`,
          onclick: () => gozuDegistir(i.anahtar) }, gozIkonu(acik)),
        kutu,
        i.anahtar === "dublaj" && dublajlar.length > 1
          ? h("select", { class: "iz-secim", "aria-label": "Dublaj kaydı", onchange: (o) => dublajSec(o.target.value) }, secenekler(dublajlar.map((k) => [k, dilAdi(k)]), P.dublajSecili))
          : h("span", { class: "ed-zc-ad-yazi" }, i.ad));
    };
    const govdeler = {
      video: () => gorunum.sahneler.map((s, i) => {
        const a = z.sahneler.get(s.id);
        return h("button", {
          class: "ed-zc-oge" + (i === secili ? " secili" : "") + (s.gorselVar ? "" : " bos"), "data-sira": i, "data-kucuk": s.id,
          style: `width:${px(a.bit - a.bas)};` + (kucukler.get(s.id) ? `background-image:url("${kucukler.get(s.id).adres}")` : ""),
          "aria-label": `Sahne ${i + 1}`, onclick: () => sec(i),
        }, h("span", null, String(i + 1)));
      }),
      seslendirme: () => { const a = zamanlama(P); return a.sesDurumu === "tam"
        ? blok("ses" + (kod ? " soluk-blok" : ""), 0, a.toplam, `Seslendirme · ${dilAdi("")} · ${sureYaz(a.toplam)}`)
        : bosIz(a.sesDurumu === "eksik" ? "ses eksik: devam et" : "ses yok: devam et", "uretim"); },
      dublaj: () => { if (!dublajVar()) return bosIz("dublaj yok", "dublaj");
        const d = zamanlama(dilGorunumu(P, P.dublajSecili));
        return d.sesDurumu === "tam" ? blok("dublaj", 0, d.toplam, `Dublaj · ${dilAdi(P.dublajSecili)} · ${sureYaz(d.toplam)}`) : bosIz(`${dilAdi(P.dublajSecili)} dublajının sesi yok`, "dublaj"); },
      muzik: () => (P.muzik ? blok("muzik", 0, P.muzik.tekrarla ? z.toplam : Math.min(z.toplam, P.muzik.sure), `${P.muzik.ad} · %${P.muzik.seviye}`) : bosIz("müzik yok", "muzik")),
      altyazi: () => { const b = tumAltyazilar(gorunum); return b.length ? b.map((x) => blok("altyazi", x.bas, x.bit - x.bas, x.metin)) : bosIz("altyazı yok", "altyazi"); },
    };

    const konumdan = (o) => (o.clientX - cetvel.getBoundingClientRect().left) / zcOlcek;
    const adimSn = zcOlcek >= 30 ? 1 : zcOlcek >= 18 ? 2 : 5;
    const isaretler = [];
    for (let t = 0; t <= z.toplam; t += adimSn) isaretler.push(h("span", { style: `left:${px(t)}` }, sureYaz(t)));
    const cetvel = h("div", { class: "ed-cetvel", style: `width:${genislik}`, "aria-label": "Zaman cetveli: sürükleyerek gezin",
      onpointerdown: (o) => { cetvel.setPointerCapture(o.pointerId); gez(konumdan(o)); },
      onpointermove: (o) => { if (cetvel.hasPointerCapture(o.pointerId)) gez(konumdan(o)); } }, isaretler);
    const ac = h("button", { class: "ed-zc-ac", "aria-label": zcAcik ? "Çizelgeyi küçült" : "Çizelgeyi büyüt (bütün izler)",
      onclick: () => { zcAcik = !zcAcik; ayarGuncelle({ zcAcik: zcAcik ? "" : "kapali" }); cizZaman(); } }, zcAcik ? "▾ İzler" : "▴ İzler");
    const satirlar = [h("div", { class: "ed-iz ed-iz-cetvel" }, h("div", { class: "ed-zc-ad ed-zc-kose" }, ac), cetvel)];
    for (const i of IZLER) {
      if (!zcAcik && i.anahtar !== "video") continue;
      satirlar.push(h("div", { class: `ed-iz ed-iz-${i.anahtar}${goz[i.anahtar] ? "" : " gizli"}${P.isaret[i.anahtar] ? "" : " disarida"}` },
        baslik(i), h("div", { class: "ed-iz-govde", style: `width:${genislik}` }, govdeler[i.anahtar]())));
    }
    zamanCizelgesi.classList.toggle("acik", zcAcik);
    zamanCizelgesi.replaceChildren(h("div", { class: "ed-zc-ic", style: `width:calc(${genislik} + ${IZ_SOL + 12}px)` }, satirlar, imlecCizgi));
    imleciKoy(Math.min(imlec, z.toplam));
  }

  function ciz() {
    secili = Math.max(0, Math.min(secili, P.sahneler.length - 1));
    cizUst();
    cizPanel();
    cizZaman();
    cizTuval();
    cizDenetci();
    zamaniYaz();
    for (const sahne of P.sahneler) if (sahne.gorselVar && !kucukler.has(sahne.id)) kucukYukle(sahne).catch(() => {});
  }
  ciz();

  return () => {
    is.iptal = true;
    oynatmayiDurdur();
    document.removeEventListener("visibilitychange", gizlenince);
    if (!silindi) kaydet.simdi();
    document.body.classList.remove("editor-acik");
    document.querySelectorAll(".yazi-kaplama, .video-kaplama").forEach((k) => k.remove());
    try { screen.orientation?.unlock?.(); } catch { /* desteklenmiyor */ }
    if (tamEkranBizden && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    adresler.forEach((a) => URL.revokeObjectURL(a));
  };
}
