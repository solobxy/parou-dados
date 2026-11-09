# Copia de teste do tapmoss (nunca o repositório): injeta window.__ev antes do último })();
import shutil, sys, os
src, dst = sys.argv[1], sys.argv[2]
if os.path.exists(dst): shutil.rmtree(dst)
shutil.copytree(src, dst)
for lang in ['', 'pt']:
    p = os.path.join(dst, lang, 'index.html')
    s = open(p, encoding='utf-8').read()
    i = s.rfind('})();')
    assert i > 0
    s = s[:i] + 'window.__ev=s=>eval(s);' + s[i:]
    open(p, 'w', encoding='utf-8').write(s)
print('ok', dst)
