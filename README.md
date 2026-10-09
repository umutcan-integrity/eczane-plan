# Eczane Plan

Eczane ve dükkânlar için **sade 2B plan çizimi + 3B görüntüleme ve gezinti**. Telefonda ve
bilgisayarda çalışır, kurulum gerektirmez; projeler cihazın tarayıcısında saklanır.

**Canlı sürüm:** https://umutcan-integrity.github.io/eczane-plan/

## Neler var

- **Projeler:** İsim vererek başla, birden fazla proje tut. Son proje en üstte. Yeniden adlandır,
  çoğalt, sil, JSON olarak yedekle / içe aktar.
- **Kaydetme:** `Kaydet` düğmesi (Ctrl+S) ve açılıp kapatılabilen otomatik kayıt. Veriler yalnızca
  bu cihazda (localStorage) durur; önceki sürümde kalan plan ilk açılışta otomatik içe alınır.
- **2B çizim:** Oda çiz / taşı / boyutlandır (içindekiler odayla birlikte taşınır), duvarlar oda
  kenarlarından otomatik oluşur. Öğeler: kapı, pencere, kolon; dolap (kapaklı, açık raf, çekmeceli,
  gondol, vitrin, buzdolabı); banko; masa; insan, tekerlekli sandalye ve geçiş/dönüş alanları.
- **Dükkân şekli:** Dikdörtgen, L, U, T şablonları. **Silgi** ile odaya ya da duvarla kapanan alana dokununca
  alan dükkândan çıkar (içinde eşya varsa sorar); sürükleyerek köşe/çentik kesilir. **Alan ekle** ile dükkân
  dışarı doğru büyütülür ya da boşluk geri eklenir. **Duvar çiz** ile serbest bölme duvarı (10–25 cm).
  Dış duvarlar şeklin çevresinden otomatik çizilir; alanlar, 3B, kroki ve ölçüler şekli takip eder.
- **Ekipmanlar:** İlaç dolabı (altı çekmece, üstü raf; çekmece sırası/yan yana sayısı ve çekmece bölümü
  yüksekliği seçilebilir), OTC dolabı (ışıklı başlık), demir kozmetik standı (cam raf, ayna), demir raf (depo),
  cam önü stand (vitrin camının önüne kendiliğinden yerleşir), kırmızı-yeşil reçete dolabı, açık raf, gondol, vitrin, buzdolabı, mutfak tezgâhı (evye, çekmece, üst dolap), klozet, lavabo, banko, masa.
- **Zemin:** 9 kaplama (seramik, mermer, terrazzo, parke, laminat, epoksi, vinil, karo) önizlemeli; dükkân
  geneli ve her oda için ayrı seçilebilir.
- **Kroki çizimi:** Sağlık müdürlüğü başvurularındaki rölöve planı biçiminde A4 dikey kroki (PDF/PNG):
  ölçekli (1/100, gerekirse 1/200) siyah-beyaz plan, cm ölçüler, kapı etiketleri (90/210), RAF/BANKO/STAND
  yazıları, oda adı + net alan + yükseklik, giriş oku, kuzey oku, eczane/eczacı adı, adres, alan tablosu
  (toplam faydalı ve net alan) ve imza kutuları. Bilgiler projeyle saklanır.
- **Toplu seçim:** Ctrl/Shift + tıkla (telefonda "Çoklu" düğmesi) ya da Ctrl + boş alanda sürükle ile
  seç; birlikte taşı, döndür, kopyala, sil; hizala ve eşit aralıkla dağıt. Ctrl+A tümünü seçer.
- **Video:** Girişten içeri yürüyüş, 360° dış tur veya kendin gezerek canlı kayıt (MP4/WebM).
- **Render ve sunum:** 3B render (HD–4K, açılı/üstten/girişten, ön duvarları kesme, ölçüler üzerinde);
  tek sayfalık sunum paftası (tüm ölçülü plan + iki 3B görünüm + ekipman listesi); ölçülü plan PNG.
- **Kapılar kolay:** Eklenince en yakın duvara oturur, sürükleyince duvar boyunca kayar, başka
  duvara yaklaşınca oraya geçer (dış duvarda içe açılır). “Yönü çevir” ile ya da resimli seçiciyle
  açılış yönü; 80/90/100/120/160 cm hazır genişlikler; köşeye olan mesafeler görünür.
- **İnsan boşlukları:** Dolap önü / banko müşteri ve personel tarafı boşlukları planda gösterilir,
  bir şey keserse kırmızıya döner. Seçili öğenin dört yanındaki boşluk cm olarak yazılır
  (kırmızı: geçilemez, turuncu: tek kişi, yeşil: rahat). Ölç aracı mesafeyi yorumlar.
- **Mıknatıs:** Duvara, odalara ve diğer öğelerin kenarına yapışma; ızgara 5 cm.
- **3B:** Yörünge (döndür, yakınlaştır, üstten/açılı), duvar yüksekliği tam/yarım/yok. Cephede ışıklı
  eczane tabelası ve kırmızı “E” bayrak tabela (yazısı proje panelindeki *Tabela yazısı*ndan).
  Raflarda ilaç kutuları, fiyat rayları ve LED; çekmeceli dolap altta çekmece, üstte açık raf.
- **3B gez (oyun gibi):** Girişin önünden insan gözü hizasında başlar. Bilgisayarda tıkla → fareyle
  bak, **W A S D** / oklar yürü, Shift koş, Q/E dön, Esc bırak. Telefonda sol alttaki joystick ile
  yürü, ekranı sürükleyerek dön. Duvar ve eşyalardan geçilmez, kapılardan geçilir. Mini haritaya
  dokununca oraya yürür.
- **Tema:** Sistem / açık / koyu / şeffaf (glassmorphism: renkli arka plan üzerinde buzlu cam paneller) ve 8 vurgu rengi.
- **Dışa aktarma:** Plan PNG, 3B görüntü PNG, JSON yedek, paylaş (telefonda).
- Çevrimdışı çalışır ve ana ekrana “uygulama” olarak eklenebilir (PWA).

## Geliştirme

`index.html` üretilmiş dosyadır; kaynaklar `src/` altında:

```
src/shell.html     sayfa iskeleti
src/style.css      stiller
src/js/*.js        uygulama (sırayla birleştirilir)
src/sw.js          service worker şablonu
vendor/            three.js (3B motoru, MIT)
```

Düzenledikten sonra:

```bash
python3 build.py      # index.html ve sw.js üretilir, JS sözdizimi kontrol edilir
```

## Sorumluluk reddi

Ön tasarım aracıdır, resmî kroki yerine geçmez. Ölçü ve boşluk önerileri bilgilendirme
amaçlıdır; ruhsat işlemleri için ilgili kurumlarla teyit edin.
