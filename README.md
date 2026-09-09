# Eczane Plan Masası

13,65 × 6,95 m'lik bir eczane için tarayıcıda çalışan 2B yerleşim planlayıcı.
Odaları ve mobilyaları sürükleyerek yerleştirir, anlık m² ve gerçek insan
ölçeğine göre "sığar / sığmaz" geri bildirimi verir.

**Canlı sürüm:** https://umutcan-integrity.github.io/eczane-plan/

## Ne yapar

- Oda çizimi, taşıma, köşelerden boyutlandırma; anlık brüt/net m²
- 55'ten fazla gerçek ölçülü eşya: banko, kasa, gondol, çekmeceli ilaç dolabı,
  ilaç buzdolabı, sedye, lavabo, mutfak tezgâhı, stok rafı, kapı, pencere
- İnsan ölçeği katmanı: ayakta insan, tekerlekli sandalye, Ø1,50 m dönüş
  dairesi, 0,90 / 1,20 m geçiş şeritleri
- Cetvel; ölçülen mesafe için "iki kişi yan yana geçer" türünden yorum
- Geçiş kontrolü: 1,20 m altındaki boşlukları planda oklarla işaretler
- Özet paneli: satış alanı, yürünebilir alan, raf yüzü metrajı, banko önü derinlik
- Yönetmelik kontrol listesi (Eczacılar ve Eczaneler Hk. Yönetmelik Md. 20–22 özeti)
- PNG ve JSON dışa aktarma, JSON'dan geri yükleme, yazdırma
- Koyu / açık tema, masaüstü + dokunmatik

## Kullanım

Tek dosyalık statik bir sayfa. Kurulum yok:

- Yukarıdaki bağlantıyı aç, ya da
- `index.html` dosyasını indirip çift tıkla.

Plan, açan kişinin **kendi tarayıcısında** saklanır (localStorage). Sayfayı
paylaşmak planı paylaşmaz; başkasına göndermek için Dışa Aktar → JSON kullan.

## Kaynak

`index.html` üretilmiş dosyadır. Kaynak parçalar `part1.html` ve `part2–4c.js`;
düzenledikten sonra birleştirmek için:

```bash
python3 build.py
cp eczane-plan-masasi-local.html index.html
```

## Sorumluluk reddi

Ön tasarım aracıdır, resmî kroki yerine geçmez. Ölçüler ve yönetmelik notları
bilgilendirme amaçlıdır; ruhsat işlemleri için il sağlık müdürlüğü ve eczacı
odasıyla teyit edin.
