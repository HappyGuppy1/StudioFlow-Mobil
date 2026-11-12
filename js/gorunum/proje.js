// Proje ekranı (düzenleyici): yatay ekranda, masaüstü StudioFlow'daki düzenle.
//   üst çubuk · [şerit | panel | önizleme | sahne paneli] · alt zaman çizelgesi
import { h, secenekler, durumYaz, geciktir, ekranAcik, sureYaz } from "../dom.js";
import * as depo from "../depo.js";
import { ayar, ayarGuncelle, ltxSpaceleri } from "../ayar.js";
import * as havuz from "../hesap.js";
import * as ltx from "../video_ltx.js";
import * as gemini from "../gemini.js";
import * as cloudflare from "../cloudflare.js";
import * as metinAI from "../metin.js";
import { sahnelereBol, sesPlani, zamanlama, altyaziBloklari, gorselPromptu, uretimBoyutu, yeniSahne,
         SES_PARCA_SINIRI } from "../sahne.js";
import { depoyaHazirla, videoTuvali, kayittanBlob, ltxKaresi, klipOgesi } from "../gorsel.js";
import { sesBaglami, wavBlob } from "../ses.js";
import { disaAktar } from "../disa_aktar.js";

const BOYUTLAR = [["720x1280", "Dikey 720 × 1280"], ["1080x1920", "Dikey 1080 × 1920"],
                  ["1280x720", "Yatay 1280 × 720"], ["1920x1080", "Yatay 1920 × 1080"]];
const SURELER = [30, 45, 60, 90, 120, 180, 300];
const RAY = [["sahneler", "🎞", "Sahneler"], ["metin", "📝", "Metin"], ["ayarlar", "⚙", "Ayarlar"], ["video", "🎬", "Video"]];
const bekle = (ms) => new Promise((coz) => setTimeout(coz, ms));

export async function projeGorunumu(kok, id, kabuk) {
  const P = await depo.projeler.al(id);
  if (!P) { location.replace("#/"); return null; }
  kabuk.baslik(P.ad, true);

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

  async function sesAdimi() {
    const plan = sesPlani(P);
    const eksik = plan.filter((p) => !(P.sesSureleri[p.anahtar] > 0));
    let biten = 0;
    for (const parca of eksik) {
      durduysa();
      adim(`Seslendirme: parça ${biten + 1} / ${eksik.length}`, biten / eksik.length);
      const ses = await hesapla("gemini")((hesap) => gemini.seslendirDayanikli({
        anahtar: hesap.gemini_key, model: P.model, ses: P.ses, dil: P.dil, stil: P.stil, metin: parca.metin }));
      const ornek = new Int16Array(ses.pcm.length);
      for (let i = 0; i < ornek.length; i++) ornek[i] = Math.max(-32768, Math.min(32767, Math.round(ses.pcm[i] * 32767)));
      await depo.dosyalar.yaz(depo.sesAnahtari(P.id, parca.anahtar), { veri: ornek.buffer, hiz: ses.hiz });
      P.sesSureleri[parca.anahtar] = ses.pcm.length / ses.hiz;
      await depo.projeler.yaz(P);
      biten++;
    }
    // Metni değişen parçaların eski sesleri silinir.
    const gecerli = new Set(plan.map((p) => p.anahtar));
    for (const anahtar of Object.keys(P.sesSureleri)) if (!gecerli.has(anahtar)) delete P.sesSureleri[anahtar];
    for (const dosya of await depo.dosyalar.anahtarlar(`${P.id}:ses:`)) {
      if (!gecerli.has(dosya.split(":").pop())) await depo.dosyalar.sil(dosya);
    }
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

  // ── Önizleme ve oynatma ─────────────────────────────────────────────────────
  const altyaziKutusu = h("div", { class: "ed-altyazi", hidden: true });
  let tuvalSirasi = 0;
  async function cizTuval() {
    const benim = ++tuvalSirasi;
    const [en, boy] = P.boyut.split("x").map(Number);
    tuval.style.aspectRatio = `${en} / ${boy}`;
    const sahne = P.sahneler[secili];
    if (!sahne) return tuval.replaceChildren(h("p", { class: "ed-bos" }, "Sahne yok"));
    let icerik;
    if (P.hareketli && sahne.videoVar) {
      const adres = await klipAdresi(sahne);
      if (adres) icerik = h("video", { src: adres, muted: true, playsinline: true, autoplay: true, loop: true });
    }
    if (!icerik && sahne.gorselVar) {
      const adres = await kucukYukle(sahne);
      if (adres) icerik = h("img", { src: adres, alt: `Sahne ${secili + 1}` });
    }
    if (benim !== tuvalSirasi) return;          // bu arada başka sahne seçildi
    tuval.replaceChildren(icerik || h("p", { class: "ed-bos" }, "Görsel yok"), altyaziKutusu,
      h("span", { class: "ed-etiket" }, `Sahne ${secili + 1}`));
  }

  const oynatma = { calisiyor: false, ses: null, sesAnahtari: "", kare: 0 };
  function oynatmayiDurdur() {
    if (!oynatma.calisiyor) return;
    oynatma.calisiyor = false;
    cancelAnimationFrame(oynatma.kare);
    oynatma.ses?.pause();
    oynatDugmesi.textContent = "▶";
    altyaziKutusu.hidden = true;
  }

  async function oynat() {
    if (oynatma.calisiyor) return oynatmayiDurdur();
    const z = zamanlama(P);
    if (!P.sahneler.length || !(z.toplam > 0)) return;
    let bas = z.sahneler.get(P.sahneler[secili].id).bas;
    if (bas >= z.toplam - 0.05) bas = 0;
    let saat;
    if (z.sesDurumu === "tam") {
      const anahtar = sesPlani(P).map((p) => p.anahtar).join("|");
      if (oynatma.sesAnahtari !== anahtar) {
        const ses = await sesiTopla().catch(() => null);
        if (!ses) return;
        const adres = URL.createObjectURL(wavBlob(ses.pcm, ses.hiz));
        adresler.add(adres);
        oynatma.ses = new Audio(adres);
        oynatma.sesAnahtari = anahtar;
      }
      oynatma.ses.currentTime = bas;
      try { await oynatma.ses.play(); } catch { return; }
      saat = () => oynatma.ses.currentTime;
    } else {
      const t0 = performance.now();
      saat = () => bas + (performance.now() - t0) / 1000;
    }
    oynatma.calisiyor = true;
    oynatDugmesi.textContent = "⏸";
    const dongu = () => {
      if (!oynatma.calisiyor) return;
      const t = saat();
      if (t >= z.toplam || oynatma.ses?.ended) return oynatmayiDurdur();
      const sira = P.sahneler.findIndex((s) => { const a = z.sahneler.get(s.id); return t >= a.bas && t < a.bit; });
      if (sira >= 0 && sira !== secili) sec(sira, true);
      zamanEtiketi.textContent = `${sureYaz(t)} / ${sureYaz(z.toplam)}`;
      if (P.altyazi && sira >= 0) {
        const a = z.sahneler.get(P.sahneler[sira].id);
        const blok = altyaziBloklari(P.sahneler[sira].metin, a.bas, a.bit).find((b) => t >= b.bas && t < b.bit);
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
    zamanCizelgesi.querySelector(".secili")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    cizTuval();
    cizDenetci();
    if (!oynatirken) zamaniYaz();
  }

  function zamaniYaz() {
    const z = zamanlama(P);
    const a = P.sahneler[secili] && z.sahneler.get(P.sahneler[secili].id);
    zamanEtiketi.textContent = `${sureYaz(a?.bas || 0)} / ${sureYaz(z.toplam)}`;
  }

  // ── Paneller ────────────────────────────────────────────────────────────────
  function alan(etiket, ad, ogeTuru, { degisti, ...ozellik } = {}, cocuklar = []) {
    const oge = h(ogeTuru, { ...ozellik, value: P[ad] ?? "", oninput: () => { P[ad] = oge.value; kaydet(); degisti?.(); } }, cocuklar);
    return h("label", null, etiket, oge);
  }
  const onay = (etiket, ad, degisti) => {
    const kutu = h("input", { type: "checkbox", onchange: () => { P[ad] = kutu.checked; kaydet(); degisti?.(); } });
    kutu.checked = !!P[ad];
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
        if (P.sahneler.length && !confirm(`Mevcut ${P.sahneler.length} sahne, görselleri ve sesi silinip senaryo yeniden bölünsün mü?`)) return;
        oynatmayiDurdur();
        await depo.dosyalar.onekSil(`${P.id}:`);
        P.sahneler = sahnelereBol(P.senaryo);
        P.sesSureleri = {};
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
      onay("Görselleri hareketlendir (LTX)", "hareketli", ciz),
      h("p", { class: "soluk" }, "Her görsel birkaç saniyelik klibe çevrilir; klip başına yaklaşık 40 sn sürer ve Hugging Face kotasından düşer."),
      onay("Altyazıyı videoya yaz", "altyazi"),
      h("p", { class: "soluk" }, "Ses, model ya da anlatım tarzı değişirse seslendirme yeniden üretilir."),
    ];
  }

  // ── Sağ panel: seçili sahne ─────────────────────────────────────────────────
  function cizDenetci() {
    const sahne = P.sahneler[secili];
    if (!sahne) return denetci.replaceChildren(h("h2", null, "Sahne"), h("p", { class: "soluk" }, "Sahne seçilmedi."));
    const no = secili + 1;
    const z = zamanlama(P);
    const a = z.sahneler.get(sahne.id);
    const dosya = h("input", { type: "file", accept: "image/*", hidden: true, onchange: async () => {
      const secilen = dosya.files[0];
      dosya.value = "";
      if (!secilen) return;
      try { await gorselKaydet(sahne, await depoyaHazirla(secilen)); cizZaman(); cizPanel(); } catch { alert("Bu görsel okunamadı."); }
    } });
    const tekIs = (etiket, isi, sinif = "dugme kucuk is-dugme") => h("button", { class: sinif, disabled: is.calisiyor, onclick: () => calistir(isi) }, etiket);
    denetci.replaceChildren(
      h("div", { class: "ed-denetci-ust" },
        h("h2", null, `Sahne ${no}`),
        h("span", { class: "soluk" }, a && a.bit > a.bas ? `${sureYaz(a.bas)} – ${sureYaz(a.bit)}${z.sesDurumu === "tam" ? "" : " (tahmini)"}` : ""),
        h("span", { class: "bosluk" }),
        h("button", { class: "ed-ikon", "aria-label": `Sahne ${no} sil`, onclick: async () => {
          if (!confirm(`Sahne ${no} silinsin mi?`)) return;
          await depo.dosyalar.sil(depo.gorselAnahtari(P.id, sahne.id));
          await depo.dosyalar.sil(depo.videoAnahtari(P.id, sahne.id));
          P.sahneler = P.sahneler.filter((s) => s !== sahne);
          secili = Math.max(0, Math.min(secili, P.sahneler.length - 1));
          kaydet();
          ciz();
        } }, "🗑")),
      yaziAlani("Anlatım", sahne.metin, { satir: 3, veri: { "data-anlatim": "" }, degisti: (v) => { sahne.metin = v; kaydet(); cizZaman(); cizUst(); zamaniYaz(); } }),
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
        }) : null));
  }

  // ── Video (dışa aktarma) ────────────────────────────────────────────────────
  async function sesiTopla() {
    const plan = sesPlani(P);
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

  function cizelge(z) {
    // Görseli olmayan sahne, kendinden önceki (yoksa sonraki) en yakın görseli kullanır.
    const gorselli = P.sahneler.map((s, i) => (s.gorselVar ? i : -1)).filter((i) => i >= 0);
    const dilimler = [], altyazilar = [];
    P.sahneler.forEach((sahne, i) => {
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
      if (P.altyazi && sahne.metin.trim()) altyazilar.push(...altyaziBloklari(sahne.metin, bas, bit));
    });
    return { dilimler, altyazilar };
  }

  function videoyuGoster() {
    if (!sonVideo) return;
    const kaplama = h("div", { class: "video-kaplama" },
      h("video", { src: sonVideo.adres, controls: true, playsinline: true, autoplay: true }),
      h("div", { class: "satir" },
        h("button", { class: "dugme birincil", onclick: videoKaydet }, "Kaydet / Paylaş"),
        h("button", { class: "dugme", onclick: () => kaplama.remove() }, "Kapat")));
    document.body.append(kaplama);
  }

  function videoPaneli() {
    const z = zamanlama(P);
    const gorselli = P.sahneler.filter((s) => s.gorselVar).length;
    const durum = h("p", { class: "durum", role: "status" });
    const cubuk = h("progress", { max: "1", value: "0", hidden: true });
    const yontem = h("select", null, secenekler([["oto", "Otomatik"], ["hizli", "Hızlı"], ["gercek", "Gerçek zamanlı"]], "oto"));
    const iptal = h("button", { class: "dugme kucuk", hidden: true, onclick: () => { is.iptal = true; } }, "İptal");
    const izle = h("button", { class: "dugme kucuk", hidden: !sonVideo, onclick: videoyuGoster }, "İzle");
    const paylas = h("button", { class: "dugme kucuk", hidden: !sonVideo, onclick: videoKaydet }, "Kaydet / Paylaş");
    const hazirlik = !P.sahneler.length ? "Önce sahneleri oluştur."
      : !gorselli ? "En az bir sahnenin görseli olmalı."
      : z.sesDurumu === "eksik" ? "Ses eksik: “Eksikleri üret”e bas." : "";
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
          durumYaz(durum, "Hazırlanıyor…");
          const ses = z.sesDurumu === "tam" ? await sesiTopla() : null;
          const { dilimler, altyazilar } = cizelge(z);
          const sonuc = await disaAktar({
            dilimler, altyazilar, ses, en, boy, yontem: yontem.value, sesBaglami: baglam,
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
          sonVideo = { ...sonuc, adres: URL.createObjectURL(sonuc.blob) };
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
        ? `${P.sahneler.length} sahne · ${gorselli} görsel · ${sureYaz(z.toplam)}`
          + (z.sesDurumu === "tam" ? " · sesli" : z.sesDurumu === "yok" ? " · sessiz (süre tahmini)" : "")
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
    const ad = `${(P.ad || "studioflow").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "studioflow"}.${sonVideo.uzanti}`;
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
    const z = zamanlama(P);
    const gorselli = P.sahneler.filter((s) => s.gorselVar).length;
    const ses = !z.parcaSayisi ? "" : z.sesDurumu === "tam" ? "ses ✓" : z.sesDurumu === "eksik" ? "ses eksik" : "ses yok";
    ustCubuk.querySelector(".ed-ozet").textContent = P.sahneler.length
      ? [`${P.sahneler.length} sahne`, `${gorselli} görsel`, P.hareketli ? `${P.sahneler.filter((s) => s.videoVar).length} klip` : "", ses, sureYaz(z.toplam)].filter(Boolean).join(" · ")
      : "";
    uretDugmesi.disabled = is.calisiyor;
  }

  function cizPanel() {
    ray.replaceChildren(...RAY.map(([ad, ikon, etiket]) => h("button", {
      class: "ed-ray-oge" + (panel === ad ? " secili" : ""), "aria-pressed": String(panel === ad),
      onclick: () => { if (panel !== ad) { kaydet.simdi(); panel = ad; cizPanel(); } },
    }, h("span", { "aria-hidden": "true" }, ikon), etiket)));
    panelKutusu.replaceChildren(...(panel === "sahneler" ? sahnelerPaneli() : panel === "metin" ? metinPaneli()
      : panel === "ayarlar" ? ayarlarPaneli() : videoPaneli()).flat().filter(Boolean));
  }

  function cizZaman() {
    const z = zamanlama(P);
    if (!P.sahneler.length) return zamanCizelgesi.replaceChildren(h("p", { class: "soluk" }, "Zaman çizelgesi: sahneler burada görünür."));
    zamanCizelgesi.replaceChildren(...P.sahneler.map((s, i) => {
      const a = z.sahneler.get(s.id);
      return h("button", {
        class: "ed-zc-oge" + (i === secili ? " secili" : "") + (s.gorselVar ? "" : " bos"), "data-sira": i, "data-kucuk": s.id,
        style: `width:${Math.max(44, Math.round((a.bit - a.bas) * 14))}px;` + (kucukler.get(s.id) ? `background-image:url("${kucukler.get(s.id).adres}")` : ""),
        "aria-label": `Sahne ${i + 1}`, onclick: () => sec(i),
      }, h("span", null, String(i + 1)));
    }));
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
