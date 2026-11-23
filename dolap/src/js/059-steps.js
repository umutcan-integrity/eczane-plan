/* Dolap Tasarımı: ekran ekran tanıtım adımları (Tour, 058-tour.js) */
Tour.K = 'dolap.v1.tour';
/* sihirbaz açıkken yalnız sihirbaz tanıtımı */
Tour.block = id => { const w = document.getElementById('wiz'); return id !== 'wiz' && w && !w.hidden; };
Tour.screen = () => !document.getElementById('wiz').hidden ? 'wiz' : A.sel ? 'part' : A.view === 'cut' ? 'cut' : A.view === 'nest' ? 'nest' : 'main';
Tour.S = {
  wiz: [
    {el: '#wiz .wiz-steps', t: 'Soru soru ilerle', d: 'Dolabı adım adım soruyoruz. Üstteki adımlara dokunarak istediğin zaman geri dönüp düzeltebilirsin.'},
    {el: '#wiz .wiz-main .tiles, #wiz .wiz-main', t: 'Seç', d: 'Büyük kartlardan birine dokun. Emin değilsen varsayılanı bırak; her şey sonradan değiştirilebilir.'},
    {el: '#wiz .wiz-foot .btn.primary', t: 'İleri', d: 'Hazır olunca İleri’ye bas. Son adımda dolap oluşur ve kesim ölçüleri hesaplanır.'},
  ],
  main: [
    {el: '#cabs .cab.on, #cabs', t: 'Dolapların', d: 'Bu işteki dolaplar burada. Birine dokununca onu düzenlersin; “Dolap oluştur” ile yenisini eklersin.'},
    {el: '#form .btn.steel', t: 'Soru soru düzenle', d: 'Dolabı sihirbazdaki gibi adım adım baştan değiştirmek için buraya bas.'},
    {el: '#form .grp', t: 'Ölçüler', d: 'Genişlik, yükseklik ve derinliği buradan değiştir. Bütün parçalar kendiliğinden yeniden hesaplanır.'},
    {el: '#cv', t: '3B görünüm', d: 'Parmağınla ya da fareyle çevir, iki parmakla yakınlaştır. Bir parçaya dokununca yana ayrılır ve kesim ölçüleri üstünde yazar.'},
    {el: '#tools3d', t: 'Görünüm araçları', d: 'Kapakları aç ya da gizle, parçaları ayrık göster (patlat), ölçüleri aç/kapa.'},
    {el: '#viewSeg, #mtabs', t: 'Kesim listesi ve levha planı', d: 'Kesimhaneye götüreceğin parça listesi ve parçaların levhaya yerleşimi bu sekmelerde.'},
    {el: '#btnPrint', t: 'Yazdır', d: 'Kesim listesini yazdır ya da PDF olarak kaydet.'},
    {el: '#btnUndo', t: 'Geri al', d: 'Yanlış bir değişikliği geri alır.'},
    {el: '#btnMenu', t: 'Menü', d: 'Yeni iş, kayıtlı işler, tema ve bu tanıtımı yeniden görme buradan.'},
  ],
  part: [
    {el: '#pcard .pc-cut', t: 'Kesim ölçüsü', d: 'Levhadan bu ölçüde kesilir: Boy × En × Kalınlık. Kenar bandı yapışacaksa bant kalınlığı önceden düşülmüştür.'},
    {el: '#lbls .lbl.dim', t: 'Ölçüler parçanın üstünde', d: 'Kalın çizgi ölçülen kenarı, oklu çizgi ölçüyü gösterir. “Bantlanınca” yazan, bant yapıştıktan sonraki son ölçüdür.'},
    {el: '#pcard .turnbar', t: 'Parçayı çevir', d: 'Ayrılan parçayı döndürüp kenarından bakabilirsin. Parçayı sürükleyerek de çevirebilirsin.'},
    {el: '#pcard .pc-sec', t: 'Ölçüyü değiştir', d: 'Parçanın ölçüsünü değiştirirsen ona bağlı dolap ölçüsü değişir; diğer parçalar da kendiliğinden uyar.'},
  ],
  cut: [
    {el: '#vcut .tot', t: 'Özet', d: 'Toplam parça, alan, gereken levha ve kenar bandı metrajı.'},
    {el: '#vcut table.cl tbody tr', t: 'Parça satırı', d: 'No, parça adı, kesim ölçüsü (Boy × En) ve adet. Satıra dokununca parça 3B’de seçilir.'},
    {el: '#vcut table.cl td .bsvg, #vcut table.cl tbody tr td:nth-child(6)', t: 'Kenar bandı', d: 'Küçük çizim, hangi kenarlara bant yapışacağını gösterir.'},
    {el: '#vcut .ptool .seg', t: 'Tüm iş / Bu dolap', d: 'Listeyi bütün dolaplar için ya da yalnız seçili dolap için gör.'},
    {el: '#vcut .ptool .btn', t: 'Excel’e aktar', d: 'Listeyi Excel’de açılan bir dosya (CSV) olarak indir.'},
  ],
  nest: [
    {el: '#nestBuy', t: 'Alınacak levha', d: 'Bu iş için kaç levha alman gerektiği, malzeme malzeme.'},
    {el: '#vnest .sheet svg', t: 'Levha çizimi', d: 'Her dikdörtgen bir parça. Renk parçanın türünü, numara listedeki satırı gösterir. Taralı alan artan parçadır (fire).'},
    {el: '#vnest .sleg', t: 'Parça listesi', d: 'Satıra dokununca o parça levhada sarıyla işaretlenir. Küp simgesi parçayı 3B’de gösterir.'},
    {el: '#vnest .pays', t: 'Kesim payları', d: 'Testere izi ve kenar temizleme payı. Kesimhanenin değerlerine göre ayarlayabilirsin.'},
  ],
};
