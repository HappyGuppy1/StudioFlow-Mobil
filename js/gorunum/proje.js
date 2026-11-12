// Proje ekranı (düzenleyici): yatay ekranda, masaüstü StudioFlow'daki düzenle.
//   üst çubuk · [şerit | panel | önizleme | sahne paneli] · alt zaman çizelgesi (sahne, altyazı, dil, müzik izleri)
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
import { disaAktar } from "../disa_aktar.js";

const BOYUTLAR = [["720x1280", "Dikey 720 × 1280"], ["1080x1920", "Dikey 1080 × 1920"],
                  ["1280x720", "Yatay 1280 × 720"], ["1920x1080", "Yatay 1920 × 1080"]];
const SURELER = [30, 45, 60, 90, 120, 180, 300];
const RAY = [["sahneler", "🎞", "Sahneler"], ["metin", "📝", "Metin"], ["ayarlar", "⚙", "Ayarlar"], ["altyazi", "💬", "Altyazı"],
             ["dublaj", "🌐", "Dublaj"], ["muzik", "🎵", "Müzik"], ["video", "🎬", "Video"]];
const ALTYAZI_OLCEK = { kucuk: 0.8, orta: 1, buyuk: 1.25 };
const bekle = (ms) => new Promise((coz) => setTimeout(coz, ms));

export async function projeGorunumu(kok, id, kabuk) {
  const P = await depo.projeler.al(id);
  if (!P) { location.replace("#/"); return null; }
  kabuk.baslik(P.ad, true);
  P.diller ||= {};                   // dublajlar: { kod: { metinler: { sahneId: çeviri }, sesSureleri: {} } }
  P.altyaziBoyut ||= "orta";
  P.altyaziKonum ||= "alt";

  const kaydet = geciktir(() => { P.guncelleme = Date.now(); depo.projeler.yaz(P).catch(() => {}); }, 400);
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
  let zcAcik = !!ayar.zcAcik;        // çizelge büyütülmüş mü (bütün izler görünür)
  const IZ_SOL = 32;                 // iz adı sütununun genişliği (piksel)

  // Etkin dil: önizleme, zaman çizelgesi, altyazı ve dışa aktarma bu dile göre çalışır ("" = asıl dil).
  let etkin = P.diller[P.etkinDil] ? P.etkinDil : "";
  const G = () => (etkin ? dilGorunumu(P, etkin) : P);
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
  const uretDugmesi = h("button", { class: "dugme birincil kucuk is-dugme", onclick: () => tumunuUret() }, "▶ Eksikleri üret");
  const ustCubuk = h("header", { class: "ed-ust" },
    h("button", { class: "ed-ikon", "aria-label": "Projelere dön", onclick: () => { location.hash = "#/"; } }, "‹"),
    adEtiketi, h("span", { class: "ed-ozet" }), h("span", { class: "bosluk" }), uretDugmesi,
    h("button", { class: "dugme kucuk", onclick: () => { panel = "video"; ciz(); } }, "Dışa aktar"));
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

  // ── Tam ekran yazı düzenleyici: yatayda klavye ekranı kapladığı için uzun yazılar ayrı açılır ──
  function yaziAlani(etiket, deger, { yerTutucu = "", satir = 2, degisti, veri = {} } = {}) {
    const kutu = h("textarea", { rows: String(satir), readonly: true, placeholder: yerTutucu, value: deger || "", class: "ed-yazi", ...veri,
      onclick: () => {
        const alan = h("textarea", { class: "yazi-alan", placeholder: yerTutucu, value: kutu.value });
        const kapat = () => { kutu.value = alan.value; degisti?.(alan.value); kaplama.remove(); };
        const kaplama = h("div", { class: "yazi-kaplama" },
          h("div", { class: "yazi-ust" }, h("strong", null, etiket), h("span", { class: "bosluk" }),
            h("button", { class: "dugme birincil kucuk", onclick: kapat }, "Tamam")),
          alan);
        document.body.append(kaplama);
        alan.focus();
      } });
    return h("label", null, etiket, kutu);
  }

  // ── İş yürütme ──────────────────────────────────────────────────────────────
  const adim = (metin, oran) => {
    durumYaz(isDurumu, metin);
    if (oran == null) isCubugu.removeAttribute("value"); else isCubugu.value = oran;
  };
  const durduysa = () => { if (is.iptal) throw new Error("Durduruldu. Tamamlanan adımlar kaydedildi."); };
  // Hesap havuzu: kotası biten hesap atlanır, sıradakiyle sürer; geçişler iş satırına yazılır.
  const hesapla = (hizmet) => (isi) => havuz.hesaplarla(hizmet, isi, { bildir: (mesaj) => adim(mesaj), iptal: () => is.iptal });
  const kilitle = (durum) => editor.querySelectorAll(".is-dugme").forEach((d) => { d.disabled = durum; });

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

  /** Verilen dilin (varsayılan: asıl dil) eksik ses parçalarını üretir. */
  async function sesAdimi(kod = "") {
    const gorunum = kod ? dilGorunumu(P, kod) : P;
    const plan = sesPlani(gorunum);
    const eksik = plan.filter((p) => !(gorunum.sesSureleri[p.anahtar] > 0));
    const onek = kod ? `${dilAdi(kod)} dublajı` : "Seslendirme";
    let biten = 0;
    for (const parca of eksik) {
      durduysa();
      adim(`${onek}: parça ${biten + 1} / ${eksik.length}`, biten / eksik.length);
      const ses = await hesapla("gemini")((hesap) => gemini.seslendirDayanikli({
        anahtar: hesap.gemini_key, model: P.model, ses: P.ses, dil: gorunum.dil, stil: P.stil, metin: parca.metin }));
      const ornek = new Int16Array(ses.pcm.length);
      for (let i = 0; i < ornek.length; i++) ornek[i] = Math.max(-32768, Math.min(32767, Math.round(ses.pcm[i] * 32767)));
      await depo.dosyalar.yaz(depo.sesAnahtari(P.id, parca.anahtar), { veri: ornek.buffer, hiz: ses.hiz });
      gorunum.sesSureleri[parca.anahtar] = ses.pcm.length / ses.hiz;
      await depo.projeler.yaz(P);
      biten++;
    }
    // Metni değişen parçaların eski sesleri silinir (öbür dillerin sesleri korunur).
    const buDil = new Set(plan.map((p) => p.anahtar));
    for (const anahtar of Object.keys(gorunum.sesSureleri)) if (!buDil.has(anahtar)) delete gorunum.sesSureleri[anahtar];
    const gecerli = tumSesAnahtarlari(P);
    for (const dosya of await depo.dosyalar.anahtarlar(`${P.id}:ses:`)) {
      if (!gecerli.has(dosya.split(":").pop())) await depo.dosyalar.sil(dosya);
    }
    return biten;
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
    const [en, boy] = P.boyut.split("x").map(Number);
    const kare = await ltxKaresi(kayit);
    const klip = await hesapla("huggingface")((hesap) => ltx.videoUret({
      token: hesap.hf_token, spaceler: ltxSpaceleri(), erisim: ayar.ltxErisim || "",
      gorsel: kare, prompt: sahne.hareket, dikey: en < boy,
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

  const tumunuUret = () => calistir(async () => {
    if (!P.sahneler.length) throw new Error("Önce Metin bölümünde senaryoyu yazıp sahnelere böl.");
    if (!havuz.hesapVar("gemini")) throw new Error("Gemini hesabı yok: API sayfasından kasaya bağlanıp ekle.");
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
  });

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

  // ── Ses: anlatım (etkin dil) + müzik ────────────────────────────────────────
  async function sesiTopla(gorunum = G()) {
    const plan = sesPlani(gorunum);
    const parcalar = [];
    let hiz = null;
    for (const p of plan) {
      const kayit = await depo.dosyalar.al(depo.sesAnahtari(P.id, p.anahtar));
      if (!kayit) throw new Error("Ses dosyası eksik: “Eksikleri üret”e bas.");
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

  /** Etkin dilin son sesi: anlatım (varsa) ve müzik (varsa) karışımı. Hiçbiri yoksa `null`. */
  async function sonSes(z = zamanlama(G())) {
    const anlatim = z.sesDurumu === "tam" ? await sesiTopla() : null;
    const muzik = await muzigiCoz().catch(() => null);
    if (!muzik) return anlatim;
    return karistir({ anlatim, muzik, sure: z.toplam, seviye: P.muzik.seviye, ducking: P.muzik.ducking, karartma: P.muzik.karartma });
  }
  const sesImzasi = () => [etkin, sesPlani(G()).map((p) => p.anahtar).join("|"), JSON.stringify(P.muzik || null)].join("#");

  // ── Önizleme ve oynatma ─────────────────────────────────────────────────────
  const altyaziKutusu = h("div", { class: "ed-altyazi", hidden: true });
  let tuvalSirasi = 0;
  async function cizTuval() {
    const benim = ++tuvalSirasi;
    const [en, boy] = P.boyut.split("x").map(Number);
    tuval.style.aspectRatio = `${en} / ${boy}`;
    altyaziKutusu.dataset.konum = P.altyaziKonum;
    const sahne = P.sahneler[secili];
    if (!sahne) return tuval.replaceChildren(h("p", { class: "ed-bos" }, "Sahne yok"));
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
    tuval.replaceChildren(icerik || h("p", { class: "ed-bos" }, "Görsel yok"), altyaziKutusu,
      h("span", { class: "ed-etiket" }, `Sahne ${secili + 1}${etkin ? " · " + dilAdi(etkin) : ""}`));
  }

  const oynatma = { calisiyor: false, ses: null, sesAnahtari: "", kare: 0 };
  function oynatmayiDurdur() {
    if (!oynatma.calisiyor) return;
    oynatma.calisiyor = false;
    cancelAnimationFrame(oynatma.kare);
    oynatma.ses?.pause();
    tuval.querySelector("video")?.pause();
    oynatDugmesi.textContent = "▶";
    altyaziKutusu.hidden = true;
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
      const ses = await sonSes(z).catch(() => null);
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
      if (P.altyazi && sira >= 0) {
        const a = z.sahneler.get(gorunum.sahneler[sira].id);
        const blok = altyaziBloklari(gorunum.sahneler[sira].metin, a.bas, a.bit).find((b) => t >= b.bas && t < b.bit);
        altyaziKutusu.textContent = blok?.metin || "";
        altyaziKutusu.hidden = !blok;
      }
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
      if (x > sol + gen - 30 || x < sol + IZ_SOL) zamanCizelgesi.scrollLeft = Math.max(0, x - gen / 3);
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
    const a = z.sahneler.get(gorunum.sahneler[sira].id);
    if (sira !== secili) {
      secili = sira;
      for (const oge of editor.querySelectorAll("[data-sira]")) oge.classList.toggle("secili", Number(oge.dataset.sira) === secili);
      cizTuval();
      cizDenetci();
    } else {
      const klip = tuval.querySelector("video");          // aynı sahnede: klip o ana götürülür
      if (klip?.duration) klip.currentTime = Math.min(klip.duration - 0.05, t - a.bas);
    }
    if (P.altyazi) {
      const blok = altyaziBloklari(gorunum.sahneler[sira].metin, a.bas, a.bit).find((b) => t >= b.bas && t < b.bit);
      altyaziKutusu.textContent = blok?.metin || "";
      altyaziKutusu.hidden = !blok;
    }
  }

  function zamaniYaz() {
    const z = zamanlama(G());
    zamanEtiketi.textContent = `${sureYaz(Math.min(imlec, z.toplam))} / ${sureYaz(z.toplam)}`;
  }

  function dilSec(kod) {
    oynatmayiDurdur();
    etkin = P.diller[kod] ? kod : "";
    P.etkinDil = etkin;
    kaydet();
    ciz();
  }

  // ── Paneller ────────────────────────────────────────────────────────────────
  function alan(etiket, ad, ogeTuru, { degisti, ...ozellik } = {}, cocuklar = []) {
    const oge = h(ogeTuru, { ...ozellik, value: P[ad] ?? "", oninput: () => { P[ad] = oge.value; kaydet(); degisti?.(); } }, cocuklar);
    return h("label", null, etiket, oge);
  }
  const onay = (etiket, deger, degisti) => {
    const kutu = h("input", { type: "checkbox", onchange: () => degisti(kutu.checked) });
    kutu.checked = !!deger;
    return h("label", { class: "onay" }, kutu, h("span", null, etiket));
  };
  const tercih = (ad) => () => ayarGuncelle({ [ad]: P[ad] });

  function sahnelerPaneli() {
    if (!P.sahneler.length) {
      return [h("h2", null, "Sahneler"), h("p", { class: "soluk" }, "Henüz sahne yok. Metin bölümünde senaryoyu yazıp sahnelere böl."),
              h("button", { class: "dugme kucuk", onclick: () => { panel = "metin"; ciz(); } }, "Metne git")];
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

  function metinPaneli() {
    const durum = h("p", { class: "durum", role: "status" });
    const sayac = h("p", { class: "soluk" });
    const sayaciYaz = () => {
      const n = P.senaryo.trim().length;
      sayac.textContent = n ? `${n} karakter · yaklaşık ${sureYaz(n / 14)} · ${Math.ceil(n / SES_PARCA_SINIRI)} ses isteği` : "Yaz, yapıştır ya da Gemini'ye yazdır.";
    };
    sayaciYaz();
    return [
      h("h2", null, "Metin"),
      alan("Proje adı", "ad", "input", { type: "text", degisti: () => { adEtiketi.textContent = P.ad; kabuk.baslik(P.ad, true); } }),
      yaziAlani("Konu (Gemini'ye yazdırmak için)", P.konu, { yerTutucu: "Örn. Vatoz balıkları bir nehri nasıl ele geçirdi?", degisti: (v) => { P.konu = v; kaydet(); } }),
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
      } }, "Senaryoyu Gemini yazsın"),
      yaziAlani("Senaryo (anlatım metni)", P.senaryo, { yerTutucu: "Anlatım metni…", satir: 4, veri: { "data-senaryo": "" },
                                                       degisti: (v) => { P.senaryo = v; kaydet(); sayaciYaz(); } }),
      sayac,
      h("button", { class: "dugme birincil kucuk is-dugme", disabled: is.calisiyor, onclick: async () => {
        if (!P.senaryo.trim()) return durumYaz(durum, "Önce senaryoyu yaz.", "hata");
        if (P.sahneler.length && !confirm(`Mevcut ${P.sahneler.length} sahne, görselleri, sesi ve dublajları silinip senaryo yeniden bölünsün mü?`)) return;
        oynatmayiDurdur();
        for (const tur of ["gorsel", "video", "ses"]) await depo.dosyalar.onekSil(`${P.id}:${tur}:`);      // müzik korunur
        P.sahneler = sahnelereBol(P.senaryo);
        P.sesSureleri = {};
        P.diller = {};
        etkin = P.etkinDil = "";
        kaydet(); kaydet.simdi();
        panel = "sahneler";
        secili = 0;
        ciz();
      } }, P.sahneler.length ? "Sahnelere yeniden böl" : "Sahnelere böl"),
      durum,
    ];
  }

  function ayarlarPaneli() {
    return [
      h("h2", null, "Ayarlar"),
      h("div", { class: "izgara-2" },
        alan("Ses", "ses", "select", { degisti: tercih("ses") }, secenekler(gemini.SESLER.map((s) => [s, s]), P.ses)),
        alan("Biçim", "boyut", "select", { degisti: () => { tercih("boyut")(); cizTuval(); } }, secenekler(BOYUTLAR, P.boyut))),
      alan("Seslendirme modeli", "model", "select", { degisti: tercih("model") }, secenekler(gemini.MODELLER.map((m) => [m, m]), P.model)),
      yaziAlani("Anlatım tarzı", P.stil, { degisti: (v) => { P.stil = v; kaydet(); } }),
      alan("Görsel modeli", "gorselModel", "select", { degisti: tercih("gorselModel") }, secenekler(cloudflare.MODELLER.map((m) => [m.kimlik, m.ad]), P.gorselModel)),
      yaziAlani("Görsel stili (her tarife eklenir)", P.gorselStili, { degisti: (v) => { P.gorselStili = v; kaydet(); } }),
      onay("Görselleri hareketlendir (LTX)", P.hareketli, (v) => { P.hareketli = v; kaydet(); ciz(); }),
      h("p", { class: "soluk" }, "Her görsel birkaç saniyelik klibe çevrilir; klip başına yaklaşık 40 sn sürer ve Hugging Face kotasından düşer."),
      h("p", { class: "soluk" }, "Ses, model ya da anlatım tarzı değişirse seslendirme (dublajlar dahil) yeniden üretilir."),
    ];
  }

  // Altyazı: sahne metni kısa bloklara bölünür; süreler metin uzunluğuna göre paylaştırılır (yaklaşık).
  function tumAltyazilar() {
    const gorunum = G(), z = zamanlama(gorunum);
    return gorunum.sahneler.flatMap((s) => {
      const a = z.sahneler.get(s.id);
      return s.metin.trim() && a.bit > a.bas ? altyaziBloklari(s.metin, a.bas, a.bit) : [];
    });
  }

  function altyaziPaneli() {
    const bloklar = P.sahneler.length ? tumAltyazilar() : [];
    return [
      h("h2", null, "Altyazı"),
      onay("Altyazıyı videoya yaz", P.altyazi, (v) => { P.altyazi = v; kaydet(); cizZaman(); }),
      h("div", { class: "izgara-2" },
        alan("Boyut", "altyaziBoyut", "select", {}, secenekler([["kucuk", "Küçük"], ["orta", "Orta"], ["buyuk", "Büyük"]], P.altyaziBoyut)),
        alan("Konum", "altyaziKonum", "select", { degisti: cizTuval }, secenekler([["alt", "Altta"], ["orta", "Ortada"], ["ust", "Üstte"]], P.altyaziKonum))),
      h("p", { class: "soluk" }, bloklar.length
        ? `${bloklar.length} altyazı bloğu · dil: ${dilAdi(etkin)}. Süreler metin uzunluğuna göre paylaştırılır (yaklaşık).`
        : "Sahneler oluşunca altyazı blokları burada sayılır."),
      h("button", { class: "dugme kucuk", disabled: !bloklar.length, onclick: () => {
        const adres = URL.createObjectURL(new Blob([srtMetni(tumAltyazilar())], { type: "application/x-subrip" }));
        adresler.add(adres);
        h("a", { href: adres, download: `${dosyaAdi()}${etkin ? "-" + etkin : ""}.srt` }).click();
      } }, "SRT dosyasını indir"),
    ];
  }

  function dublajPaneli() {
    const eklenebilir = Object.keys(gemini.DILLER).filter((k) => k !== P.dil && !P.diller[k]);
    const secim = h("select", null, secenekler(eklenebilir.map((k) => [k, `${k.toUpperCase()} · ${gemini.DILLER[k]}`]), eklenebilir[0]));
    const satir = (kod) => {
      const z = zamanlama(kod ? dilGorunumu(P, kod) : P);
      const durum = z.sesDurumu === "tam" ? `ses ✓ · ${sureYaz(z.toplam)}` : z.sesDurumu === "eksik" ? "ses eksik" : "ses yok";
      return h("div", { class: "ed-dil-satir" + (etkin === kod ? " secili" : "") },
        h("button", { class: "ed-dil-ad", onclick: () => dilSec(kod) }, h("strong", null, dilAdi(kod)), h("small", null, kod ? durum : `asıl · ${durum}`)),
        kod ? h("button", { class: "ed-ikon", "aria-label": `${dilAdi(kod)} dublajını sil`, onclick: async () => {
          if (!confirm(`${dilAdi(kod)} dublajı (çeviri ve ses) silinsin mi?`)) return;
          delete P.diller[kod];
          if (etkin === kod) etkin = P.etkinDil = "";
          const gecerli = tumSesAnahtarlari(P);
          for (const dosya of await depo.dosyalar.anahtarlar(`${P.id}:ses:`)) if (!gecerli.has(dosya.split(":").pop())) await depo.dosyalar.sil(dosya);
          kaydet();
          ciz();
        } }, "🗑") : null);
    };
    return [
      h("h2", null, "Dublaj"),
      h("p", { class: "soluk" }, "Anlatım başka bir dile çevrilir ve o dilde seslendirilir; görseller ortaktır. Bir dile dokununca önizleme ve dışa aktarma o dile geçer."),
      satir(""), Object.keys(P.diller).map(satir),
      eklenebilir.length ? h("label", null, "Dil ekle", secim) : null,
      eklenebilir.length ? h("button", { class: "dugme birincil kucuk is-dugme", disabled: is.calisiyor || !P.sahneler.length, onclick: () => {
        const kod = secim.value;
        calistir(async () => {
          if (!havuz.hesapVar("gemini")) throw new Error("Gemini hesabı yok: API sayfasından kasaya bağlanıp ekle.");
          P.diller[kod] ||= { metinler: {}, sesSureleri: {} };
          const cevrilen = await ceviriAdimi(kod);
          durduysa();
          const ses = await sesAdimi(kod);
          etkin = P.etkinDil = kod;
          return `${dilAdi(kod)} dublajı hazır: ${cevrilen} sahne çevrildi, ${ses} ses parçası üretildi.`;
        });
      } }, "Çevir ve seslendir") : null,
      h("p", { class: "soluk" }, "Her dil için çeviri (12 sahnede 1 istek) ve seslendirme Gemini kotasından düşer."),
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
        P.muzik = { ad: secilen.name, sure: cozulen.pcm.length / cozulen.hiz, seviye: P.muzik?.seviye ?? 20,
                    ducking: P.muzik?.ducking ?? true, karartma: P.muzik?.karartma ?? 1.5 };
        oynatmayiDurdur();
        kaydet();
        ciz();
      } catch {
        durumYaz(durum, "Bu ses dosyası okunamadı.", "hata");
      }
    } });
    if (!P.muzik) {
      return [h("h2", null, "Müzik"),
              h("p", { class: "soluk" }, "Telefonundan bir müzik dosyası seç. Müzik anlatımın altına serilir; videodan kısaysa baştan tekrarlanır."),
              h("label", { class: "dugme birincil kucuk dosya" }, "Müzik dosyası seç", dosya), durum];
    }
    const seviyeYazi = h("span", null, `Düzey: %${P.muzik.seviye}`);
    const seviye = h("input", { type: "range", min: "0", max: "100", step: "1", value: String(P.muzik.seviye), oninput: () => {
      P.muzik.seviye = Number(seviye.value);
      seviyeYazi.textContent = `Düzey: %${P.muzik.seviye}`;
      kaydet();
    }, onchange: cizZaman });
    return [
      h("h2", null, "Müzik"),
      h("p", { class: "ed-muzik-ad" }, `🎵 ${P.muzik.ad} · ${sureYaz(P.muzik.sure)}`),
      h("label", null, seviyeYazi, seviye),
      onay("Konuşurken müziği kıs", P.muzik.ducking, (v) => { P.muzik.ducking = v; kaydet(); }),
      h("label", null, "Baş ve son karartma",
        h("select", { onchange: (o) => { P.muzik.karartma = Number(o.target.value); kaydet(); } },
          secenekler([["0", "Yok"], ["1.5", "1,5 sn"], ["3", "3 sn"], ["5", "5 sn"]], String(P.muzik.karartma)))),
      h("div", { class: "satir" },
        h("label", { class: "dugme kucuk dosya" }, "Değiştir", dosya),
        h("button", { class: "dugme kucuk", onclick: async () => {
          if (!confirm("Müzik projeden kaldırılsın mı?")) return;
          await depo.dosyalar.sil(depo.muzikAnahtari(P.id));
          P.muzik = null;
          muzikPcm = null;
          oynatmayiDurdur();
          kaydet();
          ciz();
        } }, "Kaldır")),
      h("p", { class: "soluk" }, "Değişikliği duymak için önizlemede ▶ bas."),
      durum,
    ];
  }

  // ── Sağ panel: seçili sahne ─────────────────────────────────────────────────
  function cizDenetci() {
    const sahne = P.sahneler[secili];
    if (!sahne) return denetci.replaceChildren(h("h2", null, "Sahne"), h("p", { class: "soluk" }, "Sahne seçilmedi."));
    const no = secili + 1;
    const z = zamanlama(G());
    const a = z.sahneler.get(sahne.id);
    const dosya = h("input", { type: "file", accept: "image/*", hidden: true, onchange: async () => {
      const secilen = dosya.files[0];
      dosya.value = "";
      if (!secilen) return;
      try { await gorselKaydet(sahne, await depoyaHazirla(secilen)); cizZaman(); cizPanel(); } catch { alert("Bu görsel okunamadı."); }
    } });
    const tekIs = (etiket, isi) => h("button", { class: "dugme kucuk is-dugme", disabled: is.calisiyor, onclick: () => calistir(isi) }, etiket);
    const metinDegisti = () => { kaydet(); cizZaman(); cizUst(); zamaniYaz(); };
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
      etkin
        ? yaziAlani(`Anlatım (${dilAdi(etkin)} çevirisi)`, P.diller[etkin].metinler[sahne.id], { satir: 3, veri: { "data-anlatim": "" },
            yerTutucu: "Çeviri yok: Dublaj bölümünden üret ya da buraya yaz.", degisti: (v) => { P.diller[etkin].metinler[sahne.id] = v; metinDegisti(); } })
        : yaziAlani("Anlatım", sahne.metin, { satir: 3, veri: { "data-anlatim": "" }, degisti: (v) => { sahne.metin = v; metinDegisti(); } }),
      yaziAlani("Görsel tarifi (İngilizce)", sahne.prompt, { satir: 3, yerTutucu: "Boş bırakırsan anlatımdan üretilir.", veri: { "data-prompt": "" },
                                                           degisti: (v) => { sahne.prompt = v; kaydet(); } }),
      P.hareketli ? yaziAlani("Hareket tarifi (İngilizce)", sahne.hareket, { yerTutucu: ltx.VARSAYILAN_HAREKET, veri: { "data-hareket": "" },
                                                                          degisti: (v) => { sahne.hareket = v; kaydet(); } }) : null,
      h("div", { class: "satir" },
        tekIs(sahne.gorselVar ? "Görseli yeniden üret" : "Görsel üret", async () => {
          adim(`Sahne ${no} görseli üretiliyor…`);
          await gorselUret(sahne);
          return `Sahne ${no} görseli hazır.`;
        }),
        h("label", { class: "dugme kucuk dosya" }, "Galeriden", dosya),
        tekIs("Tarif yaz", async () => {
          if (!sahne.metin.trim()) throw new Error("Bu sahnenin anlatımı boş.");
          await promptAdimi([sahne]);
          return `Sahne ${no} için görsel tarifi yazıldı.`;
        }),
        P.hareketli && sahne.gorselVar ? tekIs(sahne.videoVar ? "Klibi yeniden üret" : "Klip üret", async () => {
          if (!havuz.hesapVar("huggingface")) throw new Error("Hugging Face hesabı yok: API sayfasından ekle.");
          adim(`Sahne ${no} klibi üretiliyor…`);
          await klipUret(sahne, (mesaj) => adim(`Sahne ${no} · ${mesaj.replace(/^LTX · /, "")}`));
          return `Sahne ${no} klibi hazır.`;
        }) : null)].filter(Boolean));
  }

  // ── Video (dışa aktarma) ────────────────────────────────────────────────────
  const dosyaAdi = () => (P.ad || "studioflow").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "studioflow";

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

  function videoPaneli() {
    const gorunum = G();
    const z = zamanlama(gorunum);
    const gorselli = P.sahneler.filter((s) => s.gorselVar).length;
    const durum = h("p", { class: "durum", role: "status" });
    const cubuk = h("progress", { max: "1", value: "0", hidden: true });
    const yontem = h("select", null, secenekler([["oto", "Otomatik"], ["hizli", "Hızlı"], ["gercek", "Gerçek zamanlı"]], "oto"));
    const iptal = h("button", { class: "dugme kucuk", hidden: true, onclick: () => { is.iptal = true; } }, "İptal");
    const izle = h("button", { class: "dugme kucuk", hidden: !sonVideo, onclick: videoyuGoster }, "İzle");
    const paylas = h("button", { class: "dugme kucuk", hidden: !sonVideo, onclick: videoKaydet }, "Kaydet / Paylaş");
    const hazirlik = !P.sahneler.length ? "Önce sahneleri oluştur."
      : !gorselli ? "En az bir sahnenin görseli olmalı."
      : z.sesDurumu === "eksik" ? "Ses eksik: “Eksikleri üret”e bas."
      : etkin && z.sesDurumu !== "tam" ? `${dilAdi(etkin)} dublajının sesi yok: Dublaj bölümünden üret.` : "";
    const olustur = h("button", { class: "dugme birincil kucuk is-dugme", disabled: is.calisiyor || !!hazirlik, onclick: async () => {
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
          const ses = await sonSes(z);
          const sonuc = await disaAktar({
            dilimler: cizelge(gorunum, z), altyazilar: P.altyazi ? tumAltyazilar() : [],
            altyaziStili: { olcek: ALTYAZI_OLCEK[P.altyaziBoyut] || 1, konum: P.altyaziKonum },
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
          sonVideo = { ...sonuc, dil: etkin, adres: URL.createObjectURL(sonuc.blob) };
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
      h("h2", null, "Video"),
      h("p", { class: "soluk" }, P.sahneler.length
        ? [`Dil: ${dilAdi(etkin)}`, `${P.sahneler.length} sahne`, `${gorselli} görsel`, sureYaz(z.toplam),
           z.sesDurumu === "tam" ? "sesli" : z.sesDurumu === "yok" ? "sessiz (süre tahmini)" : "",
           P.muzik ? "müzikli" : "", P.altyazi ? "altyazılı" : ""].filter(Boolean).join(" · ")
        : "Proje boş."),
      h("label", null, "Yöntem", yontem),
      hazirlik ? h("p", { class: "durum hata" }, hazirlik) : null,
      h("div", { class: "satir" }, olustur, iptal),
      cubuk, durum,
      h("div", { class: "satir" }, izle, paylas),
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

  // ── Çizim ───────────────────────────────────────────────────────────────────
  function cizUst() {
    const z = zamanlama(G());
    const gorselli = P.sahneler.filter((s) => s.gorselVar).length;
    const ses = !z.parcaSayisi ? "" : z.sesDurumu === "tam" ? "ses ✓" : z.sesDurumu === "eksik" ? "ses eksik" : "ses yok";
    ustCubuk.querySelector(".ed-ozet").textContent = P.sahneler.length
      ? [etkin ? dilAdi(etkin) : "", `${P.sahneler.length} sahne`, `${gorselli} görsel`,
         P.hareketli ? `${P.sahneler.filter((s) => s.videoVar).length} klip` : "", ses, sureYaz(z.toplam)].filter(Boolean).join(" · ")
      : "";
    uretDugmesi.disabled = is.calisiyor;
  }

  const PANELLER = { sahneler: sahnelerPaneli, metin: metinPaneli, ayarlar: ayarlarPaneli, altyazi: altyaziPaneli,
                     dublaj: dublajPaneli, muzik: muzikPaneli, video: videoPaneli };
  function cizPanel() {
    ray.replaceChildren(...RAY.map(([ad, ikon, etiket]) => h("button", {
      class: "ed-ray-oge" + (panel === ad ? " secili" : ""), "aria-pressed": String(panel === ad),
      onclick: () => { if (panel !== ad) { kaydet.simdi(); panel = ad; cizPanel(); } },
    }, h("span", { "aria-hidden": "true" }, ikon), etiket)));
    panelKutusu.replaceChildren(...PANELLER[panel]().flat().filter(Boolean));
  }

  /**
   * Zaman çizelgesi: cetvel + izler (Sahneler, Seslendirme, Dublaj, Müzik, Altyazı) aynı ölçekle alt alta
   * durur. Küçükken yalnızca cetvel ve sahne izi görünür. Cetvelde parmak sürüklenince önizleme o ana gider.
   */
  function cizZaman() {
    if (!P.sahneler.length) return zamanCizelgesi.replaceChildren(h("p", { class: "soluk" }, "Zaman çizelgesi: sahneler burada görünür."));
    const gorunum = G(), z = zamanlama(gorunum);
    const sureler = gorunum.sahneler.map((s) => { const a = z.sahneler.get(s.id); return a.bit - a.bas; }).filter((s) => s > 0);
    zcOlcek = Math.min(40, Math.max(16, 46 / Math.min(...sureler, 3)));
    const px = (t) => `${Math.round(t * zcOlcek)}px`;
    const iz = (ad, ikon, etiket, ...ogeler) => h("div", { class: "ed-iz ed-iz-" + ad },
      h("span", { class: "ed-iz-ad", title: etiket, "aria-label": etiket }, ikon), h("div", { class: "ed-iz-govde", style: `width:${px(z.toplam)}` }, ogeler));
    // Boş iz: ne eksik olduğunu yazar; dokununca ilgili bölüm açılır.
    const bosIz = (metin, hedef) => h("button", { class: "ed-blok ed-bos-iz", style: `left:0;width:${px(z.toplam)}`,
      onclick: () => { panel = hedef; cizPanel(); } }, metin);

    // Cetvel: saniye işaretleri; parmakla gezinme alanı.
    const adimSn = zcOlcek >= 30 ? 1 : zcOlcek >= 18 ? 2 : 5;
    const isaretler = [];
    for (let t = 0; t <= z.toplam; t += adimSn) isaretler.push(h("span", { style: `left:${px(t)}` }, sureYaz(t)));
    const konumdan = (o) => (o.clientX - cetvel.getBoundingClientRect().left) / zcOlcek;
    const cetvel = h("div", { class: "ed-cetvel", style: `width:${px(z.toplam)}`, "aria-label": "Zaman cetveli: sürükleyerek gezin",
      onpointerdown: (o) => { cetvel.setPointerCapture(o.pointerId); gez(konumdan(o)); },
      onpointermove: (o) => { if (cetvel.hasPointerCapture(o.pointerId)) gez(konumdan(o)); } }, isaretler);
    const ac = h("button", { class: "ed-zc-ac", "aria-label": zcAcik ? "Çizelgeyi küçült" : "Çizelgeyi büyüt (bütün izler)",
      onclick: () => { zcAcik = !zcAcik; ayarGuncelle({ zcAcik: zcAcik || "" }); cizZaman(); } }, zcAcik ? "▾" : "▴");
    const izler = [h("div", { class: "ed-iz ed-iz-cetvel" }, ac, cetvel)];

    izler.push(iz("sahne", "🎞", "Sahneler", gorunum.sahneler.map((s, i) => {
      const a = z.sahneler.get(s.id);
      return h("button", {
        class: "ed-zc-oge" + (i === secili ? " secili" : "") + (s.gorselVar ? "" : " bos"), "data-sira": i, "data-kucuk": s.id,
        style: `width:${px(a.bit - a.bas)};` + (kucukler.get(s.id) ? `background-image:url("${kucukler.get(s.id).adres}")` : ""),
        "aria-label": `Sahne ${i + 1}`, onclick: () => sec(i),
      }, h("span", null, String(i + 1)));
    })));

    if (zcAcik) {
      izler.push(iz("ses", "🎙", "Seslendirme", z.sesDurumu === "tam"
        ? h("span", { class: "ed-blok", style: `left:0;width:${px(z.toplam)}` }, `Seslendirme · ${dilAdi(etkin)} · ${sureYaz(z.toplam)}`)
        : bosIz(z.sesDurumu === "eksik" ? "Ses eksik: “Eksikleri üret”e bas" : "Ses yok: “Eksikleri üret”e bas", "sahneler")));
      izler.push(iz("dil", "🌐", "Dublaj", Object.keys(P.diller).length
        ? ["", ...Object.keys(P.diller)].map((kod) => h("button", {
            class: "ed-cip" + (etkin === kod ? " secili" : ""), "data-dil": kod, onclick: () => dilSec(kod) }, dilAdi(kod) + (kod ? "" : " · asıl")))
        : bosIz("Dublaj yok: dil eklemek için dokun", "dublaj")));
      izler.push(iz("muzik", "🎵", "Müzik", P.muzik
        ? h("span", { class: "ed-blok", style: `left:0;width:${px(z.toplam)}` }, `${P.muzik.ad} · %${P.muzik.seviye}`)
        : bosIz("Müzik yok: eklemek için dokun", "muzik")));
      izler.push(iz("altyazi", "💬", "Altyazı", P.altyazi
        ? tumAltyazilar().map((b) => h("span", { class: "ed-blok", style: `left:${px(b.bas)};width:${px(b.bit - b.bas)}`, title: b.metin }, b.metin))
        : bosIz("Altyazı kapalı: açmak için dokun", "altyazi")));
    }
    zamanCizelgesi.classList.toggle("acik", zcAcik);
    zamanCizelgesi.replaceChildren(h("div", { class: "ed-zc-ic", style: `width:calc(${px(z.toplam)} + ${IZ_SOL + 8}px)` }, izler, imlecCizgi));
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
    kaydet.simdi();
    document.body.classList.remove("editor-acik");
    document.querySelectorAll(".yazi-kaplama, .video-kaplama").forEach((k) => k.remove());
    try { screen.orientation?.unlock?.(); } catch { /* desteklenmiyor */ }
    if (tamEkranBizden && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    adresler.forEach((a) => URL.revokeObjectURL(a));
  };
}
