// API sayfası: Kasa · Gemini · Cloudflare · Hugging Face. Kasa bağlanana kadar servis sayfaları kilitlidir.
import { h, durumYaz } from "../dom.js";
import { ayar, ayarGuncelle } from "../ayar.js";
import * as havuz from "../hesap.js";

const SEKMELER = [["kasa", "Kasa"], ["gemini", "Gemini"], ["cloudflare", "Cloudflare"], ["huggingface", "Hugging Face"]];
const KURULUM_PAROLASI = "kasa-kurulum-parolasi";      // rehber yarıda kalırsa parola değişmesin (yalnızca bu sekme)

const SERVIS_NOTU = {
  gemini: { metin: "Seslendirme, senaryo ve görsel tarifleri için. Anahtar Google AI Studio'dan ücretsiz alınır.",
            dugme: "Anahtar al", adres: "https://aistudio.google.com/apikey" },
  cloudflare: { metin: "Görsel üretimi için. Account ID, Cloudflare panelinin ana sayfasında yazar. Token oluştururken “Workers AI” şablonunu seç.",
                dugme: "Token oluştur", adres: "https://dash.cloudflare.com/profile/api-tokens" },
  huggingface: { metin: "Görselleri hareketli klibe çevirmek (LTX) için. Salt okunur (Read) bir token yeterli.",
                 dugme: "Token oluştur", adres: "https://huggingface.co/settings/tokens" },
};

const girdi = (tur, deger, yerTutucu) => h("input", { type: tur, value: deger || "", placeholder: yerTutucu || null,
  autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
const disBag = (metin, adres, sinif = "dugme") => h("a", { class: sinif, href: adres, target: "_blank", rel: "noopener" }, metin);

async function kopyala(metin, dugme) {
  const eski = dugme.textContent;
  try {
    await navigator.clipboard.writeText(metin);
    dugme.textContent = "Kopyalandı ✓";
  } catch {
    dugme.textContent = "Kopyalanamadı";
  }
  setTimeout(() => { dugme.textContent = eski; }, 1800);
}

export async function apiGorunumu(kok, kabuk) {
  kabuk.baslik("API", false);
  let sekme = "kasa";
  let kasaKipi = "giris";          // giris | var | olustur (kasa bağlı değilken)
  let adim = 0;
  const sekmeCubugu = h("div", { class: "sekmeler dortlu", role: "tablist" });
  const govde = h("div", { class: "sayfa" });
  kok.append(sekmeCubugu, govde);

  // ── Kasa: bağlı değil ───────────────────────────────────────────────────────
  function kasaGiris() {
    return h("section", { class: "kart" },
      h("h2", null, "Kasa nedir?"),
      h("p", null, "Kasa, API anahtarlarının durduğu yerdir. Anahtarlar telefonda değil, senin kendi ücretsiz "
        + "Cloudflare hesabında saklanır. Telefon yalnızca kasanın adresini ve parolasını bilir."),
      h("p", { class: "soluk" }, "Telefonun kaybolsa ya da parola çalınsa bile anahtarların okunamaz; parolayı değiştirmen yeter. "
        + "Kasa bir kez kurulur, sonra bütün hesaplarını buradan eklersin."),
      h("div", { class: "satir" },
        h("button", { class: "dugme birincil", onclick: () => { kasaKipi = "var"; ciz(); } }, "Kasa hesabım var"),
        h("button", { class: "dugme", onclick: () => { kasaKipi = "olustur"; adim = 0; ciz(); } }, "Kasa hesabı oluştur")));
  }

  function baglanFormu(parolaDegeri, bitince) {
    const durum = h("p", { class: "durum", role: "status" });
    const adres = girdi("url", ayar.kasaAdres, "https://studioflow-kasa.….workers.dev");
    const parola = girdi("text", parolaDegeri);
    const dugme = h("button", { class: "dugme birincil", onclick: async () => {
      dugme.disabled = true;
      durumYaz(durum, "Kasaya bağlanılıyor…");
      try {
        await havuz.kasaBaglan(adres.value, parola.value);
        try { sessionStorage.removeItem(KURULUM_PAROLASI); } catch { /* özel sekme */ }
        bitince();
      } catch (hata) {
        durumYaz(durum, hata.message, "hata");
        dugme.disabled = false;
      }
    } }, "Bağlan");
    return [h("label", null, "Kasa adresi", adres), h("label", null, "Kasa parolası", parola), h("div", { class: "satir" }, dugme), durum];
  }

  function kasaVar() {
    return h("section", { class: "kart" },
      h("h2", null, "Kasaya bağlan"),
      h("p", { class: "soluk" }, "Kasanın adresini ve parolasını yaz. Bu telefon ikisini de hatırlar; bir daha sormaz."),
      baglanFormu("", () => { kasaKipi = "giris"; ciz(); }),
      h("div", { class: "satir" }, h("button", { class: "dugme kucuk", onclick: () => { kasaKipi = "giris"; ciz(); } }, "‹ Geri")));
  }

  function kurulumParolasi() {
    let parola = null;
    try { parola = sessionStorage.getItem(KURULUM_PAROLASI); } catch { /* özel sekme */ }
    if (!parola) {
      parola = havuz.parolaUret();
      try { sessionStorage.setItem(KURULUM_PAROLASI, parola); } catch { /* özel sekme */ }
    }
    return parola;
  }

  function kasaOlustur() {
    const parola = kurulumParolasi();
    const kopyaDugmesi = (etiket, metinAl) => h("button", { class: "dugme birincil", onclick: async (o) => kopyala(await metinAl(), o.target) }, etiket);
    const kutu = (deger) => h("input", { type: "text", value: deger, readonly: true, class: "kopya-kutu", onfocus: (o) => o.target.select() });
    const ADIMLAR = [
      { baslik: "Cloudflare'de kasayı aç",
        metin: ["Cloudflare hesabın yoksa açılan sayfada ücretsiz bir hesap oluştur.",
                "“Start with Hello World!”ü seç. Ada studioflow-kasa yaz, Deploy'a bas."],
        ogeler: [disBag("Cloudflare'i aç", "https://dash.cloudflare.com/?to=/:account/workers-and-pages/create", "dugme birincil")] },
      { baslik: "Kasa kodunu yapıştır",
        metin: ["Aşağıdaki düğmeyle kodu kopyala.",
                "Cloudflare'de “Edit code”a bas. Oradaki yazının tamamını sil, kopyaladığını yapıştır, Deploy'a bas."],
        ogeler: [kopyaDugmesi("Kodu kopyala", async () => (await fetch("araci/kasa.js", { cache: "no-store" })).text())] },
      { baslik: "Depolama oluştur",
        metin: ["Hesapların burada saklanır.",
                "Açılan sayfada “Create”e bas, ada kasa-depo yaz, oluştur."],
        ogeler: [disBag("Depolama sayfasını aç", "https://dash.cloudflare.com/?to=/:account/workers/kv/namespaces", "dugme birincil")] },
      { baslik: "Depolamayı kasaya bağla",
        metin: ["studioflow-kasa sayfasına dön. “Bindings” kutusunda “Add a binding”e bas, “KV namespace”i seç.",
                "Variable name alanına DEPO yaz, listeden kasa-depo'yu seç, kaydet."],
        ogeler: [kutu("DEPO"), disBag("Kasalarımı aç", "https://dash.cloudflare.com/?to=/:account/workers-and-pages")] },
      { baslik: "Parolayı ekle",
        metin: ["Bu parola senin kasana özel üretildi. Bir yere kaydet; telefon değiştirirsen gerekir.",
                "studioflow-kasa › Settings › Variables and Secrets › Add. Type: Secret, ad: KASA_PAROLA, değer: bu parola. Deploy'a bas."],
        ogeler: [h("label", null, "Ad", kutu("KASA_PAROLA")), h("label", null, "Parola", kutu(parola)),
                 kopyaDugmesi("Parolayı kopyala", async () => parola)] },
      { baslik: "Bağlan",
        metin: ["Kasanın adresi studioflow-kasa sayfasının üstünde yazar (…workers.dev ile biter). Buraya yaz ve bağlan."],
        ogeler: baglanFormu(parola, () => { kasaKipi = "giris"; ciz(); }) },
    ];
    const a = ADIMLAR[adim];
    return h("section", { class: "kart" },
      h("p", { class: "adim-sayaci" }, `Adım ${adim + 1} / ${ADIMLAR.length}`),
      h("h2", null, a.baslik),
      a.metin.map((m) => h("p", null, m)),
      a.ogeler,
      h("div", { class: "satir" },
        h("button", { class: "dugme", onclick: () => { if (adim === 0) kasaKipi = "giris"; else adim--; ciz(); } }, adim === 0 ? "‹ Vazgeç" : "‹ Geri"),
        adim < ADIMLAR.length - 1 ? h("button", { class: "dugme", onclick: () => { adim++; ciz(); } }, "Yaptım, ileri ›") : null));
  }

  // ── Kasa: bağlı ─────────────────────────────────────────────────────────────
  function kasaBagli() {
    const durum = h("p", { class: "durum", role: "status" });
    const parolaKutusu = h("input", { type: "text", value: ayar.kasaParola, readonly: true, class: "kopya-kutu", hidden: true,
                                      onfocus: (o) => o.target.select() });
    const ozet = Object.entries(havuz.HIZMETLER).map(([k, t]) => `${t.ad} ${havuz.hizmetOzeti(k).toplam}`).join(" · ");
    return h("section", { class: "kart" },
      h("h2", null, "Kasa bağlı"),
      h("p", { class: "durum tamam" }, ozet),
      h("p", { class: "soluk adres" }, ayar.kasaAdres),
      havuz.kasaYazilabilir() ? null : h("p", { class: "durum hata" },
        "Kasaya depolama bağlı değil; hesap eklenemez. Cloudflare'de bir depolama oluşturup kasaya DEPO adıyla bağla (kurulumun 3. ve 4. adımı)."),
      h("p", { class: "soluk" }, "Hesaplarını üstteki Gemini, Cloudflare ve Hugging Face sayfalarından ekle."),
      parolaKutusu,
      h("div", { class: "satir" },
        h("button", { class: "dugme kucuk", onclick: async () => {
          durumYaz(durum, "Kasa yenileniyor…");
          try { await havuz.kasaYenile(); ciz(); } catch (hata) { durumYaz(durum, hata.message, "hata"); }
        } }, "Yenile"),
        h("button", { class: "dugme kucuk", onclick: (o) => {
          parolaKutusu.hidden = !parolaKutusu.hidden;
          o.target.textContent = parolaKutusu.hidden ? "Parolayı göster" : "Parolayı gizle";
        } }, "Parolayı göster"),
        h("button", { class: "dugme kucuk", onclick: () => {
          if (!confirm("Kasa bağlantısı bu telefondan kaldırılsın mı? Kasadaki hesaplara dokunulmaz.")) return;
          havuz.kasaAyril();
          kasaKipi = "giris";
          ciz();
        } }, "Bağlantıyı kes")),
      durum,
      h("p", { class: "soluk" }, "Parolayı değiştirmek için: Cloudflare'de studioflow-kasa › Settings › Variables and Secrets › "
        + "KASA_PAROLA'yı düzenle, Deploy'a bas; sonra burada bağlantıyı kesip yeni parolayla bağlan."));
  }

  // ── Servis sayfaları ────────────────────────────────────────────────────────
  function servisSayfasi(hizmet) {
    const tanim = havuz.HIZMETLER[hizmet], not = SERVIS_NOTU[hizmet];
    const durum = h("p", { class: "durum", role: "status" });
    const aktif = havuz.aktifHesap(hizmet);
    const ad = girdi("text", "", "Hesap adı (ör. kişisel)");
    const alanlar = tanim.alanlar.map(([alan, etiket]) => [alan, girdi("text", "", etiket)]);
    const ekle = h("button", { class: "dugme birincil", disabled: !havuz.kasaYazilabilir(), onclick: async () => {
      ekle.disabled = true;
      durumYaz(durum, "Anahtar deneniyor ve kasaya kaydediliyor…");
      try {
        await havuz.hesapEkle(hizmet, ad.value, Object.fromEntries(alanlar.map(([alan, oge]) => [alan, oge.value])));
        ciz();
      } catch (hata) {
        durumYaz(durum, hata.message, "hata");
        ekle.disabled = false;
      }
    } }, "Kasaya kaydet");
    const satirlar = havuz.hesapAdlari(hizmet).map((hesapAdi) => {
      const acilis = havuz.kotaBekliyor(hizmet, hesapAdi);
      return h("div", { class: "hesap-satir" },
        h("span", null, (hesapAdi === aktif ? "★ " : "") + hesapAdi,
          acilis ? h("small", null, ` · kota doldu, ${havuz.saatYaz(acilis)}'de açılır`) : null),
        hesapAdi === aktif ? null : h("button", { class: "dugme kucuk", onclick: () => { havuz.aktifYap(hizmet, hesapAdi); ciz(); } }, "İlk sıraya al"),
        h("button", { class: "dugme kucuk", onclick: async (o) => {
          if (!confirm(`${tanim.ad} '${hesapAdi}' hesabı kasadan silinsin mi?`)) return;
          o.target.disabled = true;
          try { await havuz.hesapSil(hizmet, hesapAdi); ciz(); } catch (hata) { durumYaz(durum, hata.message, "hata"); o.target.disabled = false; }
        } }, "Sil"));
    });
    const kartlar = [
      h("section", { class: "kart" },
        h("h2", null, `${tanim.ad} hesabı ekle`),
        h("p", { class: "soluk" }, not.metin),
        h("div", { class: "satir" }, disBag(not.dugme, not.adres)),
        ad, alanlar.map(([, oge]) => oge),
        h("div", { class: "satir" }, ekle),
        durum),
      h("section", { class: "kart" },
        h("h2", null, `Hesaplar (${satirlar.length})`),
        satirlar.length ? satirlar : h("p", { class: "soluk" }, "Henüz hesap yok."),
        satirlar.length > 1 ? h("p", { class: "soluk" }, "Üretim ★ işaretli hesapla başlar; kotası dolunca sıradakine geçer.") : null,
        havuz.hizmetOzeti(hizmet).bekleyen ? h("div", { class: "satir" },
          h("button", { class: "dugme kucuk", onclick: () => { havuz.kotaTemizle(hizmet); ciz(); } }, "Kota beklemelerini sıfırla")) : null),
    ];
    return kartlar;
  }

  // ── İskelet ─────────────────────────────────────────────────────────────────
  function ciz() {
    const bagli = havuz.kasaAcik();
    if (!bagli) sekme = "kasa";
    sekmeCubugu.replaceChildren(...SEKMELER.map(([ad, etiket]) => {
      const kilitli = ad !== "kasa" && !bagli;
      return h("button", { role: "tab", "aria-selected": String(sekme === ad), class: sekme === ad ? "secili" : "", disabled: kilitli,
                           title: kilitli ? "Önce kasaya bağlan" : null,
                           onclick: () => { sekme = ad; ciz(); window.scrollTo(0, 0); } }, (kilitli ? "🔒 " : "") + etiket);
    }));
    govde.replaceChildren(...[sekme !== "kasa" ? servisSayfasi(sekme)
      : bagli ? kasaBagli() : kasaKipi === "var" ? kasaVar() : kasaKipi === "olustur" ? kasaOlustur() : kasaGiris()].flat());
  }
  ciz();
  // Telefon kasayı hatırlar: sayfa açılınca hesap listesi kasadan tazelenir.
  if (havuz.kasaAcik()) havuz.kasaYenile().then(ciz).catch(() => {});
  return null;
}
