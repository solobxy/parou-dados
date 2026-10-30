"""Duplicasa: estatísticas próprias, sem cookies e sem serviços de terceiros.

Cada visitante é contado com um código que muda todos os dias (hash de um sal diário + IP + navegador),
como no Plausible: dá para contar visitantes únicos por dia, mas não dá para seguir alguém entre dias
nem saber quem é. Não se guardam IPs, e-mails nem textos livres; só nomes de eventos e uns poucos
campos curtos de uma lista fechada. Os robôs não contam. Os eventos com mais de 400 dias são apagados.
"""
import datetime, hashlib, json, re, secrets, time

CAMPOS = {'cidade', 'tips', 'preco', 'filtros', 'casa', 'fonte', 'tipo', 'tip', 'renda', 'origem', 'metodo',
          'n', 'ordem', 'valor', 'pagina', 's', 'nome', 'zona', 'resultados'}
EVENTOS = {'vista', 'pesquisa', 'casa', 'original', 'paywall', 'pagar_clique', 'pago', 'promo_ver', 'promo_fechar',
           'promo_clique', 'alerta', 'pesquisa_guardada', 'registo', 'entrar', 'guardar', 'perfil', 'filtro',
           'tempo', 'cidade_inicio', 'contactar', 'proteger', 'publicar', 'sair', 'instalar', 'instalada', 'alerta_pop_ver', 'alerta_pop_nao'}
RE_ROBO = re.compile(r'bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|curl|wget|python|httpclient', re.I)


def criar(c):
    c.executescript('''
    CREATE TABLE IF NOT EXISTS eventos(id INTEGER PRIMARY KEY, t INTEGER NOT NULL, dia TEXT NOT NULL, vid TEXT NOT NULL,
      nome TEXT NOT NULL, pagina TEXT, ref TEXT, utm TEXT, disp TEXT, conta INTEGER NOT NULL DEFAULT 0, props TEXT NOT NULL DEFAULT '{}');
    CREATE INDEX IF NOT EXISTS i_ev_dia ON eventos(dia);
    CREATE INDEX IF NOT EXISTS i_ev_nome ON eventos(nome, dia);
    ''')


def _sal(c, dia):
    r = c.execute("SELECT valor FROM config WHERE chave='sal_est'").fetchone()
    if r:
        d, s = (r['valor'].split(':', 1) + [''])[:2]
        if d == dia:
            return s
    s = secrets.token_hex(16)                     # sal novo por dia: o código de ontem deixa de servir
    c.execute("INSERT OR REPLACE INTO config VALUES('sal_est', ?)", (dia + ':' + s,))
    return s


def dispositivo(ua):
    u = ua.lower()
    if 'ipad' in u or ('android' in u and 'mobile' not in u) or 'tablet' in u:
        return 'tablet'
    if 'mobi' in u or 'iphone' in u or 'android' in u:
        return 'telemóvel'
    return 'computador'


def _curto(v):
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v if abs(v) < 1e9 else None
    if isinstance(v, str):
        return v.strip()[:60]
    if isinstance(v, list):
        return [str(x)[:20] for x in v[:6]]
    return None


def registar(c, corpo, ip, ua, com_conta):
    """Guarda um evento. Devolve False se for ignorado."""
    if not ua or RE_ROBO.search(ua):
        return False
    nome = str(corpo.get('e') or '')
    if nome not in EVENTOS:
        return False
    agora = int(time.time())
    dia = datetime.datetime.utcfromtimestamp(agora).strftime('%Y-%m-%d')
    vid = hashlib.sha256((_sal(c, dia) + '|' + ip + '|' + ua).encode()).hexdigest()[:16]
    props = {}
    for k, v in (corpo.get('d') or {}).items() if isinstance(corpo.get('d'), dict) else []:
        if k in CAMPOS:
            v = _curto(v)
            if v not in (None, '', []):
                props[k] = v
    ref = str(corpo.get('ref') or '')[:80]
    ref = re.sub(r'^https?://(www\.)?', '', ref).split('/')[0][:60]
    utm = str(corpo.get('utm') or '')[:80]
    pagina = re.sub(r'[^a-z\-]', '', str(corpo.get('r') or ''))[:30]
    c.execute('INSERT INTO eventos(t, dia, vid, nome, pagina, ref, utm, disp, conta, props) VALUES(?,?,?,?,?,?,?,?,?,?)',
              (agora, dia, vid, nome, pagina, ref, utm, dispositivo(ua), 1 if com_conta else 0,
               json.dumps(props, ensure_ascii=False, separators=(',', ':'))))
    if secrets.randbelow(500) == 0:               # limpeza de vez em quando
        c.execute('DELETE FROM eventos WHERE t<?', (agora - 400 * 86400,))
    return True


def _top(rows, n=10):
    return [{'nome': k, 'n': v} for k, v in sorted(rows.items(), key=lambda x: -x[1])[:n]]


def resumo(c, dias):
    dias = max(1, min(int(dias or 30), 400))
    hoje = datetime.datetime.utcnow().date()
    inicio = (hoje - datetime.timedelta(days=dias - 1)).isoformat()
    ev = c.execute('SELECT dia, vid, nome, pagina, ref, utm, disp, conta, props FROM eventos WHERE dia>=?', (inicio,)).fetchall()

    por_dia = {(hoje - datetime.timedelta(days=i)).isoformat(): {'visitantes': set(), 'vistas': 0} for i in range(dias)}
    visitantes = set()
    contagem = {}
    pessoas = {}            # evento -> visitantes distintos (código do dia + dia)
    paginas, refs, utms, disp = {}, {}, {}, {}
    cidades, tips, precos, filtros, casas, fontes_orig, cidades_casa = {}, {}, {}, {}, {}, {}, {}
    tempos = []
    for r in ev:
        chave = r['dia'] + r['vid']
        visitantes.add(chave)
        nome = r['nome']
        contagem[nome] = contagem.get(nome, 0) + 1
        pessoas.setdefault(nome, set()).add(chave)
        d = por_dia.get(r['dia'])
        if d is not None:
            d['visitantes'].add(r['vid'])
        try:
            p = json.loads(r['props'] or '{}')
        except ValueError:
            p = {}
        if nome == 'vista':
            if d is not None:
                d['vistas'] += 1
            paginas[r['pagina'] or 'inicio'] = paginas.get(r['pagina'] or 'inicio', 0) + 1
            if r['ref']:
                refs[r['ref']] = refs.get(r['ref'], 0) + 1
            if r['utm']:
                utms[r['utm']] = utms.get(r['utm'], 0) + 1
            disp.setdefault(r['disp'], set()).add(chave)
        elif nome == 'pesquisa':
            if p.get('cidade'):
                k = p['cidade'].strip().title()
                cidades[k] = cidades.get(k, 0) + 1
            for t in p.get('tips') or []:
                tips[t] = tips.get(t, 0) + 1
            pr = p.get('preco')
            faixa = 'Sem limite' if not pr else ('até 600 €' if pr <= 600 else 'até 800 €' if pr <= 800 else 'até 1000 €' if pr <= 1000 else 'até 1500 €' if pr <= 1500 else 'mais de 1500 €')
            precos[faixa] = precos.get(faixa, 0) + 1
        elif nome == 'filtro' and p.get('nome'):
            filtros[p['nome']] = filtros.get(p['nome'], 0) + 1
        elif nome == 'casa':
            k = '%s · %s · %s' % (p.get('tip') or p.get('tipo') or 'Casa', p.get('cidade') or '?', ('%s €' % p['renda']) if p.get('renda') else 'sem preço')
            casas[(p.get('casa'), k, p.get('fonte'))] = casas.get((p.get('casa'), k, p.get('fonte')), 0) + 1
            if p.get('cidade'):
                cidades_casa[p['cidade']] = cidades_casa.get(p['cidade'], 0) + 1
        elif nome == 'original' and p.get('fonte'):
            fontes_orig[p['fonte']] = fontes_orig.get(p['fonte'], 0) + 1
        elif nome == 'tempo' and isinstance(p.get('s'), (int, float)) and 0 < p['s'] < 4 * 3600:
            tempos.append(p['s'])

    def n(e):
        return len(pessoas.get(e, ()))
    total_v = len(visitantes)
    funil = [('Visitaram o site', total_v), ('Pesquisaram', n('pesquisa')), ('Abriram uma casa', n('casa')),
             ('Viram a oferta de acesso', len(pessoas.get('paywall', set()) | pessoas.get('promo_ver', set()))),
             ('Carregaram em pagar', n('pagar_clique')), ('Pagaram', n('pago'))]

    # contas (da própria base de dados)
    t0 = int(time.mktime((hoje - datetime.timedelta(days=dias - 1)).timetuple()))
    u = c.execute('SELECT COUNT(*) n, SUM(marketing) mk, SUM(CASE WHEN google_sub IS NOT NULL THEN 1 ELSE 0 END) g, '
                  'SUM(CASE WHEN facebook_id IS NOT NULL THEN 1 ELSE 0 END) f, SUM(CASE WHEN senha IS NOT NULL THEN 1 ELSE 0 END) s, '
                  "SUM(CASE WHEN perfil!='{}' THEN 1 ELSE 0 END) pf, SUM(CASE WHEN foto IS NOT NULL THEN 1 ELSE 0 END) ft, "
                  'SUM(CASE WHEN acesso_ate>? THEN 1 ELSE 0 END) ac, SUM(CASE WHEN criado>=? THEN 1 ELSE 0 END) novos '
                  'FROM utilizadores WHERE apagado=0', (int(time.time()), t0)).fetchone()
    novas_dia = {}
    for r in c.execute('SELECT criado FROM utilizadores WHERE apagado=0 AND criado>=?', (t0,)):
        k = datetime.datetime.utcfromtimestamp(r['criado']).strftime('%Y-%m-%d')
        novas_dia[k] = novas_dia.get(k, 0) + 1
    al = c.execute('SELECT COUNT(*) n, SUM(CASE WHEN criado>=? THEN 1 ELSE 0 END) novos FROM alertas WHERE ativo=1', (t0,)).fetchone()

    # perfis e zonas preferidas (agregados; nada individual)
    perfil = {'situacao': {}, 'genero': {}, 'idade': {}, 'procura': {}, 'zonas': {}, 'orcamento': {}}
    for r in c.execute("SELECT perfil, prefs FROM utilizadores WHERE apagado=0"):
        try:
            pf = json.loads(r['perfil'] or '{}')
            pr = json.loads(r['prefs'] or '{}')
        except ValueError:
            continue
        for k in ('situacao', 'genero'):
            if pf.get(k):
                perfil[k][pf[k]] = perfil[k].get(pf[k], 0) + 1
        idade = pf.get('idade')
        if isinstance(idade, int):
            fx = '18–24' if idade < 25 else '25–34' if idade < 35 else '35–44' if idade < 45 else '45+'
            perfil['idade'][fx] = perfil['idade'].get(fx, 0) + 1
        for t in pf.get('tips') or []:
            perfil['procura'][t] = perfil['procura'].get(t, 0) + 1
        orc = pf.get('orcamento')
        if isinstance(orc, (int, float)) and orc > 0:
            fx = 'até 600 €' if orc <= 600 else 'até 800 €' if orc <= 800 else 'até 1000 €' if orc <= 1000 else 'mais de 1000 €'
            perfil['orcamento'][fx] = perfil['orcamento'].get(fx, 0) + 1
        for z in str(pf.get('zonas') or '').split(','):
            z = z.strip()
            if z:
                perfil['zonas'][z] = perfil['zonas'].get(z, 0) + 1
        for z in (pr.get('zonas') or {}).values() if isinstance(pr.get('zonas'), dict) else []:
            if isinstance(z, dict) and z.get('nome') and not z.get('tirada'):
                perfil['zonas'][z['nome']] = perfil['zonas'].get(z['nome'], 0) + 1

    serie = [{'dia': k, 'visitantes': len(v['visitantes']), 'vistas': v['vistas'], 'contas': novas_dia.get(k, 0)}
             for k, v in sorted(por_dia.items())]
    return {
        'dias': dias, 'desde': inicio, 'gerado': int(time.time()),
        'visitantes': total_v, 'vistas': contagem.get('vista', 0),
        'tempo_medio_s': int(sum(tempos) / len(tempos)) if tempos else None,
        'serie': serie,
        'funil': [{'nome': a, 'n': b} for a, b in funil],
        'eventos': {k: {'vezes': contagem.get(k, 0), 'pessoas': n(k)} for k in sorted(EVENTOS)},
        'paginas': _top(paginas), 'origens': _top(refs), 'campanhas': _top(utms),
        'dispositivos': _top({k: len(v) for k, v in disp.items()}),
        'cidades_pesquisadas': _top(cidades, 15), 'tipologias': _top(tips), 'precos': _top(precos), 'filtros': _top(filtros),
        'cidades_abertas': _top(cidades_casa, 15), 'cliques_original': _top(fontes_orig),
        'casas': [{'casa': k[0], 'nome': k[1], 'fonte': k[2], 'n': v} for k, v in sorted(casas.items(), key=lambda x: -x[1])[:15]],
        'promo': {'vista': n('promo_ver'), 'fechada': n('promo_fechar'), 'clique': n('promo_clique')},
        'contas': {'total': u['n'] or 0, 'novas': u['novos'] or 0, 'marketing': u['mk'] or 0, 'google': u['g'] or 0,
                   'facebook': u['f'] or 0, 'senha': u['s'] or 0, 'com_perfil': u['pf'] or 0, 'com_foto': u['ft'] or 0,
                   'com_acesso': u['ac'] or 0, 'alertas_ativos': al['n'] or 0, 'alertas_novos': al['novos'] or 0},
        'perfil': {k: _top(v) for k, v in perfil.items()},
    }
