"""Kaynakları (src/) tek dosyalık index.html'e birleştirir ve sw.js önbellek sürümünü günceller.

Kullanım:  python3 build.py
"""
import hashlib, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

shell = open('src/shell.html', encoding='utf-8').read()
css = open('src/style.css', encoding='utf-8').read()
js_files = sorted(f for f in os.listdir('src/js') if f.endswith('.js'))
js = '\n'.join(open(os.path.join('src/js', f), encoding='utf-8').read() for f in js_files)

out = shell.replace('/*@CSS@*/', css).replace('/*@JS@*/', js)
open('index.html', 'w', encoding='utf-8').write(out)

# Service worker: içerik değişince önbellek adı değişsin
ver = hashlib.sha1(out.encode('utf-8')).hexdigest()[:10]
sw = open('src/sw.js', encoding='utf-8').read().replace('@VERSION@', ver)
open('sw.js', 'w', encoding='utf-8').write(sw)

# Sözdizimi kontrolü
chk = subprocess.run(['node', '--check', '-'], input=js, capture_output=True, text=True)
if chk.returncode:
    print('SÖZDİZİMİ HATASI:\n' + chk.stderr)
    sys.exit(1)
print(f'index.html yazıldı ({len(out) // 1024} KB), sürüm {ver}; JS dosyaları: {", ".join(js_files)}')
