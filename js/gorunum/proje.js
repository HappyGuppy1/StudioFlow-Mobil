// Proje ekranı: Senaryo → Sahneler → Video.
import { h, secenekler, durumYaz, geciktir, ekranAcik, sureYaz } from "../dom.js";
import * as depo from "../depo.js";
import { ayar, ayarGuncelle, cloudflareHazir, ltxSpaceleri } from "../ayar.js";
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
const bekle = (ms) => new Promise((coz) => setTimeout(coz, ms));

export async function projeGorunumu(kok, id, kabuk) {
  const P = await depo.projeler.al(id);
  if (!P) { location.replace("#/"); return null; }
  kabuk.baslik(P.ad, true);

  const kaydet = geciktir(() => { P.guncelleme = Date.now(); depo.projeler.yaz(P).catch(() => {}); }, 400);
  const gizlenince = () => { if (document.hidden) kaydet.simdi(); };
  document.addEventListener("visibilitychange", gizlenince);

  const kucukler = new Map();        // sahne id → { adres, surum }
  const adresler = new Set();        // serbest bırakılacak nesne adresleri
  const is = { calisiyor: false, iptal: false };
  let sekme = P.sahneler.length ? "sahneler" : "senaryo";
  let sonVideo = null;

  // ── Kalıcı iş çubuğu: sekme değişse de çalışan işin durumu görünür ──────────
  const isDurumu = h("p", { class: "durum", role: "status" });
  const isCubugu = h("progress", { max: "1", hidden: true });
  const durdur = h("button", { class: "dugme kucuk", hidden: true, onclick: () => {
    is.iptal = true;
    durumYaz(isDurumu, "Durduruluyor… (süren istek bitince durur)");
  } }, "Durdur");
  const isAlani = h("div", { class: "is-alani", hidden: true }, h("div", { class: "is-satir" }, isDurumu, durdur), isCubugu);

  const adim = (metin, oran) => {
    durumYaz(isDurumu, metin);
    if (oran == null) isCubugu.removeAttribute("value"); else isCubugu.value = oran;
  };
  const durduysa = () => { if (is.iptal) throw new Error("Durduruldu. Tamamlanan adımlar kaydedildi."); };

  async function calistir(is_) {
    if (is.calisiyor) return;
    is.calisiyor = true;
    is.iptal = false;
    isAlani.hidden = false;
    isCubugu.hidden = false;
    durdur.hidden = false;
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
      kaydet();
      kaydet.simdi();
      ciz();
    }
  }
  const kilitle = (durum) => govde.querySelectorAll(".is-dugme").forEach((d) => { d.disabled = durum; });

  // ── Üretim adımları ─────────────────────────────────────────────────────────
  async function promptAdimi(hedefler) {
    const liste = hedefler.filter((s) => s.metin.trim());
    if (!liste.length) return 0;
    const sira = new Map(P.sahneler.map((s, i) => [s.id, i + 1]));
    const hedefNo = new Set(liste.map((s) => sira.get(s.id)));
    let yazilan = 0;
    adim(`Prompt'lar yazılıyor: 0 / ${liste.length}`, 0);
    await metinAI.promptlariYaz({
      anahtar: ayar.gemini, dil: P.dil, stil: P.gorselStili,
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
        const alan = govde.querySelector(`[data-prompt="${sahne.id}"]`);
        if (alan) alan.value = prompt;
        const hareketAlani = govde.querySelector(`[data-hareket="${sahne.id}"]`);
        if (hareketAlani && hareket) hareketAlani.value = hareket;
        adim(`Prompt'lar yazılıyor: ${++yazilan} / ${liste.length}`, yazilan / liste.length);
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
      const ses = await gemini.seslendirDayanikli({
        anahtar: ayar.gemini, model: P.model, ses: P.ses, dil: P.dil, stil: P.stil, metin: parca.metin });
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
  }

  /** Sahnenin görselini LTX ile hareketli klibe çevirir; klip sahne süresine göre istenir. */
  async function klipUret(sahne, bildir) {
    const kayit = await depo.dosyalar.al(depo.gorselAnahtari(P.id, sahne.id));
    if (!kayit) throw new Error("Önce bu sahnenin görselini üret.");
    const zaman = zamanlama(P).sahneler.get(sahne.id);
    const sahneSuresi = zaman ? zaman.bit - zaman.bas : 0;
    const [en, boy] = P.boyut.split("x").map(Number);
    const klip = await ltx.videoUret({
      token: ayar.hfToken, spaceler: ltxSpaceleri(), erisim: ayar.ltxErisim || "",
      gorsel: await ltxKaresi(kayit), prompt: sahne.hareket, dikey: en < boy,
      sure: Math.min(ltx.SURE_UST, Math.max(2, Math.ceil((sahneSuresi || 5) * 2) / 2)),
      bildir, iptal: () => is.iptal });
    await depo.dosyalar.yaz(depo.videoAnahtari(P.id, sahne.id), { veri: await klip.arrayBuffer(), tur: "video/mp4" });
    sahne.videoVar = true;
    sahne.videoSurum = (sahne.videoSurum || 0) + 1;
    await depo.projeler.yaz(P);
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
        const blob = await cloudflare.gorselUret({
          araci: ayar.cfAraci, hesap: ayar.cfHesap, token: ayar.cfToken,
          model: P.gorselModel, prompt: gorselPromptu(P, sahne), ...boyut });
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
    if (!P.sahneler.length) throw new Error("Önce Senaryo sekmesinde sahneleri oluştur.");
    if (!ayar.gemini) throw new Error("Gemini anahtarı yok: Ayarlar bölümünden gir.");
    const ozet = [];
    const promptsuz = P.sahneler.filter((s) => !(s.prompt || "").trim());
    if (promptsuz.length) ozet.push(`${await promptAdimi(promptsuz)} prompt`);
    durduysa();
    const ses = await sesAdimi();
    if (ses) ozet.push(`${ses} ses parçası`);
    const gorselsiz = P.sahneler.filter((s) => !s.gorselVar);
    if (gorselsiz.length && cloudflareHazir()) ozet.push(`${await gorselAdimi(gorselsiz)} görsel`);
    let not = gorselsiz.length && !cloudflareHazir()
      ? " Görseller için Cloudflare ayarlı değil; galeriden ekleyebilirsin." : "";
    if (P.hareketli) {
      const klipsiz = P.sahneler.filter((s) => s.gorselVar && !s.videoVar && s.metin.trim());
      if (klipsiz.length && ayar.hfToken) ozet.push(`${await klipAdimi(klipsiz)} klip`);
      else if (klipsiz.length) not += " Klipler için Hugging Face token'ı yok: Ayarlar bölümünden gir.";
    }
    return (ozet.length ? `Üretildi: ${ozet.join(", ")}.` : "Her şey zaten hazır.") + not;
  });

  // ── Küçük görseller ─────────────────────────────────────────────────────────
  async function kucukYukle(sahne) {
    const eski = kucukler.get(sahne.id);
    if (eski?.surum === sahne.gorselSurum) return eski.adres;
    const kayit = await depo.dosyalar.al(depo.gorselAnahtari(P.id, sahne.id));
    if (!kayit) return null;
    if (eski) { URL.revokeObjectURL(eski.adres); adresler.delete(eski.adres); }
    const adres = URL.createObjectURL(kayittanBlob(kayit));
    adresler.add(adres);
    kucukler.set(sahne.id, { adres, surum: sahne.gorselSurum });
    const resim = govde.querySelector(`[data-kucuk="${sahne.id}"]`);
    if (resim) { resim.src = adres; resim.hidden = false; resim.parentElement.classList.remove("bos"); }
    return adres;
  }

  // ── Senaryo sekmesi ─────────────────────────────────────────────────────────
  function alan(etiket, ad, ogeTuru, { degisti, ...ozellik } = {}, cocuklar = []) {
    const oge = h(ogeTuru, { ...ozellik, value: P[ad] ?? "", oninput: () => { P[ad] = oge.value; kaydet(); degisti?.(); } }, cocuklar);
    return h("label", null, etiket, oge);
  }

  function hareketKutusu() {
    const kutu = h("input", { type: "checkbox", onchange: () => { P.hareketli = kutu.checked; kaydet(); } });
    kutu.checked = !!P.hareketli;
    return h("div", null,
      h("label", { class: "onay" }, kutu, h("span", null, "Görselleri hareketlendir (LTX video)")),
      h("p", { class: "soluk" }, "Her sahnenin görseli Hugging Face'teki LTX ile birkaç saniyelik klibe çevrilir. "
        + "Klip başına yaklaşık 40 sn sürer ve Hugging Face GPU kotasından düşer; token Ayarlar'dan girilir."));
  }

  function senaryoPaneli() {
    const durum = h("p", { class: "durum", role: "status" });
    const sayac = h("p", { class: "soluk" });
    const sayaciYaz = () => {
      const n = P.senaryo.trim().length;
      sayac.textContent = n
        ? `${n} karakter · yaklaşık ${sureYaz(n / 14)} · ${Math.ceil(n / SES_PARCA_SINIRI)} seslendirme isteği`
        : "Senaryoyu yaz, yapıştır ya da Gemini'ye yazdır.";
    };
    const senaryo = h("textarea", { rows: "10", placeholder: "Anlatım metni…", value: P.senaryo, oninput: () => {
      P.senaryo = senaryo.value; kaydet(); sayaciYaz();
    } });
    const yazdir = h("button", { class: "dugme is-dugme", onclick: () => {
      if (P.senaryo.trim() && !confirm("Mevcut senaryonun üzerine yazılsın mı?")) return;
      calistir(async () => {
        adim("Gemini senaryoyu yazıyor…");
        P.senaryo = await metinAI.senaryoYaz({ anahtar: ayar.gemini, konu: P.konu, dil: P.dil, saniye: Number(P.hedefSaniye) || 60 });
        return "Senaryo yazıldı. Okuyup düzelt, sonra sahnelere böl.";
      });
    } }, "Senaryoyu Gemini yazsın");
    const bol = h("button", { class: "dugme birincil is-dugme", onclick: async () => {
      if (!P.senaryo.trim()) return durumYaz(durum, "Önce senaryoyu yaz.", "hata");
      if (P.sahneler.length && !confirm(`Mevcut ${P.sahneler.length} sahne, görselleri ve sesi silinip senaryo yeniden bölünsün mü?`)) return;
      await depo.dosyalar.onekSil(`${P.id}:`);
      P.sahneler = sahnelereBol(P.senaryo);
      P.sesSureleri = {};
      kaydet(); kaydet.simdi();
      sekme = "sahneler";
      ciz();
    } }, P.sahneler.length ? "Sahnelere yeniden böl" : "Sahnelere böl");
    sayaciYaz();
    const tercih = (ad) => () => ayarGuncelle({ [ad]: P[ad] });
    return h("div", { class: "sayfa" },
      h("section", { class: "kart" },
        alan("Proje adı", "ad", "input", { type: "text", degisti: () => kabuk.baslik(P.ad, true) }),
        alan("Konu (Gemini'ye yazdırmak için)", "konu", "textarea", { rows: "2", placeholder: "Örn. Vatoz balıkları bir nehri nasıl ele geçirdi?" }),
        h("div", { class: "izgara-2" },
          alan("Dil", "dil", "select", { degisti: tercih("dil") }, secenekler(Object.keys(gemini.DILLER).map((k) => [k, `${k.toUpperCase()} · ${gemini.DILLER[k]}`]), P.dil)),
          alan("Hedef süre", "hedefSaniye", "select", {}, secenekler(SURELER.map((s) => [String(s), s < 60 ? `${s} sn` : `${s / 60} dk`]), String(P.hedefSaniye)))),
        h("div", { class: "satir" }, yazdir)),
      h("section", { class: "kart" },
        h("h2", null, "Senaryo"),
        h("label", null, "Anlatım metni", senaryo),
        sayac,
        h("div", { class: "satir" }, bol),
        durum),
      h("section", { class: "kart" },
        h("h2", null, "Ses ve görsel ayarları"),
        h("div", { class: "izgara-2" },
          alan("Ses", "ses", "select", { degisti: tercih("ses") }, secenekler(gemini.SESLER.map((s) => [s, s]), P.ses)),
          alan("Biçim", "boyut", "select", { degisti: tercih("boyut") }, secenekler(BOYUTLAR, P.boyut))),
        alan("Seslendirme modeli", "model", "select", { degisti: tercih("model") }, secenekler(gemini.MODELLER.map((m) => [m, m]), P.model)),
        alan("Anlatım tarzı", "stil", "textarea", { rows: "2" }),
        alan("Görsel modeli", "gorselModel", "select", { degisti: tercih("gorselModel") }, secenekler(cloudflare.MODELLER.map((m) => [m.kimlik, m.ad]), P.gorselModel)),
        alan("Görsel stili (her prompt'a eklenir)", "gorselStili", "textarea", { rows: "3" }),
        hareketKutusu(),
        h("p", { class: "soluk" }, "Ses, model ya da anlatım tarzı değişirse seslendirme yeniden üretilir.")));
  }

  // ── Sahneler sekmesi ────────────────────────────────────────────────────────
  function sesOzeti() {
    const z = zamanlama(P);
    if (!z.parcaSayisi) return "Ses: metin yok";
    if (z.sesDurumu === "tam") return `Ses hazır · ${sureYaz(z.toplam)}`;
    if (z.sesDurumu === "eksik") return `Ses eksik: ${z.eksik} / ${z.parcaSayisi} parça üretilecek`;
    return `Ses yok · ${z.parcaSayisi} istek · tahmini ${sureYaz(z.toplam)}`;
  }

  function sahneKarti(sahne, no, z) {
    const zaman = z.sahneler.get(sahne.id);
    const kucuk = kucukler.get(sahne.id);
    const resim = h("img", { "data-kucuk": sahne.id, alt: `Sahne ${no} görseli`, loading: "lazy",
                             src: kucuk?.adres, hidden: !kucuk });
    const dosya = h("input", { type: "file", accept: "image/*", hidden: true, onchange: async () => {
      const secilen = dosya.files[0];
      dosya.value = "";
      if (!secilen) return;
      try {
        await gorselKaydet(sahne, await depoyaHazirla(secilen));
      } catch {
        alert("Bu görsel okunamadı.");
      }
    } });
    return h("article", { class: "sahne" },
      h("div", { class: "sahne-ust" },
        h("div", { class: "kucuk" + (kucuk ? "" : " bos") }, resim),
        h("div", { class: "sahne-bilgi" },
          h("strong", null, `Sahne ${no}`),
          h("span", { class: "soluk" }, zaman && zaman.bit > zaman.bas ? `${sureYaz(zaman.bas)} – ${sureYaz(zaman.bit)}${z.sesDurumu === "tam" ? "" : " (tahmini)"}` : "")),
        h("button", { class: "sahne-sil", "aria-label": `Sahne ${no} sil`, onclick: async () => {
          if (!confirm(`Sahne ${no} silinsin mi?`)) return;
          await depo.dosyalar.sil(depo.gorselAnahtari(P.id, sahne.id));
          await depo.dosyalar.sil(depo.videoAnahtari(P.id, sahne.id));
          P.sahneler = P.sahneler.filter((s) => s !== sahne);
          kaydet();
          ciz();
        } }, "×")),
      h("label", null, "Anlatım",
        h("textarea", { rows: "3", value: sahne.metin, oninput: (o) => {
          sahne.metin = o.target.value;
          kaydet();
          sesSatiri.textContent = sesOzeti();
          const dinle = govde.querySelector("[data-dinle]");
          if (dinle) dinle.hidden = zamanlama(P).sesDurumu !== "tam";
        } })),
      h("label", null, "Görsel tarifi (İngilizce)",
        h("textarea", { rows: "3", "data-prompt": sahne.id, value: sahne.prompt || "", placeholder: "Boş bırakırsan anlatımdan üretilir.",
                        oninput: (o) => { sahne.prompt = o.target.value; kaydet(); } })),
      P.hareketli ? h("label", null, "Hareket tarifi (İngilizce)",
        h("textarea", { rows: "2", "data-hareket": sahne.id, value: sahne.hareket || "", placeholder: ltx.VARSAYILAN_HAREKET,
                        oninput: (o) => { sahne.hareket = o.target.value; kaydet(); } })) : null,
      P.hareketli && sahne.gorselVar ? h("div", { class: "satir" },
        h("button", { class: "dugme kucuk is-dugme", disabled: is.calisiyor, onclick: () => calistir(async () => {
          if (!ayar.hfToken) throw new Error("Hugging Face token'ı yok: Ayarlar bölümünden gir.");
          adim(`Sahne ${no} klibi üretiliyor…`);
          await klipUret(sahne, (mesaj) => adim(`Sahne ${no} · ${mesaj.replace(/^LTX · /, "")}`));
          return `Sahne ${no} klibi hazır.`;
        }) }, sahne.videoVar ? "Klibi yeniden üret" : "Klip üret"),
        sahne.videoVar ? h("button", { class: "dugme kucuk", onclick: async (o) => {
          const kart = o.target.closest(".sahne");
          const eski = kart.querySelector("video");
          if (eski) return eski.remove();
          const kayit = await depo.dosyalar.al(depo.videoAnahtari(P.id, sahne.id));
          if (!kayit) return;
          const adres = URL.createObjectURL(new Blob([kayit.veri], { type: "video/mp4" }));
          adresler.add(adres);
          kart.append(h("video", { src: adres, controls: true, playsinline: true, muted: true, autoplay: true, loop: true }));
        } }, "Klibi izle") : null) : null,
      h("div", { class: "satir" },
        h("button", { class: "dugme kucuk is-dugme", disabled: is.calisiyor, onclick: () => calistir(async () => {
          adim(`Sahne ${no} görseli üretiliyor…`);
          await gorselUret(sahne);
          return `Sahne ${no} görseli hazır.`;
        }) }, sahne.gorselVar ? "Yeniden üret" : "Görsel üret"),
        h("label", { class: "dugme kucuk dosya" }, "Galeriden", dosya),
        h("button", { class: "dugme kucuk is-dugme", disabled: is.calisiyor, onclick: () => calistir(async () => {
          if (!sahne.metin.trim()) throw new Error("Bu sahnenin anlatımı boş.");
          await promptAdimi([sahne]);
          return `Sahne ${no} için prompt yazıldı.`;
        }) }, "Prompt yaz")));
  }

  let sesSatiri = h("span");
  function sahnePaneli() {
    if (!P.sahneler.length) {
      return h("div", { class: "sayfa" }, h("section", { class: "kart" },
        h("p", { class: "soluk" }, "Henüz sahne yok. Senaryo sekmesinde metni yazıp “Sahnelere böl”e bas."),
        h("div", { class: "satir" }, h("button", { class: "dugme", onclick: () => { sekme = "senaryo"; ciz(); } }, "Senaryoya git"))));
    }
    const z = zamanlama(P);
    sesSatiri = h("span", null, sesOzeti());
    const oynatici = h("audio", { controls: true, hidden: true });
    const dinle = h("button", { class: "dugme kucuk", "data-dinle": "", onclick: async () => {
      const ses = await sesiTopla().catch(() => null);
      if (!ses) return alert("Ses henüz hazır değil.");
      const adres = URL.createObjectURL(wavBlob(ses.pcm, ses.hiz));
      adresler.add(adres);
      oynatici.src = adres;
      oynatici.hidden = false;
      oynatici.play().catch(() => {});
    } }, "Dinle");
    const gorselli = P.sahneler.filter((s) => s.gorselVar).length;
    for (const sahne of P.sahneler) if (sahne.gorselVar) kucukYukle(sahne).catch(() => {});
    return h("div", { class: "sayfa" },
      h("section", { class: "kart" },
        h("div", { class: "ozet-satir" }, h("span", null, `${P.sahneler.length} sahne · ${gorselli} görsel`
          + (P.hareketli ? ` · ${P.sahneler.filter((s) => s.videoVar).length} klip` : "")), sesSatiri,
          z.sesDurumu === "tam" ? dinle : null),
        oynatici,
        h("div", { class: "satir" },
          h("button", { class: "dugme birincil is-dugme", disabled: is.calisiyor, onclick: tumunuUret }, "Eksikleri üret"),
          h("button", { class: "dugme is-dugme", disabled: is.calisiyor, onclick: () => calistir(async () => {
            if (!ayar.gemini) throw new Error("Gemini anahtarı yok: Ayarlar bölümünden gir.");
            const n = await sesAdimi();
            return n ? `${n} ses parçası üretildi.` : "Ses zaten hazır.";
          }) }, "Yalnızca ses")),
        h("p", { class: "soluk" }, `“Eksikleri üret” sırayla eksik prompt'ları, sesi${P.hareketli ? ", görselleri ve klipleri" : " ve görselleri"} üretir. Yarıda kalırsa kaldığı yerden sürer.`)),
      P.sahneler.map((s, i) => sahneKarti(s, i + 1, z)),
      h("div", { class: "satir" },
        h("button", { class: "dugme", onclick: () => { P.sahneler.push(yeniSahne()); kaydet(); ciz(); } }, "＋ Sahne ekle")));
  }

  // ── Video sekmesi ───────────────────────────────────────────────────────────
  async function sesiTopla() {
    const plan = sesPlani(P);
    const parcalar = [];
    let hiz = null;
    for (const p of plan) {
      const kayit = await depo.dosyalar.al(depo.sesAnahtari(P.id, p.anahtar));
      if (!kayit) throw new Error("Ses dosyası eksik. Sahneler sekmesinde sesi yeniden üret.");
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

  function videoPaneli() {
    const z = zamanlama(P);
    const gorselli = P.sahneler.filter((s) => s.gorselVar).length;
    const durum = h("p", { class: "durum", role: "status" });
    const cubuk = h("progress", { max: "1", value: "0", hidden: true });
    const oynatici = h("video", { controls: true, playsinline: true, hidden: !sonVideo, src: sonVideo?.adres });
    const yontem = h("select", null, secenekler([["oto", "Otomatik"], ["hizli", "Hızlı"], ["gercek", "Gerçek zamanlı"]], "oto"));
    const iptal = h("button", { class: "dugme", hidden: true, onclick: () => { is.iptal = true; } }, "İptal");
    const kaydetDugmesi = h("button", { class: "dugme birincil", hidden: !sonVideo, onclick: videoKaydet }, "Kaydet / Paylaş");
    const hazirlik = !P.sahneler.length ? "Önce sahneleri oluştur."
      : !gorselli ? "En az bir sahnenin görseli olmalı."
      : z.sesDurumu === "eksik" ? "Ses eksik: Sahneler sekmesinde “Eksikleri üret”e bas (ya da sessiz video için metni değiştirme)." : "";
    const olustur = h("button", { class: "dugme birincil is-dugme", disabled: is.calisiyor || !!hazirlik, onclick: async () => {
      if (is.calisiyor) return;
      const baglam = sesBaglami();        // iOS: dokunma olayının içinde açılmalı
      is.calisiyor = true;
      is.iptal = false;
      olustur.disabled = true;
      cubuk.hidden = false;
      iptal.hidden = false;
      kaydetDugmesi.hidden = true;
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
          oynatici.src = sonVideo.adres;
          oynatici.hidden = false;
          kaydetDugmesi.hidden = false;
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
        olustur.disabled = false;
        cubuk.hidden = true;
        iptal.hidden = true;
      }
    } }, "Videoyu oluştur");
    const altyazi = h("input", { type: "checkbox", onchange: () => { P.altyazi = altyazi.checked; kaydet(); } });
    altyazi.checked = !!P.altyazi;
    return h("div", { class: "sayfa" }, h("section", { class: "kart" },
      h("p", { class: "soluk" }, P.sahneler.length
        ? `${P.sahneler.length} sahne · ${gorselli} görsel · ${sureYaz(z.toplam)}`
          + (z.sesDurumu === "tam" ? " · sesli" : z.sesDurumu === "yok" ? " · sessiz (süre tahmini)" : "")
        : "Proje boş."),
      h("div", { class: "izgara-2" },
        alan("Biçim", "boyut", "select", {}, secenekler(BOYUTLAR, P.boyut)),
        h("label", null, "Yöntem", yontem)),
      h("label", { class: "onay" }, altyazi, h("span", null, "Altyazıyı videoya yaz (yaklaşık zamanlama)")),
      hazirlik ? h("p", { class: "durum hata" }, hazirlik) : null,
      h("div", { class: "satir" }, olustur, iptal),
      cubuk, durum, oynatici,
      h("div", { class: "satir" }, kaydetDugmesi)));
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
    const bag = h("a", { href: sonVideo.adres, download: ad });
    bag.click();
  }

  // ── İskelet ─────────────────────────────────────────────────────────────────
  const SEKMELER = [["senaryo", "Senaryo"], ["sahneler", "Sahneler"], ["video", "Video"]];
  const sekmeCubugu = h("div", { class: "sekmeler", role: "tablist" });
  const govde = h("div");
  function ciz() {
    sekmeCubugu.replaceChildren(...SEKMELER.map(([ad, etiket]) => h("button", {
      role: "tab", "aria-selected": String(sekme === ad), class: sekme === ad ? "secili" : "",
      onclick: () => { if (sekme !== ad) { kaydet.simdi(); sekme = ad; ciz(); window.scrollTo(0, 0); } },
    }, etiket)));
    govde.replaceChildren(sekme === "senaryo" ? senaryoPaneli() : sekme === "sahneler" ? sahnePaneli() : videoPaneli());
  }
  kok.append(sekmeCubugu, isAlani, govde);
  ciz();

  return () => {
    is.iptal = true;
    document.removeEventListener("visibilitychange", gizlenince);
    kaydet.simdi();
    adresler.forEach((a) => URL.revokeObjectURL(a));
  };
}
