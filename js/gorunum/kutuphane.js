// Projeler ekranı: telefonda kayıtlı projelerin listesi.
import { h } from "../dom.js";
import * as depo from "../depo.js";
import { yeniProje } from "../sahne.js";
import { kayittanBlob } from "../gorsel.js";

export async function kutuphaneGorunumu(kok, kabuk) {
  kabuk.baslik("", false);
  const adresler = [];
  const projeler = (await depo.projeler.hepsi()).sort((a, b) => b.guncelleme - a.guncelleme);

  const yeni = h("button", { class: "dugme birincil genis", onclick: async () => {
    const proje = yeniProje();
    await depo.projeler.yaz(proje);
    depo.kaliciIste();
    location.hash = `#/proje/${proje.id}`;
  } }, "＋ Yeni proje");

  const kartlar = projeler.map((p) => {
    const kapak = h("div", { class: "kapak" });
    const ilk = p.sahneler.find((s) => s.gorselVar);
    if (ilk) {
      depo.dosyalar.al(depo.gorselAnahtari(p.id, ilk.id)).then((kayit) => {
        if (!kayit) return;
        const adres = URL.createObjectURL(kayittanBlob(kayit));
        adresler.push(adres);
        kapak.style.backgroundImage = `url("${adres}")`;
      }).catch(() => {});
    }
    const gorselli = p.sahneler.filter((s) => s.gorselVar).length;
    const ozet = p.sahneler.length
      ? `${p.sahneler.length} sahne · ${gorselli} görsel`
      : (p.senaryo.trim() ? "Senaryo yazıldı" : "Boş proje");
    const kart = h("a", { class: "proje-kart", href: `#/proje/${p.id}` },
      kapak,
      h("div", { class: "proje-bilgi" },
        h("h3", null, p.ad || "Adsız proje"),
        h("p", { class: "soluk" }, `${ozet} · ${new Date(p.guncelleme).toLocaleDateString("tr-TR")}`)),
      h("button", { class: "kart-sil", "aria-label": `${p.ad} projesini sil`, onclick: async (olay) => {
        olay.preventDefault();
        olay.stopPropagation();
        if (!confirm(`"${p.ad}" projesi ve tüm dosyaları bu telefondan silinsin mi? Geri alınamaz.`)) return;
        await depo.dosyalar.onekSil(`${p.id}:`);
        await depo.projeler.sil(p.id);
        kart.remove();
        if (!liste.querySelector(".proje-kart")) liste.append(bos());
      } }, "×"));
    return kart;
  });

  const bos = () => h("p", { class: "soluk bos" },
    "Henüz proje yok. Yeni bir proje aç; senaryonu yaz ya da yapıştır, uygulama sahnelere bölüp "
    + "seslendirsin, görselleri üretsin ve videoyu oluştursun.");
  const liste = h("div", { class: "proje-liste" }, kartlar.length ? kartlar : bos());
  kok.append(h("div", { class: "sayfa" }, yeni, liste));

  return () => adresler.forEach((a) => URL.revokeObjectURL(a));
}
