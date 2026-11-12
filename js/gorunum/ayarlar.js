// Ayarlar ekranı: bağlantı anahtarları ve cihaz raporu.
import { h, durumYaz } from "../dom.js";
import { ayar, ayarGuncelle } from "../ayar.js";
import { cihazRaporu, raporMetni } from "../cihaz.js";

const ALANLAR = [
  ["gemini", "Gemini API anahtarı (seslendirme, senaryo, prompt)", "password"],
  ["cfHesap", "Cloudflare Account ID (görsel)", "text"],
  ["cfToken", "Cloudflare API token", "password"],
  ["cfAraci", "Aracı adresi (Cloudflare Worker)", "url"],
];

export async function ayarlarGorunumu(kok, kabuk, surum) {
  kabuk.baslik("Ayarlar", false);
  const girdiler = {};
  const durum = h("p", { class: "durum", role: "status" });
  const form = h("section", { class: "kart" },
    h("h2", null, "Bağlantılar"),
    h("p", { class: "soluk" }, "Anahtarlar yalnızca bu cihazda saklanır; hiçbir sunucuya ya da depoya gönderilmez."),
    ALANLAR.map(([ad, etiket, tur]) => h("label", null, etiket,
      girdiler[ad] = h("input", { type: tur, value: ayar[ad] || "", autocomplete: "off", autocapitalize: "off",
                                  spellcheck: "false", placeholder: ad === "cfAraci" ? "https://….workers.dev" : null }))),
    h("p", { class: "soluk" },
      "Gemini anahtarı ", h("a", { href: "https://aistudio.google.com/apikey", target: "_blank", rel: "noopener" }, "Google AI Studio"),
      "'dan ücretsiz alınır. Cloudflare tarayıcıdan doğrudan çağrıya izin vermediği için küçük bir aracı gerekir; kurulumu ",
      h("a", { href: "https://github.com/HappyGuppy1/StudioFlow-Mobil#cloudflare-aracısı", target: "_blank", rel: "noopener" }, "burada"),
      " anlatılıyor. Aracı yoksa görselleri galeriden ekleyebilirsin."),
    h("div", { class: "satir" },
      h("button", { class: "dugme birincil", onclick: () => {
        const oldu = ayarGuncelle(Object.fromEntries(ALANLAR.map(([ad]) => [ad, girdiler[ad].value.trim()])));
        durumYaz(durum, oldu ? "Kaydedildi (yalnızca bu cihazda)." : "Kaydedilemedi: tarayıcı depolamayı engelliyor.",
                 oldu ? "tamam" : "hata");
      } }, "Kaydet"),
      h("button", { class: "dugme", onclick: () => {
        if (!confirm("Anahtarlar bu cihazdan silinsin mi?")) return;
        ayarGuncelle(Object.fromEntries(ALANLAR.map(([ad]) => [ad, ""])));
        for (const [ad] of ALANLAR) girdiler[ad].value = "";
        durumYaz(durum, "Anahtarlar bu cihazdan silindi.", "tamam");
      } }, "Anahtarları sil")),
    durum);

  const liste = h("ul", { class: "rapor" });
  const raporDurumu = h("p", { class: "durum", role: "status" });
  let satirlar = [];
  const yenile = async () => {
    satirlar = await cihazRaporu();
    liste.replaceChildren(...satirlar.map((s) => h("li", null,
      h("span", { class: s.durum === true ? "var" : s.durum === false ? "yok" : "bilinmiyor" },
        s.durum === true ? "✓" : s.durum === false ? "✗" : "?"),
      h("div", null, s.ad, s.not ? h("div", { class: "not" }, s.not) : null))));
  };
  const rapor = h("section", { class: "kart" },
    h("h2", null, "Cihaz raporu"),
    h("p", { class: "soluk" }, "Bu telefonun neleri desteklediğini gösterir. Bir sorun olursa raporu kopyalayıp gönder."),
    liste,
    h("div", { class: "satir" },
      h("button", { class: "dugme", onclick: async () => {
        const son = sessionStorage.getItem("son-aktarim");
        const metin = raporMetni(satirlar, [`Sürüm: ${surum}`, son].filter(Boolean));
        try {
          await navigator.clipboard.writeText(metin);
          durumYaz(raporDurumu, "Rapor panoya kopyalandı.", "tamam");
        } catch {
          durumYaz(raporDurumu, metin);
        }
      } }, "Raporu kopyala")),
    raporDurumu);

  kok.append(h("div", { class: "sayfa" }, form, rapor,
    h("p", { class: "alt-not" }, `StudioFlow Mobil · sürüm ${surum}`)));
  yenile();
  return null;
}
