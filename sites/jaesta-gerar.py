#!/usr/bin/env python3
"""Gera as pré-visualizações fixas (site/p/<nome>/index.html) a partir de uma lista de negócios.

Uso: python3 gerar.py prospetos.json [dias_de_validade]

Cada negócio na lista (JSON) pode ter os campos do agente de prospeção
(nome, categoria, freguesia, morada, telefone, rating, n_avaliacoes, horario, maps)
ou já os campos do motor (nicho, sub, tel, n, ...). Escreve também
site/p/lista.json (para a página de seguimento) e ferramentas/saida/prospetos.md.
"""
import json, re, sys, unicodedata, datetime, pathlib, html

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SITE = RAIZ / 'site'
MODELOS = SITE / 'm'

def slug(s):
    s = unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')[:60]

def nicho_de(cat):
    c = slug(cat or '')
    if re.search(r'barbe', c): return 'barbearia', None
    if re.search(r'unha|manicure|nail', c): return 'beleza', 'unhas'
    if re.search(r'cabele|hair', c): return 'beleza', 'cabeleireiro'
    if re.search(r'estetic|beleza|spa|depila|sobrancel|pestan', c): return 'beleza', 'estetica'
    if re.search(r'chapa|pintura-auto|bate', c): return 'oficina', 'chapa'
    if re.search(r'oficina|mecanic|auto|pneu|garage', c): return 'oficina', 'mecanica'
    if re.search(r'canaliz|desentup|plumb', c): return 'obras', 'canalizador'
    if re.search(r'eletric|electric', c): return 'obras', 'eletricista'
    if re.search(r'pintor|pintura', c): return 'obras', 'pintor'
    if re.search(r'constru|empreit', c): return 'obras', 'construcao'
    if re.search(r'obra|remodel|reparac|renov', c): return 'obras', 'remodelacoes'
    return None, None

DIAS = {'segunda': 'seg', 'terca': 'ter', 'quarta': 'qua', 'quinta': 'qui', 'sexta': 'sex', 'sabado': 'sab', 'domingo': 'dom',
        'monday': 'seg', 'tuesday': 'ter', 'wednesday': 'qua', 'thursday': 'qui', 'friday': 'sex', 'saturday': 'sab', 'sunday': 'dom',
        'seg': 'seg', 'ter': 'ter', 'qua': 'qua', 'qui': 'qui', 'sex': 'sex', 'sab': 'sab', 'dom': 'dom'}

def hora(h):
    m = re.match(r'^(\d{1,2})(?:[:h.](\d{2}))?$', h.strip())
    if not m: return None
    hh, mm = int(m.group(1)), int(m.group(2) or 0)
    return f'{hh:02d}:{mm:02d}' if hh <= 24 and mm < 60 else None

def blocos(txt):
    t = (txt or '').lower()
    if not t.strip() or re.search(r'fechad|encerrad|closed', t): return []
    if re.search(r'24 horas|24 hours|aberto 24', t): return [['00:00', '23:59']]
    out = []
    for a, b in re.findall(r'(\d{1,2}(?:[:h.]\d{2})?)\s*h?\s*(?:–|-|—|às|a|até|to)\s*(\d{1,2}(?:[:h.]\d{2})?)', t):
        a, b = hora(a), hora(b)
        if a and b: out.append([a, b])
    return out

def horario(h):
    """Aceita dict {seg: [[...]]}, dict {"segunda-feira": "9:00–19:00"} ou texto do Google Maps."""
    if not h: return None
    res = {d: [] for d in ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']}
    if isinstance(h, dict):
        for k, v in h.items():
            d = DIAS.get(slug(k).split('-')[0])
            if not d: continue
            res[d] = v if isinstance(v, list) and v and isinstance(v[0], list) else blocos(', '.join(v) if isinstance(v, list) else str(v))
    else:
        txt = str(h)
        partes = re.split(r'(?i)(segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)', txt)
        for i in range(1, len(partes) - 1, 2):
            d = DIAS.get(slug(partes[i]))
            if d: res[d] = blocos(partes[i + 1])
    return res if any(res.values()) else None

def preparar(p, dias):
    D = {}
    nicho, sub = p.get('nicho'), p.get('sub')
    if not nicho: nicho, sub = nicho_de(p.get('categoria', ''))
    if not nicho: return None
    D['nome'] = p['nome'].strip()
    D['nicho'] = nicho
    if sub: D['sub'] = sub
    for a, b in [('freguesia', 'freguesia'), ('morada', 'morada'), ('maps', 'maps')]:
        if p.get(a): D[b] = str(p[a]).strip()
    tel = re.sub(r'\D', '', str(p.get('tel') or p.get('telefone') or ''))
    if tel.startswith('351') and len(tel) == 12: tel = tel[3:]
    if len(tel) != 9: return None
    D['tel'] = tel
    r = p.get('rating')
    try:
        r = float(str(r).replace(',', '.'))
        if 0 < r <= 5: D['rating'] = round(r, 1)
    except (TypeError, ValueError): pass
    n = p.get('n') or p.get('n_avaliacoes')
    try:
        if int(n) > 0: D['n'] = int(n)
    except (TypeError, ValueError): pass
    h = horario(p.get('horario'))
    if h: D['horario'] = h
    if p.get('servicos') and isinstance(p['servicos'], list): D['servicos'] = p['servicos']
    if 'artigo' in p and p['artigo'] is not None: D['artigo'] = p['artigo']
    D['expira'] = (datetime.date.today() + datetime.timedelta(days=dias)).isoformat()
    return D

def pagina(D, nome_pasta):
    s = (MODELOS / f"{D['nicho']}.html").read_text()
    # caminhos dos ficheiros do modelo passam a apontar para /m/
    s = re.sub(r'(href|src)="(?!https?:|#|data:|\.\./|/|mailto:|tel:)([^"]+)"', lambda m: f'{m.group(1)}="../../m/{m.group(2)}"', s)
    s = s.replace('url("fontes/', 'url("../../m/fontes/')
    s = s.replace('href="../apple-touch-icon.png"', 'href="../../apple-touch-icon.png"')
    titulo = 'Pré-visualização do site: ' + D['nome']
    s = s.replace('<meta property="og:title" content="Pré-visualização do seu site">', f'<meta property="og:title" content="{html.escape(titulo)}">')
    s = re.sub(r'<title>[^<]*</title>', f'<title>{html.escape(D["nome"])}</title>', s, count=1)
    dados = json.dumps(D, ensure_ascii=False).replace('</', '<\\/')
    s = s.replace('<script>\n', f'<script>window.D = {dados};</script>\n<script>\n', 1)
    destino = SITE / 'p' / nome_pasta
    destino.mkdir(parents=True, exist_ok=True)
    (destino / 'index.html').write_text(s)

def main():
    lista = json.loads(pathlib.Path(sys.argv[1]).read_text())
    dias = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    feitos, ignorados, usados = [], [], set()
    for p in lista:
        D = preparar(p, dias)
        if not D:
            ignorados.append(p.get('nome', '?')); continue
        base = slug(D['nome']) or 'negocio'; nome_pasta = base; k = 2
        while nome_pasta in usados: nome_pasta = f'{base}-{k}'; k += 1
        usados.add(nome_pasta)
        pagina(D, nome_pasta)
        feitos.append({'nome': D['nome'], 'pasta': nome_pasta, 'nicho': D['nicho'], 'sub': D.get('sub'), 'freguesia': D.get('freguesia', ''),
                       'tel': D['tel'], 'rating': D.get('rating'), 'n': D.get('n'), 'morada': D.get('morada', ''), 'maps': D.get('maps', ''),
                       'expira': D['expira'], 'site_atual': p.get('site_atual', ''), 'tipo_empresa': p.get('tipo_empresa', '')})
    (SITE / 'p').mkdir(exist_ok=True)
    (SITE / 'p' / 'lista.json').write_text(json.dumps(feitos, ensure_ascii=False, indent=1))
    print(f'{len(feitos)} pré-visualizações feitas; ignorados (sem ramo ou telefone): {len(ignorados)}')
    for n in ignorados: print('  -', n)

if __name__ == '__main__':
    main()
