
/* =====================================================================
   Eczane Plan Masası — tek dosya 2D yerleşim planlayıcısı
   Koordinatlar metre, orijin dükkânın sol üst iç köşesi, y aşağı.
   Eşya: x,y sol üst (rot=0), w yatay, h dikey, rot merkez etrafında (°).
   Şekillerde "ön yüz" = yerel +y (rot=0'da alt kenar). rot 90 → ön yüz sola,
   rot 180 → ön yüz yukarı, rot 270 → ön yüz sağa.
   ===================================================================== */
'use strict';

const GRID = 0.05;            // yapışma ızgarası (m)
const MIN_ROOM = 0.6;         // en küçük oda kenarı (m)
const MIN_ITEM = 0.05;        // en küçük eşya kenarı (m)
const STORAGE_KEY = 'eczanePlanMasasi.v1';

const CATS = [
  ['satis','Satış'], ['ofis_stok','Ofis / Stok / Lab'], ['mutfak','Mutfak'], ['bakim','Bakım odası'],
  ['wc','WC'], ['yapi','Kapı & Yapı'], ['insan','İnsan ölçeği'],
];

/* Eşya kütüphanesi — w: yatay (m), h: dikey (m), hm: yükseklik (m), s: çizim şekli */
const LIB = [
  // ---- Satış
  {key:'banko_modul',   n:'Banko modülü',              c:'satis', w:1.20,h:0.70,hm:1.05, s:'counter', note:'Yan yana dizilir; müşteri yüzü 1,05 m, çalışma yüzü 0,90 m'},
  {key:'banko_duz',     n:'Düz banko',                 c:'satis', w:3.80,h:0.70,hm:1.05, s:'counter', note:'Önünde ≥1,50 m müşteri alanı, arkasında ≥0,90 m personel koridoru'},
  {key:'banko_engelli', n:'Engelli banko bölümü',      c:'satis', w:0.90,h:0.70,hm:0.80, s:'counter', note:'Yükseklik 0,75–0,85 m; altında 0,70 yüksek × 0,60 derin boşluk (doğrula)'},
  {key:'kasa_pos',      n:'Kasa / POS',                c:'satis', w:0.45,h:0.40,hm:0.35, s:'pos', note:'Bankonun üstüne konur'},
  {key:'duvar_rafi',    n:'Duvar rafı (açık teşhir)',  c:'satis', w:1.00,h:0.40,hm:2.20, s:'shelf', note:'Duvara yasla; önünde ≥0,90 m geçiş. Raf yüzü metrajına sayılır'},
  {key:'cekmeceli_ilac_dolabi',n:'Çekmeceli ilaç dolabı',c:'satis',w:1.00,h:0.45,hm:2.20,s:'drawer', note:'Banko arkası; açık çekmece 0,50 m ileri çıkar → önünde ≥1,00 m'},
  {key:'gondol_cift',   n:'Orta gondol (çift yüzlü)',  c:'satis', w:1.20,h:0.80,hm:1.50, s:'gondola', note:'Gondollar arası 1,20–1,50 m; 1,50 m üstü bankodan görüşü keser'},
  {key:'gondol_tek',    n:'Gondol (tek yüzlü)',        c:'satis', w:1.20,h:0.45,hm:1.50, s:'gondola1', note:'Duvar önü'},
  {key:'gondol_baslik', n:'Gondol başlığı (end-cap)',  c:'satis', w:0.80,h:0.45,hm:1.50, s:'gondola1', note:'Gondol ucuna eklenir'},
  {key:'vitrin_dolabi', n:'Vitrin dolabı (cam)',       c:'satis', w:1.00,h:0.45,hm:1.90, s:'showcase', note:'Önünde ≥0,90 m'},
  {key:'dermokozmetik_unite',n:'Dermokozmetik ünitesi',c:'satis', w:1.00,h:0.45,hm:2.20, s:'shelf', note:'Aydınlatmalı duvar ünitesi'},
  {key:'ilac_buzdolabi',n:'İlaç buzdolabı',            c:'satis', w:0.60,h:0.65,hm:1.80, s:'fridge', note:'Termometreli; arka/yanlarda 0,10 m havalandırma; gıda buzdolabından ayrı'},
  {key:'bekleme_koltuk',n:'Bekleme koltuğu',           c:'satis', w:0.60,h:0.60,hm:0.85, s:'chair'},
  {key:'bekleme_bank_2',n:'Bekleme bankı (2’li)',      c:'satis', w:1.20,h:0.60,hm:0.85, s:'bench', note:'3’lü için 1,80 m'},
  {key:'tansiyon_masasi',n:'Tansiyon ölçüm masası',    c:'satis', w:0.70,h:0.50,hm:0.75, s:'table', note:'Sandalye ile birlikte iz 0,90 × 1,50 m'},
  {key:'sandalye',      n:'Sandalye',                  c:'satis', w:0.45,h:0.45,hm:0.85, s:'chair'},
  {key:'danisma_masasi',n:'Danışma masası',            c:'satis', w:1.20,h:0.60,hm:0.75, s:'table', note:'Hasta bilgilendirme'},
  {key:'sepet_standi',  n:'Sepet standı',              c:'satis', w:0.50,h:0.50,hm:0.90, s:'basket', note:'Giriş yanı'},
  {key:'personel_kapagi',n:'Personel geçiş kapağı',    c:'satis', w:0.70,h:0.05,hm:0.90, s:'door', note:'Banko arkası koridorun ucunu kapatır'},
  // ---- Ofis / Stok / Lab
  {key:'lab_tezgahi',   n:'Laboratuvar tezgâhı (evyeli)',c:'ofis_stok',w:1.20,h:0.60,hm:0.90,s:'lab', note:'Yönetmelik Md. 21: müşteri erişimi olmayan bölümde; önünde ≥0,90 m'},
  {key:'eczaci_masasi', n:'Eczacı masası',             c:'ofis_stok', w:1.40,h:0.70,hm:0.75, s:'table', note:'Arkasında 0,90 m sandalye payı'},
  {key:'ofis_sandalyesi',n:'Ofis sandalyesi',          c:'ofis_stok', w:0.60,h:0.60,hm:1.00, s:'chair'},
  {key:'ofis_dolabi',   n:'Ofis / dosya dolabı',       c:'ofis_stok', w:0.90,h:0.45,hm:2.00, s:'cabinet'},
  {key:'stok_rafi',     n:'Stok rafı (metal)',         c:'ofis_stok', w:1.00,h:0.40,hm:2.00, s:'rack', note:'5 kat, duvara sabitlenir; raf arası ≥0,90 m'},
  {key:'stok_rafi_agir',n:'Stok rafı (ağır tip)',      c:'ofis_stok', w:1.20,h:0.50,hm:2.00, s:'rack'},
  {key:'narkotik_kasa', n:'Narkotik çelik kasa',       c:'ofis_stok', w:0.45,h:0.45,hm:0.60, s:'safe', note:'Kırmızı/yeşil reçete ilaçları; müşteri erişimi olmayan odada'},
  {key:'para_kasasi',   n:'Para kasası',               c:'ofis_stok', w:0.45,h:0.45,hm:0.60, s:'safe'},
  {key:'bilgisayar_masasi',n:'Bilgisayar / yazıcı masası',c:'ofis_stok',w:0.80,h:0.60,hm:0.75,s:'table'},
  {key:'koli_alani',    n:'Koli / palet alanı',        c:'ofis_stok', w:0.80,h:1.20,hm:0.15, s:'zone'},
  // ---- Mutfak
  {key:'mutfak_tezgahi',n:'Mutfak tezgâhı + alt dolap',c:'mutfak', w:2.00,h:0.60,hm:0.90, s:'counter', note:'1,20 / 1,60 / 2,00 m modüller'},
  {key:'mutfak_evye',   n:'Evye',                      c:'mutfak', w:0.50,h:0.50,hm:0.90, s:'sink', note:'Tezgâh içine oturur'},
  {key:'mini_buzdolabi',n:'Mini buzdolabı',            c:'mutfak', w:0.55,h:0.60,hm:0.85, s:'fridge', note:'Gıda; ilaç buzdolabıyla ortak kullanılmaz'},
  {key:'buzdolabi',     n:'Buzdolabı',                 c:'mutfak', w:0.60,h:0.65,hm:1.85, s:'fridge'},
  {key:'mikrodalga',    n:'Mikrodalga / ocak',         c:'mutfak', w:0.50,h:0.40,hm:0.30, s:'appliance', note:'Tezgâh üstü'},
  {key:'personel_masasi',n:'Personel masası',          c:'mutfak', w:0.80,h:0.60,hm:0.75, s:'table'},
  {key:'mutfak_dolabi', n:'Dik dolap',                 c:'mutfak', w:0.60,h:0.60,hm:2.00, s:'cabinet'},
  // ---- Bakım odası
  {key:'sedye',         n:'Sedye / muayene masası',    c:'bakim', w:1.90,h:0.65,hm:0.75, s:'stretcher', note:'Bir uzun kenarda ≥0,90 m, baş ucunda ≥0,60 m boşluk'},
  {key:'lavabo',        n:'Lavabo',                    c:'bakim', w:0.50,h:0.40,hm:0.85, s:'sink', note:'Duvara yaslanır'},
  {key:'paravan',       n:'Paravan (3 kanat)',         c:'bakim', w:1.80,h:0.05,hm:1.70, s:'screen'},
  {key:'tibbi_dolap',   n:'Tıbbi malzeme dolabı',      c:'bakim', w:0.60,h:0.40,hm:1.80, s:'cabinet'},
  {key:'tibbi_araba',   n:'Tıbbi araba / sehpa',       c:'bakim', w:0.60,h:0.45,hm:0.85, s:'cart'},
  {key:'tabure',        n:'Döner tabure',              c:'bakim', w:0.40,h:0.40,hm:0.55, s:'stool'},
  {key:'hasta_sandalyesi',n:'Hasta / refakatçi sandalyesi',c:'bakim',w:0.45,h:0.45,hm:0.85,s:'chair'},
  {key:'tibbi_atik',    n:'Tıbbi atık kutusu',         c:'bakim', w:0.30,h:0.30,hm:0.60, s:'bin'},
  // ---- WC
  {key:'klozet',        n:'Klozet',                    c:'wc', w:0.40,h:0.70,hm:0.80, s:'toilet', note:'Ekseni yan duvara ≥0,40 m; önünde ≥0,60 m'},
  {key:'wc_lavabo',     n:'WC lavabosu',               c:'wc', w:0.45,h:0.35,hm:0.85, s:'sink'},
  {key:'temizlik_dolabi',n:'Temizlik dolabı',          c:'wc', w:0.40,h:0.40,hm:1.80, s:'cabinet'},
  // ---- Kapı & Yapı
  {key:'giris_kapisi_cift',n:'Giriş kapısı (çift kanat)',c:'yapi',w:1.60,h:0.10,hm:2.20,s:'door2', note:'Dışa açılır; net ≥0,90 m. R ile döndür, panelden menteşe yönü'},
  {key:'giris_kapisi_tek',n:'Giriş kapısı (tek kanat)',c:'yapi', w:1.00,h:0.10,hm:2.20, s:'door', note:'Net ≥0,90 m'},
  {key:'ic_kapi',       n:'İç kapı (90 cm)',           c:'yapi', w:0.90,h:0.10,hm:2.10, s:'door', note:'Duvar çizgisine yerleştir; yay yarıçapı = kapı genişliği'},
  {key:'wc_kapisi',     n:'WC kapısı (80 cm)',         c:'yapi', w:0.80,h:0.10,hm:2.10, s:'door'},
  {key:'surgu_kapi',    n:'Sürgülü kapı',              c:'yapi', w:0.90,h:0.10,hm:2.10, s:'slider'},
  {key:'bolme_duvar',   n:'İç bölme duvar',            c:'yapi', w:2.00,h:0.10,hm:2.80, s:'wall', note:'Alçıpan 0,10 m; oda içini bölmek için'},
  {key:'vitrin_cami',   n:'Vitrin camı',               c:'yapi', w:2.00,h:0.05,hm:2.20, s:'window', note:'Önüne raf konmaz'},
  {key:'pencere',       n:'Pencere',                   c:'yapi', w:1.20,h:0.10,hm:1.20, s:'window'},
  {key:'kolon',         n:'Kolon',                     c:'yapi', w:0.40,h:0.40,hm:2.80, s:'column'},
  // ---- İnsan ölçeği
  {key:'insan_ayakta',  n:'Ayakta insan (1,75 m)',     c:'insan', w:0.60,h:0.40,hm:1.75, s:'human', note:'Omuz 0,60 m, gövde 0,40 m'},
  {key:'insan_yuruyen', n:'Yürüyen insan (şerit)',     c:'insan', w:0.60,h:0.75,hm:1.75, s:'human_walk', note:'Yürüme şeridi 0,75 m'},
  {key:'iki_kisi_yanyana',n:'İki kişi yan yana',       c:'insan', w:1.20,h:0.40,hm:1.75, s:'human2', note:'Koridor referansı 1,20 m'},
  {key:'tekerlekli_sandalye',n:'Tekerlekli sandalye',  c:'insan', w:1.20,h:0.70,hm:1.30, s:'wheelchair', note:'Geçiş ≥0,90 m; dönüş Ø1,50 m'},
  {key:'sedyede_hasta', n:'Sedyede yatan hasta',       c:'insan', w:1.95,h:0.65,hm:0.75, s:'human_lying', note:'Sedye üstüne bindir'},
  {key:'bebek_arabasi', n:'Bebek arabası',             c:'insan', w:0.60,h:1.00,hm:1.00, s:'stroller', note:'Kapı / koridor kontrolü'},
  {key:'donus',         n:'Dönüş dairesi Ø1,50 m',     c:'insan', w:1.50,h:1.50,hm:0, s:'circle', note:'Tekerlekli sandalye 180° döner mi?'},
  {key:'gecis',         n:'Geçiş şeridi 0,90 m',       c:'insan', w:0.90,h:2.00,hm:0, s:'strip', note:'Koridora koy; sığıyorsa geçiş yeterli'},
  {key:'gecis_rahat',   n:'Rahat geçiş 1,20 m',        c:'insan', w:1.20,h:2.00,hm:0, s:'strip'},
];
const LIB_BY_KEY = Object.fromEntries(LIB.map(x => [x.key, x]));
const SHELF_KEYS = {duvar_rafi: 1, dermokozmetik_unite: 1, vitrin_dolabi: 1, gondol_tek: 1, gondol_baslik: 1, gondol_cift: 2, cekmeceli_ilac_dolabi: 0};
const DOOR_SHAPES = new Set(['door', 'door2', 'slider']);

/* Ergonomi eşikleri (m) */
const ERGO = {
  passMin: 0.90, passComfort: 1.20, wheelTurn: 1.50, doorAccess: 0.90, counterFront: 1.50, behindCounter: 0.90,
  m2Comfort: 1.0, m2Spacious: 1.5, m2CustomerComfort: 4, m2CustomerBusy: 2,
  stretcherL: 1.90, stretcherW: 0.65, stretcherSide: 0.90, stretcherHead: 0.60,
};

/* Karşılaştırma nesneleri */
const COMPARE = [
  {key:'park',    n:'araba park yeri',          w:2.50, h:5.00},
  {key:'oto',     n:'binek otomobil',           w:1.80, h:4.50},
  {key:'pingpong',n:'masa tenisi masası',       w:1.525,h:2.74},
  {key:'yatak2',  n:'çift kişilik yatak',       w:1.60, h:2.00},
  {key:'yatak1',  n:'tek kişilik yatak',        w:0.90, h:1.90},
  {key:'asansor', n:'asansör kabini (8 kişilik)',w:1.10,h:1.40},
  {key:'dus',     n:'duş kabini',               w:0.90, h:0.90},
];

const ROOM_COLORS = ['#7C93B8','#D9A441','#9B9B9B','#9B7BB8','#5FA37A','#D97A6A','#5FA8A0','#C98BB0','#B58A5C'];
const ROOM_TEMPLATES = [
  {name:'WC', w:1.60, h:1.80, color:ROOM_COLORS[0]},
  {name:'Mutfak', w:2.00, h:1.80, color:ROOM_COLORS[1]},
  {name:'Eczacı Odası + Stok', w:3.60, h:2.15, color:ROOM_COLORS[3]},
  {name:'Bakım Odası', w:3.60, h:2.05, color:ROOM_COLORS[4]},
  {name:'Hol', w:3.60, h:0.95, color:ROOM_COLORS[2]},
  {name:'Laboratuvar', w:2.00, h:1.60, color:ROOM_COLORS[6]},
  {name:'Depo', w:2.00, h:2.00, color:ROOM_COLORS[8]},
  {name:'Serbest Oda', w:3.00, h:3.00, color:ROOM_COLORS[5]},
];

/* Cetvel yorumu: [eşik, renk sınıfı, metin] */
function rulerComment(d) {
  if (d < 0.60) return {t: 'Geçilemez — bir kişi bile sıkışır', c: 'no'};
  if (d < 0.80) return {t: 'Tek kişi dar geçiş', c: 'no'};
  if (d < 0.90) return {t: 'Tek kişi rahat; tekerlekli sandalye için yetersiz', c: 'so'};
  if (d < 1.20) return {t: 'Tekerlekli sandalye geçer / standart kapı; iki kişi zor', c: 'so'};
  if (d < 1.50) return {t: 'İki kişi yan yana rahat', c: 'ok'};
  return {t: 'Tekerlekli sandalye dönebilir / geniş koridor', c: 'ok'};
}

/* ---------- Varsayılan yerleşim (13,65 × 6,95) ---------- */
function defaultState(variant = 'default') {
  const W = 13.65, H = 6.95;
  const rooms = [];
  const room = (name, x, y, w, h, color, pin = '') => rooms.push({id: 'r' + (rooms.length + 1), name, x, y, w, h, color, pin, locked: false});
  room('WC', 12.05, 0, 1.60, 1.80, ROOM_COLORS[0]);
  if (variant !== 'empty') {
    room('Mutfak', 10.05, 0, 2.00, 1.80, ROOM_COLORS[1]);
    room('Arka Hol', 10.05, 1.80, 3.60, 0.95, ROOM_COLORS[2]);
    room('Eczacı Odası + Stok', 10.05, 2.75, 3.60, 2.15, ROOM_COLORS[3]);
    room('Bakım Odası', 10.05, 4.90, 3.60, 2.05, ROOM_COLORS[4]);
  }
  let n = 1;
  const items = [];
  // cx, cy: merkez; rot: 0 ön yüz aşağı, 90 sola, 180 yukarı, 270 sağa
  const put = (key, cx, cy, rot = 0, extra = {}) => {
    const d = LIB_BY_KEY[key];
    const w = extra.w || d.w, h = extra.h || d.h;
    items.push({id: 'i' + (n++), key, name: d.n, x: r3(cx - w / 2), y: r3(cy - h / 2), w, h, rot, flip: !!extra.flip, locked: false});
  };
  if (variant === 'empty') {
    put('giris_kapisi_cift', 0.05, 3.45, 270);
    put('klozet', 13.15, 0.45); put('wc_lavabo', 12.375, 0.275); put('wc_kapisi', 12.75, 1.80, 0);
  } else {
    // Sol kısa duvar: giriş + vitrin camları
    put('giris_kapisi_cift', 0.05, 3.45, 270);
    put('vitrin_cami', 0.025, 1.30, 90); put('vitrin_cami', 0.025, 5.60, 90);
    // Satış alanı
    put('dermokozmetik_unite', 2.10, 0.225, 0, {w: 3.00});
    put('duvar_rafi', 5.50, 0.20, 0, {w: 3.80});
    put('duvar_rafi', 3.00, 6.75, 180, {w: 4.80});
    put('gondol_cift', 3.20, 1.95); put('gondol_cift', 5.60, 1.95); put('gondol_cift', 3.20, 5.00); put('gondol_cift', 5.60, 5.00);
    put('banko_duz', 8.25, 3.15, 90);
    put('kasa_pos', 8.175, 1.80, 90); put('kasa_pos', 8.175, 4.50, 90);
    put('cekmeceli_ilac_dolabi', 8.75, 0.225, 0, {w: 1.70});
    put('cekmeceli_ilac_dolabi', 9.825, 0.875, 90, {w: 1.75});
    put('cekmeceli_ilac_dolabi', 9.825, 3.875, 90, {w: 2.05});
    put('ilac_buzdolabi', 9.25, 0.825, 0);
    put('personel_kapagi', 7.925, 0.85, 90, {w: 0.80});
    put('personel_kapagi', 9.10, 5.075, 0, {w: 1.00});
    put('bekleme_bank_2', 6.60, 6.65, 180); put('tansiyon_masasi', 7.75, 6.65, 0); put('sandalye', 7.725, 6.075, 0);
    put('sepet_standi', 0.75, 2.65);
    put('tekerlekli_sandalye', 1.80, 3.20, 0); put('insan_ayakta', 7.30, 3.30, 90);
    // Mutfak (10,05–12,05 × 0–1,80)
    put('mutfak_tezgahi', 11.05, 0.30, 0); put('mutfak_evye', 10.50, 0.30, 0); put('mini_buzdolabi', 11.725, 1.50, 180);
    put('ic_kapi', 10.80, 1.80, 0);
    // WC (12,05–13,65 × 0–1,80)
    put('wc_lavabo', 12.375, 0.275, 0); put('klozet', 13.15, 0.45, 0); put('wc_kapisi', 12.75, 1.80, 0);
    // Arka hol kapıları
    put('ic_kapi', 10.05, 2.30, 90); put('ic_kapi', 10.80, 2.75, 180);
    // Eczacı odası + stok (10,05–13,65 × 2,75–4,90)
    put('lab_tezgahi', 10.75, 4.60, 180); put('ofis_dolabi', 11.80, 3.075, 0); put('eczaci_masasi', 12.95, 3.20, 0, {w: 1.30});
    put('ofis_sandalyesi', 12.75, 3.90, 180); put('narkotik_kasa', 13.375, 3.825, 0);
    put('stok_rafi', 11.95, 4.65, 180); put('stok_rafi', 13.05, 4.65, 180);
    // Bakım odası (10,05–13,65 × 4,90–6,95)
    put('ic_kapi', 10.05, 5.90, 90);
    put('sedye', 12.50, 6.525, 0); put('lavabo', 10.40, 5.15, 0); put('paravan', 11.075, 5.75, 90, {w: 1.50});
    put('tibbi_dolap', 13.35, 5.15, 0); put('hasta_sandalyesi', 12.225, 5.225, 0); put('tabure', 11.05, 6.60); put('tibbi_atik', 13.45, 5.65);
  }
  return {v: 1, rev: 0, shop: {w: W, h: H, wall: 0.10, name: 'Eczanem'}, rooms, items, nextId: n + 10};
}
function r3(v) { return Math.round(v * 1000) / 1000; }
