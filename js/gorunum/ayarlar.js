// Ayarlar ekranı: cihaz raporu ve sürüm. (API hesapları ve kasa, API sayfasındadır.)
import { h, durumYaz } from "../dom.js";
import * as havuz from "../hesap.js";
import { cihazRaporu, raporMetni } from "../cihaz.js";

export async function ayarlarGorunumu(kok, kabuk, surum) {
  kabuk.baslik("Ayarlar", false);
  const liste = h("ul", { class: "rapor" });
  const durum = h("p", { class: "durum", role: "status" });
  let satirlar = [];
  kok.append(h("div", { class: "sayfa" },
    h("section", { class: "kart" },
      h("h2", null, "Cihaz raporu"),
      h("p", { class: "soluk" }, "Bu telefonun neleri desteklediğini gösterir. Bir sorun olursa raporu kopyalayıp gönder (anahtar ya da parola içermez)."),
      liste,
      h("div", { class: "satir" },
        h("button", { class: "dugme", onclick: async () => {
          let son = null;
          try { son = sessionStorage.getItem("son-aktarim"); } catch { /* özel sekme */ }
          const metin = raporMetni(satirlar, [`Sürüm: ${surum}`, `Kasa: ${havuz.kasaAcik() ? "bağlı" : "yok"}`, son].filter(Boolean));
          try {
            await navigator.clipboard.writeText(metin);
            durumYaz(durum, "Rapor panoya kopyalandı.", "tamam");
          } catch {
            durumYaz(durum, metin);
          }
        } }, "Raporu kopyala")),
      durum),
    h("p", { class: "alt-not" }, `StudioFlow Mobil · sürüm ${surum}`)));
  satirlar = await cihazRaporu();
  liste.replaceChildren(...satirlar.map((satir) => h("li", null,
    h("span", { class: satir.durum === true ? "var" : satir.durum === false ? "yok" : "bilinmiyor" },
      satir.durum === true ? "✓" : satir.durum === false ? "✗" : "?"),
    h("div", null, satir.ad, satir.not ? h("div", { class: "not" }, satir.not) : null))));
  return null;
}
