// Ayarlar ekranı: kasa bağlantısı, telefondaki hesaplar, diğer ayarlar ve cihaz raporu.
import { h, durumYaz } from "../dom.js";
import { ayar, ayarGuncelle } from "../ayar.js";
import * as havuz from "../hesap.js";
import { cihazRaporu, raporMetni } from "../cihaz.js";

const girdi = (tur, deger, yerTutucu) => h("input", { type: tur, value: deger || "", placeholder: yerTutucu || null,
  autocomplete: "off", autocapitalize: "off", spellcheck: "false" });

export async function ayarlarGorunumu(kok, kabuk, surum) {
  kabuk.baslik("Ayarlar", false);
  const sayfa = h("div", { class: "sayfa" });
  kok.append(sayfa);

  // ── Kasa ────────────────────────────────────────────────────────────────────
  function kasaKarti() {
    const durum = h("p", { class: "durum", role: "status" });
    const adres = girdi("url", ayar.kasaAdres, "https://….workers.dev");
    const parola = girdi("password", ayar.kasaParola);
    const bagli = havuz.kasaAcik();
    const ozet = bagli
      ? "Bağlı · " + Object.entries(havuz.HIZMETLER).map(([k, t]) => `${t.ad} ${havuz.hizmetOzeti(k).toplam}`).join(" · ")
      : "Bağlı değil";
    return h("section", { class: "kart" },
      h("h2", null, "Kasa"),
      h("p", { class: "soluk" }, "Kasa, API anahtarlarını telefonda değil kendi Cloudflare hesabındaki bir Worker'da tutar. "
        + "Telefonda yalnızca kasa parolası durur; parola çalınsa bile anahtarlar okunamaz, parolayı değiştirmen yeter. Kurulum ",
        h("a", { href: "https://github.com/HappyGuppy1/StudioFlow-Mobil#kasa", target: "_blank", rel: "noopener" }, "burada"), " anlatılıyor."),
      h("p", { class: "durum" + (bagli ? " tamam" : "") }, ozet),
      h("label", null, "Kasa adresi", adres),
      h("label", null, "Kasa parolası", parola),
      h("div", { class: "satir" },
        h("button", { class: "dugme birincil", onclick: async (o) => {
          o.target.disabled = true;
          durumYaz(durum, "Kasaya bağlanılıyor…");
          try {
            const sayilar = await havuz.kasaBaglan(adres.value, parola.value);
            const toplam = Object.values(sayilar).reduce((a, b) => a + b, 0);
            ciz();
            durumYaz(sayfa.querySelector("[data-kasa-durum]"), toplam ? "Kasaya bağlanıldı." : "Kasaya bağlanıldı, ama kasada hiç hesap yok.", toplam ? "tamam" : "hata");
          } catch (hata) {
            durumYaz(durum, hata.message, "hata");
            o.target.disabled = false;
          }
        } }, bagli ? "Yeniden bağlan" : "Bağlan"),
        bagli ? h("button", { class: "dugme", onclick: () => {
          if (!confirm("Kasa bağlantısı bu cihazdan kaldırılsın mı? Kasadaki anahtarlara dokunulmaz.")) return;
          havuz.kasaAyril();
          ciz();
        } }, "Bağlantıyı kaldır") : null),
      durum,
      h("p", { class: "durum", role: "status", "data-kasa-durum": "" }));
  }

  // ── Telefondaki hesaplar (kasasız kullanım) ─────────────────────────────────
  function hizmetBolumu(hizmet) {
    const tanim = havuz.HIZMETLER[hizmet];
    const o = havuz.hizmetOzeti(hizmet);
    const durum = h("p", { class: "durum", role: "status" });
    const ozet = `${tanim.ad}: ${o.toplam} hesap` + (o.bekleyen ? ` · ${o.bekleyen} tanesi kota bekliyor (en erken ${havuz.saatYaz(o.enErken)})` : "");
    if (havuz.kasaAcik()) return h("p", { class: "hesap-ozet" }, ozet);
    const aktif = havuz.aktifHesap(hizmet);
    const ad = girdi("text", "", "Hesap adı (ör. kişisel)");
    const alanlar = tanim.alanlar.map(([alan, etiket]) => [alan, girdi(alan.includes("account") ? "text" : "password", "", etiket)]);
    return h("details", { class: "hesap-grubu" },
      h("summary", null, ozet),
      havuz.yerelHesaplar(hizmet).map((hesapAdi) => h("div", { class: "hesap-satir" },
        h("span", null, (hesapAdi === aktif ? "★ " : "") + hesapAdi),
        hesapAdi === aktif ? null : h("button", { class: "dugme kucuk", onclick: () => { havuz.aktifYap(hizmet, hesapAdi); ciz(); } }, "Aktif yap"),
        h("button", { class: "dugme kucuk", onclick: () => {
          if (!confirm(`${tanim.ad} '${hesapAdi}' hesabı bu cihazdan silinsin mi?`)) return;
          havuz.hesapSil(hizmet, hesapAdi);
          ciz();
        } }, "Sil"))),
      h("div", { class: "hesap-ekle" }, ad, alanlar.map(([, oge]) => oge),
        h("button", { class: "dugme kucuk", onclick: () => {
          try {
            havuz.hesapEkle(hizmet, ad.value, Object.fromEntries(alanlar.map(([alan, oge]) => [alan, oge.value])));
            ciz();
          } catch (hata) {
            durumYaz(durum, hata.message, "hata");
          }
        } }, "Hesap ekle")),
      durum);
  }

  function hesaplarKarti() {
    const kasa = havuz.kasaAcik();
    return h("section", { class: "kart" },
      h("h2", null, kasa ? "Kasadaki hesaplar" : "Telefondaki hesaplar"),
      h("p", { class: "soluk" }, kasa
        ? "Hesaplar kasadan geliyor. Kotası biten hesap atlanır, sıradakiyle sürülür. Hesap eklemek ya da çıkarmak için kasadaki listeyi düzenle, sonra “Yeniden bağlan”a bas."
        : "Kasa kullanmıyorsan anahtarları buraya girebilirsin; yalnızca bu cihazda, şifresiz saklanır. Bu yüzden yalnızca birkaç hesap gir; çok hesap için kasa kullan. "
          + "Kotası biten hesap atlanır, sıradakiyle sürülür."),
      Object.keys(havuz.HIZMETLER).map(hizmetBolumu),
      h("div", { class: "satir" },
        h("button", { class: "dugme kucuk", onclick: () => { havuz.kotaTemizle(); ciz(); } }, "Kota bekleme listesini temizle"),
        kasa ? null : h("button", { class: "dugme kucuk", onclick: () => {
          if (!confirm("Telefondaki bütün API hesapları silinsin mi?")) return;
          havuz.tumunuSil();
          ciz();
        } }, "Bütün hesapları sil")));
  }

  // ── Diğer ayarlar ───────────────────────────────────────────────────────────
  function digerKarti() {
    const durum = h("p", { class: "durum", role: "status" });
    const alanlar = [
      ...(havuz.kasaAcik() ? [] : [["cfAraci", "Cloudflare aracı adresi (kasasız görsel üretimi için)", "url", "https://….workers.dev"]]),
      ["ltxSpaceler", "Kendi LTX Space'lerin (isteğe bağlı; virgülle ayır)", "text"],
      ["ltxErisim", "Kendi Space erişim anahtarı (isteğe bağlı)", "password"],
    ].map(([ad, etiket, tur, yerTutucu]) => [ad, etiket, girdi(tur, ayar[ad], yerTutucu)]);
    return h("section", { class: "kart" },
      h("h2", null, "Diğer"),
      alanlar.map(([, etiket, oge]) => h("label", null, etiket, oge)),
      h("p", { class: "soluk" }, "Kendi LTX Space'in yoksa resmî Space kullanılır. Kasasız görsel üretimi için küçük bir aracı gerekir; kurulumu ",
        h("a", { href: "https://github.com/HappyGuppy1/StudioFlow-Mobil#cloudflare-aracısı", target: "_blank", rel: "noopener" }, "burada"), "."),
      h("div", { class: "satir" }, h("button", { class: "dugme", onclick: () => {
        const oldu = ayarGuncelle(Object.fromEntries(alanlar.map(([ad, , oge]) => [ad, oge.value.trim()])));
        durumYaz(durum, oldu ? "Kaydedildi." : "Kaydedilemedi: tarayıcı depolamayı engelliyor.", oldu ? "tamam" : "hata");
      } }, "Kaydet")),
      durum);
  }

  // ── Cihaz raporu ────────────────────────────────────────────────────────────
  const liste = h("ul", { class: "rapor" });
  const raporDurumu = h("p", { class: "durum", role: "status" });
  let satirlar = [];
  const rapor = h("section", { class: "kart" },
    h("h2", null, "Cihaz raporu"),
    h("p", { class: "soluk" }, "Bu telefonun neleri desteklediğini gösterir. Bir sorun olursa raporu kopyalayıp gönder (anahtar içermez)."),
    liste,
    h("div", { class: "satir" },
      h("button", { class: "dugme", onclick: async () => {
        let son = null;
        try { son = sessionStorage.getItem("son-aktarim"); } catch { /* özel sekme */ }
        const metin = raporMetni(satirlar, [`Sürüm: ${surum}`, `Kasa: ${havuz.kasaAcik() ? "bağlı" : "yok"}`, son].filter(Boolean));
        try {
          await navigator.clipboard.writeText(metin);
          durumYaz(raporDurumu, "Rapor panoya kopyalandı.", "tamam");
        } catch {
          durumYaz(raporDurumu, metin);
        }
      } }, "Raporu kopyala")),
    raporDurumu);
  cihazRaporu().then((s) => {
    satirlar = s;
    liste.replaceChildren(...s.map((satir) => h("li", null,
      h("span", { class: satir.durum === true ? "var" : satir.durum === false ? "yok" : "bilinmiyor" },
        satir.durum === true ? "✓" : satir.durum === false ? "✗" : "?"),
      h("div", null, satir.ad, satir.not ? h("div", { class: "not" }, satir.not) : null))));
  });

  function ciz() {
    sayfa.replaceChildren(kasaKarti(), hesaplarKarti(), digerKarti(), rapor,
      h("p", { class: "alt-not" }, `StudioFlow Mobil · sürüm ${surum}`));
  }
  ciz();
  return null;
}
