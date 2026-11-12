# StudioFlow Mobil

[StudioFlow](https://github.com/HappyGuppy1/StudioFlow)'un telefonda çalışan sürümü. Tarayıcıdan açılır,
ana ekrana eklenince uygulama gibi çalışır (PWA). Sunucusu yoktur: seslendirme, görsel üretimi ve video
dışa aktarma doğrudan telefonda yapılır.

**Aç:** https://happyguppy1.github.io/StudioFlow-Mobil/

> Bu bir **deneme sürümüdür** (0.1). Amacı, masaüstü StudioFlow'un temel adımlarının iPhone ve Android'de
> çalıştığını doğrulamaktır: metni seslendir, görsel üret ya da ekle, ikisini videoya çevir, kaydet.

## Telefona kurulum

**iPhone / iPad (Safari):** adresi Safari'de aç › Paylaş düğmesi › **Ana Ekrana Ekle**.

**Android (Chrome):** adresi aç › ⋮ menüsü › **Uygulamayı yükle** (ya da *Ana ekrana ekle*).

Uygulama ilk açılıştan sonra çevrimdışı da açılır; üretim adımları için internet gerekir. Güncellemeler
kendiliğinden gelir.

## Kullanım

1. **Bağlantılar:** Gemini API anahtarını gir ([Google AI Studio](https://aistudio.google.com/apikey)'dan
   ücretsiz alınır). Görsel üretmek istersen Cloudflare bilgilerini de gir.
2. **Seslendirme:** metni yaz, dili ve sesi seç, *Seslendir*'e bas. Hazır bir ses dosyası da seçebilirsin.
3. **Görseller:** tarif yazıp *Görsel üret*'e bas ya da galeriden görsel ekle.
4. **Video:** boyutu seç, *Videoyu oluştur*'a bas, sonra *Kaydet / Paylaş* ile Fotoğraflar'a ya da
   Dosyalar'a kaydet.

Anahtarlar yalnızca telefonda (tarayıcı deposunda) saklanır. Bu depoya ya da herhangi bir sunucuya
gönderilmez; istekler doğrudan Google'a ve kendi Cloudflare hesabına gider.

## Cloudflare aracısı

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
| `js/app.js` | Arayüz |
| `js/gemini.js` | Gemini TTS ile seslendirme |
| `js/cloudflare.js` | Cloudflare Workers AI ile görsel |
| `js/disa_aktar.js` | Video dışa aktarma (WebCodecs; yedek: MediaRecorder) |
| `js/cihaz.js` | Cihaz raporu |
| `sw.js` | Çevrimdışı açılış |
| `araci/cloudflare-araci.js` | Cloudflare Worker aracısı |

MP4 dosyası [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) (MIT) ile yazılır.

## Lisans

[MIT](LICENSE)
