/* Eczane Plan: ekran ekran tanıtım adımları (Tour, 068-tour.js) */
Tour.K = 'eczplan.v2.tour';
Tour.screen = () => !$('#home').hidden ? 'home' : Ed.view === '3d' ? '3d' : 'plan';
Tour.S = {
  home: [
    {el: '#newName', t: 'Yeni proje', d: 'Projene bir isim ver ve dükkânın genişliğini ve derinliğini metre olarak gir.'},
    {el: '#newTpl', t: 'Boş dükkân ya da örnek eczane', d: '“Örnek eczane” ile odaları, bankosu ve dolapları hazır bir planla başlayıp nasıl çalıştığını görebilirsin.'},
    {el: '#newForm .btn.primary', t: 'Başla', d: 'Bilgileri girince Başla’ya bas; çizim ekranı açılır.'},
    {el: '#projList .proj, #projList', t: 'Projelerin', d: 'Kaydettiğin projeler burada. Projeler yalnız bu cihazda saklanır; menüden yedek (JSON) alabilirsin.'},
    {el: '.home .apptabs a:not(.on)', t: 'Dolap Tasarımı', d: 'Ustalar için dolap kesim ölçüsü aracı bu sekmede.'},
    {el: '#homeSettings', t: 'Görünüm', d: 'Açık ya da koyu tema ve otomatik kayıt ayarı.'},
  ],
  plan: [
    {el: '#sheetAdd .pal, #sheetAdd', t: 'Ekle', d: 'Oda, kapı, pencere, dolap, banko… Birine dokun, plana eklensin; sonra sürükleyip yerleştir.'},
    {el: '#dock', t: 'Alt çubuk', d: 'Ekle: kapı, dolap, banko… Oda çiz ve Ölç araçları, Proje ayarları buradan.'},
    {el: '#tools2d', t: 'Çizim araçları', d: 'Seç, oda çiz, duvar, silgi, alan ekle, ölç. Kullandığın araç sarı görünür.'},
    {el: '#plan', t: 'Plan', d: 'Bir öğeye dokununca seçilir: sürükleyerek taşı, köşelerinden boyutlandır. Etrafındaki boşluklar cm olarak yazar.'},
    {el: '#sheetProps', t: 'Özellikler', d: 'Seçili öğenin ölçüsü, rengi ve yönü burada. Hiçbir şey seçili değilken dükkân ve kat ayarları görünür.'},
    {el: '#floorBar', t: 'Katlar', d: 'Bodrum, asma kat ya da üst kat ekle; katlar arasında buradan geç.'},
    {el: '#viewSeg', t: '2B / 3B', d: 'Planı üç boyutlu görmek ve içinde gezmek için 3B’ye geç.'},
    {el: '#btnKroki', t: 'Kroki', d: 'Sağlık müdürlüğü başvurusu için ölçekli A4 kroki (PDF) çıkarır.'},
    {el: '#btnSave', t: 'Kaydet', d: 'Değişiklikleri bu cihaza kaydeder. Otomatik kayıt açıksa kendiliğinden kaydeder.'},
    {el: '#btnMenu', t: 'Menü', d: 'Render, video, PNG/JSON dışa aktarma, tema, yardım ve bu tanıtımı yeniden görme.'},
  ],
  '3d': [
    {el: '#scene', t: '3B görünüm', d: 'Sürükleyerek etrafına bak, tekerlek ya da iki parmakla yakınlaş. Bir öğeye tıklayınca seçilir.'},
    {el: '#modeSeg', t: 'Döndür / Gez', d: '“Gez”e geçince dükkânın içinde insan gözü hizasında yürürsün (bilgisayarda W A S D, telefonda joystick).'},
    {el: '#camRender', t: 'Render', d: 'Sunum için yüksek çözünürlüklü görsel alır.'},
    {el: '#camVideo', t: 'Video', d: 'İçeride yürüyüş ya da dışarıdan tur videosu kaydeder.'},
    {el: '#camNight', t: 'Akşam', d: 'Yalnız armatür ışıklarıyla, akşam görünümü.'},
    {el: '#camWalls', t: 'Duvarlar', d: 'Duvarları tam, yarım ya da gizli göster; içeriyi rahat görmek için.'},
  ],
};
