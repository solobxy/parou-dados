"""ganhas.pt: função pública a partir da página do Sistema Remuneratório da Administração Pública (DGAEP).

A página traz os dados em JavaScript (const CONFIG = {...}, const GERAIS = [...], ...). Cada valor é lido sozinho e
avaliado pelo Node num contexto vazio (sem acesso a nada), depois tratado com as mesmas regras de ganhas/processar.py.
Só substitui o que está em oficial.json se o ano for igual ou mais recente e os números passarem nas verificações.
"""
import json, os, re, subprocess

NOMES = ['CONFIG', 'TRU_DATA', 'GERAIS', 'ESPECIAIS_RAW', 'SEMTRU', 'NRE', 'NRG', 'NRCE']
MESES = {'JAN': 1, 'FEV': 2, 'MAR': 3, 'ABR': 4, 'MAI': 5, 'JUN': 6, 'JUL': 7, 'AGO': 8, 'SET': 9, 'OUT': 10, 'NOV': 11, 'DEZ': 12}

LER = r'''
const vm = require('vm'), fs = require('fs');
const s = fs.readFileSync(process.argv[2], 'utf8'), nomes = JSON.parse(process.argv[3]), out = {};
for (const n of nomes) {
  const m = new RegExp('(?:const|let|var)\\s+' + n + '\\s*=\\s*([\\[{])').exec(s);
  if (!m) continue;
  // corta o valor contando parênteses, sem contar os que estão dentro de texto
  let i = m.index + m[0].length - 1, d = 0, q = null;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '[' || c === '{') d++;
    else if (c === ']' || c === '}') { d--; if (d === 0) { out[n] = vm.runInNewContext('(' + s.slice(i, j + 1) + ')', Object.create(null), { timeout: 2000 }); break; } }
  }
}
process.stdout.write(JSON.stringify(out));
'''


def ler(pagina):
    js = os.path.join(os.path.dirname(pagina), '_ler.js')
    open(js, 'w').write(LER)
    r = subprocess.run(['node', js, pagina, json.dumps(NOMES)], capture_output=True, text=True, timeout=60)
    if r.returncode:
        raise RuntimeError(r.stderr[:300])
    return json.loads(r.stdout)


def euros(v):
    return float(str(v).replace(' ', ' ').replace(' €', '').replace('€', '').replace(' ', '').replace(',', '.'))


def atualizar(O, F, _decis):
    pag = os.path.join(F, 'dgaep', 'index.htm')
    assert os.path.exists(pag), 'sem a página da DGAEP'
    D = ler(pag)
    falta = [n for n in NOMES if n not in D]
    assert not falta, f'falta {falta}'
    C = D['CONFIG']
    ano = int(C['ano'])
    velho = O.get('funcao_publica') or {}
    assert ano >= int(velho.get('ano') or 0), f'ano {ano} mais antigo'
    brap = float(C['brapN'])
    tru = [[t['nivel'], t['vn'] if t['vn'] is not None else brap] for t in D['TRU_DATA']]
    carreiras = []
    for g in D['GERAIS']:
        carreiras.append({'grupo': 'Carreiras gerais', 'carreira': g['career'], 'nome': g['cat'],
                          'posicoes': [{'posicao': p['l'], 'nivel': p['n'], 'valor': euros(p['v'])} for p in g['posNormais']]})

    def lista(lst, grupo):
        for x in lst:
            pos = []
            for i, p in enumerate(x.get('positions', [])):
                if p.get('vn') is None:
                    continue
                pos.append({'posicao': str(p.get('p') or p.get('id') or p.get('escalao') or i + 1), 'nivel': str(p.get('n') or p.get('nivel') or ''),
                            'indice': str(p.get('indice') or ''), 'valor': round(float(p['vn']), 2)})
            if pos:
                carreiras.append({'grupo': grupo, 'carreira': x['career'], 'subgrupo': x.get('subgroup') or x.get('regime') or '',
                                  'nome': x['cat'], 'posicoes': pos})
    lista(D['ESPECIAIS_RAW'], 'Carreiras especiais')
    lista(D['SEMTRU'], 'Carreiras fora da TRU')
    lista(D['NRE'], 'Carreiras especiais não revistas')
    lista(D['NRG'], 'Carreiras não revistas')
    lista(D['NRCE'], 'Carreiras e cargos específicos')
    # verificações: o mesmo tamanho de sempre, a base remuneratória e os valores plausíveis
    n0 = len(velho.get('carreiras') or []) or len(carreiras)
    assert 0.8 <= len(carreiras) / n0 <= 1.3, f'{len(carreiras)} carreiras (antes {n0})'
    if velho.get('brap'):
        assert 0.95 <= brap / float(velho['brap']) <= 1.25, f'base remuneratória {brap} (antes {velho["brap"]})'
    vals = [p['valor'] for c in carreiras for p in c['posicoes']]
    assert vals and min(vals) > 100 and max(vals) < 20000 and sorted(vals)[len(vals) // 2] > 600, 'valores fora do normal'
    O['funcao_publica'] = {'ano': ano, 'brap': brap, 'tru': tru, 'carreiras': carreiras}
    f = O['fontes'].setdefault('tru', {})
    dl = re.sub(r'^DL\b', 'Decreto-Lei', str(C.get('dl') or '')).split(', de ')[0]
    f['nome'] = f'DGAEP, Sistema Remuneratório da Administração Pública {ano}' + (f' ({dl})' if dl else '')
    m = re.match(r'(\d{1,2})\s+([A-Z]{3})\s+(\d{4})', str(C.get('data') or '').upper())
    if m and m.group(2) in MESES:
        f['ref'] = f'versão de {int(m.group(1)):02d}/{MESES[m.group(2)]:02d}/{m.group(3)}'
    return f'{ano}, {len(carreiras)} carreiras, base {brap}'
