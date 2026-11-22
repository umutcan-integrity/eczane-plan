---
name: Eczane Plan + Dolap Tasarımı
description: Eczacı ve usta için tarayıcıda plan, 3B ve kesim aracı; galvaniz atölye görsel dili.
colors:
  steel: "#262C32"
  steel-raised: "#353C43"
  steel-ink: "#EDF0F2"
  steel-muted: "#AEB6BD"
  signal-yellow: "#F5B700"
  signal-yellow-ink: "#1A1500"
  signal-yellow-text: "#7A5800"
  signal-yellow-edge: "#C79500"
  galvanized-ground: "#D6DADE"
  sheet: "#F5F6F7"
  sheet-2: "#ECEEF0"
  sheet-3: "#E0E3E6"
  seam: "#C4CAD0"
  seam-strong: "#A3ABB3"
  ink: "#161B20"
  ink-muted: "#49515A"
  ink-faint: "#737C86"
  plan-select: "#A36F00"
  danger: "#C0352A"
  warn: "#B26400"
  ok: "#2C7A4B"
  dim-length: "#C2410C"
  dim-width: "#1D4ED8"
  dim-thickness: "#7E22CE"
typography:
  display:
    fontFamily: "Saira, system-ui, sans-serif"
    fontWeight: 800
    fontVariation: "'wdth' 75"
  headline:
    fontFamily: "Saira, system-ui, sans-serif"
    fontWeight: 750
    fontVariation: "'wdth' 78"
  body:
    fontFamily: "Saira, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
    fontVariation: "'wdth' 92"
    fontFeature: "'tnum'"
  label:
    fontFamily: "Saira, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 750
    letterSpacing: 0.1em
rounded:
  xs: 3px
  sm: 4px
  md: 6px
components:
  button-primary:
    backgroundColor: "{colors.signal-yellow}"
    textColor: "{colors.signal-yellow-ink}"
    rounded: "{rounded.sm}"
  button-steel:
    backgroundColor: "{colors.steel}"
    textColor: "{colors.steel-ink}"
    rounded: "{rounded.sm}"
  button-default:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
  shell-bar:
    backgroundColor: "{colors.steel}"
    textColor: "{colors.steel-ink}"
---

# Design System: Eczane Plan + Dolap Tasarımı

## Overview

**Creative North Star: "Galvaniz Atölye"**

Sanayinin malzemesi ekrana taşınır: koyu çelik kabuk, galvaniz sac gibi hafif metal parlaklıklı paneller, iş güvenliği sarısı. Bu bir çalışma ekranıdır (Operate): düzen, gezinme ve kontroller plan/editör araçlarının alışılmış düzenidir; dünya yalnızca yazı, renk, yoğunluk ve tek bir imza hareketiyle gelir.

İmza hareket: **seçili olan sarı etiket olur.** Seçili araç, seçili dolap, seçili sihirbaz kartı, seçili şekil sarı zemin ve koyu yazı alır; alt kenarında hafif bir basılı gölge vardır. Geri kalan her şey çelik ve sac tonlarındadır, böylece sarı her zaman "şu an bu" demektir.

İki uygulama (Eczane Plan, Dolap Tasarımı) aynı dili paylaşır; üst bantta sekmeyle ayrılır.

**Key Characteristics:**
- Çelik üst bant + 3 px sarı alt çizgi (her ekranın tabelası)
- Sac paneller: çok açık dikey metal gradyanı, ince gri dikiş çizgisi
- Sarı yalnız seçim ve her alanda tek ana eylem
- Yarı dar Saira; başlık ve ölçü rakamları dar ve kalın, etiketler büyük harf aralıklı
- Uyarı (sarı seviye) işareti ikaz şeridi (sarı-siyah çapraz)

## Colors

Çelik + galvaniz nötrleri, tek sinyal rengi sarı; durum renkleri yalnız anlam taşıdıkları yerde.

### Primary
- **İş Güvenliği Sarısı** (#F5B700): seçili durumlar, ana eylem düğmesi, üst bant alt çizgisi, logo zemini, metin seçimi. Üzerindeki yazı her zaman **Sarı Mürekkep** (#1A1500).
- **Koyu Sarı Metin** (#7A5800): açık zeminde sarının metin/çizgi olarak gerektiği yerler (vurgulu ikon çizgisi, sürücü notu). Koyu modda sarının kendisi kullanılır.
- **Plan Seçimi Kehribarı** (#A36F00): 2B plan tuvalinde seçim çizgisi, tutamaçlar ve ölçü etiketleri (beyaz zeminde okunurluk için). Koyu modda #F5B700, etiket yazısı koyu.

### Neutral
- **Çelik** (#262C32) / **Yükseltilmiş Çelik** (#353C43): üst bant, mobil alt dok, bildirim (toast), ikincil "çelik" düğme.
- **Galvaniz Zemin** (#D6DADE): sayfa zemini; plan ve 3B sahne zemini #CDD2D7.
- **Sac** (#F5F6F7, #ECEEF0, #E0E3E6): paneller, kartlar, girişler, gömme alanlar.
- **Dikiş** (#C4CAD0, güçlü #A3ABB3): kenarlıklar ve ayırıcılar.
- **Mürekkep** (#161B20, ikincil #49515A, silik #737C86): metin.

### Ölçü renkleri (Dolap)
- **Boy** #C2410C, **En** #1D4ED8, **Kalınlık** #7E22CE: 3B ölçü etiketleri, parça kartı ve form satırlarında aynı üç renk; değişmez.

### Named Rules
**Tek Sinyal Kuralı.** Sarı bir ekranda yalnız şunlarda görünür: seçili olan, o alanın tek ana eylemi, kabuğun alt çizgisi ve logo. Sekmeler (seg) seçiliyken çelik olur (alt çizgisi sarı); aç/kapa düğmeleri seçiliyken açık sarı zemin + sarı kenar alır, dolu sarı değil.

## Typography

**Font:** Saira (değişken; genişlik 50–125, ağırlık 100–900), uygulamanın içinde barındırılır (`vendor/fonts/`, OFL). Yedek: system-ui.

**Character:** Makine etiketi ve plaka yazısı gibi yarı dar, sert ama okunaklı. Tüm rakamlar tablo genişliğinde (tnum), ölçüler alt alta hizalanır.

### Hierarchy
- **Display** (800, genişlik 75): büyük ölçü rakamları (parça kesim ölçüsü 30 px, dükkân alanı 30 px).
- **Headline** (750, genişlik 78): h1–h3; panel ve diyalog başlıkları büyük harf, 18–22 px.
- **Body** (400, 14 px, genişlik 92, 1.45): arayüz metni.
- **Label** (750, 12 px, 0.1em, BÜYÜK HARF): grup başlıkları (ODA & YAPI, HESAP ÖZETİ, KATLAR).

## Layout

Mevcut uygulama düzeni korunur: editörde sol palet (236 px), orta tuval, sağ özellikler (308 px); Dolap'ta sol form (372 px) + 3B/kesim/levha. 900 px altında yan paneller alttan açılan sayfalara, araç çubukları simge düğmelerine döner. Yoğunluk orta-yüksek: kontroller 38–44 px, dokunmatikte 40 px+.

## Elevation & Depth

Hafif, yapısal gölge: sac parçalar kenarlıkla ayrılır; gölge yalnız "bir sac parça diğerinin üstünde" demek için.

### Shadow Vocabulary
- **Sac** (`inset 0 1px 0 rgba(255,255,255,.75), 0 1px 2px rgba(10,14,18,.12), 0 4px 12px rgba(10,14,18,.07)`): düğme, kart, yüzen araç çubuğu.
- **Kaldırılmış** (`0 2px 4px rgba(10,14,18,.12), 0 18px 42px rgba(10,14,18,.22)`): diyalog, menü.
- **Basılı** (`inset 0 -2px 0 rgba(0,0,0,.16)`): sarı ve çelik dolu düğmelerin alt kenarı; seçili etiket hissi.

## Shapes

Küçük, endüstriyel köşeler: 3 / 4 / 6 px. Hap (999 px) şekil yalnız durum göstergelerinde (gezinti ipucu, kayıt çubuğu); düğme, sekme ve çipte yok.

## Components

### Buttons
- **Shape:** 4 px.
- **Primary:** sarı zemin, sarı mürekkep, 750 ağırlık, sarı kenar (#C79500), basılı alt gölge. Hover #FFC21A.
- **Steel:** çelik zemin, açık yazı; büyük ikincil eylemler ("Soru soru düzenle").
- **Default:** sac gradyan, güçlü dikiş kenarı, sac gölgesi; basınca içe gölge.
- **Üst bantta:** varsayılan düğmeler yükseltilmiş çelik zemin, açık yazı.

### Tabs (seg) ve uygulama sekmeleri
- Gömme sac oluk; seçili sekme çelik zemin + açık yazı + 2 px sarı alt çizgi. Üst bantta seçili sekme açık zemin + çelik yazı + sarı alt çizgi.

### Seçim kartları (palet, sihirbaz kartları, dolap listesi, şekiller)
- Varsayılan sac; seçili olan **sarı etiket** (dolu sarı, koyu yazı, basılı alt kenar).

### Inputs
- Sac zemin, güçlü dikiş kenarı, 4 px; odakta sarı kenar + %35 sarı halka. Sayılar yarı dar, kalın.

### Uyarılar
- Sarı seviye uyarı işareti ikaz şeridi (sarı-siyah 45°); kırmızı seviye düz kırmızı.

## Do's and Don'ts

### Do:
- **Do** her yeni seçili durumu sarı etiket olarak yap (#F5B700 zemin, #1A1500 yazı).
- **Do** açık zeminde sarıyı metin olarak kullanman gerekirse #7A5800 kullan.
- **Do** rakamları tablo genişliğinde bırak (body `font-variant-numeric: tabular-nums`).
- **Do** yeni ekranlarda çelik bant + sarı alt çizgi kabuğunu koru.

### Don't:
- **Don't** bir ekranda birden fazla dolu sarı ana eylem koyma.
- **Don't** sekme ve aç/kapa düğmelerini dolu sarı yapma (Tek Sinyal Kuralı).
- **Don't** cam/bulanıklık, renk geçişli yazı, hap biçimli düğme ekleme.
- **Don't** ikaz şeridini süs olarak kullanma; yalnız uyarı.
- **Don't** resmî kroki çıktısını (siyah-beyaz, ölçekli) bu temaya göre renklendirme.
