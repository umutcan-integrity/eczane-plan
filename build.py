import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
p1=open('part1.html').read()
js=''.join(open(f).read() for f in ['part2.js','part3.js','part4a.js','part4b.js','part4c.js'])
out=p1+"\n<script>\n"+js+"\n</script>\n"
open('eczane-plan-masasi.html','w').write(out)
full='<!doctype html>\n<html lang="tr">\n<head>\n<meta charset="utf-8">\n'+out.split('<style>')[0]+'<style>\nimg{max-width:100%}[hidden]{display:none!important}\n'+out.split('<style>',1)[1].split('</style>',1)[0]+'</style>\n</head>\n<body>\n'+out.split('</style>',1)[1]+'\n</body>\n</html>\n'
open('eczane-plan-masasi-local.html','w').write(full)
import subprocess
r=subprocess.run(['node','-e',"const fs=require('fs');const s=fs.readFileSync('eczane-plan-masasi.html','utf8');const js=s.slice(s.indexOf('<script>')+8,s.lastIndexOf('</script>'));try{new Function(js);console.log('syntax OK')}catch(e){console.log('SYNTAX ERR',e.message)}"],capture_output=True,text=True)
print(r.stdout.strip(), len(out))
