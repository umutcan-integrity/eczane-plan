"""Dolap Tasarımı: kaynakları (dolap/src/) tek dosyalık dolap/index.html'e birleştirir.

Bu klasör bağımsızdır; ana uygulamadan ayrı bir depoya olduğu gibi taşınabilir.
Kullanım:  python3 dolap/build.py
"""
import os, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

shell = open('src/shell.html', encoding='utf-8').read()
css = open('src/style.css', encoding='utf-8').read()
js_files = sorted(f for f in os.listdir('src/js') if f.endswith('.js'))
js = '\n'.join(open(os.path.join('src/js', f), encoding='utf-8').read() for f in js_files)

out = shell.replace('/*@CSS@*/', css).replace('/*@JS@*/', js)
open('index.html', 'w', encoding='utf-8').write(out)

chk = subprocess.run(['node', '--check', '-'], input=js, capture_output=True, text=True)
if chk.returncode:
    print('SÖZDİZİMİ HATASI (dolap):\n' + chk.stderr)
    sys.exit(1)
print(f'dolap/index.html yazıldı ({len(out) // 1024} KB); JS: {", ".join(js_files)}')
