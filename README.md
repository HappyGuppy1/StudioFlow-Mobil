# StudioFlow Mobil

[StudioFlow](https://github.com/HappyGuppy1/StudioFlow)'un telefonda çalışan sürümü. Tarayıcıdan açılır,
ana ekrana eklenince uygulama gibi çalışır (PWA). Sunucusu yoktur: seslendirme, görsel üretimi ve video
dışa aktarma doğrudan telefonda yapılır.

**Aç:** https://happyguppy1.github.io/StudioFlow-Mobil/

> **Sürüm 0.4 (erken sürüm).** Masaüstü StudioFlow'un ana akışı telefonda: senaryoyu yaz ya da Gemini'ye
> yazdır, sahnelere böl, sesi ve görselleri üret, istersen görselleri LTX ile hareketlendir, videoyu oluştur. Projeler telefonda saklanır; yarıda
> kalan üretim kaldığı yerden sürer.

## Telefona kurulum

**iPhone / iPad (Safari):** adresi Safari'de aç › Paylaş düğmesi › **Ana Ekrana Ekle**.

**Android (Chrome):** adresi aç › ⋮ menüsü › **Uygulamayı yükle** (ya da *Ana ekrana ekle*).

Uygulama ilk açılıştan sonra çevrimdışı da açılır; üretim adımları için internet gerekir. Güncellemeler
kendiliğinden gelir.

## Kullanım

1. **Ayarlar:** Gemini API anahtarını gir ([Google AI Studio](https://aistudio.google.com/apikey)'dan
   ücretsiz alınır). Görsel üretmek istersen Cloudflare bilgilerini, görselleri hareketlendirmek istersen
   Hugging Face token'ını da gir.
2. **Projeler › Yeni proje › Senaryo:** anlatım metnini yaz ya da yapıştır; istersen konuyu yazıp
   *Senaryoyu Gemini yazsın*'a bas. Dili, sesi ve biçimi (dikey / yatay) seç, *Sahnelere böl*'e bas.
3. **Sahneler:** *Eksikleri üret* sırayla görsel tariflerini (prompt), seslendirmeyi ve görselleri üretir.
   Her sahnenin anlatımını ve tarifini düzeltebilir, görselini yeniden üretebilir ya da galeriden
   seçebilirsin. Metni değişen sahnenin yalnızca kendi ses parçası yeniden okunur.
4. **Hareketli klipler (isteğe bağlı):** Senaryo sekmesinde *Görselleri hareketlendir*'i aç. *Eksikleri
   üret* her sahnenin görselini Hugging Face'teki LTX-2.3 ile birkaç saniyelik klibe çevirir.
5. **Video:** istersen altyazıyı aç, *Videoyu oluştur*'a bas, sonra *Kaydet / Paylaş* ile Fotoğraflar'a
   ya da Dosyalar'a kaydet.

Kasa kullanmıyorsan anahtarlar yalnızca telefonda (tarayıcı deposunda) saklanır. Bu depoya ya da herhangi bir sunucuya
gönderilmez; istekler doğrudan Google'a ve kendi Cloudflare hesabına gider.

## Kasa

Kasa, API anahtarlarını telefonda değil **kendi Cloudflare hesabındaki** küçük bir Worker'da tutar.
Telefonda yalnızca kasa parolası durur; uygulama isteği kasaya gönderir, kasa doğru hesabın anahtarını
ekleyip servise iletir. Anahtarlar hiçbir yanıtta telefona dönmez. Birden çok hesabın varsa (hesap
havuzu) kasa önerilir: kotası biten hesap atlanır, sıradakiyle sürülür.

1. [dash.cloudflare.com](https://dash.cloudflare.com/) › **Workers & Pages** › **Create** › **Worker** ›
   "Hello World" ile oluştur (ad: örn. `studioflow-kasa`).
2. **Edit code**'a bas, içeriği silip [`araci/kasa.js`](araci/kasa.js) dosyasının tamamını yapıştır,
   **Deploy**'a bas.
3. Worker'ın **Settings › Variables and Secrets** bölümüne şunları **Secret** türünde ekle, sonra
   **Deploy**'a bas:

   | Ad | Değer |
   |---|---|
   | `KASA_PAROLA` | Uzun, rastgele bir parola (en az 16 karakter) |
   | `GEMINI_HESAPLAR` | Her satır: `ad = anahtar` |
   | `CLOUDFLARE_HESAPLAR` | Her satır: `ad = account_id token` |
   | `HF_HESAPLAR` | Her satır: `ad = token` |

   Kullanmadığın servisin değişkenini eklemen gerekmez. Bir değişken en fazla 5 KB olabilir; sığmazsa
   devamını `GEMINI_HESAPLAR_2` gibi adlarla ekle.
4. Uygulamada **Ayarlar › Kasa**'ya Worker adresini (`https://<ad>.<hesap>.workers.dev`) ve parolayı
   gir, **Bağlan**'a bas.

Güvenlik notları:

- Kasa yalnızca dört işi yapar (Gemini metin/ses, Workers AI, bir Hugging Face Space'inin Gradio API'si,
  hesap adlarının listesi) ve yalnızca bu uygulamanın adresinden gelen isteği kabul eder. Uygulamayı
  başka bir adreste yayınlıyorsan `kasa.js` içindeki `IZINLI_KOKENLER` listesine ekle.
- Parola çalınırsa anahtarlar okunamaz, ama parolayı değiştirene kadar kotan harcanabilir: `KASA_PAROLA`'yı
  değiştirip yeniden **Deploy** et.
- Kasanın durduğu Cloudflare hesabında iki adımlı doğrulamayı aç; o hesaba giren kasadaki anahtarlara
  da ulaşır. Faturası açık anahtarları kasaya koyma.

Kasa kurmak istemezsen birkaç anahtarı **Ayarlar › Telefondaki hesaplar**'a doğrudan girebilirsin; bunlar
telefonda şifresiz durur.

## Cloudflare aracısı

> Kasa kullanıyorsan bu bölüme gerek yok; aracı yalnızca kasasız görsel üretimi içindir.


Cloudflare'in API'si tarayıcıdan gelen isteklere izin vermez (CORS). Görsel üretimi için kendi Cloudflare
hesabında küçük, ücretsiz bir Worker çalıştırman gerekir; uygulama isteği onun üzerinden gönderir.
Aracı token'ı saklamaz, yalnızca Workers AI üretim isteğini iletir.

1. [dash.cloudflare.com](https://dash.cloudflare.com/) › **Workers & Pages** › **Create** › **Worker** ›
   "Hello World" ile oluştur.
2. **Edit code**'a bas, içeriği silip [`araci/cloudflare-araci.js`](araci/cloudflare-araci.js) dosyasının
   tamamını yapıştır, **Deploy**'a bas.
3. Verilen adresi (`https://<ad>.<hesap>.workers.dev`) uygulamada **Bağlantılar › Aracı adresi** alanına yaz.
4. Aynı bölüme Account ID'yi ve *Workers AI* izinli API token'ı gir.

Aracı kurmak istemezsen görselleri galeriden ekleyebilirsin; seslendirme ve video aracısız çalışır.

## Bilinen sınırlar

- **Ekran açık kalmalı.** Telefon, arka plana alınan ya da kilitlenen uygulamayı durdurur. Uygulama
  üretim sırasında ekranı açık tutar.
- **Uzun videolar.** Video bellekte oluşturulur; kısa videolar (Shorts) sorunsuzdur, çok uzun videolar
  telefonun belleğini aşabilir.
- **Zamanlama yaklaşıktır.** Seslendirme birkaç sahne tek istekte okunur (kota için); sahne geçişleri ve
  altyazı süreleri metin uzunluğuna göre paylaştırılır, kelime kelime hizalanmaz.
- **Klipler kotalıdır.** Hareketlendirme Hugging Face'in ücretsiz ZeroGPU kotasını kullanır (klip başına
  yaklaşık 40 sn); ücretsiz hesapta günde birkaç klip çıkar. Kota dolunca kalan sahneler yavaş yakınlaşan
  durağan görselle gösterilir. Kendi LTX Space kopyan varsa adını ve erişim anahtarını Ayarlar'a yazabilirsin.
- **Projeler tarayıcı deposundadır.** Uygulamayı ana ekrana kur; Safari'de site verilerini silersen
  projeler de silinir.
- **Eski iPhone'lar.** iOS 26 öncesinde hızlı ses kodlayıcısı yoktur; uygulama kendiliğinden gerçek
  zamanlı kayda geçer (video süresi kadar sürer).
- Sorun yaşarsan uygulamanın altındaki **Cihaz raporu**'nu kopyalayıp bir
  [issue](https://github.com/HappyGuppy1/StudioFlow-Mobil/issues) aç.

## Geliştirme

Derleme adımı yoktur; düz HTML, CSS ve JavaScript modülleridir.

```
python -m http.server 8765
```

ile klasörü sun ve `http://127.0.0.1:8765/` adresini aç.

| Dosya | Görev |
|---|---|
| `js/app.js` | Kabuk ve yönlendirme |
| `js/gorunum/` | Ekranlar: projeler, proje (senaryo / sahneler / video), ayarlar |
| `js/sahne.js` | Proje modeli: sahnelere bölme, ses planı, zamanlama, altyazı |
| `js/hesap.js` | Hesap havuzu: çoklu hesap, kota bekleme listesi, kasa bağlantısı |
| `js/depo.js` | Kalıcı depo (IndexedDB): projeler, görseller, ses |
| `js/metin.js` | Gemini ile senaryo ve görsel prompt'u |
| `js/gemini.js` | Gemini TTS ile seslendirme |
| `js/cloudflare.js` | Cloudflare Workers AI ile görsel |
| `js/video_ltx.js` | Hugging Face LTX Space'i ile görselden klip |
| `js/disa_aktar.js` | Video dışa aktarma (WebCodecs; yedek: MediaRecorder) |
| `js/cihaz.js` | Cihaz raporu |
| `sw.js` | Çevrimdışı açılış |
| `araci/kasa.js` | Kasa (Cloudflare Worker): anahtarları saklar, istekleri iletir |
| `araci/cloudflare-araci.js` | Cloudflare Worker aracısı |

MP4 dosyası [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) (MIT) ile yazılır.

## Lisans

[MIT](LICENSE)
