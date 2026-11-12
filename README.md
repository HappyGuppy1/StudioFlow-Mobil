# StudioFlow Mobil

[StudioFlow](https://github.com/HappyGuppy1/StudioFlow)'un telefonda çalışan sürümü. Tarayıcıdan açılır,
ana ekrana eklenince uygulama gibi çalışır (PWA). Senaryo, seslendirme, görsel, hareketli klip ve video
dışa aktarma telefonda yapılır.

**Aç:** https://happyguppy1.github.io/StudioFlow-Mobil/

> **Sürüm 0.5 (erken sürüm).** API anahtarları telefonda değil, kendi Cloudflare hesabındaki **kasada**
> durur. Projeler telefonda saklanır; yarıda kalan üretim kaldığı yerden sürer.

## Telefona kurulum

**iPhone / iPad (Safari):** adresi Safari'de aç › Paylaş düğmesi › **Ana Ekrana Ekle**.

**Android (Chrome):** adresi aç › ⋮ menüsü › **Uygulamayı yükle** (ya da *Ana ekrana ekle*).

Uygulama ilk açılıştan sonra çevrimdışı da açılır; üretim için internet gerekir. Güncellemeler
kendiliğinden gelir.

## Kullanım

1. **API › Kasa:** önce kasanı kur ya da var olan kasana bağlan (aşağıya bak). Kasa bağlanana kadar
   diğer sayfalar kilitlidir.
2. **API › Gemini / Cloudflare / Hugging Face:** hesaplarını ekle. Her hesap kaydedilmeden önce denenir
   ve doğrudan kasaya yazılır. Aynı servise birden çok hesap ekleyebilirsin; kotası dolan hesap atlanır,
   sıradakiyle sürülür.
3. **Projeler › Yeni proje › Senaryo:** anlatım metnini yaz ya da yapıştır; istersen konuyu yazıp
   *Senaryoyu Gemini yazsın*'a bas. Dili, sesi ve biçimi seç, *Sahnelere böl*'e bas.
4. **Sahneler:** *Eksikleri üret* sırayla görsel tariflerini, seslendirmeyi, görselleri ve (açıksa)
   hareketli klipleri üretir. Her sahneyi ayrı ayrı düzeltebilir ya da galeriden görsel seçebilirsin.
5. **Video:** istersen altyazıyı aç, *Videoyu oluştur*'a bas, sonra *Kaydet / Paylaş* ile kaydet.

| Servis | Ne için | Zorunlu mu |
|---|---|---|
| Gemini | Seslendirme, senaryo, görsel tarifleri | Evet |
| Cloudflare (Workers AI) | Görsel üretimi | Hayır; görselleri galeriden de ekleyebilirsin |
| Hugging Face | Görselleri hareketli klibe çevirme (LTX) | Hayır |

## Kasa

Kasa, API anahtarlarının durduğu yerdir: kendi ücretsiz Cloudflare hesabında çalışan küçük bir
Worker ([`araci/kasa.js`](araci/kasa.js)). Telefon yalnızca kasanın adresini ve parolasını bilir; isteği
kasaya gönderir, kasa doğru hesabın anahtarını ekleyip servise iletir. Anahtarlar hiçbir yanıtta
telefona dönmez.

Kurulum uygulamanın içinde, **API › Kasa › Kasa hesabı oluştur** altında adım adım anlatılır ve
telefondan yapılabilir:

1. Cloudflare'de bir Worker aç (`studioflow-kasa`).
2. Kasa kodunu yapıştır (uygulama kopyalar).
3. Bir KV depolaması oluştur (`kasa-depo`).
4. Depolamayı Worker'a `DEPO` adıyla bağla.
5. Uygulamanın ürettiği parolayı `KASA_PAROLA` adıyla Secret olarak ekle.
6. Uygulamada kasa adresini yazıp bağlan.

Güvenlik notları:

- Kasa yalnızca şu işleri yapar: Gemini metin/ses, Workers AI, bir Hugging Face Space'inin Gradio API'si
  ve hesap ekleme/silme. Yalnızca bu uygulamanın adresinden gelen isteği kabul eder. Uygulamayı başka
  bir adreste yayınlıyorsan `kasa.js` içindeki `IZINLI_KOKENLER` listesine ekle.
- Parola çalınırsa anahtarlar okunamaz, ama parolayı değiştirene kadar kotan harcanabilir ve hesap
  eklenip silinebilir: `KASA_PAROLA`'yı değiştirip yeniden **Deploy** et.
- Kasanın durduğu Cloudflare hesabında iki adımlı doğrulamayı aç; o hesaba giren kasadaki anahtarlara
  da ulaşır. Faturası açık anahtarları kasaya koyma.

## Bilinen sınırlar

- **Ekran açık kalmalı.** Telefon, arka plana alınan ya da kilitlenen uygulamayı durdurur. Uygulama
  üretim sırasında ekranı açık tutar.
- **Uzun videolar.** Video bellekte oluşturulur; kısa videolar sorunsuzdur, çok uzun videolar telefonun
  belleğini aşabilir.
- **Zamanlama yaklaşıktır.** Sahne geçişleri ve altyazı süreleri metin uzunluğuna göre paylaştırılır,
  kelime kelime hizalanmaz.
- **Klipler kotalıdır.** Hareketlendirme Hugging Face'in ücretsiz ZeroGPU kotasını kullanır (klip başına
  yaklaşık 40 sn). Kota dolunca kalan sahneler yavaş yakınlaşan durağan görselle gösterilir.
- **Projeler tarayıcı deposundadır.** Uygulamayı ana ekrana kur; Safari'de site verilerini silersen
  projeler de silinir (kasadaki hesaplar silinmez).
- **Eski iPhone'lar.** iOS 26 öncesinde hızlı ses kodlayıcısı yoktur; uygulama kendiliğinden gerçek
  zamanlı kayda geçer (video süresi kadar sürer).
- Sorun yaşarsan **Ayarlar › Cihaz raporu**'nu kopyalayıp bir
  [issue](https://github.com/HappyGuppy1/StudioFlow-Mobil/issues) aç.

## Geliştirme

Derleme adımı yoktur; düz HTML, CSS ve JavaScript modülleridir. Klasörü `python -m http.server 8765`
ile sunup `http://127.0.0.1:8765/` adresini aç.

| Dosya | Görev |
|---|---|
| `js/app.js` | Kabuk ve yönlendirme |
| `js/gorunum/` | Ekranlar: projeler, proje (senaryo / sahneler / video), API, ayarlar |
| `js/hesap.js` | Kasa bağlantısı, hesap havuzu, kota bekleme listesi |
| `js/sahne.js` | Proje modeli: sahnelere bölme, ses planı, zamanlama, altyazı |
| `js/depo.js` | Kalıcı depo (IndexedDB): projeler, görseller, ses, klipler |
| `js/metin.js` | Gemini ile senaryo ve görsel tarifi |
| `js/gemini.js` | Gemini TTS ile seslendirme |
| `js/cloudflare.js` | Cloudflare Workers AI ile görsel |
| `js/video_ltx.js` | Hugging Face LTX Space'i ile görselden klip |
| `js/disa_aktar.js` | Video dışa aktarma (WebCodecs; yedek: MediaRecorder) |
| `sw.js` | Çevrimdışı açılış |
| `araci/kasa.js` | Kasa (Cloudflare Worker) |

MP4 dosyası [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) (MIT) ile yazılır.

## Lisans

[MIT](LICENSE)
