# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, one site:

- **Eczane Plan:** eczacılar ve dükkân sahipleri (çevrelerindeki mimar/uygulamacılar dahil). Yeni açılacak ya da yenilenecek bir eczanenin/dükkânın yerleşimini kendileri çiziyor; sağlık müdürlüğü başvurusu için kroki çıkarıyor; müşteriye/ortağa/ustaya 3B sunum, render ve video gösteriyor. Tasarım uzmanı değiller.
- **Dolap Tasarımı:** sanayideki marangoz ve mobilya ustaları. Dolap ölçüsünü girip kesime gönderilecek milimetrik parça listesini (yan dikme, raf, tabla, arkalık, kapak, çekmece) ve levha yerleşimini alıyorlar. Kullanım çok basit olmalı; atölye ortamında, çoğu zaman telefonla.
- Cihaz: telefon ve bilgisayar ikisi de destekleniyor; hangisinin baskın olduğu henüz belirlenmedi (open decision). İkisi de birinci sınıf çalışmalı.

## Product Purpose

Kurulum gerektirmeyen, tarayıcıda çalışan iki araç:

- **Eczane Plan:** sade 2B plan çizimi (dükkân şekli, odalar, duvarlar, kapı/pencere, eczane ekipmanları, katlar, merdiven/asansör, tavan ve aydınlatma, zemin) + 3B görüntüleme, oyun gibi gezinti, render/video, ve resmî biçimde A4 kroki (PDF/PNG).
- **Dolap Tasarımı:** adım adım sihirbazla dolap oluşturma, 3B görünüm (parçaya dokununca ayrılıp ölçüleriyle görünür), parçadan ölçü değiştirme, kesim listesi, hırdavat, bant metrajı, levha yerleşimi, yazdır/CSV.

Başarı: tasarımcı olmayan biri (eczacı ya da usta) yardım almadan doğru, kullanılabilir bir çıktı (kroki, sunum, kesim listesi) elde eder.

## Positioning

Eczaneye özel ekipman kütüphanesi ve sağlık müdürlüğü krokisi biçimi; ustaya özel milimetrik, kesime hazır dolap hesabı (bant düşümü, montaj/çakışma kontrolü, giyotin yerleşim). Genel amaçlı plan/mobilya araçlarının vermediği bu iki iş-özel çıktı, sıfır kurulum ve Türkçe arayüzle.

## Operating Context

- Türkçe arayüz; ölçüler cm (Eczane Plan) ve mm (Dolap).
- Veriler yalnızca cihazda (localStorage); JSON yedek/içe aktarma. Hesap yok, sunucu yok.
- PWA: çevrimdışı çalışır, ana ekrana eklenebilir. GitHub Pages'te statik yayın.
- Dolap Tasarımı ileride ayrı bir uygulama olarak ayrılacak; şimdilik üst sekmeden açılır.
- Çıktılar: A4 kroki (siyah-beyaz, ölçekli), sunum paftası, PNG/MP4, kesim listesi çıktısı/CSV.

## Capabilities and Constraints

- Statik HTML/CSS/JS, framework yok; `src/` → `build.py` → `index.html`; `dolap/src` → `dolap/build.py` → `dolap/index.html`. three.js ile 3B.
- Mevcut tema seçenekleri (sistem/açık/koyu/şeffaf, vurgu renkleri) kullanıcı ayarı olarak var; yeniden tasarımda korunup korunmayacağı açık karar.
- Tüm mevcut işlevler, kısayollar ve kayıtlı veriler korunmalı (localStorage anahtarları değişmez).
- Kroki çıktısının resmî biçimi (siyah-beyaz, ölçekli rölöve) arayüz temasından bağımsızdır, değişmez.

## Brand Commitments

- Ad: "Eczane Plan" ve "Dolap Tasarımı". Logo/kimlik dosyası yok; mevcut uygulama ikonu (`icon.svg`) var.
- Ton: sade, doğrudan, Türkçe, teknik terimlerde ustanın dili (yan dikme, kuşak, baza, kenar bandı).

## Evidence on Hand

- Gerçek ürün: canlı uygulama ve README'deki özellik listesi. Müşteri yorumu, kullanıcı sayısı, logo, fotoğraf yok; uydurulmamalı.

## Product Principles

1. Uzman olmayan kullanıcı ilk denemede doğru çıktıyı almalı: sorarak ilerle, varsayılanlar akıllı olsun.
2. Ölçü kutsaldır: ekranda görünen, çıktıdaki ve hesaptaki değerle birebir aynı olmalı.
3. Telefonda da tam araç: hiçbir işlev masaüstüne özel kalmamalı.
4. Veri kullanıcınındır: cihazda kalır, kaybolmaz, yedeklenebilir.
