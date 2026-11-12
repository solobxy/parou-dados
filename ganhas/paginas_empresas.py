#!/usr/bin/env python3
"""ganhas.pt: páginas feitas a partir das partilhas (corre no servidor, de hora a hora, e logo que o site estático muda).

Uso: python3 paginas_empresas.py <dados.db> <pasta-de-saída> <modelo.html>

Escreve na pasta de saída (o Caddy serve-a antes do site estático nestes caminhos):
  empresa/<id>/                empresas com pelo menos 5 pessoas diferentes
  profissoes/<id>/             a página da profissão com os números da comunidade no HTML (só quando há 5 pessoas)
  profissoes/<id>/<distrito>/  a profissão num distrito (5 pessoas e supressão complementar)
  sitemap-empresas.xml, sitemap-comunidade.xml
Regras dos números em agregados.py: K = 5, partilhas com mais de 24 h, arredondamento a 50 € abaixo de 10 pessoas
e à dezena a partir daí, nunca valores individuais. Faz também uma cópia de segurança diária da base de dados em
/var/lib/ganhas-copias (guarda 14 dias).
"""
import datetime as dt, hashlib, html, json, os, re, shutil, sqlite3, sys, time

DB, SAIDA, MODELO = sys.argv[1:4]
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import agregados as ag  # noqa: E402

WWW = os.path.dirname(os.path.abspath(MODELO))  # o site estático (/var/www/ganhas)
DOMINIO = 'https://ganhas.pt'
K = ag.K
ATRASO = 24 * 3600
COPIAS = '/var/lib/ganhas-copias'
e = html.escape
euro = ag.euro

with open(os.path.join(AQUI, 'catalogo.json'), encoding='utf-8') as f:
    CAT = json.load(f)
try:
    with open(os.path.join(AQUI, 'dados', 'oficial.json'), encoding='utf-8') as f:
        O = json.load(f)
except Exception:  # noqa: BLE001
    O = {}
PROF = {p['id']: p for p in CAT['profissoes']}
DIST = {d['id']: d for d in CAT['distritos']}
CONTRATOS = {'efetivo': 'Sem termo', 'termo': 'A termo', 'temporario': 'Temporário', 'recibos': 'Recibos verdes',
             'estagio': 'Estágio', 'outro': 'Outro'}
# «no distrito de Aveiro», mas «do Porto», «da Guarda»; as regiões autónomas não são distritos
LOCAL = {'porto': ('no distrito do Porto', 'Distrito do Porto'), 'guarda': ('no distrito da Guarda', 'Distrito da Guarda'),
         'acores': ('nos Açores', 'Açores'), 'madeira': ('na Madeira', 'Madeira')}


def local(d):
    return LOCAL.get(d, (f'no distrito de {DIST[d]["nome"]}', f'Distrito de {DIST[d]["nome"]}'))


def minusc(nome):
    return nome[:1].lower() + nome[1:] if len(nome) > 1 and not nome[1].isupper() else nome


def copia_seguranca():
    try:
        os.makedirs(COPIAS, exist_ok=True)
        destino = os.path.join(COPIAS, f'dados-{dt.date.today().isoformat()}.db')
        if not os.path.exists(destino):
            origem = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
            copia = sqlite3.connect(destino)
            origem.backup(copia)
            copia.close(); origem.close()
        antigas = sorted(f for f in os.listdir(COPIAS) if f.startswith('dados-'))
        for f in antigas[:-14]:
            os.remove(os.path.join(COPIAS, f))
    except Exception as ex:  # noqa: BLE001
        print('cópia de segurança falhou:', ex)


def ld(obj):
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False).replace('</', '<\\/') + '</script>'


def migalhas(itens):
    partes = ['<a href="/">Início</a>'] + [f'<a href="{h}">{e(t)}</a>' if h else e(t) for h, t in itens[:-1]] + [e(itens[-1][1])]
    lista = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': t, 'item': DOMINIO + h} for i, (h, t) in enumerate([('/', 'Início')] + itens)]}
    return '<nav class="migalhas mold" aria-label="Estás aqui">' + ' / '.join(partes) + '</nav>', ld(lista)


def data_pt(d):
    return dt.date.fromisoformat(d).strftime('%d/%m/%Y')


def preencher(modelo, caminho, titulo, descricao, corpo):
    return (modelo.replace('@@TITULO@@', e(titulo)).replace('@@DESCRICAO@@', e(descricao))
            .replace('@@CAMINHO@@', caminho).replace('@@CORPO@@', corpo))


def escrever(raiz, caminho, conteudo):
    p = os.path.join(raiz, caminho.strip('/'), 'index.html')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(conteudo)


# ---------------------------------------------------------------- empresas

def paginas_empresas(linhas, por_prof, modelo, novo):
    empresas = {}
    for r in linhas:
        if r['empresa_id']:
            empresas.setdefault(r['empresa_id'], []).append(r)
    publicadas = []
    for eid, lst in empresas.items():
        tl = [r['t'] for r in lst]
        geral = ag.resumo(tl)
        if 'mediana' not in geral:
            continue
        nomes = {}
        for r in lst:
            nomes[r['empresa']] = nomes.get(r['empresa'], 0) + 1
        nome = max(nomes, key=nomes.get)
        grupos = {}
        for r in lst:
            grupos.setdefault(r['prof'], []).append(r['t'])
        # uma profissão dentro da empresa só aparece se o resto da empresa e o resto da profissão também tiverem 0 ou 5+
        filas = [(p, ag.resumo(sub)) for p, sub in grupos.items() if ag.pode_mostrar(sub, tl, por_prof.get(p, []))]
        tabela = ''.join(
            f'<tr><td><a href="/profissoes/{p}/">{e(PROF.get(p, {}).get("nome", p))}</a></td><td class="n">{euro(s["mediana"])}</td><td class="n">{s["n"]}</td></tr>'
            for p, s in sorted(filas, key=lambda x: -x[1]['n']))
        contratos = {}
        for r in lst:
            contratos[r['contrato']] = contratos.get(r['contrato'], 0) + 1
        tot = sum(contratos.values())
        lc = ''
        if geral['n'] >= 10:  # com menos de 10 pessoas, uma percentagem chegava a dizer o contrato de uma pessoa
            lc = '<div class="recibo"><h2 class="recibo-t">Tipo de contrato</h2>' + ''.join(
                f'<div class="linha"><span class="r">{e(CONTRATOS.get(k, k))}</span><span class="p"></span><span class="v">{round(100 * n / tot)} %</span></div>'
                for k, n in sorted(contratos.items(), key=lambda x: -x[1])) + '</div>'
        caminho = f'/empresa/{eid}/'
        mig, mig_ld = migalhas([('/empresa/', 'Empresas'), (caminho, nome)])
        corpo = f'''{mig}
<section class="sec" style="padding-top:24px"><div class="mold par">
<div><h1 style="font-size:clamp(44px,9vw,96px);font-stretch:82%;line-height:.92">{e(nome)}</h1>
<p class="lede" style="margin-top:20px">Segundo {geral["n"]} pessoas que lá trabalham, a mediana do salário bruto mensal é <span class="mk">{euro(geral["mediana"])}</span>.
Metade ganha entre {euro(geral["p25"])} e {euro(geral["p75"])}.</p>
<p class="fonte">Partilhas anónimas no ganhas.pt, convertidas para 40 horas por semana; valores {ag.nota_arredondamento(geral["passo"])}. Não é um número oficial da empresa. Atualizado a {data_pt(HOJE)}.</p></div>
{lc}
</div></section>
<section class="sec"><div class="mold">
{('<h2 style="font-size:clamp(28px,4vw,40px)">Por profissão</h2><table class="tabela" style="margin-top:24px"><thead><tr><th>Profissão</th><th class="n">Mediana</th><th class="n">Pessoas</th></tr></thead><tbody>' + tabela + '</tbody></table>') if tabela else '<p class="lede">Ainda não há pessoas suficientes da mesma profissão para mostrar o detalhe sem identificar ninguém.</p>'}
<p style="margin-top:40px;display:flex;flex-wrap:wrap;gap:12px"><a class="botao" href="/partilhar/">Partilhar o meu salário</a><a class="botao sec2" href="/empresa/">Ver outras empresas</a></p>
</div></section>
{mig_ld}'''
        escrever(novo, caminho, preencher(modelo, caminho, f'{nome}: salários partilhados por quem lá trabalha',
                                          f'{nome}: mediana de {euro(geral["mediana"])} brutos por mês segundo {geral["n"]} pessoas no ganhas.pt. Por profissão e tipo de contrato.', corpo))
        publicadas.append((eid, nome, geral))
    publicadas.sort(key=lambda x: -x[2]['n'])
    filas = ''.join(f'<tr><td><a href="/empresa/{eid}/">{e(nome)}</a></td><td class="n">{euro(g["mediana"])}</td><td class="n">{g["n"]}</td></tr>'
                    for eid, nome, g in publicadas)
    mig, mig_ld = migalhas([('/empresa/', 'Empresas')])
    corpo = f'''{mig}
<section class="sec" style="padding-top:24px"><div class="mold">
<h1 style="font-size:clamp(44px,9vw,96px);font-stretch:82%;line-height:.92;margin-bottom:20px">Quanto pagam as empresas</h1>
<p class="lede">Empresas com pelo menos {K} pessoas diferentes a partilhar o salário. Valores brutos mensais a 40 horas, arredondados a 50 € abaixo de 10 pessoas e à dezena a partir daí.</p>
{('<table class="tabela" style="margin-top:32px"><thead><tr><th>Empresa</th><th class="n">Mediana</th><th class="n">Pessoas</th></tr></thead><tbody>' + filas + '</tbody></table>') if filas else f'<p class="vazio" style="margin-top:32px">Ainda nenhuma empresa chegou às {K} pessoas. Sê o primeiro da tua.</p>'}
<p style="margin-top:40px"><a class="botao" href="/partilhar/">Partilhar o meu salário</a></p>
</div></section>
{mig_ld}'''
    pag = preencher(modelo, '/empresa/', 'Quanto pagam as empresas em Portugal',
                    f'Salários partilhados de forma anónima por quem trabalha em cada empresa, só com {K} ou mais pessoas.', corpo)
    if not publicadas:  # sem empresas, a lista vazia não deve ir para o Google
        pag = pag.replace('<!--robots--><!--/robots-->', '<!--robots--><meta name="robots" content="noindex, follow"><!--/robots-->')
    escrever(novo, '/empresa/', pag)
    return publicadas


# ---------------------------------------------------------------- profissões e profissões num distrito

def bloco_comunidade(pid, r, distritos):
    p = PROF[pid]
    lista = ''
    if distritos:
        lista = ('<h3 style="margin-top:40px">Por distrito</h3><ul class="lista-colunas" style="margin-top:16px">' +
                 ''.join(f'<li><a href="/profissoes/{pid}/{d}/">{e(local(d)[1])}</a><span class="cifra">{euro(s["mediana"])}</span></li>'
                         for d, s in sorted(distritos, key=lambda x: -x[1]['n'])) + '</ul>'
                 '<p class="dica" style="margin-top:12px">Só aparecem os distritos com pelo menos 5 pessoas, e só quando o resto do país também tem 5 ou mais.</p>')
    return (f'<!--comunidade--><div><h2 class="h2-pag">Na comunidade ganhas.pt</h2>'
            f'<div style="margin-top:20px"><p class="res-frase">Mediana: <span class="mk on">{euro(r["mediana"])}</span></p>'
            f'<p class="res-extra">Metade entre {euro(r["p25"])} e {euro(r["p75"])} · {r["n"]} pessoas · brutos por mês a 40 h por semana, {ag.nota_arredondamento(r["passo"])}.</p>'
            f'<p class="fonte">Partilhas anónimas com mais de 24 horas. Atualizado a {data_pt(HOJE)}. <a href="/metodo/">Como contamos</a>.</p></div>'
            f'{lista}'
            f'<p style="margin-top:28px;display:flex;flex-wrap:wrap;gap:12px"><a class="botao" href="/partilhar/?p={pid}">Partilhar o meu salário</a>'
            f'<a class="botao sec2" href="/calculadora/">Calcular o líquido</a></p></div><!--/comunidade-->')


def frase_comunidade(pid, r, onde='em Portugal'):
    nome = PROF[pid]['nome']
    return (f'Segundo {r["n"]} pessoas que partilharam o salário no ganhas.pt, um {e(minusc(nome))} {onde} ganha em mediana '
            f'<span class="mk">{euro(r["mediana"])}</span> brutos por mês, a 40 horas por semana. Metade ganha entre {euro(r["p25"])} e {euro(r["p75"])}.'
            + ('' if onde != 'em Portugal' else ' Contam só partilhas com mais de 24 horas, de pessoas diferentes.'))


def substituir(t, marca, novo):
    i, j = t.find(f'<!--{marca}-->'), t.find(f'<!--/{marca}-->')
    if i < 0 or j < 0:
        raise ValueError(f'sem a marca {marca}')
    return t[:i] + novo + t[j + len(f'<!--/{marca}-->'):]


def pagina_profissao(pid, r, distritos, novo):
    """A página estática da profissão, com os números da comunidade no HTML e indexável."""
    f = os.path.join(WWW, 'profissoes', pid, 'index.html')
    if not os.path.exists(f):
        return False
    t = open(f, encoding='utf-8').read()
    try:
        t = substituir(t, 'robots', '<!--robots--><!--/robots-->')
        t = substituir(t, 'comunidade', bloco_comunidade(pid, r, distritos))
        # a resposta direta passa a ser a da comunidade; a frase oficial fica logo a seguir
        i = t.find('<!--resposta-->')
        j = t.find('<!--/resposta-->')
        oficial = t[i + len('<!--resposta-->'):j].replace('class="lede resposta"', 'class="lede" style="margin-top:20px"')
        t = t[:i] + f'<!--resposta--><p class="lede resposta">{frase_comunidade(pid, r)}</p>{oficial}<!--/resposta-->' + t[j + len('<!--/resposta-->'):]
    except ValueError as ex:
        print(pid, ex)
        return False
    escrever(novo, f'/profissoes/{pid}/', t)
    return True


def pagina_distrito(pid, d, r, rn, outros, modelo, novo):
    p = PROF[pid]
    nome = p['nome']
    onde, rotulo = local(d)
    caminho = f'/profissoes/{pid}/{d}/'
    qp = ((O.get('distritos_qp') or {}).get('valores') or {}).get(d)
    sg = ((O.get('subgrupos') or {}).get('linhas') or {}).get(p.get('subgrupo', ''))
    ano_qp = (O.get('subgrupos') or {}).get('ano')
    nome_sg = (CAT.get('subgrupos') or {}).get(p.get('subgrupo', ''), '')
    fonte_qp = (O.get('fontes') or {}).get('subgrupos') or {}
    linhas_of = ''
    if qp:
        linhas_of += f'<div class="linha"><span class="r">Ganho médio {e(onde)}, todas as profissões ({ano_qp})</span><span class="p"></span><span class="v">{euro(qp["ganho"])}</span></div>'
    if sg and sg.get('ganho') and sg['ganho'][-1]:
        linhas_of += f'<div class="linha"><span class="r">Subgrupo «{e(nome_sg)}», Continente ({ano_qp})</span><span class="p"></span><span class="v">{euro(sg["ganho"][-1])}</span></div>'
    oficial = ''
    if linhas_of:
        oficial = (f'<div class="recibo" style="margin-top:40px"><h2 class="recibo-t">Números oficiais ao lado</h2>{linhas_of}'
                   f'<p class="fonte">Ganho médio mensal bruto de quem trabalha a tempo completo no setor privado e nas empresas públicas. Fonte: '
                   f'<a href="{e(fonte_qp.get("url", "/metodo/"))}" rel="noopener">{e(fonte_qp.get("nome", "DGCP/MTSSS, Quadros de Pessoal"))}</a>. '
                   f'Não há número oficial por profissão em cada distrito.</p></div>')
    concelhos = [c for c in O.get('concelhos', []) if c.get('distrito') == d]
    lc = ''
    if concelhos:
        lc = (f'<h2 class="h2-pag" style="margin-top:64px">Concelhos {e(onde.replace("no distrito", "do distrito").replace("nos Açores", "dos Açores").replace("na Madeira", "da Madeira"))}</h2>'
              '<ul class="lista-colunas" style="margin-top:24px">' +
              ''.join(f'<li><a href="/concelhos/{c["id"]}/">{e(c["nome"])}</a><span class="cifra">{euro(c["ganho_medio"])}</span></li>'
                      for c in sorted(concelhos, key=lambda c: -(c.get('ganho_medio') or 0))) +
              f'</ul><p class="dica" style="margin-top:12px">Ganho médio de todas as profissões em cada concelho, {O.get("concelhos_ano", "")} (INE). Toca num concelho para ver por grupo de profissões.</p>')
    lo = ''
    if outros:
        lo = ('<h2 class="h2-pag" style="margin-top:64px">A mesma profissão noutros distritos</h2><ul class="lista-colunas" style="margin-top:24px">' +
              ''.join(f'<li><a href="/profissoes/{pid}/{x}/">{e(local(x)[1])}</a><span class="cifra">{euro(s["mediana"])}</span></li>' for x, s in outros) + '</ul>')
    mig, mig_ld = migalhas([('/profissoes/', 'Profissões'), (f'/profissoes/{pid}/', nome), (caminho, rotulo)])
    occ = {'@context': 'https://schema.org', '@type': 'Occupation', 'name': nome, 'occupationalCategory': f'CPP {p.get("cpp", "")}',
           'occupationLocation': {'@type': 'AdministrativeArea', 'name': rotulo, 'containedInPlace': {'@type': 'Country', 'name': 'Portugal'}},
           'estimatedSalary': {'@type': 'MonetaryAmountDistribution', 'name': f'partilhas anónimas no ganhas.pt ({r["n"]} pessoas)', 'currency': 'EUR',
                               'duration': 'P1M', 'percentile25': r['p25'], 'median': r['mediana'], 'percentile75': r['p75']}}
    titulo_h1 = f'Quanto ganha um {minusc(nome)} {onde}?'
    corpo = f'''{mig}
<section class="sec" style="padding-top:24px"><div class="mold grelha2">
<div>
<h1 class="h1-pag h1-media">{e(titulo_h1)}</h1>
<p class="lede resposta" style="margin-top:20px">{frase_comunidade(pid, r, onde)} Em todo o país, a mediana desta profissão no ganhas.pt é {euro(rn["mediana"])} ({rn["n"]} pessoas).</p>
<p class="fonte">Atualizado a {data_pt(HOJE)} · {r["n"]} respostas com mais de 24 horas · valores {ag.nota_arredondamento(r["passo"])} · <a href="/metodo/">método</a></p>
{oficial}
</div>
<div>
<div class="recibo"><h2 class="recibo-t">{e(nome)}, {e(rotulo)}</h2>
<div class="linha"><span class="r">Mediana</span><span class="p"></span><span class="v"><span class="mk">{euro(r["mediana"])}</span></span></div>
<div class="linha"><span class="r">Metade ganha entre</span><span class="p"></span><span class="v">{euro(r["p25"])} e {euro(r["p75"])}</span></div>
<div class="linha"><span class="r">Pessoas</span><span class="p"></span><span class="v">{r["n"]}</span></div>
<div class="linha"><span class="r">Em Portugal (comunidade)</span><span class="p"></span><span class="v">{euro(rn["mediana"])}</span></div>
<p class="fonte">Brutos por mês, convertidos para 40 horas por semana, sem subsídio de alimentação nem prémios.</p></div>
<p style="margin-top:28px;display:flex;flex-wrap:wrap;gap:12px"><a class="botao" href="/partilhar/?p={pid}">Partilhar o meu salário</a>
<a class="botao sec2" href="/profissoes/{pid}/">{e(nome)} em todo o país</a></p>
</div>
</div></section>
<section class="sec"><div class="mold">{lo}{lc}</div></section>
{mig_ld}{ld(occ)}'''
    desc = (f'Quanto ganha um {minusc(nome)} {onde}: mediana de {euro(r["mediana"]).replace(chr(160), " ")} brutos por mês segundo {r["n"]} pessoas, '
            f'metade entre {euro(r["p25"]).replace(chr(160), " ")} e {euro(r["p75"]).replace(chr(160), " ")}. Partilhas anónimas no ganhas.pt.')
    titulo = f'Salário de {minusc(nome)} {onde.replace("no distrito do ", "no ").replace("no distrito da ", "na ").replace("no distrito de ", "em ")}'
    escrever(novo, caminho, preencher(modelo, caminho, titulo, desc, corpo))


def paginas_comunidade(linhas, por_prof, modelo, novo):
    """Devolve [(caminho, era_noindex)] para o sitemap."""
    urls = []
    por_pd = {}
    for r in linhas:
        por_pd.setdefault((r['prof'], r['dist']), []).append(r['t'])
    for pid, tl in sorted(por_prof.items()):
        if pid not in PROF:
            continue
        rn = ag.resumo(tl)
        if 'mediana' not in rn:
            continue
        dists = [(d, ag.resumo(sub)) for (p, d), sub in por_pd.items() if p == pid and d in DIST and ag.pode_mostrar(sub, tl)]
        for d, r in dists:
            pagina_distrito(pid, d, r, rn, [(x, s) for x, s in dists if x != d], modelo, novo)
            urls.append((f'/profissoes/{pid}/{d}/', True))
        f = os.path.join(WWW, 'profissoes', pid, 'index.html')
        era_noindex = os.path.exists(f) and 'noindex' in open(f, encoding='utf-8').read().split('</head>')[0]
        if pagina_profissao(pid, rn, dists, novo):
            urls.append((f'/profissoes/{pid}/', era_noindex))
    return urls


# ---------------------------------------------------------------- sitemap com datas estáveis

def lastmod(raiz, caminhos):
    """Data da última mudança real de cada página (o texto entre <main> e </main>, sem a data «Atualizado a»)."""
    fe = os.path.join(SAIDA, '.estado-comunidade.json')
    try:
        estado = json.load(open(fe, encoding='utf-8'))
    except Exception:  # noqa: BLE001
        estado = {}
    novo_estado = {}
    for c in caminhos:
        try:
            t = open(os.path.join(raiz, c.strip('/'), 'index.html'), encoding='utf-8').read()
        except OSError:
            continue
        m = t[t.find('<main'):t.find('</main>')]
        m = re.sub(r'Atualizado a \d\d/\d\d/\d{4}', '', m)
        h = hashlib.sha256(m.encode()).hexdigest()[:16]
        antigo = estado.get(c)
        novo_estado[c] = [h, antigo[1] if antigo and antigo[0] == h else HOJE]
    tmp = fe + '.novo'
    json.dump(novo_estado, open(tmp, 'w', encoding='utf-8'))
    os.replace(tmp, fe)
    return {c: v[1] for c, v in novo_estado.items()}


def sitemap(caminhos, datas):
    urls = ''.join(f'<url><loc>{DOMINIO}{c}</loc><lastmod>{datas.get(c, HOJE)}</lastmod></url>' for c in caminhos)
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls + '</urlset>\n'


HOJE = dt.date.today().isoformat()


def main():
    if not os.path.exists(DB):
        print('ainda não há base de dados'); return
    modelo = open(MODELO, encoding='utf-8').read()
    c = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
    limiar = int(time.time()) - ATRASO
    q = c.execute("SELECT id, empresa_id, empresa, profissao, distrito, bruto_mes * 40.0 / horas, ip_dia, dispositivo, contrato FROM partilhas "
                  "WHERE estado='ok' AND criado < ?", (limiar,)).fetchall()
    c.close()
    linhas = [{'id': i, 'empresa_id': eid, 'empresa': emp, 'prof': p, 'dist': d, 'contrato': ct, 't': (v, ip, disp, i)}
              for i, eid, emp, p, d, v, ip, disp, ct in q]
    por_prof = {}
    for r in linhas:
        por_prof.setdefault(r['prof'], []).append(r['t'])
    # dentro da própria pasta: o serviço só pode escrever aí (ProtectSystem=strict); o Caddy não serve pastas com ponto
    os.makedirs(SAIDA, exist_ok=True)
    novo = os.path.join(SAIDA, '.novo')
    shutil.rmtree(novo, ignore_errors=True)
    os.makedirs(os.path.join(novo, 'empresa'))
    os.makedirs(os.path.join(novo, 'profissoes'))  # sempre: substitui a pasta antiga mesmo quando fica vazia
    publicadas = paginas_empresas(linhas, por_prof, modelo, novo)
    comunidade = paginas_comunidade(linhas, por_prof, modelo, novo)
    cam_emp = (['/empresa/'] if publicadas else []) + [f'/empresa/{eid}/' for eid, _, _ in publicadas]
    cam_com = [c for c, era_noindex in comunidade if era_noindex]
    datas = lastmod(novo, cam_emp + cam_com)
    with open(os.path.join(novo, 'sitemap-empresas.xml'), 'w', encoding='utf-8') as f:
        f.write(sitemap(cam_emp, datas))
    with open(os.path.join(novo, 'sitemap-comunidade.xml'), 'w', encoding='utf-8') as f:
        f.write(sitemap(cam_com, datas))
    # troca atómica: o Caddy nunca vê uma pasta a meio
    velho = os.path.join(SAIDA, '.velho')
    shutil.rmtree(velho, ignore_errors=True)
    for nome in os.listdir(novo):
        alvo = os.path.join(SAIDA, nome)
        if os.path.exists(alvo):
            os.makedirs(velho, exist_ok=True)
            os.replace(alvo, os.path.join(velho, nome))
        os.replace(os.path.join(novo, nome), alvo)
    shutil.rmtree(novo, ignore_errors=True)
    shutil.rmtree(velho, ignore_errors=True)
    print(f'{len(publicadas)} empresas publicadas; {sum(1 for c, _ in comunidade if c.count("/") == 3)} profissões e '
          f'{sum(1 for c, _ in comunidade if c.count("/") == 4)} profissões num distrito com números da comunidade; {len(linhas)} partilhas públicas')
    if os.environ.get('GANHAS_SEM_COPIA') != '1':
        copia_seguranca()


if __name__ == '__main__':
    main()
