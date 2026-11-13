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
import { sesPlani, sahneParcalari, anlatimParcalari, tamMetin, sozcukler, zamanlama, tumBloklar, gorselPromptu, uretimBoyutu,
         varsayilanGorselBoyutu, yeniSahne, dilGorunumu, dublajAdi, tumSesAnahtarlari, srtMetni, hizCarpani, kimlik,
         KELIME_HIZI, SAHNE_ALT, SAHNE_UST, SAHNE_TAVAN_ALT, SAHNE_TAVAN_VARSAYILAN, VARSAYILAN_NEGATIF } from "../sahne.js";
import { planKur, planIzi, icerikSahneleri, sahneleriZamanla, sahneTavani, tahminiSure } from "../plan.js";
import { depoyaHazirla, videoTuvali, kayittanBlob, ltxKaresi, klipOgesi } from "../gorsel.js";
import { sesBaglami, wavBlob, dosyadanSes } from "../ses.js";
import { karistir, muzikDilimleri, muzikSuresi } from "../karisim.js";
import { dinle, kelimeZamanlari, istekSayisi } from "../hizalama.js";
import { hizTon } from "../tempo.js";
import { disaAktar, YAZI_TIPLERI } from "../disa_aktar.js";

const BOYUTLAR = [["720x1280", "Dikey 720 × 1280"], ["1080x1920", "Dikey 1080 × 1920"],
                  ["1280x720", "Yatay 1280 × 720"], ["1920x1080", "Yatay 1920 × 1080"]];
const SURELER = [30, 45, 60, 90, 120, 180, 300];
// Ön ayarlar: masaüstündeki hazır kurulumlardan mobilde karşılığı olanlar (biçim + görsel modeli + adım).
const KLEIN = "@cf/black-forest-labs/flux-2-klein-4b", LIGHTNING = "@cf/bytedance/stable-diffusion-xl-lightning";
const ON_AYARLAR = [
  { kimlik: "shorts-sahne", ad: "Shorts / Reels dikey · sahneye sadık (FLUX.2 klein 4B)", boyut: "1080x1920", model: KLEIN, adim: 0, guidance: 0 },
  { kimlik: "yt-sahne", ad: "YouTube yatay · sahneye sadık (FLUX.2 klein 4B)", boyut: "1920x1080", model: KLEIN, adim: 0, guidance: 0 },
  { kimlik: "shorts-hizli", ad: "Shorts / Reels dikey · hızlı (SDXL Lightning · 4 adım)", boyut: "1080x1920", model: LIGHTNING, adim: 4, guidance: 7.5 },
  { kimlik: "yt-hizli", ad: "YouTube yatay · hızlı (SDXL Lightning · 4 adım)", boyut: "1920x1080", model: LIGHTNING, adim: 4, guidance: 7.5 },
];
const TEST_CUMLELERI = {
  tr: "Merhaba, bu bir ses denemesidir. Anlatım bu sesle ve bu hızda okunacak.",
  en: "Hello, this is a voice test. The narration will be read with this voice at this pace.",
  de: "Hallo, dies ist ein Stimmtest. Die Erzählung wird mit dieser Stimme in diesem Tempo gelesen.",
  es: "Hola, esta es una prueba de voz. La narración se leerá con esta voz y a este ritmo.",
  fr: "Bonjour, ceci est un test de voix. La narration sera lue avec cette voix et à ce rythme.",
  pt: "Olá, este é um teste de voz. A narração será lida com esta voz e neste ritmo.",
  it: "Ciao, questa è una prova vocale. La narrazione sarà letta con questa voce e a questo ritmo.",
  ar: "مرحبا، هذا اختبار للصوت. سيُقرأ السرد بهذا الصوت وبهذه السرعة.",
  ru: "Здравствуйте, это проверка голоса. Текст будет прочитан этим голосом в этом темпе.",
  ja: "こんにちは、これは音声テストです。ナレーションはこの声とこの速さで読まれます。",
};
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
  // Eski sürüm projeler (sahneler sesten önce bölünürdü): ses parçaları ve sahnelerin kelime aralıkları eski
  // gruplamadan kurulur; üretilmiş ses, görsel ve klipler korunur.
  if (!P.sesParcalari?.length && P.sahneler.some((s) => s.kb === undefined)) {
    P.sahneler = P.sahneler.filter((s) => (s.metin || "").trim());
    P.sesParcalari = sahneParcalari(P).map((parca) => parca.metin);
    let k = 0;
    for (const s of P.sahneler) { const n = sozcukler(s.metin).length; s.kb = k; s.ks = k + n; k += n; }
    P.senaryo = P.sesParcalari.join(" ");
  }
  for (const s of P.sahneler) s.negatif ??= "";
  P.genel ??= ""; P.negatif ??= ""; P.promptModel ??= ""; P.sahneUst ??= SAHNE_TAVAN_VARSAYILAN; P.plan ??= null;
  P.dublajSecili = P.diller[P.dublajSecili] ? P.dublajSecili : (P.diller[P.etkinDil] ? P.etkinDil : Object.keys(P.diller)[0] || "");
  P.isaret ||= { video: true, seslendirme: true, dublaj: !!P.diller[P.etkinDil], muzik: true, altyazi: !!P.altyazi };
  P.isaret.video = true;
  P.altyaziStil ||= { boyut: dikeyMi() ? 3.5 : 4.5, seviye: dikeyMi() ? 18 : 10, renk: "#ffffff", kalin: true, golge: true, font: "sans" };
  P.sesSeviye ??= 100;
  // Müzik: eski tek kayıt (`P.muzik`) listeye taşınır. Kayıt: { id, ad, sure, bas, bit, seviye, giris, cikis }.
  P.muzikler ||= [];
  if (P.muzik) {
    const m = P.muzik;
    P.muzikler.push({ id: "ilk", ad: m.ad, sure: m.sure, bas: 0, bit: m.sure, seviye: m.seviye ?? 20,
                      giris: m.giris ?? m.karartma ?? 1.5, cikis: m.cikis ?? m.karartma ?? 1.5 });
    P.muzikSira = ["ilk"];
    P.muzikAyar = { tekrarla: m.tekrarla ?? true, ducking: m.ducking ?? true };
    delete P.muzik;
  }
  P.muzikSira = (P.muzikSira || []).filter((id) => P.muzikler.some((m) => m.id === id));       // videoya girecekler, sırayla
  P.muzikAyar ||= { tekrarla: true, ducking: true };
  P.sesZamanlari ||= {};             // parça anahtarı → kelime zamanları (whisper); [] = dinlendi ama güvenilmez
  P.sesHiz ??= 0;
  P.sesTon ??= 0;
  for (const ad of ["gorselEn", "gorselBoy", "gorselAdim", "gorselGuidance"]) P[ad] ??= 0;      // 0 = varsayılan
  P.onAyar ??= "";
  P.gorselOnay ||= P.sahneler.some((s) => s.videoVar) ? "VERİLDİ" : "BEKLİYOR";
  for (const [ad, d] of Object.entries(P.diller)) { d.dil ||= ad; d.sesZamanlari ||= {}; }       // eski kayıt: ad = dil kodu

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
  const muzikPcm = new Map();        // çözülmüş müzikler: kimlik → { pcm, hiz } (bellekte)
  let muzikTaslak = null;            // Müzik bölümündeki form: yeni yüklenen ya da düzenlenen müzik
  const islenmis = new Map();        // hız/ton uygulanmış ses parçaları (bellekte)
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
  const dilAdi = (kod) => (kod || P.dil).toUpperCase();          // kaydın görünen adı (dublajda kayıt adı)
  const dublajDili = (ad) => P.diller[ad]?.dil || ad;

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
  function yaziAlani(etiket, deger, { yerTutucu = "", satir = 2, degisti, veri = {}, kilit = false } = {}) {
    const kutu = h("textarea", { rows: String(satir), readonly: true, placeholder: yerTutucu, value: deger || "", class: "ed-yazi", ...veri,
      onclick: () => {
        if (kilit) return;          // kilitli alan yalnızca gösterilir
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
    const gorselTanimi = cloudflare.modelTanimi(P.gorselModel), zaman = zamanlama(P);
    adim(`Görsel prompt'ları yazılıyor: 0 / ${liste.length}`, 0);
    await metinAI.promptlariYaz({
      anahtar: hesapla("gemini"), dil: P.dil, stil: P.gorselStili, genel: P.genel, model: P.promptModel,
      negatifDestekli: !!gorselTanimi.negatif, negatif: P.negatif, kelimeSiniri: gorselTanimi.kelime || 0,
      tamMetin: tamMetin(P),
      sahneler: liste.map((s) => ({ index: sira.get(s.id), metin: s.metin, ...zaman.sahneler.get(s.id) })),
      onceki: P.sahneler.map((s, i) => ({ index: i + 1, prompt: s.prompt || "" }))
        .filter((k) => k.prompt.trim() && !hedefNo.has(k.index)),
      iptal: () => is.iptal,
      bildir: (kayit, prompt, negatif) => {
        const sahne = P.sahneler[kayit.index - 1];
        sahne.prompt = prompt;
        if (negatif) sahne.negatif = negatif;
        kaydet();
        if (P.sahneler[secili] === sahne) cizDenetci();
        adim(`Görsel prompt'ları yazılıyor: ${++yazilan} / ${liste.length}`, yazilan / liste.length);
      },
    });
    return yazilan;
  }

  /** Bir ses parçasını okutup kaydeder; var olan parçanın üzerine ancak yenisi gelince yazılır. */
  async function parcayiSeslendir(gorunum, parca) {
    const ses = await hesapla("gemini")((hesap) => gemini.seslendirDayanikli({
      anahtar: hesap.gemini_key, model: gorunum.model, ses: gorunum.ses, dil: gorunum.dil, stil: P.stil, metin: parca.metin }));
    const ornek = new Int16Array(ses.pcm.length);
    for (let i = 0; i < ornek.length; i++) ornek[i] = Math.max(-32768, Math.min(32767, Math.round(ses.pcm[i] * 32767)));
    await depo.dosyalar.yaz(depo.sesAnahtari(P.id, parca.anahtar), { veri: ornek.buffer, hiz: ses.hiz });
    gorunum.sesSureleri[parca.anahtar] = ses.pcm.length / ses.hiz;
    delete gorunum.sesZamanlari[parca.anahtar];       // yeni ses: kelime zamanları yeniden çıkarılır
    islenmis.clear();
    oynatma.sesAnahtari = "";          // önizleme sesi yeniden kurulsun
    await depo.projeler.yaz(P);
  }

  /** Kelime zamanı çıkarılmamış (`zorla` ise: çıkarılamamış olanlar da) ses parçaları. */
  const hizasizParcalar = (gorunum, zorla = false) => sesPlani(gorunum).filter((p) => gorunum.sesSureleri[p.anahtar] > 0
    && (zorla ? !gorunum.sesZamanlari[p.anahtar]?.length : !Array.isArray(gorunum.sesZamanlari[p.anahtar])));
  const dinlemeIstegi = (gorunum, zorla) => hizasizParcalar(gorunum, zorla).reduce((t, p) => t + istekSayisi(gorunum.sesSureleri[p.anahtar]), 0);

  /**
   * Ses parçalarını Cloudflare whisper ile dinleyip kelime zamanlarını kaydeder: sahne geçişleri ve altyazı
   * sese oturur. Dinleme güvenilmezse parça boş diziyle işaretlenir (kendiliğinden yeniden dinlenmez, zamanı
   * tahmini kalır). Döner: `{ tamam, tahmini }` parça sayıları.
   */
  async function hizalaAdimi(kod = "", zorla = false) {
    const gorunum = gorunumAl(kod), eksik = hizasizParcalar(gorunum, zorla);
    const onek = kod ? `${dilAdi(kod)} · kelime zamanlaması` : "Kelime zamanlaması";
    let tamam = 0, tahmini = 0;
    for (const [sira, parca] of eksik.entries()) {
      durduysa();
      adim(`${onek}: ses dinleniyor ${sira + 1} / ${eksik.length}`, sira / eksik.length);
      const kayit = await depo.dosyalar.al(depo.sesAnahtari(P.id, parca.anahtar));
      if (!kayit) continue;
      const ham = new Int16Array(kayit.veri), pcm = new Float32Array(ham.length);
      for (let i = 0; i < ham.length; i++) pcm[i] = ham[i] / 32768;
      const duyulan = await hesapla("cloudflare")((hesap) => dinle({
        hesap: { hesap: hesap.cf_account_id, token: hesap.cf_token }, pcm, hiz: kayit.hiz, dil: gorunum.dil, iptal: () => is.iptal }));
      const zamanlar = kelimeZamanlari(parca.metin, duyulan, pcm.length / kayit.hiz);
      gorunum.sesZamanlari[parca.anahtar] = zamanlar || [];
      if (zamanlar) tamam++; else tahmini++;
      oynatma.sesAnahtari = "";
      await depo.projeler.yaz(P);
    }
    return { tamam, tahmini };
  }

  /** Verilen dublajın (varsayılan: asıl seslendirme) eksik ses parçalarını üretir. */
  async function sesAdimi(kod = "") {
    if (!kod && !P.sesParcalari?.length) {
      if (!P.senaryo.trim()) throw new Error("Önce Metin bölümüne anlatım metnini yaz.");
      P.sesParcalari = anlatimParcalari(P.senaryo);
    }
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
    // Metni değişen parçaların eski sesleri silinir (öbür kayıtların sesleri korunur).
    const buDil = new Set(plan.map((p) => p.anahtar));
    for (const kayit of [gorunum.sesSureleri, gorunum.sesZamanlari]) for (const anahtar of Object.keys(kayit)) if (!buDil.has(anahtar)) delete kayit[anahtar];
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
      anahtar: hesapla("gemini"), kaynakDil: P.dil, hedefDil: dublajDili(kod),
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
    P.gorselOnay = "BEKLİYOR";        // yeni kare: klipler yeniden onay bekler (masaüstündeki gibi)
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
    if (!(sahne.hareket || "").trim()) throw new Error("Bu sahnenin video prompt'u yok: önce “Video prompt'unu yaz”a bas ya da elle yaz.");
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
    if (!(sahne.prompt || "").trim()) throw new Error("Bu sahnenin görsel tarifi yok: önce “Tarif yaz”a bas ya da elle yaz.");
    const boyut = uretimBoyutu(P);
    for (let deneme = 1; ; deneme++) {
      try {
        const blob = await hesapla("cloudflare")((hesap) => cloudflare.gorselUret({
          hesap: hesap.cf_account_id, token: hesap.cf_token,
          model: P.gorselModel, prompt: gorselPromptu(P, sahne), ...boyut, adim: P.gorselAdim, guidance: P.gorselGuidance,
          negatif: (sahne.negatif || P.negatif || VARSAYILAN_NEGATIF).trim() }));
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

  /** Görsel tarifi olan sahnelerin hareket tarifini (video prompt'u) yazar. Döner: yazılan sayısı. */
  async function hareketAdimi(hedefler) {
    const sira = new Map(P.sahneler.map((s, i) => [s.id, i + 1]));
    const liste = hedefler.filter((s) => s.metin.trim() && (s.prompt || "").trim());
    if (!liste.length) return 0;
    let yazilan = 0;
    adim(`Video prompt'ları yazılıyor: 0 / ${liste.length}`, 0);
    await metinAI.hareketleriYaz({
      anahtar: hesapla("gemini"), model: P.promptModel, iptal: () => is.iptal,
      sahneler: liste.map((s) => ({ index: sira.get(s.id), metin: s.metin, prompt: s.prompt })),
      bildir: (kayit, hareket) => {
        const sahne = P.sahneler[kayit.index - 1];
        sahne.hareket = hareket;
        kaydet();
        if (P.sahneler[secili] === sahne) cizDenetci();
        adim(`Video prompt'ları yazılıyor: ${++yazilan} / ${liste.length}`, yazilan / liste.length);
      },
    });
    return yazilan;
  }

  // Video prompt'u olmayan sahnenin klibi üretilmez (genel bir hareketle doldurulmaz).
  const klipBekleyenler = () => P.sahneler.filter((s) => s.gorselVar && !s.videoVar && s.metin.trim() && (s.hareket || "").trim());
  const nolar = (liste) => liste.map((s) => P.sahneler.indexOf(s) + 1).join(", ");

  /**
   * Sahne planı (masaüstündeki "adımlama"): seslendirme bittikten sonra anlatım sahnelere bölünür. Kayıtlı plan
   * (Metin › 🎬) bu anlatıma aitse o, değilse yapay zekânın planı, o da alınamazsa içerik yedeği kullanılır;
   * sonra sahneler gerçek konuşmanın kelime zamanlarına hizalanır.
   */
  async function planAdimi() {
    const z = zamanlama(P), metin = tamMetin(P), ust = Number(P.sahneUst) || SAHNE_TAVAN_VARSAYILAN;
    adim("Sahne planı çıkarılıyor; süreler anlatımın içeriğine göre belirlenecek…");
    let ham = P.plan?.iz === planIzi(metin, ust) ? P.plan.sahneler.map((s) => ({ ...s })) : null, kaynak = "kayıtlı plan";
    if (!ham) {
      kaynak = "yapay zekâ planı";
      try {
        ham = planKur(await metinAI.sahnePlaniYaz({ anahtar: hesapla("gemini"), metin, dil: P.dil, alt: SAHNE_ALT, ust, toplamSure: z.toplam, model: P.promptModel }),
                      metin, z.toplam, SAHNE_ALT, ust);
      } catch (hata) {
        if (is.iptal) throw hata;
        ham = null;
      }
      if (!ham) { ham = icerikSahneleri(metin, z.toplam, SAHNE_ALT, ust); kaynak = "içerik yedeği (yapay zekâ planı alınamadı; her cümle bir sahne)"; }
    }
    const hizala = (plan) => sahneleriZamanla(metin, plan, z.kelimeZamanlari, z.toplam, SAHNE_ALT, ust, Math.max(sahneTavani(60, z.toplam, ust), plan.length));
    let gruplar = hizala(ham);
    if (!gruplar) { gruplar = hizala(icerikSahneleri(metin, z.toplam, SAHNE_ALT, ust)); kaynak = "içerik yedeği (plan anlatımı kapsamadı)"; }
    if (!gruplar) throw new Error("Sahne planı kurulamadı: anlatım metni okunamadı.");
    const kelimeler = sozcukler(metin);
    P.sahneler = gruplar.map(([kb, ks]) => yeniSahne(kelimeler.slice(kb, ks).join(" "), kb, ks));
    P.gorselOnay = "BEKLİYOR";
    secili = 0;
    await depo.projeler.yaz(P);
    return `${P.sahneler.length} sahne · ${kaynak}, ${z.kesin ? "gerçek sesin kelime zamanlarına hizalandı" : "zamanlar tahmini (ses dinlenemedi)"}`;
  }

  const tumunuUret = () => {
    if (is.calisiyor) return;
    if (!P.senaryo.trim() && !P.sahneler.length) { panel = "metin"; cizPanel(); return alert("Önce Metin bölümüne anlatım metnini yaz."); }
    if (!confirm("Kaldığın yerden devam edilsin mi?\n\nSırayla eksik olanlar üretilir: seslendirme → kelime zamanlaması → sahne planı → görsel"
      + (P.hareketli ? " ve video" : "") + " prompt'ları → görseller" + (Object.keys(P.diller).length ? " → dublajlar" : "") + ". Hazır olanlara dokunulmaz. Kota harcar."
      + (!P.hareketli ? "" : P.gorselOnay !== "VERİLDİ" ? "\n\nKlipler, sen görselleri onayladıktan sonra üretilir." : "\n\nGörseller onaylı: eksik klipler de üretilir."))) return;
    return calistir(tumunuIsi);
  };
  /** Görsel onayı: kareler beğenildi, klip üretimi başlasın (masaüstündeki "Görsel onayı" kapısı). */
  function gorselOnayiVer() {
    if (is.calisiyor) return;
    const n = klipBekleyenler().length;
    if (!confirm(`Görseller onaylansın mı?\n\n${n} sahnenin klibi üretilir (klip başına yaklaşık 40 sn, Hugging Face kotası). `
      + "Beğenmediğin kare varsa önce sağ panelden yenile.")) return;
    P.gorselOnay = "VERİLDİ";
    kaydet();
    return calistir(tumunuIsi);
  }
  // Masaüstündeki akışla aynı sıra: seslendirme → (altyazı) kelime zamanları → sahne planı → prompt'lar → kareler → görsel onayı → klipler.
  const tumunuIsi = async () => {
    geminiGerek();
    const ozet = [];
    let not = "";
    const cloudflareVar = havuz.hesapVar("cloudflare");
    // Kelime zamanlaması başarısız olursa üretim durmaz; zamanlar tahmini kalır.
    const hizala = async (kod = "") => {
      if (!cloudflareVar) return;
      try {
        const sonuc = await hizalaAdimi(kod);
        if (sonuc.tamam) ozet.push(`${kod ? dilAdi(kod) + " · " : ""}${sonuc.tamam} parçada kelime zamanı`);
        if (sonuc.tahmini) not += ` ${sonuc.tahmini} ses parçası net duyulamadı; o bölümde zamanlar tahminidir.`;
      } catch (hata) {
        if (is.iptal) throw hata;
        not += ` Kelime zamanlaması yapılamadı (${hata.message}); zamanlar tahminidir.`;
      }
    };
    // 1) Seslendirme: anlatımın tamamı
    const ses = await sesAdimi();
    if (ses) ozet.push(`${ses} ses parçası`);
    // 2) Kelime zamanları (altyazı ve sahne hizalaması bunlara oturur)
    await hizala();
    if (!cloudflareVar && hizasizParcalar(P).length) not += " Sahneleri ve altyazıyı sese oturtmak için Cloudflare hesabı gerekli (API sayfası); zamanlar tahminidir.";
    // 3) Sahne planı
    durduysa();
    if (!P.sahneler.length) ozet.push(await planAdimi());
    // 4) Prompt'lar: görsel ve video üretiminden önce hepsi hazır olur
    durduysa();
    const promptsuz = P.sahneler.filter((s) => !(s.prompt || "").trim());
    if (promptsuz.length) ozet.push(`${await promptAdimi(promptsuz)} görsel prompt'u`);
    const tarifsiz = P.sahneler.filter((s) => s.metin.trim() && !(s.prompt || "").trim());
    if (tarifsiz.length) not += ` Sahne ${nolar(tarifsiz)}: görsel prompt'u yazılamadı (Gemini içerik filtresi), bu yüzden görseli üretilmedi. Prompt'u sağ panelden elle yaz, sonra yeniden devam et.`;
    if (P.hareketli) {
      durduysa();
      const hareketsiz = P.sahneler.filter((s) => !(s.hareket || "").trim() && (s.prompt || "").trim() && s.metin.trim());
      if (hareketsiz.length) { const n = await hareketAdimi(hareketsiz); if (n) ozet.push(`${n} video prompt'u`); }
    }
    // 5) Bütün kareler (kliplerden önce)
    const gorselsiz = P.sahneler.filter((s) => !s.gorselVar && (s.prompt || "").trim());
    if (gorselsiz.length && cloudflareVar) ozet.push(`${await gorselAdimi(gorselsiz)} görsel`);
    if (gorselsiz.length && !cloudflareVar) not += " Görseller için Cloudflare hesabı yok (API sayfası); galeriden ekleyebilirsin.";
    for (const kod of Object.keys(P.diller)) {          // dublajların eksik çevirisi, sesi ve kelime zamanları
      durduysa();
      const n = (await ceviriAdimi(kod)) + (await sesAdimi(kod));
      if (n) ozet.push(`${dilAdi(kod)} dublajı`);
      await hizala(kod);
    }
    const bitir = (ek = "") => (ozet.length ? `Üretildi: ${ozet.join(", ")}.` : ek ? "" : "Her şey zaten hazır.") + ek + not;
    if (!P.hareketli) return bitir();
    const promptsuzKlip = P.sahneler.filter((s) => s.gorselVar && !s.videoVar && s.metin.trim() && !(s.hareket || "").trim());
    if (promptsuzKlip.length) not += ` Sahne ${nolar(promptsuzKlip)}: video prompt'u yazılamadı (Gemini içerik filtresi), bu yüzden klibi üretilmeyecek. Sağ panelden “Video prompt'unu yaz”ı dene ya da elle yaz.`;
    // 6) Görsel onayı → 7) klipler
    const klipsiz = klipBekleyenler();
    if (!klipsiz.length) return bitir();
    if (P.gorselOnay !== "VERİLDİ") {
      panel = "uretim";
      return bitir(` ${klipsiz.length} klip GÖRSEL ONAYI bekliyor: kareleri incele, beğenmediğini sağ panelden yenile, sonra “Görselleri onayla”ya bas.`);
    }
    if (!havuz.hesapVar("huggingface")) return bitir(" Klipler için Hugging Face hesabı yok: API sayfasından ekle.");
    ozet.push(`${await klipAdimi(klipsiz)} klip`);
    return bitir();
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
  /**
   * Görünümün konuşma sesi: parçalar sırayla birleştirilir, konuşma hızı ve ton uygulanır. "Sahnelere göre
   * hizalı" dublajda her sahnenin sözü kendi sahnesinin başına yerleştirilir (sığmıyorsa hızlandırılır).
   */
  async function sesiTopla(gorunum) {
    const plan = sesPlani(gorunum), tempo = hizCarpani(P), ton = Number(P.sesTon) || 0;
    const parcalar = [];
    let hiz = null;
    for (const p of plan) {
      const kayit = await depo.dosyalar.al(depo.sesAnahtari(P.id, p.anahtar));
      if (!kayit) throw new Error("Ses dosyası eksik: “Kaldığın yerden devam et”e bas.");
      if (hiz !== null && kayit.hiz !== hiz) throw new Error("Ses parçalarının örnekleme hızları farklı; sesi yeniden üret.");
      hiz = kayit.hiz;
      const onbellek = `${p.anahtar}:${tempo}:${ton}`;
      if (!islenmis.has(onbellek)) {
        const ham = new Int16Array(kayit.veri);
        let pcm = new Float32Array(ham.length);
        for (let i = 0; i < ham.length; i++) pcm[i] = ham[i] / 32768;
        if (tempo !== 1 || ton) pcm = hizTon(pcm, hiz, tempo, ton);
        if (islenmis.size > 40) islenmis.clear();
        islenmis.set(onbellek, pcm);
      }
      parcalar.push(islenmis.get(onbellek));
    }
    if (!parcalar.length) return null;
    const pcm = new Float32Array(parcalar.reduce((t, p) => t + p.length, 0));
    let konum = 0;
    for (const p of parcalar) { pcm.set(p, konum); konum += p.length; }
    const z = zamanlama(gorunum);
    if (!z.hiza) return { pcm, hiz };
    const hizali = new Float32Array(Math.round(z.toplam * hiz));
    for (const h of z.hiza.values()) {
      let dilim = pcm.subarray(Math.round(h.kaynakBas * hiz), Math.round(h.kaynakBit * hiz));
      if (h.tempo > 1.004) dilim = hizTon(dilim, hiz, h.tempo, 0);
      const bas = Math.round(h.hedefBas * hiz);
      if (bas < hizali.length) hizali.set(dilim.subarray(0, hizali.length - bas), bas);
    }
    return { pcm: hizali, hiz };
  }

  async function muzigiCoz(m) {
    if (!muzikPcm.has(m.id)) {
      const kayit = await depo.dosyalar.al(depo.muzikAnahtari(P.id, m.id));
      if (!kayit) return null;
      muzikPcm.set(m.id, await dosyadanSes(kayit.veri.slice(0)));
    }
    return muzikPcm.get(m.id);
  }
  /** Videoya girecek müzikler, işaretlendikleri sırayla. */
  const seciliMuzikler = () => P.muzikSira.map((id) => P.muzikler.find((m) => m.id === id)).filter(Boolean);
  const muzikOzeti = () => seciliMuzikler().map((m) => `${m.ad} · %${m.seviye}`).join(" → ");

  /** `kod` kaydının sesi: `konusmali` ise konuşma, `muzikli` ise seçili müzikler karışır. Hiçbiri yoksa `null`. */
  async function sesKur(kod, konusmali, muzikli) {
    const gorunum = gorunumAl(kod), z = zamanlama(gorunum);
    const konusma = konusmali && z.sesDurumu === "tam" ? await sesiTopla(gorunum) : null;
    const muzikler = [];
    if (muzikli) {
      for (const m of seciliMuzikler()) {
        const cozulen = await muzigiCoz(m).catch(() => null);
        if (cozulen) muzikler.push({ ...m, ...cozulen });
      }
    }
    return karistir({ konusma, muzikler, sure: z.toplam, konusmaSeviyesi: P.sesSeviye, ducking: P.muzikAyar.ducking, tekrarla: P.muzikAyar.tekrarla });
  }
  const onizlemeSesi = () => sesKur(onizlemeDili(), onizlemeDili() ? true : goz.seslendirme, goz.muzik && seciliMuzikler().length > 0);
  const sesImzasi = () => { const g = G(); return JSON.stringify([onizlemeDili(), goz.seslendirme, goz.muzik, sesPlani(g).map((p) => p.anahtar),
    seciliMuzikler(), P.muzikAyar, P.sesSeviye, P.sesHiz, P.sesTon, !!g.hizali, zamanlama(g).toplam]); };
  // ── Önizleme ve oynatma ─────────────────────────────────────────────────────
  const altyaziKutusu = h("div", { class: "ed-altyazi", hidden: true });
  function altyaziStiliniUygula() {
    const s = P.altyaziStil, boy = tuval.getBoundingClientRect().height || 200;
    Object.assign(altyaziKutusu.style, { bottom: `${s.seviye}%`, color: s.renk, fontWeight: s.kalin ? "700" : "500",
      fontSize: `${Math.max(7, boy * s.boyut / 100)}px`, fontFamily: YAZI_TIPLERI[s.font] || YAZI_TIPLERI.sans,
      textShadow: s.golge ? "0 0 3px #000, 0 1px 4px #000" : "0 0 2px #000" });
  }
  /** `bloklar`: bütün videonun altyazı blokları (`tumBloklar`); `t` anındaki blok önizlemede gösterilir. */
  function altyaziGoster(bloklar, t) {
    const blok = goz.altyazi ? bloklar.find((b) => t >= b.bas && t < b.bit) : null;
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
    const bloklar = tumBloklar(gorunum, z);
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
      altyaziGoster(bloklar, t);
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
    altyaziGoster(tumBloklar(gorunum, z), t);
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
      return [h("h2", null, "Sahneler"),
              aciklama("Henüz sahne yok. Sahneler seslendirmeden sonra kurulur: Metin bölümüne anlatımı yaz, sonra “Kaldığın yerden devam et”e bas. "
                + "Önce anlatım seslendirilir, sonra yapay zekâ onu sahnelere böler ve her sahneyi sesteki yerine oturtur."),
              h("button", { class: "dugme kucuk", onclick: () => { panel = "metin"; cizPanel(); } }, "Metne git")];
    }
    return [
      h("h2", null, `Sahneler (${P.sahneler.length})`),
      h("div", { class: "ed-izgara" }, P.sahneler.map((s, i) => h("button", {
        class: "ed-kare" + (i === secili ? " secili" : ""), "data-sira": i, "data-kucuk": s.id,
        style: kucukler.get(s.id) ? `background-image:url("${kucukler.get(s.id).adres}")` : null,
        "aria-label": `Sahne ${i + 1}`, onclick: () => sec(i),
      }, h("span", null, String(i + 1)), P.hareketli && s.videoVar ? h("i", null, "▶") : null))),
    ];
  }

  function ayarlarPaneli() {
    const tanim = cloudflare.modelTanimi(P.gorselModel), v = varsayilanGorselBoyutu(P), boyut = uretimBoyutu(P);
    // Elle değişiklik ön ayarı bırakır; seçim kutusu da "elle ayarla"ya döner.
    const elle = (degisiklik) => { Object.assign(P, degisiklik, { onAyar: "" }); kaydet(); const kutu = panelKutusu.querySelector("[data-on-ayar] select"); if (kutu) kutu.value = ""; };
    const adimAlani = tanim.alanlar.find((a) => a.tur === "adim"), guidanceAlani = tanim.alanlar.find((a) => a.tur === "guidance");
    return [
      h("h2", null, "Ayarlar"),
      grup("Çıktı biçimi · platform ve tuval ölçüsü",
        h("div", { "data-on-ayar": "" }, secim("Ön ayar · tek seçimle hazır kurulum", [["", "— elle ayarla —"], ...ON_AYARLAR.map((o) => [o.kimlik, o.ad])], P.onAyar, (k) => {
          const o = ON_AYARLAR.find((x) => x.kimlik === k);
          if (!o) { P.onAyar = ""; kaydet(); return; }
          Object.assign(P, { onAyar: k, boyut: o.boyut, gorselModel: o.model, gorselAdim: o.adim, gorselGuidance: o.guidance, gorselEn: 0, gorselBoy: 0 });
          Object.assign(P.altyaziStil, dikeyMi() ? { boyut: 3.5, seviye: 18 } : { boyut: 4.5, seviye: 10 });
          ayarGuncelle({ boyut: P.boyut, gorselModel: P.gorselModel });
          kaydet();
          ciz();
        })),
        secim("Hedef biçim", BOYUTLAR, P.boyut, (b) => { elle({ boyut: b, gorselEn: 0, gorselBoy: 0 }); ayarGuncelle({ boyut: b }); ciz(); }),
        aciklama("Ön ayar; biçimi, görsel modelini, adımı ve altyazının yerini birlikte kurar. Üretilmiş görseller değişmez.")),
      grup("Görsel ayarları",
        secim("Model", cloudflare.MODELLER.map((m) => [m.kimlik, m.ad]), P.gorselModel, (m) => {
          elle({ gorselModel: m, gorselAdim: 0, gorselGuidance: 0 });
          ayarGuncelle({ gorselModel: m });
          cizPanel();
        }),
        tanim.sabitBoyut ? aciklama("Bu model 1024 × 1024 sabit üretir; boyut ayarlanamaz.") : [
          aralikSatiri("Genişlik (px)", cloudflare.BOYUT_ALT, cloudflare.BOYUT_UST, tanim.adim, boyut.en, (d) => elle({ gorselEn: d === v.en ? 0 : d })),
          aralikSatiri("Yükseklik (px)", cloudflare.BOYUT_ALT, cloudflare.BOYUT_UST, tanim.adim, boyut.boy, (d) => elle({ gorselBoy: d === v.boy ? 0 : d })),
          aciklama(`Bu biçimin varsayılanı ${v.en} × ${v.boy}. Boyut ${tanim.adim}'in katına yuvarlanır.`)],
        adimAlani ? aralikSatiri("Adım (steps)", adimAlani.min, adimAlani.max, 1, P.gorselAdim || adimAlani.varsayilan, (d) => elle({ gorselAdim: d })) : null,
        guidanceAlani ? aralikSatiri("Guidance (CFG)", guidanceAlani.min, guidanceAlani.max, 0.5, P.gorselGuidance || guidanceAlani.varsayilan, (d) => elle({ gorselGuidance: d })) : null,
        tanim.alanlar.length ? null : aciklama("Bu model adım ve guidance almaz."),
        aciklama("Bu ayarlar bundan sonra üretilen görsellere uygulanır.")),
      grup("Video · hareket",
        onay("Görselleri hareketlendir (LTX)", P.hareketli, (d) => { P.hareketli = d; kaydet(); ciz(); }),
        aciklama("Her görsel birkaç saniyelik klibe çevrilir; klip başına yaklaşık 40 sn sürer ve Hugging Face kotasından düşer. Klipler, sen görselleri onayladıktan sonra üretilir.")),
    ];
  }

  function uretimPaneli() {
    const z = zamanlama(P), n = P.sahneler.length;
    const satir = (ad, biten, toplam) => h("div", { class: "iz-kayit" }, h("span", null, ad),
      h("span", { class: "ekli" + (toplam && biten >= toplam ? "" : " eksik") }, toplam ? `${biten} / ${toplam}` : "—"));
    const yazi = (ad, deger, tamam, veri = {}) => h("div", { class: "iz-kayit" }, h("span", null, ad), h("span", { class: "ekli" + (tamam ? "" : " eksik"), ...veri }, deger));
    const onayli = P.gorselOnay === "VERİLDİ", bekleyen = klipBekleyenler().length;
    return [
      h("h2", null, "Üretim"),
      grup("Durum · üretim sırasıyla",
        satir("1 · Seslendirme", z.parcaSayisi - z.eksik, z.parcaSayisi),
        satir("2 · Kelime zamanları (altyazı)", z.zamanliParca, z.parcaSayisi),
        yazi("3 · Sahne planı", n ? `${n} sahne` : "—", n > 0, { "data-plan-durum": "" }),
        satir("4 · Görsel prompt'ları", P.sahneler.filter((s) => (s.prompt || "").trim()).length, n),
        P.hareketli ? satir("4 · Video prompt'ları", P.sahneler.filter((s) => (s.hareket || "").trim()).length, n) : null,
        satir("5 · Görseller", P.sahneler.filter((s) => s.gorselVar).length, n),
        P.hareketli ? yazi("6 · Görsel onayı", onayli ? "VERİLDİ" : "BEKLİYOR", onayli, { "data-onay": "" }) : null,
        P.hareketli ? satir("7 · Klipler", P.sahneler.filter((s) => s.videoVar).length, P.sahneler.filter((s) => s.gorselVar).length) : null,
        Object.keys(P.diller).map((kod) => { const d = zamanlama(dilGorunumu(P, kod)); return satir(`${dilAdi(kod)} dublajı`, d.parcaSayisi - d.eksik, d.parcaSayisi); })),
      h("div", { class: "dugme-satiri" },
        h("button", { class: "dugme birincil genis-dugme is-dugme", disabled: is.calisiyor, onclick: tumunuUret }, "▶ Kaldığın yerden devam et")),
      P.hareketli ? h("div", { class: "dugme-satiri" }, onayli
        ? h("button", { class: "dugme kucuk is-dugme", disabled: is.calisiyor, onclick: () => { P.gorselOnay = "BEKLİYOR"; kaydet(); cizPanel(); } }, "Görsel onayını geri al")
        : h("button", { class: "dugme genis-dugme is-dugme", "data-onayla": "", disabled: is.calisiyor || !bekleyen, onclick: gorselOnayiVer },
            bekleyen ? `✓ Görselleri onayla · ${bekleyen} klibi üret` : "✓ Görselleri onayla (önce görseller üretilmeli)")) : null,
      aciklama("Önce anlatımın tamamı seslendirilir ve kelime zamanları çıkarılır. Sonra yapay zekâ anlatımı sahnelere böler; her sahne sesteki yerine oturtulur. "
        + "Ardından prompt'lar yazılır ve görseller üretilir. Yarıda kalırsa kaldığı yerden sürer."
        + (P.hareketli ? " Kareler bitince durur ve görsel onayını bekler; onaydan sonra yenilenen kare yeniden onay ister." : "")),
    ];
  }

  /** Anlatımı, sesi ve ondan türeyen her şeyi (sahneler, görseller, klipler, dublajlar) siler; müzikler kalır. */
  async function anlatimiSifirla() {
    oynatmayiDurdur();
    for (const tur of ["gorsel", "video", "ses"]) await depo.dosyalar.onekSil(`${P.id}:${tur}:`);
    Object.assign(P, { sahneler: [], sesSureleri: {}, sesZamanlari: {}, sesParcalari: null, plan: null, diller: {}, dublajSecili: "", gorselOnay: "BEKLİYOR" });
    P.isaret.dublaj = goz.dublaj = false;
    gozYaz();
    islenmis.clear();
    kucukler.clear();
    klipler.clear();
    secili = 0;
    kaydet();
    kaydet.simdi();
    ciz();
  }

  function metinPaneli() {
    // Masaüstündeki gibi: anlatım seslendirildikten sonra metin kilitlenir (sahneler sesin kelimelerine bağlıdır).
    const sesli = Object.values(P.sesSureleri).some((s) => s > 0) || P.sahneler.length > 0;
    const sayac = h("small", { class: "alan-not soluk" });
    const sayaciYaz = () => { const n = sozcukler(P.senaryo).length; sayac.textContent = n ? `${n} kelime · ~${Math.round(n / KELIME_HIZI)} sn seslendirme` : ""; };
    sayaciYaz();
    const ust = Number(P.sahneUst) || SAHNE_TAVAN_VARSAYILAN;
    const planGecerli = !!P.plan && P.plan.iz === planIzi(tamMetin(P), ust);
    return [
      h("h2", null, "Metin"),
      alan("Proje adı", "ad", "input", { type: "text", degisti: () => { adEtiketi.textContent = P.ad; kabuk.baslik(P.ad, true); } }),
      sesli ? null : h("details", { class: "katlanir" },
        h("summary", null, "✍ Anlatımı yapay zekâ yazsın · konu · süre"),
        yaziAlani("Konu", P.konu, { yerTutucu: "Örn. Vatoz balıkları bir nehri nasıl ele geçirdi?", degisti: (v) => { P.konu = v; kaydet(); } }),
        alan("Hedef süre", "hedefSaniye", "select", {}, secenekler(SURELER.map((s) => [String(s), s < 60 ? `${s} sn` : `${s / 60} dk`]), String(P.hedefSaniye))),
        h("button", { class: "dugme kucuk is-dugme", disabled: is.calisiyor, onclick: () => {
          if (P.senaryo.trim() && !confirm("Mevcut anlatım metninin üzerine yazılsın mı?")) return;
          calistir(async () => {
            adim("Gemini anlatımı yazıyor…");
            P.senaryo = await metinAI.senaryoYaz({ anahtar: hesapla("gemini"), konu: P.konu, dil: P.dil, saniye: Number(P.hedefSaniye) || 60 });
            P.sesParcalari = null;
            return "Anlatım yazıldı. Okuyup düzelt, sonra “Kaldığın yerden devam et”e bas.";
          });
        } }, "Anlatımı Gemini yazsın"),
        aciklama("Dil, Seslendirme bölümünden seçilir.")),
      yaziAlani("Anlatım metni (seslendirilecek yazı)", P.senaryo, { yerTutucu: "Videonun anlatım metnini buraya yapıştır…", satir: 6, kilit: sesli, veri: { "data-senaryo": "" },
        degisti: (v) => { P.senaryo = v; P.sesParcalari = null; kaydet(); sayaciYaz(); cizUst(); } }),
      sayac,
      sesli ? [aciklama("Bu projede anlatım seslendirildi; metin değiştirilemez (sahneler sesin kelimelerine bağlıdır). Yeni metin için yeni proje aç ya da aşağıdaki düğmeyle bu projeyi baştan kur."),
        h("button", { class: "dugme kucuk tehlike is-dugme", disabled: is.calisiyor, onclick: () => {
          if (confirm("Anlatım metni değiştirilsin mi?\n\nBu projenin sesi, sahneleri, görselleri, klipleri ve dublajları SİLİNİR; müzikler ve ayarlar kalır. Geri alınamaz.")) anlatimiSifirla();
        } }, "Metni değiştir · projeyi baştan kur")] : null,
      grup("Prompt · genel brief, görsel stil ve negatif prompt",
        yaziAlani("Genel video prompt'u (İngilizce)", P.genel, { satir: 3, veri: { "data-genel": "" },
          yerTutucu: "A lone astronaut drifting through a decaying orbital station; cold cyan light, slow dolly moves, 35mm anamorphic, quiet awe",
          degisti: (v) => { P.genel = v; kaydet(); } }),
        aciklama("Videonun tamamına hâkim çerçeve: konu, karakterler, mekân, atmosfer ve kamera dili. Boş bırakırsan anlatımdan türetilir."),
        yaziAlani("Görsel stil katmanı (İngilizce)", P.gorselStili, { degisti: (v) => { P.gorselStili = v; kaydet(); } }),
        aciklama("Her karenin prompt'una eklenir; fotoğraf / tablo farkını belirler."),
        yaziAlani("Negatif prompt (opsiyonel)", P.negatif, { yerTutucu: VARSAYILAN_NEGATIF, degisti: (v) => { P.negatif = v; kaydet(); } }),
        aciklama(cloudflare.modelTanimi(P.gorselModel).negatif
          ? "Yapay zekâ her sahne için kendi negatif prompt'unu yazar; yazamazsa bu değer kullanılır."
          : "Seçili görsel modeli (FLUX) negatif prompt almaz; bu alan negatif destekleyen bir modele geçersen kullanılır.")),
      grup("Prompt yapay zekâsı",
        aciklama("Anlatımı sahnelere bölen ve sahne prompt'larını yazan servis: Gemini. Seçili model yoğunsa sıradaki model denenir."),
        secim("Prompt modeli", [["", "Otomatik"], ...metinAI.MODELLER.map((m) => [m, m])], P.promptModel, (v) => { P.promptModel = v; kaydet(); })),
      grup("Sahne süresi",
        aralikSatiri("Sahne süresi · üst sınır (saniye)", SAHNE_TAVAN_ALT, SAHNE_UST, 0.5, ust, (v) => { P.sahneUst = v; kaydet(); cizPanel(); }),
        aciklama("Bir sahnenin alabileceği en uzun süre. Sahne süreleri anlatıma göre bu tavanın altında değişir (en kısa sahne 1 sn). 6 sn üstü kesitlerde tek görselden üretilen klipte hareket tükenip kare donuklaşabilir."
          + (P.sahneler.length ? " Sahneler kuruldu; yeni tavan bu projede uygulanmaz." : "")),
        h("button", { class: "dugme genis-dugme is-dugme", "data-plan": "", disabled: is.calisiyor || !P.senaryo.trim() || P.sahneler.length > 0, onclick: () => calistir(async () => {
          geminiGerek();
          const metin = tamMetin(P), sure = tahminiSure(metin);
          adim("Sahne planı çıkarılıyor…");
          const ham = planKur(await metinAI.sahnePlaniYaz({ anahtar: hesapla("gemini"), metin, dil: P.dil, alt: SAHNE_ALT, ust, toplamSure: sure, model: P.promptModel }), metin, sure, SAHNE_ALT, ust);
          if (!ham) throw new Error("Yapay zekânın planı okunamadı. Yeniden dene; plan kaydetmesen de sahneler üretim sırasında kurulur.");
          P.plan = { iz: planIzi(metin, ust), sahneler: ham.map((s) => ({ text: s.text, saniye: s.saniye })) };
          return `Sahne planı kaydedildi: ${ham.length} sahne · toplam ${ham.reduce((a, s) => a + s.saniye, 0)} sn (tahmini süreyle). Üretimde gerçek sese hizalanır.`;
        }) }, "🎬 Video sürelerini yapay zekâ ayarlasın"),
        planGecerli ? [
          aciklama("Kayıtlı sahne planı var: üretimde yapay zekâya yeniden sorulmaz, sahneler bununla kurulur ve gerçek sese hizalanır."),
          h("ol", { class: "plan-rapor", "data-plan-rapor": "" }, P.plan.sahneler.map((s) => h("li", null, h("b", null, `${s.saniye} sn`), ` · ${s.text}`)))] : null),
    ];
  }
  const yokPaneli = (baslik, metin) => () => [h("h2", null, baslik), aciklama(metin)];

  const metinKutusu = (etiket, deger, yerTutucu, yaz) => alanKutu(etiket,
    h("input", { type: "text", value: deger || "", placeholder: yerTutucu, autocomplete: "off", oninput: (o) => yaz(o.target.value) }));
  /** Sesi dinletir: `oynatici` gizliyse açılır. */
  function dinlet(oynatici, ses) {
    const adres = URL.createObjectURL(wavBlob(ses.pcm, ses.hiz));
    adresler.add(adres);
    oynatici.src = adres;
    oynatici.hidden = false;
    oynatici.play().catch(() => {});
  }
  // Hız, ton ve hizalama zamanlamayı değiştirir; panel yeniden çizilmez (kaydırma yeri korunur).
  const zamanDegisti = () => { islenmis.clear(); oynatmayiDurdur(); kaydet(); cizUst(); cizZaman(); cizDenetci(); zamaniYaz(); };
  let testSesi = "";                 // "Sesi test et" ile üretilen son deneme (kaydedilmez)

  function seslendirmePaneli() {
    const z = zamanlama(P);
    const oynatici = h("audio", { controls: true, class: "dinle", hidden: true });
    return [
      h("h2", null, "Seslendirme"),
      grup("Ses servisi ve ayarları",
        alan("Dil", "dil", "select", { degisti: tercih("dil") }, secenekler(Object.keys(gemini.DILLER).map((k) => [k, `${k.toUpperCase()} · ${gemini.DILLER[k]}`]), P.dil)),
        alan("Gemini sesi", "ses", "select", { degisti: tercih("ses") }, secenekler(gemini.SESLER.map((s) => [s, s]), P.ses)),
        alan("Gemini modeli", "model", "select", { degisti: tercih("model") }, secenekler(gemini.MODELLER.map((m) => [m, m]), P.model)),
        yaziAlani("Anlatım üslubu (İngilizce yaz)", P.stil, { degisti: (v) => { P.stil = v; kaydet(); } }),
        aciklama("Ses, model ya da üslup değişirse seslendirme yeniden üretilir (üslup dublajları da etkiler)."),
        aralikSatiri("Konuşma hızı (%)", -30, 30, 5, P.sesHiz, (v) => { P.sesHiz = v; zamanDegisti(); }),
        aralikSatiri("Ton (yarım ton)", -6, 6, 0.5, P.sesTon, (v) => { P.sesTon = v; zamanDegisti(); }),
        aciklama("Hız ve ton, üretilmiş sese sonradan uygulanır: değiştirince yeniden üretim gerekmez, kota harcamaz. Dublajlara da uygulanır."),
        aralikSatiri("Ses seviyesi · videodaki seslendirme (%)", 25, 400, 5, P.sesSeviye, (v) => { P.sesSeviye = v; kaydet(); })),
      grup("Sesi test et · kaydedilmez",
        aciklama("Seçili ses, model, üslup, hız ve tonla kısa bir deneme cümlesi okur. 1 Gemini seslendirme isteği harcar; projeye yazılmaz."),
        h("button", { class: "dugme kucuk is-dugme", "data-ses-test": "", disabled: is.calisiyor, onclick: () => calistir(async () => {
          geminiGerek();
          adim("Test sesi üretiliyor…");
          const ses = await hesapla("gemini")((hesap) => gemini.seslendir({
            anahtar: hesap.gemini_key, model: P.model, ses: P.ses, dil: P.dil, stil: P.stil, metin: TEST_CUMLELERI[P.dil] || TEST_CUMLELERI.en }));
          if (testSesi) { URL.revokeObjectURL(testSesi); adresler.delete(testSesi); }
          testSesi = URL.createObjectURL(wavBlob(hizTon(ses.pcm, ses.hiz, hizCarpani(P), Number(P.sesTon) || 0), ses.hiz));
          adresler.add(testSesi);
          return "Test sesi hazır: Seslendirme bölümünde dinle.";
        }) }, "🔊 Sesi test et"),
        testSesi ? h("audio", { controls: true, class: "dinle", src: testSesi, "data-test-sesi": "" }) : null),
      grup("Seslendirme",
        h("p", { class: "soluk aciklama" }, !z.parcaSayisi ? "Metin yok." : z.sesDurumu === "tam" ? `Ses hazır · ${sureYaz(z.toplam)}`
          : z.sesDurumu === "eksik" ? `Ses eksik: ${z.eksik} / ${z.parcaSayisi} parça üretilecek` : `Ses yok · ${z.parcaSayisi} istek · tahmini ${sureYaz(z.toplam)}`),
        z.sesDurumu === "tam" ? h("button", { class: "dugme kucuk", onclick: async () => {
          const ses = await sesiTopla(P).catch(() => null);
          if (ses) dinlet(oynatici, ses);
        } }, "Dinle") : null,
        oynatici,
        tekIs("Seslendirmeyi üret", async () => {
          geminiGerek();
          const n = await sesAdimi();
          return n ? `${n} ses parçası üretildi.` : "Ses zaten hazır.";
        }, "dugme birincil genis-dugme is-dugme")),
    ];
  }

  // Dublaj formu bölüm kapanıp açılınca korunur.
  const dublajForm = { dil: "", ses: P.ses, model: P.model, hizali: false, isim: "" };
  function dublajPaneli() {
    const eklenebilir = Object.keys(gemini.DILLER).filter((k) => k !== P.dil);
    const f = dublajForm;
    if (!eklenebilir.includes(f.dil)) f.dil = eklenebilir.find((k) => !Object.values(P.diller).some((d) => d.dil === k)) || eklenebilir[0];
    const adlar = Object.keys(P.diller);
    return [
      h("h2", null, "Dublaj"),
      grup("Dublaj üret ve kaydet · dil · ses · çeviri",
        secim("Hedef dil", eklenebilir.map((k) => [k, `${k.toUpperCase()} · ${gemini.DILLER[k]}`]), f.dil, (v) => { f.dil = v; }),
        onay("Sahnelere göre hizala", f.hizali, (v) => { f.hizali = v; }),
        aciklama("Açıkken her sahnenin sözü kendi sahnesinde başlar ve video asıl seslendirmenin süresinde kalır; söz sığmazsa biraz hızlandırılır. Kapalıyken dublaj kendi süresiyle akar."),
        secim("Gemini modeli", gemini.MODELLER.map((m) => [m, m]), f.model, (v) => { f.model = v; }),
        secim("Gemini sesi", gemini.SESLER.map((s) => [s, s]), f.ses, (v) => { f.ses = v; }),
        metinKutusu("Dublaj adı (opsiyonel)", f.isim, "ör. en-charon · boşsa dil kodu", (v) => { f.isim = v; }),
        aciklama("Ad verirsen aynı dile birden çok dublaj kaydedebilirsin. Aynı adla kaydetmek kaydı günceller. Çeviri (12 sahnede 1 istek) ve ses Gemini kotasından düşer."),
        h("button", { class: "dugme birincil genis-dugme is-dugme", "data-dublaj-kaydet": "", disabled: is.calisiyor || !P.sahneler.length, onclick: () => {
          const ad = dublajAdi(f.isim, f.dil), eski = P.diller[ad];
          if (eski && (eski.dil !== f.dil || (eski.ses || P.ses) !== f.ses || (eski.model || P.model) !== f.model)
              && !confirm(`“${ad.toUpperCase()}” dublajı güncellensin mi?\n\nDili, sesi ya da modeli değişiyor: sesi yeniden üretilir (Gemini kotası).`)) return;
          calistir(async () => {
            geminiGerek();
            const kayit = P.diller[ad] ||= { metinler: {}, sesSureleri: {}, sesZamanlari: {} };
            if (kayit.dil && kayit.dil !== f.dil) kayit.metinler = {};
            // Aynı dilde başka bir dublaj varsa çevirisi kullanılır (çeviri kotası harcanmaz).
            const ayniDil = Object.entries(P.diller).find(([a, d]) => a !== ad && d.dil === f.dil);
            if (ayniDil && !Object.keys(kayit.metinler).length) kayit.metinler = { ...ayniDil[1].metinler };
            Object.assign(kayit, { dil: f.dil, ses: f.ses, model: f.model, hizali: f.hizali });
            const cevrilen = await ceviriAdimi(ad);
            durduysa();
            const ses = await sesAdimi(ad);
            let not = "";
            if (havuz.hesapVar("cloudflare")) {
              try { await hizalaAdimi(ad); } catch (hata) { if (is.iptal) throw hata; not = ` Kelime zamanlaması yapılamadı (${hata.message}).`; }
            }
            P.dublajSecili = ad;
            f.isim = "";
            return `${dilAdi(ad)} dublajı kaydedildi: ${cevrilen} sahne çevrildi, ${ses} ses parçası üretildi.` + not;
          });
        } }, "Dublajı kaydet")),
      grup("Kayıtlı dublajlar · videoya ekle",
        adlar.length ? h("div", { class: "kayit-listesi" }, adlar.map((ad) => {
          const d = P.diller[ad], gorunum = dilGorunumu(P, ad), z = zamanlama(gorunum);
          const oynatici = h("audio", { controls: true, class: "dinle", hidden: true });
          const radyo = h("input", { type: "radio", name: "dublaj-secim", onchange: () => dublajSec(ad) });
          radyo.checked = P.dublajSecili === ad;
          const ozet = [ad === d.dil ? "" : d.dil.toUpperCase(), d.ses || P.ses, d.hizali ? "sahnelere hizalı" : "",
            z.sesDurumu === "tam" ? "ses ✓ · " + sureYaz(z.toplam) : z.sesDurumu === "eksik" ? "ses eksik" : "ses yok"].filter(Boolean).join(" · ");
          return h("div", { class: "kayit" + (P.dublajSecili === ad ? " secili" : ""), "data-dublaj": ad },
            h("label", { class: "kayit-sec" }, radyo, h("b", null, dilAdi(ad)), h("span", { class: "soluk" }, ` · ${ozet}`)),
            oynatici,
            h("div", { class: "kayit-islem" },
              z.sesDurumu === "tam" ? h("button", { class: "dugme kucuk", onclick: async () => {
                const ses = await sesiTopla(gorunum).catch(() => null);
                if (ses) dinlet(oynatici, ses);
              } }, "dinle") : null,
              h("button", { class: "dugme kucuk", onclick: () => { d.hizali = !d.hizali; zamanDegisti(); cizPanel(); } }, d.hizali ? "hizayı kapat" : "sahnelere hizala"),
              h("button", { class: "dugme kucuk", onclick: () => srtIndir(ad) }, "altyazı"),
              h("button", { class: "dugme kucuk tehlike", "aria-label": `${dilAdi(ad)} dublajını sil`, onclick: async () => {
                if (!confirm(`${dilAdi(ad)} dublajı (çeviri ve ses) silinsin mi?`)) return;
                delete P.diller[ad];
                if (P.dublajSecili === ad) P.dublajSecili = Object.keys(P.diller)[0] || "";
                if (!dublajVar()) { P.isaret.dublaj = goz.dublaj = false; gozYaz(); }
                await artikSesleriSil();
                kaydet();
                ciz();
              } }, "🗑")));
        })) : aciklama("Kayıtlı dublaj yok: dil seç ve Dublajı kaydet'e bas."),
        adlar.length ? h("div", { class: "dugme-satiri" },
          P.isaret.dublaj && dublajVar()
            ? h("button", { class: "dugme tehlike", onclick: () => { P.isaret.dublaj = goz.dublaj = false; gozYaz(); kaydet(); ciz(); } }, "Dublajı videodan çıkar")
            : h("button", { class: "dugme birincil", disabled: !dublajVar(), onclick: () => isaretle("dublaj", true) }, "Seçili dublajı videoya ekle")) : null,
        adlar.length ? aciklama(P.isaret.dublaj && dublajVar()
          ? `Videoda ${dilAdi(P.dublajSecili)} dublajı var: konuşma sesi ve altyazı bu kayda göre kurulur.`
          : "Videoda asıl seslendirme var.") : null),
    ];
  }

  function muzikSec(id, isaretli) {
    P.muzikSira = P.muzikSira.filter((x) => x !== id);
    if (isaretli) P.muzikSira.push(id);
    P.isaret.muzik = P.muzikSira.length > 0;
    if (isaretli) goz.muzik = true;
    gozYaz();
    oynatmayiDurdur();
    kaydet();
    ciz();
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
        const sure = cozulen.pcm.length / cozulen.hiz, id = kimlik();
        muzikPcm.set(id, cozulen);
        muzikTaslak = { id, yeni: true, veri, tur: secilen.type, ad: secilen.name.replace(/\.[^.]+$/, ""), sure,
                        bas: 0, bit: Math.floor(sure * 2) / 2, seviye: 20, giris: 1.5, cikis: 1.5 };
        cizPanel();
      } catch {
        durumYaz(durum, "Bu ses dosyası okunamadı.", "hata");
      }
    } });
    const yukle = h("div", { class: "dugme-satiri" }, h("label", { class: "dugme dosya" }, "📁 Müzik dosyası yükle", dosya));
    /** Kayıtlı ya da taslak müziğin dinleme çubuğu (dosyanın tamamı). */
    const oynaticiKur = (veriAl) => {
      const oynatici = h("audio", { controls: true, class: "dinle", preload: "none" });
      Promise.resolve(veriAl()).then((kayit) => {
        if (!kayit) return;
        const adres = URL.createObjectURL(new Blob([kayit.veri], { type: kayit.tur || "audio/mpeg" }));
        adresler.add(adres);
        oynatici.src = adres;
      }).catch(() => {});
      return oynatici;
    };
    const t = muzikTaslak, ust = t ? Math.max(1, Math.ceil(t.sure * 2) / 2) : 0;
    return [
      h("h2", null, "Müzik"),
      grup("Müzik kaydet · yükle · kırp · seviye · karartma",
        yukle,
        t ? [
          h("p", { class: "soluk aciklama" }, `${t.yeni ? "Dosya" : "Düzenleniyor"}: ${t.ad} · ${sureYaz(t.sure)}`),
          oynaticiKur(() => (t.yeni ? { veri: t.veri, tur: t.tur } : depo.dosyalar.al(depo.muzikAnahtari(P.id, t.id)))),
          aralikSatiri("Kırpma · başlangıç (sn)", 0, ust, 0.5, t.bas, (v) => { t.bas = v; }),
          aralikSatiri("Kırpma · bitiş (sn)", 0, ust, 0.5, t.bit, (v) => { t.bit = v; }),
          aralikSatiri("Başlangıç karartma (sn)", 0, 10, 0.5, t.giris, (v) => { t.giris = v; }),
          aralikSatiri("Bitiş karartma (sn)", 0, 10, 0.5, t.cikis, (v) => { t.cikis = v; }),
          aralikSatiri("Ses seviyesi (%)", 0, 200, 5, t.seviye, (v) => { t.seviye = v; }),
          aciklama("100 = dosyanın kendi seviyesi. Anlatımın altında duyulması için %20–40 dene."),
          metinKutusu("Müzik adı", t.ad, "aynı adla kaydedersen üzerine yazar", (v) => { t.ad = v; }),
          h("div", { class: "dugme-satiri" },
            h("button", { class: "dugme birincil", "data-muzik-kaydet": "", onclick: async () => {
              const ad = (t.ad || "").trim() || "müzik";
              if (!(t.bit - t.bas >= 1)) return durumYaz(durum, "Kırpma bitişi başlangıçtan en az 1 sn sonra olmalı.", "hata");
              const kayit = { id: t.id, ad, sure: t.sure, bas: t.bas, bit: Math.min(t.bit, t.sure), seviye: t.seviye, giris: t.giris, cikis: t.cikis };
              if (t.yeni) await depo.dosyalar.yaz(depo.muzikAnahtari(P.id, t.id), { veri: t.veri, tur: t.tur });
              // Aynı adlı başka kayıt varsa onun yerine geçer (masaüstündeki gibi).
              const ayniAd = P.muzikler.find((m) => m.ad === ad && m.id !== t.id);
              if (ayniAd) {
                await depo.dosyalar.sil(depo.muzikAnahtari(P.id, ayniAd.id));
                muzikPcm.delete(ayniAd.id);
                P.muzikSira = P.muzikSira.map((id) => (id === ayniAd.id ? t.id : id));
                P.muzikler = P.muzikler.filter((m) => m !== ayniAd);
              }
              const yer = P.muzikler.findIndex((m) => m.id === t.id);
              if (yer >= 0) P.muzikler[yer] = kayit; else P.muzikler.push(kayit);
              muzikTaslak = null;
              if (!P.muzikSira.length) return muzikSec(kayit.id, true);        // ilk müzik kendiliğinden videoya girer
              oynatmayiDurdur();
              kaydet();
              ciz();
            } }, "Müziği kaydet"),
            h("button", { class: "dugme", onclick: () => { if (t.yeni) muzikPcm.delete(t.id); muzikTaslak = null; cizPanel(); } }, "Vazgeç")),
        ] : aciklama("Telefonundan bir müzik dosyası yükle; kırp, seviyesini ayarla ve kaydet. Kayıtlı bir müziği değiştirmek için listeden “düzenle”ye bas."),
        durum),
      grup("Kayıtlı müzikler · videoya ekle",
        P.muzikler.length ? [
          h("div", { class: "kayit-listesi" }, P.muzikler.map((m) => {
            const sira = P.muzikSira.indexOf(m.id) + 1;
            const kutu = h("input", { type: "checkbox", onchange: () => muzikSec(m.id, kutu.checked) });
            kutu.checked = sira > 0;
            return h("div", { class: "kayit" + (sira ? " secili" : ""), "data-muzik": m.ad },
              h("label", { class: "kayit-sec muzik-sec" }, kutu,
                h("span", { class: "secim-rozet" + (sira ? " acik" : "") }, sira ? `✓ ${sira}. sırada videoya girecek` : "Videoya girsin mi? İşaretle"),
                h("b", null, m.ad), h("span", { class: "soluk" }, ` · ${sureYaz(muzikSuresi(m))} · %${m.seviye}`)),
              oynaticiKur(() => depo.dosyalar.al(depo.muzikAnahtari(P.id, m.id))),
              h("div", { class: "kayit-islem" },
                h("button", { class: "dugme kucuk", onclick: () => { muzikTaslak = { ...m, yeni: false }; cizPanel(); } }, "düzenle"),
                h("button", { class: "dugme kucuk tehlike", "aria-label": `${m.ad} müziğini sil`, onclick: async () => {
                  if (!confirm(`${m.ad} silinsin mi?`)) return;
                  await depo.dosyalar.sil(depo.muzikAnahtari(P.id, m.id));
                  muzikPcm.delete(m.id);
                  P.muzikler = P.muzikler.filter((x) => x !== m);
                  if (muzikTaslak?.id === m.id) muzikTaslak = null;
                  muzikSec(m.id, false);
                } }, "🗑")));
          })),
          aciklama("Kutuları işaretlediğin sırayla müzikler videoya girer (1. bitince 2. başlar)."),
          onay("Müzik kısa kalırsa video sonuna kadar tekrarla", P.muzikAyar.tekrarla, (v) => { P.muzikAyar.tekrarla = v; oynatmayiDurdur(); kaydet(); cizZaman(); }),
          onay("Anlatım konuşurken müziği otomatik kıs (ducking)", P.muzikAyar.ducking, (v) => { P.muzikAyar.ducking = v; oynatmayiDurdur(); kaydet(); }),
        ] : aciklama("Kaydedilmiş müzik yok: yukarıdan yükle, kırp ve Müziği kaydet'e bas.")),
    ];
  }
  // Altyazı: sahne metni kısa bloklara bölünür. Ses dinlenmişse (kelime zamanlaması) her blok kendi sözüyle
  // başlar ve biter; dinlenmemişse süre metin uzunluğuna göre paylaştırılır (yaklaşık).
  const tumAltyazilar = (gorunum = G()) => tumBloklar(gorunum);
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
    const kayitlar = ["", ...Object.keys(P.diller)];
    const blokSayisi = P.sahneler.length ? tumAltyazilar().length : 0;
    const HAZIR = { dikey: { boyut: 3.5, seviye: 18 }, yatay: { boyut: 4.5, seviye: 10 } };
    const hazir = Object.keys(HAZIR).find((k) => HAZIR[k].boyut === s.boyut && HAZIR[k].seviye === s.seviye) || "";
    /** Kaydın zamanlama durumu ve "sese oturt" düğmesi. */
    const zamanSatiri = (kod) => {
      const gorunum = gorunumAl(kod), z = zamanlama(gorunum);
      if (z.sesDurumu !== "tam") return h("span", { class: "soluk" }, " · ses hazır değil");
      const ilk = dinlemeIstegi(gorunum, false), yeniden = dinlemeIstegi(gorunum, true);
      const baslat = (zorla, istek) => {
        if (!havuz.hesapVar("cloudflare")) return alert("Kelime zamanlaması için Cloudflare hesabı gerekli: API sayfasından ekle.");
        if (!confirm(`${dilAdi(kod)} sesi dinlenip altyazı sese oturtulsun mu?\n\n${istek} Cloudflare (whisper) isteği harcar; ses yeniden üretilmez.`)) return;
        calistir(async () => {
          const sonuc = await hizalaAdimi(kod, zorla);
          return `${dilAdi(kod)}: ${sonuc.tamam} parça sese oturtuldu.` + (sonuc.tahmini ? ` ${sonuc.tahmini} parça net duyulamadı; o bölüm tahmini kaldı.` : "");
        });
      };
      return [
        h("span", { class: z.kesin ? "ekli" : "ekli eksik", "data-zamanlama": kod }, z.kesin ? " · sese oturuyor ✓" : ` · tahmini (${z.zamanliParca} / ${z.parcaSayisi} parça dinlendi)`),
        z.kesin ? null : h("button", { class: "dugme kucuk is-dugme", disabled: is.calisiyor, onclick: () => baslat(!ilk, ilk || yeniden) }, ilk ? "🎧 sese oturt" : "🎧 yeniden dinle"),
      ];
    };
    return [
      h("h2", null, "Altyazı"),
      grup("Görünüm ve üretim · yazı tipi, renk, seviye",
        onay("Altyazıyı videoya göm", P.isaret.altyazi, (v) => isaretle("altyazi", v)),
        kare,
        secim("Hazır ayar", [["", "— elle ayarla —"], ["dikey", "Dikey video (Shorts / Reels)"], ["yatay", "Yatay video (YouTube)"]], hazir, (k) => {
          if (!HAZIR[k]) return;
          Object.assign(s, HAZIR[k], { renk: "#ffffff", kalin: true, golge: true });
          kaydet();
          altyaziStiliniUygula();
          cizPanel();
        }),
        secim("Yazı tipi · videoya gömülürken", [["sans", "Düz (sans-serif)"], ["serif", "Tırnaklı (serif)"], ["mono", "Eş aralıklı"]], s.font, stilDegisti("font")),
        alanKutu("Yazı rengi", h("input", { type: "color", value: s.renk, oninput: (o) => stilDegisti("renk")(o.target.value) })),
        onay("Kalın", s.kalin, stilDegisti("kalin")),
        aralikSatiri("Seviye · yazının alttan yüksekliği (%)", 2, 80, 1, s.seviye, stilDegisti("seviye")),
        aralikSatiri("Boyut · yazı yüksekliği (tuvalin %'si)", 2, 8, 0.5, s.boyut, stilDegisti("boyut")),
        onay("Arka gölge", s.golge, stilDegisti("golge"))),
      grup("Kayıtlı altyazılar · zamanlama",
        blokSayisi ? h("div", { class: "kayit-listesi" }, kayitlar.map((kod) => h("div", { class: "kayit" + (onizlemeDili() === kod ? " secili" : "") },
          h("div", { class: "kayit-sec" }, h("b", null, dilAdi(kod)),
            h("span", { class: "soluk" }, ` · ${tumAltyazilar(gorunumAl(kod)).length} blok${kod ? "" : " · asıl dil"}`), zamanSatiri(kod)),
          h("div", { class: "kayit-islem" }, h("button", { class: "dugme kucuk", onclick: () => srtIndir(kod) }, "srt")))))
          : aciklama("Sahneler oluşunca altyazılar burada listelenir."),
        aciklama("Ses üretilince Cloudflare (whisper) ile dinlenir ve her altyazı kendi sözünün söylendiği ana oturur. “Tahmini” yazıyorsa ses henüz dinlenmemiştir: “sese oturt”a ya da “Kaldığın yerden devam et”e bas. "
          + "Videoya, o an videoda olan konuşmanın (seslendirme ya da seçili dublaj) altyazısı gömülür.")),
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
      dublaj: dublajVar() ? `${dilAdi(P.dublajSecili)}` : "kayıtlı dublaj yok", muzik: muzikOzeti() || "müzik yok",
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
          const ses = await sesKur(kod, konusmali, P.isaret.muzik && seciliMuzikler().length > 0);
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
        satir("Dublajlar", Object.keys(P.diller).map(dilAdi).join(", ") || "yok"), satir("Müzik", P.muzikler.map((m) => m.ad).join(", ") || "yok")),
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
        h("span", { class: "bosluk" })),
      kod
        ? yaziAlani(`Anlatım (${dilAdi(kod)} çevirisi)`, P.diller[kod].metinler[sahne.id], { satir: 3, veri: { "data-anlatim": "" },
            yerTutucu: "Çeviri yok: Dublaj bölümünden üret ya da buraya yaz.", degisti: (v) => { P.diller[kod].metinler[sahne.id] = v; metinDegisti(); } })
        : yaziAlani("Anlatım (Metin bölümünden gelir)", sahne.metin, { satir: 3, kilit: true, veri: { "data-anlatim": "" } }),
      yaziAlani("Görsel tarifi · görsel prompt'u (İngilizce)", sahne.prompt, { satir: 3, yerTutucu: "Boş: “Kaldığın yerden devam et” yazar. Tarifsiz görsel üretilmez.", veri: { "data-prompt": "" },
                                                           degisti: (v) => { sahne.prompt = v; kaydet(); } }),
      cloudflare.modelTanimi(P.gorselModel).negatif ? yaziAlani("Negatif prompt (İngilizce)", sahne.negatif, { yerTutucu: "Boş: projenin genel negatifi kullanılır.", veri: { "data-negatif": "" },
                                                                                 degisti: (v) => { sahne.negatif = v; kaydet(); } }) : null,
      P.hareketli ? yaziAlani("Video prompt'u (İngilizce)", sahne.hareket, { yerTutucu: "Boş: “Kaldığın yerden devam et” yazar. Prompt'suz klip üretilmez.", veri: { "data-hareket": "" },
                                                                          degisti: (v) => { sahne.hareket = v; kaydet(); } }) : null,
      // Sahne işlemleri: masaüstündeki gibi her biri önce ne olacağını sorar, yalnızca bu sahneyi etkiler.
      h("p", { class: "soluk aciklama", "data-sahne-durum": "" }, [
        `görsel prompt'u ${(sahne.prompt || "").trim() ? "✓" : "—"}`, `ses ${sesVar ? "✓" : "—"}`,
        `görsel ${sahne.gorselVar ? "✓" : "—"}`, P.hareketli ? `video prompt'u ${(sahne.hareket || "").trim() ? "✓" : "—"}` : "",
        P.hareketli ? `klip ${sahne.videoVar ? "✓" : "—"}` : ""].filter(Boolean).join(" · ")),
      h("div", { class: "ed-islemler" },
        sahneIsi(sesVar ? "🎙 Sesi yeniden üret" : "🎙 Ses üret", !!sesParcasi,
          () => !sesVar ? "" : `Sahne ${no} sesi yeniden üretilsin mi?\n\n${sesParcasi.sahneler.length > 1
            ? `Ses, ${sesParcasi.sahneler.length} sahnelik tek parça halinde okunuyor; bu sahnenin içinde olduğu parça (sahne ${parcaNolari}) yeniden okunur.`
            : "Bu sahnenin sesi yeniden okunur."} 1 Gemini seslendirme isteği harcar${kod ? ` (${dilAdi(kod)} dublajı)` : ""}. Yenisi gelene kadar eski ses durur.`,
          async () => {
            geminiGerek();
            adim(`Sahne ${no} sesi yeniden üretiliyor…`);
            await parcayiSeslendir(sesGorunumu, sesParcasi);
            if (havuz.hesapVar("cloudflare")) await hizalaAdimi(kod).catch((hata) => { if (is.iptal) throw hata; });      // yeni ses: sahneler yeniden sese oturur
            return `Sahne ${no} sesi ${sesVar ? "yenilendi" : "hazır"}${sesParcasi.sahneler.length > 1 ? ` (sahne ${parcaNolari} birlikte)` : ""}.`;
          }),
        sahneIsi((sahne.prompt || "").trim() ? "📝 Görsel prompt'unu yeniden yaz" : "📝 Görsel prompt'unu yaz", !!sahne.metin.trim(),
          () => ((sahne.prompt || "").trim()
            ? `Sahne ${no} görsel tarifi yeniden yazılsın mı?\n\nŞimdiki tarifin üzerine yazılır (1 Gemini isteği). Görsel değişmez; yeni tarifle görsel için sonra “Görseli yeniden üret”e bas.` : ""),
          async () => {
            geminiGerek();
            if (!(await promptAdimi([sahne]))) throw new Error(`Sahne ${no} görsel tarifi yazılamadı: Gemini içerik filtresi bu sahneyi reddetti. Anlatımı yumuşat ya da tarifi elle yaz.`);
            return `Sahne ${no} görsel tarifi yazıldı.` + (sahne.gorselVar ? " Görsel eski tarifle duruyor; yenilemek için “Görseli yeniden üret”e bas." : "");
          }),
        sahneIsi(sahne.gorselVar ? "🖼 Görseli yeniden üret" : "🖼 Görsel üret", !!(sahne.prompt || "").trim(),
          () => (sahne.gorselVar
            ? `Sahne ${no} görseli yenilensin mi?\n\nGörsel${sahne.videoVar ? " ve klibi" : ""} silinir, aynı tarifle yenisi üretilir (görsel kotası harcar).` : ""),
          async () => {
            if (!havuz.hesapVar("cloudflare")) throw new Error("Cloudflare hesabı yok: API sayfasından ekle ya da galeriden görsel seç.");
            const klipVardi = sahne.videoVar;
            adim(`Sahne ${no} görseli üretiliyor…`);
            await gorselUret(sahne);
            return `Sahne ${no} görseli hazır.` + (klipVardi ? " Eski klip silindi; “Klibi yeniden üret” ya da “Kaldığın yerden devam et” ile yenilenir." : "");
          }),
        P.hareketli ? sahneIsi((sahne.hareket || "").trim() ? "🎞 Video prompt'unu yeniden yaz" : "🎞 Video prompt'unu yaz", !!(sahne.prompt || "").trim() && !!sahne.metin.trim(),
          () => ((sahne.hareket || "").trim()
            ? `Sahne ${no} video prompt'u yeniden yazılsın mı?\n\nŞimdikinin üzerine yazılır (1 Gemini isteği). Klip değişmez; yeni prompt'la klip için sonra “Klibi yeniden üret”e bas.` : ""),
          async () => {
            geminiGerek();
            if (!(await hareketAdimi([sahne]))) throw new Error(`Sahne ${no} video prompt'u yazılamadı: Gemini içerik filtresi reddetti ya da boş döndü. Yeniden dene ya da elle yaz.`);
            return `Sahne ${no} video prompt'u yazıldı.` + (sahne.videoVar ? " Klip eski prompt'la duruyor; yenilemek için “Klibi yeniden üret”e bas." : "");
          }) : null,
        P.hareketli ? sahneIsi(sahne.videoVar ? "🎬 Klibi yeniden üret" : "🎬 Klip üret", sahne.gorselVar && !!(sahne.hareket || "").trim(),
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
      muzik: () => { const secili = seciliMuzikler(), dl = muzikDilimleri(secili, z.toplam, P.muzikAyar.tekrarla);
        return dl.length ? dl.map((d) => blok("muzik", d.bas, d.sure, `${secili[d.sira].ad} · %${secili[d.sira].seviye}`)) : bosIz(P.muzikler.length ? "müzik seçilmedi" : "müzik yok", "muzik"); },
      altyazi: () => { const b = tumBloklar(gorunum, z); return b.length ? b.map((x) => blok("altyazi", x.bas, x.bit - x.bas, x.metin)) : bosIz("altyazı yok", "altyazi"); },
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
