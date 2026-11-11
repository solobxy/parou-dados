#!/usr/bin/env python3
"""ganhas.pt: gera o site estático em sites/ganhas a partir de ganhas/dados/oficial.json e ganhas/catalogo.json.

Uso: python3 ganhas/gerar.py   (a partir da raiz do repositório)
Tudo o que aparece nas páginas vem dos ficheiros de dados, com fonte e ano. Nada de números inventados.
"""
import datetime as dt, hashlib, html, json, os, re, shutil, sys, unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
SAIDA = os.path.join(RAIZ, 'sites', 'ganhas')
MODELO = os.path.join(AQUI, 'modelo')
DOMINIO = 'https://ganhas.pt'
GOOGLE_VERIFICACAO = os.environ.get('GANHAS_GSC', '')  # código do Search Console (meta), se houver
sys.path.insert(0, AQUI)
import legal  # noqa: E402

with open(os.path.join(AQUI, 'catalogo.json'), encoding='utf-8') as f:
    CAT = json.load(f)
with open(os.path.join(AQUI, 'dados', 'oficial.json'), encoding='utf-8') as f:
    O = json.load(f)

HOJE = dt.date.today().isoformat()
ANO = dt.date.today().year


def smn_hoje():
    """(ano, valor) do salário mínimo em vigor: o do ano corrente, ou o mais recente que já se conhece."""
    d = O['smn']
    anos = [int(a) for a in d if int(a) <= ANO]
    a = str(max(anos)) if anos else min(d, key=int)
    return int(a), d[a]


# Novembro com metade da retenção: só enquanto for esse novembro (a regra é de um ano só)
NOV = bool(O['irs'].get('novembro')) and HOJE < f"{O['irs']['ano']}-12-01"
PAGINAS = []  # (caminho, prioridade) para o sitemap
e = html.escape


def slug(s):
    s = ''.join(ch for ch in unicodedata.normalize('NFKD', s) if not unicodedata.combining(ch)).lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def euro(v, casas=0):
    if v is None:
        return '—'
    s = f'{v:,.{casas}f}'.replace(',', ' ').replace('.', ',').replace(' ', '.')
    return s + ' €'


def pct(v, casas=0):
    return f'{v:.{casas}f}'.replace('.', ',') + ' %'


def ver(nome):
    with open(os.path.join(MODELO, nome), 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()[:10]


def fonte(chave, extra=''):
    f = O['fontes'][chave]
    return (f'<p class="fonte">Fonte: <a href="{e(f["url"])}" rel="noopener">{e(f["nome"])}</a>'
            f'{", " + e(f["ref"]) if f.get("ref") else ""}.{(" " + extra) if extra else ""}</p>')


def jsonld(obj):
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False).replace('</', '<\\/') + '</script>'


ORG = {'@type': 'Organization', '@id': DOMINIO + '/#org', 'name': 'ganhas.pt', 'url': DOMINIO + '/',
       'logo': DOMINIO + '/icone-512.png', 'founder': {'@type': 'Person', 'name': 'Dinis Sousa', 'url': 'https://dinissousa.pt'}}
SITE = {'@type': 'WebSite', '@id': DOMINIO + '/#site', 'name': 'ganhas.pt', 'url': DOMINIO + '/', 'inLanguage': 'pt-PT',
        'publisher': {'@id': DOMINIO + '/#org'}}

NAV = [('/calculadora/', 'Calculadora'), ('/profissoes/', 'Profissões'), ('/concelhos/', 'Concelhos'), ('/empresa/', 'Empresas')]


def pagina(caminho, titulo, descricao, corpo, *, dados=None, ld=None, prioridade=0.6, og=None, barra=False, h_titulo=None,
           indexar=True, sitemap=True, destino=None):
    """Escreve sites/ganhas<caminho>index.html"""
    url = DOMINIO + caminho
    og = og or '/og/geral.png'
    # o Google corta perto dos 60 caracteres no título e dos 160 na descrição
    def curto(t, n):
        return t if len(t) <= n else t[:n - 1].rsplit(' ', 1)[0].rstrip(',;:(') + '…'
    titulo_meta = curto(titulo, 65)
    tit = h_titulo or (titulo_meta + ' · ganhas.pt' if len(titulo_meta) <= 50 else titulo_meta)
    descricao = curto(descricao, 160)
    nav = ''.join(f'<a href="{h}"{" aria-current=\"page\"" if caminho.startswith(h) else ""}>{t}</a>' for h, t in NAV)
    lds = [ORG, SITE] + (ld or [])
    head_extra = f'<meta name="google-site-verification" content="{e(GOOGLE_VERIFICACAO)}">' if GOOGLE_VERIFICACAO else ''
    robots = '' if indexar else '<meta name="robots" content="noindex">'
    dados_html = ('<script type="application/json" id="dados">' + json.dumps(dados, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') + '</script>') if dados else ''
    barra_html = ''  # o botão «Partilhar» do topo já está sempre à vista; uma segunda barra fixa tapava o conteúdo
    doc = f'''<!doctype html>
<html lang="pt-PT" class="sem-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(tit)}</title>
<meta name="description" content="{e(descricao)}">
<link rel="canonical" href="{e(url)}">
{robots}{head_extra}
<meta property="og:type" content="website">
<meta property="og:site_name" content="ganhas.pt">
<meta property="og:locale" content="pt_PT">
<meta property="og:title" content="{e(titulo_meta)}">
<meta property="og:description" content="{e(descricao)}">
<meta property="og:url" content="{e(url)}">
<meta property="og:image" content="{DOMINIO}{og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#F7F7F2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0F110F" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/icone-180.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/fontes/bricolage.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fontes/schibsted.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/estilo.css?v={ver('estilo.css')}">
<script defer src="/_e.js" data-site="ganhas"></script>
<script defer src="/app.js?v={ver('app.js')}"></script>
{jsonld({'@context': 'https://schema.org', '@graph': lds})}
</head>
<body>
<a class="salto" href="#conteudo">Saltar para o conteúdo</a>
<header class="topo"><div class="mold">
<a class="marca" href="/" aria-label="ganhas.pt, início">ganhas<span>.pt</span></a>
<nav class="nav" aria-label="Principal">{nav}</nav>
<a class="botao" href="/partilhar/">Partilhar</a>
</div></header>
<main id="conteudo">
{corpo}
</main>
{rodape()}
{barra_html}
{dados_html}
</body>
</html>
'''
    if not destino:
        destino = os.path.join(SAIDA, caminho.strip('/'), 'index.html') if caminho != '/' else os.path.join(SAIDA, 'index.html')
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, 'w', encoding='utf-8') as f:
        f.write(doc)
    if indexar and sitemap:
        PAGINAS.append((caminho, prioridade))


def rodape():
    return f'''<footer class="rodape"><div class="mold">
<a class="marca" href="/">ganhas<span>.pt</span></a>
<div class="rodape-grelha">
<div><p>Salários reais em Portugal: números oficiais e partilhas anónimas de quem trabalha. Sem contas, sem cookies.</p>
<p class="credito">Feito por <a href="https://dinissousa.pt">dinissousa.pt</a></p></div>
<ul><li><a href="/calculadora/">Calculadora de salário líquido</a></li><li><a href="/profissoes/">Salários por profissão</a></li>
<li><a href="/concelhos/">Salários por concelho</a></li><li><a href="/funcao-publica/">Função pública</a></li><li><a href="/europa/">Portugal e a Europa</a></li><li><a href="/empresa/">Quanto pagam as empresas</a></li></ul>
<ul><li><a href="/partilhar/">Partilhar o meu salário</a></li><li><a href="/metodo/">Método e fontes</a></li><li><a href="/dados/">Dados abertos</a></li>
<li><a href="/para-empresas/">Para empresas e jornalistas</a></li></ul>
<ul><li><a href="/privacidade/">Privacidade</a></li><li><a href="/termos/">Termos</a></li><li><a href="/cookies/">Cookies</a></li>
<li><a href="mailto:{legal.EMAIL}">Contacto</a></li></ul>
</div>
<p class="peq">Dados oficiais do INE, GEP/MTSSS, AT, DGAEP e Eurostat, com a fonte em cada número. Atualizado a {dt.date.fromisoformat(O["atualizado"]).strftime("%d/%m/%Y")}.</p>
</div></footer>'''


def migalhas(itens):
    partes = ['<a href="/">Início</a>'] + [f'<a href="{h}">{e(t)}</a>' if h else e(t) for h, t in itens]
    ld = {'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': t, 'item': DOMINIO + (h or '')} for i, (h, t) in enumerate([('/', 'Início')] + itens)]}
    return '<nav class="migalhas mold" aria-label="Estás aqui">' + ' / '.join(partes) + '</nav>', ld


# ---------------------------------------------------------------- páginas de texto

def paginas_texto():
    for caminho, titulo, desc, corpo in (
        ('/privacidade/', 'Privacidade', 'Como o ganhas.pt trata os dados: sem contas, sem cookies, sem guardar o IP.', legal.privacidade()),
        ('/termos/', 'Termos de utilização', 'Regras de utilização do ganhas.pt e das partilhas de salários.', legal.termos()),
        ('/cookies/', 'Cookies', 'O ganhas.pt não usa cookies. Veja o que fica guardado no navegador.', legal.cookies()),
    ):
        pagina(caminho, titulo, desc, f'<section class="sec"><div class="mold texto">{corpo}</div></section>', prioridade=0.2)
    lista = ''.join(f'<li><strong>{e(f["nome"])}</strong>: {e(f["descricao"])} '
                    f'(<a href="{e(f["url"])}" rel="noopener">fonte</a>{", " + e(f["ref"]) if f.get("ref") else ""}).</li>'
                    for f in O['fontes'].values())
    pagina('/metodo/', 'Método e fontes', 'De onde vêm os números do ganhas.pt, como são tratados e o que não dizem.',
           f'<section class="sec"><div class="mold texto">{legal.metodologia("<ul>" + lista + "</ul>", O["irs"]["ano"])}</div></section>', prioridade=0.4)


# ---------------------------------------------------------------- dados partilhados com o JavaScript

def dados_distribuicao():
    d = O['distribuicao']
    return {'ano': d['ano'], 'minimo': d['minimo'], 'minimo_hoje': smn_hoje()[1], 'minimo_ano': smn_hoje()[0],
            'base': {k: d['base'][k] for k in ('pontos', 'mediana', 'eixo')},
            'ganho': {k: d['ganho'][k] for k in ('pontos', 'mediana', 'eixo')}}


def dados_irs():
    return O['irs']


def histograma_html(d, chave, visivel):
    """Barras com a percentagem de trabalhadores em cada intervalo de 100 € (a partir dos decis oficiais).
    A última barra junta tudo o que fica acima e é desenhada à parte."""
    s = d[chave]
    n = len(s['barras'])
    mx = max(s['barras'][:-1]) or 1
    barras = ''.join(f'<i style="--h:{min(100, round(100 * b / mx, 1))}%"{" class=resto" if i == n - 1 else ""}><span class="vis">{e(r)}: {pct(100 * b, 1)}</span></i>'
                     for i, (b, r) in enumerate(zip(s['barras'], s['rotulos'])))
    meio = s['eixo'][0] + (s['eixo'][1] - s['eixo'][0]) // 2
    return (f'<figure class="histo" data-histo="{chave}"{"" if visivel else " hidden"}>'
            f'<div class="histo-barras" style="--n:{n}">{barras}</div>'
            f'<div class="histo-tu" hidden><b>Tu</b></div>'
            f'<figcaption class="histo-eixo"><span>{euro(s["eixo"][0])}</span><span>{euro(meio)}</span>'
            f'<span>{euro(s["eixo"][1] - 100)} ou mais</span></figcaption></figure>')


# ---------------------------------------------------------------- início

def inicio():
    d = O['distribuicao']
    grupos = O['grupos']
    conc = sorted(O['concelhos'], key=lambda c: -c['ganho_medio'])
    topo, fundo = conc[:5], conc[-5:][::-1]
    eu = O.get('europa')
    pt = next((x for x in eu['liquido'] if x['codigo'] == 'PT'), None) if eu else None
    linhas_grupos = ''.join(f'<tr><td><a href="/profissoes/#g{k}">{e(GC[k])}</a></td><td class="n">{euro(v["ganho"])}</td></tr>'
                            for k, v in sorted(grupos.items(), key=lambda kv: -kv[1]['ganho']))
    ano = d['ano']
    por = carreiras_fp()
    fp_lista = ''.join(f'<li><a href="/funcao-publica/{k}/">{e(por[k]["titulo"])}</a><span class="cifra">desde {euro(por[k]["min"])}</span></li>'
                       for k in ('professores', 'enfermeiros', 'medicos', 'psp', 'tecnico-superior', 'assistente-operacional') if k in por)
    g, b = d['ganho'], d['base']
    corpo = f'''
<section class="heroi"><div class="mold">
<h1>Quanto ganhas?</h1>
<p class="lede">Compara o teu salário com os números oficiais de Portugal e com quem faz o mesmo que tu. Sem conta, sem nome, sem cookies.</p>
<div class="comparador" id="comparador">
<div class="campo-grande">
<label for="salario">O teu salário bruto por mês</label>
<div class="linha-valor"><input id="salario" name="salario" inputmode="decimal" autocomplete="off" placeholder="1 100" aria-describedby="salario-ajuda"><span class="unid">€ brutos</span></div>
<p class="ajuda" id="salario-ajuda">O valor antes de descontos, como aparece no recibo.</p>
<div class="opcoes" role="radiogroup" aria-label="O que estás a escrever">
<label><input type="radio" name="tipo" value="base" checked><span>Só o vencimento base</span></label>
<label><input type="radio" name="tipo" value="ganho"><span>Com prémios e subsídios regulares</span></label>
</div>
<div class="opcoes" role="radiogroup" aria-label="Quantos salários recebes por ano">
<label><input type="radio" name="meses" value="14" checked><span>14 meses</span></label>
<label><input type="radio" name="meses" value="12"><span>12 meses (duodécimos)</span></label>
</div>
</div>
<div class="resultado" aria-live="polite">
<p class="res-frase" id="res-frase">Em {ano}, metade de quem trabalhava a tempo completo tinha um vencimento base abaixo de <span class="mk">{euro(b["mediana"])}</span>.</p>
<p class="res-extra" id="res-extra">Escreve o teu salário para veres onde estás.</p>
<p class="res-partilha" id="res-partilha" hidden><button class="ligacao-botao" type="button" id="partilhar-resultado">Partilhar o resultado</button><span id="partilha-ok" class="res-nota" hidden>Copiado. Cola onde quiseres.</span></p>
{histograma_html(d, "base", True)}{histograma_html(d, "ganho", False)}
<p class="fonte">Quem trabalha por conta de outrem a tempo completo, {e(d["ambito"])}, outubro de {ano}. Cada barra junta 100 €. <a href="{e(O["fontes"]["decis"]["url"])}" rel="noopener">DGCP/MTSSS, Quadros de Pessoal</a>.</p>
</div>
</div>
<p class="acoes"><a class="botao" href="/partilhar/">Comparar com a minha profissão</a>
<a class="botao sec2" href="/calculadora/">Calcular o meu líquido</a></p>
<p class="fonte" data-contador hidden></p>
</div></section>

<section class="sec"><div class="mold par">
<div class="entra"><h2>Metade ganhava menos de {euro(g["mediana"])}</h2></div>
<div class="entra"><p class="lede">Contando prémios e subsídios regulares, o ganho médio era {euro(d["media"])}, mas a média engana: os salários mais altos puxam-na para cima.
A mediana diz o que ganha a pessoa do meio. Em outubro de {ano}, com o salário mínimo nos {euro(d["minimo"])}, {pct(b["ate_1000"])} de quem trabalhava a tempo completo tinha
um vencimento base até {euro(1000)}, e só 1 em cada 10 ganhava mais de {euro(g["d9"])}.</p>{fonte("decis")}</div>
</div></section>

<section class="sec folha"><div class="mold grelha2">
<div class="entra"><h2>Bruto não é o que levas para casa</h2>
<p class="lede espaco">Com as tabelas de IRS de {O["irs"]["ano"]}, a Segurança Social e o subsídio de alimentação, a calculadora mostra o teu recibo linha a linha.{(chr(10) + f'Em novembro de {O["irs"]["ano"]}, a retenção de IRS é metade.') if NOV else ''}</p>
<p class="espaco"><a class="botao" href="/calculadora/">Abrir a calculadora</a></p></div>
<div class="recibo entra" aria-label="Exemplo de recibo">
<h3>Exemplo: {euro(O["exemplo"]["bruto"])} brutos</h3>
<div class="linha"><span class="r">Vencimento base</span><span class="p"></span><span class="v">{euro(O["exemplo"]["bruto"], 2)}</span></div>
<div class="linha menos"><span class="r">Segurança Social (11 %)</span><span class="p"></span><span class="v">− {euro(O["exemplo"]["ss"], 2)}</span></div>
<div class="linha menos"><span class="r">Retenção de IRS</span><span class="p"></span><span class="v">− {euro(O["exemplo"]["irs"], 2)}</span></div>
<div class="linha total"><span class="r">Líquido</span><span class="p"></span><span class="v"><span class="mk">{euro(O["exemplo"]["liquido"], 2)}</span></span></div>
<p class="fonte">Não casado, sem dependentes, Continente, tabela I de {O["irs"]["ano"]}, sem subsídio de alimentação.</p>
</div>
</div></section>

<section class="sec"><div class="mold">
<div class="entra"><h2>Onde trabalhas muda tudo</h2>
<p class="lede espaco">O ganho médio mensal varia muito de concelho para concelho. Estes são os extremos de {O["concelhos_ano"]}.</p></div>
<div class="grelha2" style="margin-top:48px">
<table class="tabela entra"><caption class="vis">Concelhos com maior ganho médio</caption><thead><tr><th>Mais alto</th><th class="n">Ganho médio</th></tr></thead><tbody>
{"".join(f'<tr><td><a href="/concelhos/{c["id"]}/">{e(c["nome"])}</a></td><td class="n">{euro(c["ganho_medio"])}</td></tr>' for c in topo)}
</tbody></table>
<table class="tabela entra"><caption class="vis">Concelhos com menor ganho médio</caption><thead><tr><th>Mais baixo</th><th class="n">Ganho médio</th></tr></thead><tbody>
{"".join(f'<tr><td><a href="/concelhos/{c["id"]}/">{e(c["nome"])}</a></td><td class="n">{euro(c["ganho_medio"])}</td></tr>' for c in fundo)}
</tbody></table>
</div>
{fonte("concelhos")}
<p class="espaco"><a class="ligacao" href="/concelhos/">Ver os 308 concelhos</a></p>
</div></section>

<section class="sec"><div class="mold grelha2">
<div class="entra"><h2>Na tua profissão</h2>
<p class="lede espaco">Ganho médio mensal por grupo de profissões no setor privado, {grupos_ano()}. Do grupo que mais ganha ao que menos ganha.</p>
<p class="espaco"><a class="botao sec2" href="/profissoes/">Procurar a minha profissão</a></p></div>
<table class="tabela entra"><thead><tr><th>Grupo de profissões</th><th class="n">Ganho médio</th></tr></thead><tbody>{linhas_grupos}</tbody></table>
</div><div class="mold">{fonte("grupos")}</div></section>

<section class="sec folha"><div class="mold grelha2">
<div class="entra"><h2>E no Estado?</h2>
<p class="lede espaco">Na função pública o salário está na lei. Juntámos {len(por)} carreiras, de professores a juízes, com o bruto e o líquido de cada posição em {O["funcao_publica"]["ano"]}.</p>
<p class="espaco"><a class="botao sec2" href="/funcao-publica/">Ver as carreiras</a></p></div>
<ul class="lista-colunas larga entra">{fp_lista}</ul>
</div></section>

<section class="sec"><div class="mold par">
<div class="entra"><p class="gigante" aria-hidden="true">5+</p></div>
<div class="entra"><h2>A tua empresa paga bem?</h2>
<p class="lede espaco">Partilha o teu salário em 30 segundos. Só mostramos a mediana de uma empresa ou profissão quando há pelo menos 5 pessoas diferentes,
24 horas depois, arredondada à dezena. Não guardamos o teu IP nem pedimos o teu nome.</p>
<p class="espaco"><a class="botao" href="/partilhar/">Partilhar o meu salário</a></p></div>
</div></section>
{secao_europa_curta(eu, pt)}
'''
    ld = [{'@type': 'WebApplication', 'name': 'Comparador de salários ganhas.pt', 'url': DOMINIO + '/', 'applicationCategory': 'FinanceApplication',
           'operatingSystem': 'Todos', 'inLanguage': 'pt-PT', 'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'EUR'}}]
    pagina('/', 'Quanto ganhas? Compara o teu salário em Portugal',
           f'Em {ano}, metade de quem trabalhava a tempo completo ganhava menos de {euro(g["mediana"])}. Compara o teu salário e calcula o líquido de {O["irs"]["ano"]}.',
           corpo, dados={'distribuicao': dados_distribuicao(), 'irs': dados_irs()}, ld=ld, prioridade=1.0, barra=True,
           h_titulo='ganhas.pt · Quanto ganhas? Compara o teu salário em Portugal')


def fonte_curta(chave):
    f = O['fontes'][chave]
    return f'Fonte: <a href="{e(f["url"])}" rel="noopener">{e(f["nome"])}</a>.'


def grupos_ano():
    anos = {v.get('ano') for v in O['grupos'].values() if v.get('ano')}
    return str(max(anos)) if anos else ''


def secao_europa_curta(eu, pt):
    if not eu or not pt:
        return ''
    ordem = sorted(eu['liquido'], key=lambda x: -x['eur'])
    vizinhos = [x for x in ordem if x['codigo'] in ('LU', 'DE', 'FR', 'ES', 'IT', 'PL', 'PT', 'BG', 'EU27_2020')]
    mx = max(x['eur'] for x in vizinhos)
    barras = ''.join(f'<div class="barra-h{" pt" if x["codigo"] == "PT" else ""}"><span>{e(x["pais"])}</span><i style="--w:{round(100 * x["eur"] / mx, 1)}%"></i><b>{euro(x["eur"])}</b></div>'
                     for x in vizinhos)
    return f'''<section class="sec"><div class="mold par">
<div class="entra"><h2>Portugal ao lado da Europa</h2>
<p class="lede espaco">Salário líquido anual de uma pessoa sozinha, sem filhos, que ganha o salário médio, em {eu["ano"]}.</p>
<p class="espaco"><a class="ligacao" href="/europa/">Ver todos os países e o poder de compra</a></p></div>
<div class="barras-h entra">{barras}</div>
</div><div class="mold">{fonte("europa")}</div></section>'''


# ---------------------------------------------------------------- calculadora

def calculadora():
    irs = O['irs']
    T = irs['tabelas']
    def parcela(l):
        if isinstance(l[2], (int, float)):
            return euro(l[2], 2)
        q = l[2]
        return f'{pct(100 * q["t"], 2)} × {str(q["f"]).replace(".", ",")} × ({euro(q["b"], 2)} − R)'
    anterior = [0] + [l[0] for l in T['I']['linhas'][:-1]]
    linhas_I = ''.join(
        f'<tr><td>{("até " + euro(l[0], 2)) if l[0] else ("acima de " + euro(a, 2))}</td><td class="n">{pct(100 * l[1], 2)}</td>'
        f'<td class="n">{parcela(l)}</td></tr>' for l, a in zip(T['I']['linhas'], anterior))
    corpo = f'''
{migalhas([(None, "Calculadora de salário líquido")])[0]}
<section class="sec" style="padding-top:24px"><div class="mold">
<h1 class="h1-pag">Calculadora de salário líquido {irs["ano"]}</h1>
<p class="lede">Do bruto ao líquido, com as tabelas oficiais de retenção na fonte do IRS para {irs["ano"]} (Continente), a Segurança Social e o subsídio de alimentação.</p>
<div class="grelha2" style="margin-top:48px" id="calculadora">
<form class="form" id="form-calc" aria-label="Dados para o cálculo">
<div class="f"><label for="c-bruto">Salário bruto mensal</label><input type="text" id="c-bruto" inputmode="decimal" autocomplete="off" placeholder="1 200" value="1200"></div>
<div class="f"><label for="c-situacao">Situação</label><select id="c-situacao">
<option value="nc">Não casado (solteiro, divorciado, viúvo)</option>
<option value="c2">Casado ou unido de facto, os dois com rendimentos</option>
<option value="c1">Casado ou unido de facto, só um com rendimentos</option></select></div>
<div class="f"><label for="c-dep">Dependentes</label><select id="c-dep"><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5 ou mais</option></select></div>
<div class="f"><label for="c-meses">Recebes em</label><select id="c-meses"><option value="14">14 meses (subsídios de férias e Natal à parte)</option><option value="12">12 meses (subsídios em duodécimos)</option></select></div>
<div class="f"><label for="c-subs">Subsídio de alimentação por dia <span class="opc">(opcional)</span></label><input type="text" id="c-subs" inputmode="decimal" placeholder="{str(irs["subsidio_dinheiro"]).replace(".", ",")}"></div>
<div class="f"><label for="c-subs-tipo">Pago em</label><select id="c-subs-tipo"><option value="cartao">Cartão ou vale de refeição</option><option value="dinheiro">Dinheiro, junto com o salário</option></select>
<p class="dica">Isento até {euro(irs["subsidio_dinheiro"], 2)} por dia em dinheiro e {euro(irs["subsidio_cartao"], 2)} em cartão. Contamos 22 dias por mês.</p></div>
</form>
<div class="recibo" aria-live="polite">
<h3>O teu recibo</h3>
<div class="linha"><span class="r">Vencimento base</span><span class="p"></span><span class="v" id="c-r-base">—</span></div>
<div class="linha" id="c-l-subs" hidden><span class="r">Subsídio de alimentação</span><span class="p"></span><span class="v" id="c-r-subs">—</span></div>
<div class="linha" id="c-l-duo" hidden><span class="r">Duodécimos (férias e Natal)</span><span class="p"></span><span class="v" id="c-r-duo">—</span></div>
<div class="linha menos"><span class="r">Segurança Social (11 %)</span><span class="p"></span><span class="v" id="c-r-ss">—</span></div>
<div class="linha menos"><span class="r">Retenção de IRS</span><span class="p"></span><span class="v" id="c-r-irs">—</span></div>
<div class="linha total"><span class="r">Líquido por mês</span><span class="p"></span><span class="v" id="c-r-liq">—</span></div>
<div class="linha"><span class="r">Líquido por ano</span><span class="p"></span><span class="v" id="c-r-ano">—</span></div>
<div class="linha"><span class="r">Taxa de retenção</span><span class="p"></span><span class="v" id="c-r-taxa">—</span></div>
<div class="linha destaque" id="c-l-nov" hidden><span class="r">Líquido em novembro de {irs["ano"]}</span><span class="p"></span><span class="v" id="c-r-nov">—</span></div>
<div class="linha"><span class="r">Custo para a empresa</span><span class="p"></span><span class="v" id="c-r-custo">—</span></div>
<p class="fonte">A retenção é um adiantamento do IRS: o imposto final só se sabe na declaração anual. {e(irs.get("nota", "")) if NOV else ""}
O custo para a empresa soma {pct(100 * irs["tsu_empresa"], 2)} de TSU ao salário. Não aplicamos o IRS Jovem nem as regras para pessoas com deficiência.</p>
</div>
<div class="chamada" id="c-chamada" hidden>
<p><strong>Estás a ganhar o justo?</strong> Partilha este salário de forma anónima e vê quanto ganham outras pessoas na tua profissão.</p>
<p class="acoes"><a class="botao" href="/partilhar/" id="c-ir-partilhar">Partilhar e comparar</a><a class="botao sec2" href="/">Ver onde fico em Portugal</a></p>
</div>
</div>
</div></section>
<section class="sec"><div class="mold texto">
<h2>Como é feito o cálculo</h2>
<ol>
<li><strong>Segurança Social:</strong> {pct(100 * irs["ss"])} sobre o salário e a parte do subsídio de alimentação acima do limite isento.</li>
<li><strong>IRS:</strong> a retenção usa a fórmula das tabelas: salário × taxa marginal − parcela a abater − parcela por dependente
({euro(T["II"]["dependente"], 2)} se não fores casado, {euro(T["I"]["dependente"], 2)} se forem dois a ganhar, {euro(T["III"]["dependente"], 2)} se só um ganhar).
Com 3 ou mais dependentes, a taxa desce 1 ponto. O valor é arredondado para o euro de baixo.</li>
<li><strong>Subsídios de férias e de Natal:</strong> são retidos à parte, cada um com a mesma tabela. Em duodécimos, cada fração paga a taxa do subsídio inteiro.</li>
{('<li><strong>Novembro de ' + str(irs["ano"]) + ':</strong> a retenção é metade, também sobre o subsídio de Natal pago nesse mês, exceto para salários acima de ' + euro(irs["novembro"]["limite"]["I"]) + ' (Despacho n.º 12523-A/2026). Em dezembro volta ao normal.</li>') if NOV else ''}
<li><strong>Subsídio de alimentação:</strong> até {euro(irs["subsidio_dinheiro"], 2)} por dia (dinheiro) ou {euro(irs["subsidio_cartao"], 2)} (cartão) não paga IRS nem Segurança Social.</li>
</ol>
<h3>Tabela I de {irs["ano"]}: não casado sem dependentes, ou casado com dois titulares</h3>
<div class="rolar"><table class="tabela"><thead><tr><th>Remuneração mensal</th><th class="n">Taxa marginal</th><th class="n">Parcela a abater</th></tr></thead><tbody>{linhas_I}</tbody></table></div>
{fonte("irs")}
{fonte("irs_novembro")}
{fonte("tsu")}
</div></section>
'''
    ld = [{'@type': 'WebApplication', 'name': f'Calculadora de salário líquido {irs["ano"]}', 'url': DOMINIO + '/calculadora/',
           'applicationCategory': 'FinanceApplication', 'operatingSystem': 'Todos', 'inLanguage': 'pt-PT',
           'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'EUR'}}, migalhas([('/calculadora/', 'Calculadora')])[1]]
    pagina('/calculadora/', f'Calculadora de salário líquido {irs["ano"]}',
           f'Calcula o teu salário líquido em {irs["ano"]} com as tabelas oficiais de IRS, a Segurança Social e o subsídio de alimentação. Recibo linha a linha.',
           corpo, dados={'irs': dados_irs()}, ld=ld, prioridade=0.9, og='/og/calculadora.png')


# ---------------------------------------------------------------- partilhar

def partilhar():
    cat = {'profissoes': [{'id': p['id'], 'nome': p['nome'], 'fem': p.get('feminino'), 'pesquisa': p['pesquisa'],
                           'ganho_grupo': (O['grupos'].get(p['grupo']) or {}).get('ganho')} for p in CAT['profissoes']],
           'empresas': CAT['empresas']}
    distritos = ''.join(f'<option value="{d["id"]}">{e(d["nome"])}</option>' for d in CAT['distritos'])
    contratos = [('efetivo', 'Sem termo (efetivo)'), ('termo', 'A termo'), ('temporario', 'Trabalho temporário'),
                 ('recibos', 'Recibos verdes'), ('estagio', 'Estágio'), ('outro', 'Outro')]
    radios = ''.join(f'<label><input type="radio" name="contrato" value="{v}" id="p-contrato-{i}"><span>{t}</span></label>' for i, (v, t) in enumerate(contratos))
    corpo = f'''
{migalhas([(None, "Partilhar o meu salário")])[0]}
<section class="sec" style="padding-top:24px"><div class="mold grelha2">
<div>
<h1 class="h1-pag">Partilha o teu salário</h1>
<p class="lede">30 segundos. Sem nome, sem e-mail, sem conta. A tua resposta ajuda quem vai negociar a seguir.</p>
<ul class="texto" style="margin-top:24px;padding-left:20px">
<li>Só mostramos números com pelo menos 5 pessoas diferentes.</li>
<li>As partilhas só contam 24 horas depois, arredondadas à dezena.</li>
<li>Não guardamos o teu IP. Podes apagar a partilha neste navegador quando quiseres.</li>
</ul>
<div id="apagar-partilha" hidden style="margin-top:24px"><p class="dica">Já partilhaste neste navegador.</p>
<button class="botao sec2" type="button">Apagar a minha partilha</button></div>
</div>
<div>
<form class="form" id="form-partilhar" novalidate>
<div class="erro-msg" id="p-erro" role="alert" tabindex="-1" hidden></div>
<div class="f f-auto" data-campo="profissao"><label for="p-profissao">Profissão</label>
<input type="text" id="p-profissao" autocomplete="off" placeholder="Operador de call center" aria-describedby="p-profissao-d">
<p class="dica" id="p-profissao-d">Escreve e escolhe da lista.</p><p class="erro"><span></span></p></div>
<div class="f" data-campo="distrito"><label for="p-distrito">Distrito onde trabalhas</label>
<select id="p-distrito"><option value="">Escolhe</option>{distritos}</select><p class="erro"><span></span></p></div>
<div class="f" data-campo="bruto"><label for="p-bruto">Salário bruto mensal</label>
<input type="text" id="p-bruto" inputmode="decimal" autocomplete="off" placeholder="1 050" aria-describedby="p-bruto-d">
<p class="dica" id="p-bruto-d">Antes de descontos, sem subsídio de alimentação nem prémios.</p><p class="erro"><span></span></p></div>
<div class="f"><fieldset><legend>Recebes em</legend><div class="opcoes">
<label><input type="radio" name="meses" value="14" checked><span>14 meses</span></label>
<label><input type="radio" name="meses" value="12"><span>12 meses</span></label></div></fieldset></div>
<div class="f" data-campo="contrato"><fieldset><legend>Contrato</legend><div class="opcoes">{radios}</div></fieldset><p class="erro"><span></span></p></div>
<div class="f" data-campo="experiencia"><label for="p-experiencia">Anos de experiência na profissão</label>
<select id="p-experiencia"><option value="">Escolhe</option><option value="0-2">0 a 2</option><option value="3-5">3 a 5</option><option value="6-10">6 a 10</option><option value="11-20">11 a 20</option><option value="21+">21 ou mais</option></select><p class="erro"><span></span></p></div>
<div class="f f-auto" data-campo="empresa"><label for="p-empresa">Empresa <span class="opc">(opcional)</span></label>
<input type="text" id="p-empresa" autocomplete="off" maxlength="80" placeholder="Nome da empresa"><p class="erro"><span></span></p></div>
<div class="f"><label for="p-horas">Horas por semana</label>
<select id="p-horas"><option value="40" selected>40</option><option value="39">39</option><option value="37">37,5</option><option value="35">35</option><option value="30">30</option><option value="25">25</option><option value="20">20</option></select></div>
<div class="f"><label for="p-subs">Subsídio de alimentação por dia <span class="opc">(opcional)</span></label><input type="text" id="p-subs" inputmode="decimal" placeholder="6,15"></div>
<div class="f"><label for="p-genero">Género <span class="opc">(opcional, para medir a diferença salarial)</span></label>
<select id="p-genero"><option value="">Prefiro não dizer</option><option value="mulher">Mulher</option><option value="homem">Homem</option><option value="outro">Outro</option></select></div>
<div class="isco" aria-hidden="true"><label for="p-site">Não preencher</label><input type="text" id="p-site" name="site" tabindex="-1" autocomplete="off"></div>
<p class="aviso">Ao partilhar, concordas que estes dados sejam guardados sem identificação e usados só em estatísticas agregadas, como explicado na <a href="/privacidade/">política de privacidade</a>.</p>
<p><button class="botao" type="submit">Partilhar e ver o resultado</button></p>
</form>
<div id="obrigado" hidden></div>
</div>
</div></section>
'''
    pagina('/partilhar/', 'Partilha o teu salário, anónimo', 'Partilha o teu salário em 30 segundos, sem nome nem conta, e vê como comparas com a tua profissão e com Portugal.',
           corpo, dados={'catalogo': cat, 'distribuicao': dados_distribuicao()}, prioridade=0.8, og='/og/partilhar.png')


# ---------------------------------------------------------------- profissões

def artigo(nome, fem=False):
    return 'uma' if fem else 'um'


def minusc(nome):
    """Primeira letra em minúscula, sem estragar siglas (TVDE, CNC)."""
    return nome[:1].lower() + nome[1:] if len(nome) > 1 and not nome[1].isupper() else nome


GC = {'1': 'Dirigentes, diretores e gestores', '2': 'Especialistas das atividades intelectuais e científicas',
      '3': 'Técnicos e profissões de nível intermédio', '4': 'Pessoal administrativo',
      '5': 'Serviços pessoais, proteção e segurança, e vendedores', '6': 'Agricultura, pesca e floresta',
      '7': 'Indústria, construção e artífices', '8': 'Operadores de máquinas e montagem', '9': 'Trabalhadores não qualificados',
      '0': 'Forças Armadas'}
REG_ORDEM = ['1A', '11', '1B', '19', '1C', '1D', '15', '20', '30']


def media_nacional():
    return O['media_nacional']  # INE, Portugal, mesma fonte dos concelhos e dos grupos


def profissoes():
    grupos = O['grupos']
    ano = grupos_ano()
    por_g = {}
    for p in CAT['profissoes']:
        por_g.setdefault(p['grupo'], []).append(p)
    blocos = []
    for k in sorted(por_g, key=lambda s: -((grupos.get(s) or {}).get('ganho') or 0)):
        g = grupos.get(k) or {}
        itens = ''.join(f'<li data-nome="{e(slug(p["pesquisa"] + " " + p["nome"]).replace("-", " "))}"><a href="/profissoes/{p["id"]}/">{e(p["nome"])}</a></li>'
                        for p in sorted(por_g[k], key=lambda x: x['nome']))
        info = (f'Ganho médio do grupo: <strong>{euro(g["ganho"])}</strong> brutos por mês, {ano}' if g.get('ganho')
                else 'Sem dado nos Quadros de Pessoal: vê a <a href="/funcao-publica/militares/">tabela dos militares</a>')
        blocos.append(f'<div class="entra bloco-grupo" id="g{k}"><h2 class="h3-pag">{e(GC.get(k, k))}</h2>'
                      f'<p class="res-extra" style="margin-top:6px">{info}</p>'
                      f'<ul class="lista-colunas" style="margin-top:16px">{itens}</ul></div>')
    linhas = ''.join(f'<tr><td><a href="#g{k}">{e(GC[k])}</a></td><td class="n">{euro(v["ganho"])}</td></tr>'
                     for k, v in sorted(grupos.items(), key=lambda kv: -kv[1]['ganho']))
    corpo = f'''
{migalhas([(None, "Profissões")])[0]}
<section class="sec" style="padding-top:24px"><div class="mold">
<h1 class="h1-pag">Quanto se ganha em cada profissão</h1>
<p class="lede">Ganho médio mensal bruto de quem trabalha a tempo completo no setor privado, por grupo de profissões ({ano}), e as partilhas de quem trabalha.
Na função pública, os salários estão na <a href="/funcao-publica/">tabela de cada carreira</a>.</p>
<div class="grelha2" style="margin-top:40px">
<div><div class="f" style="max-width:560px"><label for="filtro-prof">Procurar profissão</label>
<input type="search" id="filtro-prof" data-filtro="#lista-prof" data-vazio="#prof-vazio" placeholder="Enfermeiro, programador, caixa…" autocomplete="off"></div>
<p class="vazio" id="prof-vazio" hidden style="margin-top:16px">Não encontrámos essa profissão. <a href="/partilhar/">Partilha o teu salário</a> e escolhe a mais próxima.</p></div>
<table class="tabela"><caption class="vis">Ganho médio por grupo de profissões</caption><thead><tr><th>Grupo de profissões</th><th class="n">Ganho médio</th></tr></thead><tbody>{linhas}</tbody></table>
</div>
<div id="lista-prof">{"".join(blocos)}</div>
{fonte("grupos")}
</div></section>'''
    pagina('/profissoes/', 'Salários por profissão em Portugal', f'Quanto se ganha em Portugal em cada profissão: ganho médio mensal por grupo de profissões ({ano}), {len(CAT["profissoes"])} profissões e partilhas anónimas.',
           corpo, prioridade=0.9, ld=[migalhas([('/profissoes/', 'Profissões')])[1]], og='/og/profissoes.png')
    for p in CAT['profissoes']:
        pagina_profissao(p, por_g[p['grupo']])


def pagina_profissao(p, irmas):
    g = O['grupos'].get(p['grupo']) or {}
    nome = p['nome']
    titulo_h1 = f'Quanto ganha {artigo(nome)} {minusc(nome)}?'
    ganho = g.get('ganho')
    ano = g.get('ano') or grupos_ano()
    med = media_nacional()
    fp_id = PROF_FP.get(p['id'])
    fp = carreiras_fp().get(fp_id) if fp_id else None
    comparacao = ''
    if ganho:
        dif = ganho - med
        comparacao = (f'<p class="lede" style="margin-top:20px">{e(nome)} pertence ao grupo <strong>{e(GC[p["grupo"]])}</strong>. Em {ano}, quem trabalhava neste grupo a tempo completo, '
                      f'no setor privado, ganhava em média <span class="mk">{euro(ganho)}</span> brutos por mês: {euro(abs(dif))} {"acima" if dif > 0 else "abaixo"} da média nacional ({euro(med)}).</p>'
                      f'<p class="dica" style="margin-top:12px">É a média do grupo inteiro, não desta profissão em concreto. As partilhas ao lado mostram esta profissão.</p>')
    reg = g.get('regioes') or {}
    tab_reg = ''
    if reg:
        linhas = ''.join(f'<tr><td>{e(O["nuts2"].get(r, r))}</td><td class="n">{euro(reg[r])}</td></tr>' for r in sorted((r for r in reg if r != 'PT'), key=lambda r: -reg[r]))
        tab_reg = (f'<h2 class="h2-pag" style="margin-top:56px">O mesmo grupo em cada região</h2>'
                   f'<table class="tabela" style="margin-top:20px"><thead><tr><th>Região</th><th class="n">Ganho médio</th></tr></thead><tbody>{linhas}</tbody></table>'
                   + fonte('grupos', 'Pelo local de trabalho.'))
    publico = ''
    if fp and fp.get('min'):
        publico = (f'<div class="recibo" style="margin-top:40px"><h3>Na função pública</h3>'
                   f'<div class="linha"><span class="r">Primeira posição</span><span class="p"></span><span class="v">{euro(fp["min"], 2)}</span></div>'
                   f'<div class="linha"><span class="r">Topo da carreira</span><span class="p"></span><span class="v">{euro(fp["max"], 2)}</span></div>'
                   f'<p class="fonte"><a href="/funcao-publica/{fp["id"]}/">{e(fp["titulo"])}: tabela completa de {O["funcao_publica"]["ano"]}</a></p></div>')
    elif p['grupo'] == '0':
        publico = '<p class="lede" style="margin-top:20px">As Forças Armadas não entram nos Quadros de Pessoal. O salário de cada posto está na <a href="/funcao-publica/militares/">tabela dos militares</a>.</p>'
    outras = ''.join(f'<li><a href="/profissoes/{x["id"]}/">{e(x["nome"])}</a></li>' for x in irmas if x['id'] != p['id'])
    corpo = f'''
{migalhas([("/profissoes/", "Profissões"), (None, nome)])[0]}
<section class="sec" style="padding-top:24px"><div class="mold grelha2">
<div>
<h1 class="h1-pag h1-media">{e(titulo_h1)}</h1>
{comparacao}
{fonte("grupos", "O ganho inclui a remuneração base, subsídios regulares, prémios e horas extra do mês. Não inclui a Administração Pública.") if ganho else ""}
{publico}
{tab_reg}
</div>
<div>
<h2 class="h2-pag">Na comunidade ganhas.pt</h2>
<div data-comunidade="profissao={p["id"]}" style="margin-top:20px"><p class="lede">A carregar as partilhas…</p></div>
<p style="margin-top:28px;display:flex;flex-wrap:wrap;gap:12px"><a class="botao" href="/partilhar/?p={p["id"]}">Partilhar o meu salário</a>
<a class="botao sec2" href="/calculadora/">Calcular o líquido</a></p>
</div>
</div></section>
<section class="sec"><div class="mold">
<h2 class="h2-pag">Outras profissões do mesmo grupo</h2>
<ul class="lista-colunas" style="margin-top:24px">{outras or '<li>Não há outras na nossa lista.</li>'}</ul>
</div></section>'''
    ld = [migalhas([('/profissoes/', 'Profissões'), (f'/profissoes/{p["id"]}/', nome)])[1]]
    if ganho:
        ld.append({'@type': 'Occupation', 'name': nome, 'occupationalCategory': f'CPP {p["cpp"]}', 'occupationLocation': {'@type': 'Country', 'name': 'Portugal'},
                   'estimatedSalary': {'@type': 'MonetaryAmountDistribution', 'name': 'ganho médio mensal do grande grupo de profissões', 'currency': 'EUR',
                                       'duration': 'P1M', 'median': round(ganho)}, 'description': f'Ganho médio mensal bruto do grupo «{GC[p["grupo"]]}» em {ano}, setor privado.'})
    if ganho:
        desc = f'Quanto ganha {artigo(nome)} {minusc(nome)} em Portugal: ganho médio do grupo de {euro(ganho)} brutos por mês ({ano}), por região, e partilhas anónimas.'
    elif fp and fp.get('min'):
        desc = f'Quanto ganha {artigo(nome)} {minusc(nome)} em Portugal: de {euro(fp["min"])} a {euro(fp["max"])} brutos na tabela de {O["funcao_publica"]["ano"]}, e partilhas anónimas.'
    else:
        desc = f'Quanto ganha {artigo(nome)} {minusc(nome)} em Portugal: dados oficiais e partilhas anónimas.'
    pagina(f'/profissoes/{p["id"]}/', f'Quanto ganha {artigo(nome)} {minusc(nome)} em Portugal', desc, corpo, ld=ld, prioridade=0.7, og='/og/profissoes.png')


# ---------------------------------------------------------------- concelhos

def concelhos():
    cs = sorted(O['concelhos'], key=lambda c: -c['ganho_medio'])
    for i, c in enumerate(cs):
        c['pos'] = i + 1
    ano = O['concelhos_ano']
    med_nac = media_nacional()
    linhas = ''.join(f'<tr data-nome="{e(slug(c["nome"]).replace("-", " "))}"><td class="n">{c["pos"]}.</td><td><a href="/concelhos/{c["id"]}/">{e(c["nome"])}</a></td>'
                     f'<td class="col-reg">{e(O["nuts2"].get(c["nuts2"], ""))}</td><td class="n">{euro(c["ganho_medio"])}</td></tr>' for c in cs)
    corpo = f'''
{migalhas([(None, "Concelhos")])[0]}
<section class="sec" style="padding-top:24px"><div class="mold">
<h1 class="h1-pag">Quanto se ganha no teu concelho</h1>
<p class="lede">Ganho mensal bruto de quem trabalha por conta de outrem a tempo completo, pelo local de trabalho, em {ano}. Os 308 concelhos, do mais alto ao mais baixo.</p>
<div class="f" style="max-width:560px;margin-top:32px"><label for="filtro-conc">Procurar concelho</label>
<input type="search" id="filtro-conc" data-filtro="#lista-conc" data-vazio="#conc-vazio" placeholder="Gondomar, Braga, Faro…" autocomplete="off"></div>
<p class="vazio" id="conc-vazio" hidden style="margin-top:16px">Não encontrámos esse concelho.</p>
<table class="tabela" style="margin-top:32px"><thead><tr><th class="n">#</th><th>Concelho</th><th class="col-reg">Região</th><th class="n">Ganho médio</th></tr></thead>
<tbody id="lista-conc">{linhas}</tbody></table>
{fonte("concelhos")}
</div></section>'''
    pagina('/concelhos/', 'Salário médio por concelho em Portugal', f'Ranking dos 308 concelhos de Portugal pelo ganho médio mensal de quem trabalha a tempo completo ({ano}). Procura o teu concelho.',
           corpo, prioridade=0.9, ld=[migalhas([('/concelhos/', 'Concelhos')])[1]], og='/og/concelhos.png')
    por_nuts3 = {}
    for c in cs:
        por_nuts3.setdefault(c.get('nuts3', ''), []).append(c)
    for c in cs:
        vizinhos = [x for x in por_nuts3.get(c.get('nuts3', ''), []) if x['id'] != c['id']][:12]
        dif = c['ganho_medio'] - med_nac
        lv = ''.join(f'<li><a href="/concelhos/{x["id"]}/">{e(x["nome"])}</a><span class="cifra">{euro(x["ganho_medio"])}</span></li>' for x in vizinhos)
        gr = c.get('grupos') or {}
        tab_g = ''
        if len(gr) >= 3:
            linhas = ''.join(f'<tr><td><a href="/profissoes/#g{k}">{e(GC.get(k, k))}</a></td><td class="n">{euro(v)}</td>'
                             f'<td class="n">{euro((O["grupos"].get(k) or {}).get("ganho"))}</td></tr>' for k, v in sorted(gr.items(), key=lambda kv: -kv[1]))
            tab_g = (f'<section class="sec"><div class="mold"><h2 class="h2-pag">Por grupo de profissões em {e(c["nome"])}</h2>'
                     f'<div class="rolar"><table class="tabela" style="margin-top:24px"><thead><tr><th>Grupo de profissões</th><th class="n">{e(c["nome"])}</th><th class="n">Portugal</th></tr></thead>'
                     f'<tbody>{linhas}</tbody></table></div><p class="dica" style="margin-top:12px">Grupos sem linha: o INE não publica o valor (poucos trabalhadores ou segredo estatístico).</p>'
                     f'{fonte("grupos")}</div></section>')
        sx = (O.get('sexo_regioes') or {}).get(c['nuts2']) or {}
        genero = ''
        if sx.get('H') and sx.get('M'):
            gap = 100 * (sx['H'] - sx['M']) / sx['H']
            genero = (f'<div class="linha"><span class="r">Mulheres na região</span><span class="p"></span><span class="v">{euro(sx["M"])}</span></div>'
                      f'<div class="linha"><span class="r">Homens na região</span><span class="p"></span><span class="v">{euro(sx["H"])}</span></div>'
                      f'<div class="linha"><span class="r">Elas ganham menos</span><span class="p"></span><span class="v">{pct(gap, 1)}</span></div>')
        corpo = f'''
{migalhas([("/concelhos/", "Concelhos"), (None, c["nome"])])[0]}
<section class="sec" style="padding-top:24px"><div class="mold par">
<div><h1 class="h1-pag h1-media">Salário médio em {e(c["nome"])}</h1>
<p class="lede" style="margin-top:20px">Em {ano}, quem trabalhava a tempo completo em {e(c["nome"])} ganhava em média <span class="mk">{euro(c["ganho_medio"])}</span> brutos por mês:
{c["pos"]}.º de 308 concelhos, {euro(abs(dif))} {"acima" if dif > 0 else "abaixo"} da média nacional ({euro(med_nac)}).</p>
{fonte("concelhos", "Pelo local de trabalho, não pela residência. Não inclui a Administração Pública.")}</div>
<div class="recibo"><h3>{e(c["nome"])}, {ano}</h3>
<div class="linha"><span class="r">Ganho médio</span><span class="p"></span><span class="v">{euro(c["ganho_medio"])}</span></div>
<div class="linha"><span class="r">Posição no país</span><span class="p"></span><span class="v">{c["pos"]}.º de 308</span></div>
<div class="linha"><span class="r">Média nacional</span><span class="p"></span><span class="v">{euro(med_nac)}</span></div>
{genero}
<p class="fonte">Região: {e(O["nuts2"].get(c["nuts2"], ""))}. Mulheres e homens: média da região, {O["sexo"]["ano"]}; diferença calculada pelo ganhas.pt.</p></div>
</div></section>
{tab_g}
<section class="sec"><div class="mold">
<h2 class="h2-pag">Concelhos da mesma sub-região ({e(c.get("nuts3_nome", ""))})</h2>
<ul class="lista-colunas" style="margin-top:24px">{lv or "<li>Sem outros concelhos nesta sub-região.</li>"}</ul>
<p style="margin-top:40px;display:flex;flex-wrap:wrap;gap:12px"><a class="botao" href="/">Comparar o meu salário</a><a class="botao sec2" href="/partilhar/">Partilhar o meu salário</a></p>
</div></section>'''
        ld = [migalhas([('/concelhos/', 'Concelhos'), (f'/concelhos/{c["id"]}/', c['nome'])])[1]]
        pagina(f'/concelhos/{c["id"]}/', f'Salário médio em {c["nome"]} ({ano})',
               f'Em {c["nome"]}, o ganho médio mensal bruto era {euro(c["ganho_medio"])} em {ano} ({c["pos"]}.º de 308 concelhos). Por grupo de profissões e comparado com o país.',
               corpo, ld=ld, prioridade=0.6, og='/og/concelhos.png')


# ---------------------------------------------------------------- Europa

def europa():
    eu = O.get('europa')
    if not eu:
        return
    paises = sorted(eu['liquido'], key=lambda x: -x['eur'])
    mx = max(x['eur'] for x in paises)
    mxp = max(x.get('pps') or 0 for x in paises) or 1
    b1 = ''.join(f'<div class="barra-h{" pt" if x["codigo"] == "PT" else ""}"><span>{e(x["pais"])}</span><i style="--w:{round(100 * x["eur"] / mx, 1)}%"></i><b>{euro(x["eur"])}</b></div>' for x in paises)
    paises_p = sorted([x for x in paises if x.get('pps')], key=lambda x: -x['pps'])
    b2 = ''.join(f'<div class="barra-h{" pt" if x["codigo"] == "PT" else ""}"><span>{e(x["pais"])}</span><i style="--w:{round(100 * x["pps"] / mxp, 1)}%"></i><b>{round(x["pps"]):,} PPC</b></div>'.replace(',', '.') for x in paises_p)
    pt = next(x for x in paises if x['codigo'] == 'PT')
    so_paises = [x['codigo'] for x in paises if x['codigo'] != 'EU27_2020']
    pos = so_paises.index('PT') + 1
    minimos = sorted(eu.get('minimo', []), key=lambda x: -x['eur'])
    mxm = max((x['eur'] for x in minimos), default=1)
    b3 = ''.join(f'<div class="barra-h{" pt" if x["codigo"] == "PT" else ""}"><span>{e(x["pais"])}</span><i style="--w:{round(100 * x["eur"] / mxm, 1)}%"></i><b>{euro(x["eur"])}</b></div>' for x in minimos)
    corpo = f'''
{migalhas([(None, "Portugal e a Europa")])[0]}
<section class="sec" style="padding-top:24px"><div class="mold">
<h1 class="h1-pag">Portugal ao lado da Europa</h1>
<p class="lede">Em {eu["ano"]}, uma pessoa sozinha, sem filhos, que ganhava o salário médio em Portugal levava para casa <span class="mk">{euro(pt["eur"])}</span> líquidos por ano: {pos}.º lugar entre os {len(so_paises)} países da União Europeia.</p>
</div></section>
<section class="sec"><div class="mold grelha2">
<div class="entra"><h2>Em euros</h2><p class="lede" style="margin-top:16px">Salário líquido anual, pessoa sozinha sem filhos, a ganhar o salário médio.</p></div>
<div class="barras-h entra">{b1}</div>
</div><div class="mold">{fonte("europa")}</div></section>
<section class="sec folha"><div class="mold grelha2">
<div class="entra"><h2>Em poder de compra</h2><p class="lede" style="margin-top:16px">O mesmo salário em paridades de poder de compra (PPC): desconta as diferenças de preços entre países.</p></div>
<div class="barras-h entra">{b2}</div>
</div><div class="mold">{fonte("europa")}</div></section>
{('<section class="sec"><div class="mold grelha2"><div class="entra"><h2>Salário mínimo</h2><p class="lede" style="margin-top:16px">Salário mínimo nacional mensal, em euros, ' + e(eu.get("minimo_periodo", "")) + '.</p></div><div class="barras-h entra">' + b3 + '</div></div><div class="mold">' + fonte("europa_minimo") + '</div></section>') if minimos else ''}
'''
    pagina('/europa/', 'Salários em Portugal e na Europa', f'Quanto se leva para casa em Portugal comparado com a Europa: salário líquido, poder de compra e salário mínimo ({eu["ano"]}).',
           corpo, prioridade=0.7, ld=[migalhas([('/europa/', 'Europa')])[1]], og='/og/europa.png')


# ---------------------------------------------------------------- função pública

FP_NOMES = {
    'Educação pré-escolar / ensino básico e secundário': ('professores', 'Professores e educadores', 'um professor'),
    'Enfermagem': ('enfermeiros', 'Enfermeiros', 'um enfermeiro'),
    'Médica — regimes de trabalho': ('medicos', 'Médicos', 'um médico'),
    'Polícia de Segurança Pública': ('psp', 'Polícia de Segurança Pública (PSP)', 'um polícia da PSP'),
    'Guarda Nacional Republicana': ('gnr', 'Guarda Nacional Republicana (GNR)', 'um militar da GNR'),
    'Militares das Forças Armadas – Quadros Permanentes (QP), em regime de contrato (RC) e de voluntariado (RV)': ('militares', 'Militares das Forças Armadas', 'um militar'),
    'Corpo da Guarda Prisional': ('guarda-prisional', 'Guarda prisional', 'um guarda prisional'),
    'Polícia Judiciária': ('policia-judiciaria', 'Polícia Judiciária', 'um inspetor da PJ'),
    'Oficial de justiça': ('oficial-de-justica', 'Oficiais de justiça', 'um oficial de justiça'),
    'Magistrados judiciais / Magistrados do Ministério Público': ('magistrados', 'Juízes e procuradores', 'um juiz'),
    'Docente universitário': ('docente-universitario', 'Professores universitários', 'um professor universitário'),
    'Docente do ensino superior politécnico': ('docente-politecnico', 'Professores do ensino politécnico', 'um professor do politécnico'),
    'Investigação científica': ('investigadores', 'Investigação científica', 'um investigador'),
    'Técnico Superior': ('tecnico-superior', 'Técnico superior', 'um técnico superior'),
    'Assistente Técnico': ('assistente-tecnico', 'Assistente técnico', 'um assistente técnico'),
    'Assistente Operacional': ('assistente-operacional', 'Assistente operacional', 'um assistente operacional'),
    'Bombeiros sapadores': ('bombeiros-sapadores', 'Bombeiros sapadores', 'um bombeiro sapador'),
    'Bombeiros municipais': ('bombeiros-municipais', 'Bombeiros municipais', 'um bombeiro municipal'),
    'Técnico de emergência pré-hospitalar (TEPH)': ('teph', 'Técnicos de emergência pré-hospitalar (INEM)', 'um técnico do INEM'),
    'Técnico superior das áreas de diagnóstico e terapêutica': ('tsdt', 'Técnicos superiores de diagnóstico e terapêutica', 'um técnico de diagnóstico e terapêutica'),
    'Farmacêutica': ('farmaceuticos', 'Farmacêuticos', 'um farmacêutico'),
    'Técnico auxiliar de saúde': ('tecnico-auxiliar-de-saude', 'Técnicos auxiliares de saúde', 'um técnico auxiliar de saúde'),
    'Diplomatas': ('diplomatas', 'Diplomatas', 'um diplomata'),
    'Especialista de sistemas e tecnologias de informação': ('especialista-de-informatica', 'Especialistas de informática', 'um especialista de informática'),
    'Técnico de sistemas e tecnologias de informação': ('tecnico-de-informatica', 'Técnicos de informática', 'um técnico de informática'),
    'Gestão e inspeção tributária e aduaneira da AT': ('autoridade-tributaria', 'Autoridade Tributária: gestão e inspeção', 'um inspetor tributário'),
    'Técnico superior de saúde': ('tecnico-superior-de-saude', 'Técnicos superiores de saúde', 'um técnico superior de saúde'),
    'Polícia marítima': ('policia-maritima', 'Polícia Marítima', 'um agente da Polícia Marítima'),
}
# carreiras que também existem no privado (aí o texto diz «na função pública»)
PUBLICO_E_PRIVADO = {'enfermeiros', 'medicos', 'professores', 'tecnico-superior', 'assistente-tecnico', 'assistente-operacional', 'farmaceuticos',
                     'tsdt', 'tecnico-auxiliar-de-saude', 'especialista-de-informatica', 'tecnico-de-informatica', 'docente-universitario',
                     'docente-politecnico', 'investigadores', 'tecnico-superior-de-saude'}
# categoria que serve de resumo («de X a Y») quando a carreira junta categorias muito diferentes
FP_PRINCIPAL = {'professores': 'Professor', 'enfermeiros': 'Enfermeiro'}
# profissões do catálogo que têm uma carreira pública equivalente
PROF_FP = {'enfermeiro': 'enfermeiros', 'medico-de-medicina-geral': 'medicos', 'medico-especialista': 'medicos',
           'professor-do-3-o-ciclo-e-secundario': 'professores', 'professor-do-1-o-ciclo': 'professores', 'educador-de-infancia': 'professores',
           'professor-do-ensino-superior': 'docente-universitario', 'agente-de-policia': 'psp', 'guarda-prisional': 'guarda-prisional',
           'bombeiro': 'bombeiros-sapadores', 'tecnico-de-emergencia-medica': 'teph', 'tecnico-de-radiologia': 'tsdt',
           'tecnico-de-analises-clinicas': 'tsdt', 'fisioterapeuta': 'tsdt', 'farmaceutico': 'farmaceuticos', 'auxiliar-de-saude': 'tecnico-auxiliar-de-saude',
           'assistente-operacional-escolar': 'assistente-operacional', 'assistente-administrativo': 'assistente-tecnico',
           'oficial-das-forcas-armadas': 'militares', 'sargento-das-forcas-armadas': 'militares', 'praca-das-forcas-armadas': 'militares',
           'economista': 'tecnico-superior', 'psicologo': 'tecnico-superior', 'assistente-social': 'tecnico-superior',
           'tecnico-superior-de-recursos-humanos': 'tecnico-superior', 'programador': 'especialista-de-informatica',
           'administrador-de-sistemas': 'especialista-de-informatica', 'tecnico-de-apoio-informatico': 'tecnico-de-informatica',
           'nutricionista': 'tecnico-superior-de-saude'}


def reter(R, tab='I', dep=0):
    """Retenção de IRS do ano das tabelas em oficial.json (mesmas regras do app.js)."""
    T = O['irs']['tabelas'][tab]
    for lim, taxa, parc in T['linhas']:
        if lim is None or R <= lim:
            if dep >= 3 and tab in ('I', 'II'):
                taxa -= 0.01
            if isinstance(parc, dict):
                parc = parc['t'] * parc['f'] * (parc['b'] - R)
            return float(max(0, int(R * taxa - parc - T['dependente'] * dep + 1e-9)))
    return 0.0


def liquido_simples(bruto):
    """Líquido mensal de um salário, solteiro sem dependentes, sem subsídio de alimentação."""
    return round(bruto - reter(bruto) - round(bruto * O['irs']['ss'], 2), 2)


def carreiras_fp():
    fp = O.get('funcao_publica') or {}
    por = {}
    for c in fp.get('carreiras', []):
        nome_c = c['carreira'] or 'Outras carreiras não revistas'
        if nome_c in FP_NOMES:
            sl, titulo, quem = FP_NOMES[nome_c]
        else:
            sl, titulo, quem = slug(nome_c), nome_c, None
            if len(sl) > 60:
                sl = sl[:60].rsplit('-', 1)[0]
        x = por.setdefault(sl, {'id': sl, 'titulo': titulo, 'quem': quem, 'carreira': nome_c, 'grupo': c['grupo'], 'categorias': []})
        x['categorias'].append(c)
    formacao = re.compile(r'cadete|aluno|aspirante|estagi|instrução|tirocin|formação|pré-carreira|interno', re.I)
    for x in por.values():
        cats = [c for c in x['categorias'] if not formacao.search(c['nome'] + ' ' + (c.get('subgrupo') or ''))]
        if x['id'] in FP_PRINCIPAL:
            cats = [c for c in cats if c['nome'] == FP_PRINCIPAL[x['id']]] or cats
        vals = [p['valor'] for c in cats for p in c['posicoes'] if p['valor'] >= smn_hoje()[1]]
        x['min'], x['max'] = (min(vals), max(vals)) if vals else (None, None)
        x['principal'] = FP_PRINCIPAL.get(x['id'])
    return por


def funcao_publica():
    fp = O.get('funcao_publica')
    if not fp:
        return
    por = carreiras_fp()
    niveis = ''.join(f'<tr><td class="n">{n}</td><td class="n">{euro(v, 2)}</td><td class="n">{euro(liquido_simples(v), 2)}</td></tr>' for n, v in fp['tru'])
    destaque = ['professores', 'enfermeiros', 'medicos', 'psp', 'gnr', 'militares', 'tecnico-superior', 'assistente-tecnico', 'assistente-operacional',
                'magistrados', 'docente-universitario', 'guarda-prisional', 'policia-judiciaria', 'oficial-de-justica', 'teph', 'bombeiros-sapadores']
    cartoes = ''.join(f'<li><a href="/funcao-publica/{k}/">{e(por[k]["titulo"])}</a><span class="cifra">{euro(por[k]["min"])} a {euro(por[k]["max"])}</span></li>'
                      for k in destaque if k in por and por[k]['min'])
    grupos = {}
    for x in sorted(por.values(), key=lambda x: x['titulo']):
        if x['id'] not in destaque:
            grupos.setdefault(x['grupo'], []).append(x)
    outras = ''.join(f'<h3 style="margin-top:40px">{e(g)}</h3><ul class="lista-colunas" style="margin-top:16px">' +
                     ''.join(f'<li><a href="/funcao-publica/{x["id"]}/">{e(x["titulo"])}</a></li>' for x in lst) + '</ul>'
                     for g, lst in sorted(grupos.items()))
    corpo = f'''
{migalhas([(None, "Função pública")])[0]}
<section class="sec" style="padding-top:24px"><div class="mold">
<h1 class="h1-pag">Quanto se ganha na função pública em {fp["ano"]}</h1>
<p class="lede">No Estado, o salário vem escrito na lei: cada carreira tem posições e cada posição um valor. A base é <span class="mk">{euro(fp["brap"], 2)}</span> brutos em {fp["ano"]}.
Aqui tens {len(por)} carreiras, com o bruto e uma estimativa do líquido.</p>
{fonte("tru")}
<h2 class="h2-pag" style="margin-top:64px">As carreiras mais procuradas</h2>
<ul class="lista-colunas larga" style="margin-top:24px">{cartoes}</ul>
<p class="dica" style="margin-top:16px">Do primeiro ao último escalão, em bruto por mês, sem suplementos.</p>
{outras}
<div class="entra" style="margin-top:72px"><h2 class="h2-pag">Tabela Remuneratória Única {fp["ano"]}</h2>
<p class="lede" style="margin-top:16px">Os níveis que servem de base à maioria das carreiras. O líquido é uma estimativa para quem não é casado, sem dependentes, Continente.</p>
<div class="rolar"><table class="tabela" style="margin-top:24px;max-width:640px"><thead><tr><th class="n">Nível</th><th class="n">Bruto mensal</th><th class="n">Líquido estimado</th></tr></thead><tbody>{niveis}</tbody></table></div>
{fonte("tru")}</div>
</div></section>'''
    pagina('/funcao-publica/', f'Salários da função pública {fp["ano"]}: todas as carreiras e a TRU',
           f'Quanto ganha um professor, enfermeiro, médico, polícia ou técnico superior em {fp["ano"]}: {len(por)} carreiras da função pública, bruto e líquido, e a Tabela Remuneratória Única.',
           corpo, prioridade=0.8, ld=[migalhas([('/funcao-publica/', 'Função pública')])[1]], og='/og/funcao-publica.png')
    for x in por.values():
        pagina_carreira(x, fp)


def pagina_carreira(x, fp):
    blocos, sub_atual = [], None
    tem_indice = any(p.get('indice') for c in x['categorias'] for p in c['posicoes'])
    for c in x['categorias']:
        sg = c.get('subgrupo') or ''
        if sg and sg != sub_atual:
            blocos.append(f'<h2 class="h2-pag" style="margin-top:64px">{e(sg)}</h2>')
            sub_atual = sg
        linhas = ''.join(f'<tr><td>{e(p["posicao"])}</td><td class="n">{e(p["nivel"])}</td>{"<td class=n>" + e(p.get("indice") or "") + "</td>" if tem_indice else ""}'
                         f'<td class="n">{euro(p["valor"], 2)}</td><td class="n">{euro(liquido_simples(p["valor"]), 2) if p["valor"] >= 400 else "—"}</td></tr>' for p in c['posicoes'])
        blocos.append(f'<div class="entra" style="margin-top:40px"><h3>{e(c["nome"])}</h3><div class="rolar"><table class="tabela" style="margin-top:16px"><thead><tr>'
                      f'<th>Posição</th><th class="n">Nível</th>{"<th class=n>Índice</th>" if tem_indice else ""}<th class="n">Bruto</th><th class="n">Líquido</th></tr></thead>'
                      f'<tbody>{linhas}</tbody></table></div></div>')
    quem = x['quem'] or ('quem está na carreira de ' + minusc(x['titulo']))
    no_estado = ' na função pública' if x['id'] in PUBLICO_E_PRIVADO else ''
    resumo = (f'Em {fp["ano"]}, {e(quem)}{no_estado} ganha entre <span class="mk">{euro(x["min"])}</span> e {euro(x["max"])} brutos por mês, '
              f'conforme {"o escalão" if x.get("principal") else "a categoria e a posição"}.') if x['min'] else ''
    corpo = f'''
{migalhas([("/funcao-publica/", "Função pública"), (None, x["titulo"])])[0]}
<section class="sec" style="padding-top:24px"><div class="mold">
<h1 class="h1-pag">{e(x["titulo"])}: salários em {fp["ano"]}</h1>
<p class="lede">{resumo} O líquido é uma estimativa para quem não é casado, sem dependentes, no Continente, sem suplementos nem subsídio de alimentação.</p>
{fonte("tru")}
{"".join(blocos)}
<p style="margin-top:56px;display:flex;flex-wrap:wrap;gap:12px"><a class="botao" href="/calculadora/">Calcular o meu líquido</a>
<a class="botao sec2" href="/funcao-publica/">Ver todas as carreiras</a></p>
</div></section>'''
    titulo = f'Quanto ganha {x["quem"]} em {fp["ano"]}' if x['quem'] else f'{x["titulo"]}: salários na função pública em {fp["ano"]}'
    desc = (f'{x["titulo"]}: salário bruto e líquido de cada categoria e posição em {fp["ano"]}, de {euro(x["min"])} a {euro(x["max"])} por mês. Dados oficiais da DGAEP.'
            if x['min'] else f'{x["titulo"]}: remuneração de cada categoria em {fp["ano"]}, com dados oficiais da DGAEP.')
    pagina(f'/funcao-publica/{x["id"]}/', titulo, desc, corpo, prioridade=0.6, og='/og/funcao-publica.png',
           ld=[migalhas([('/funcao-publica/', 'Função pública'), (f'/funcao-publica/{x["id"]}/', x['titulo'])])[1]])


# ---------------------------------------------------------------- empresas, imprensa, dados

def empresas_b2b():
    from urllib.parse import quote
    g2 = O['grupos'].get('2') or {}
    norte = (g2.get('regioes') or {}).get('11')
    porto = next((c for c in O['concelhos'] if c['id'] == 'porto'), None)
    enf = carreiras_fp().get('enfermeiros') or {}
    assunto = quote('ganhas.pt - pedido de dados')
    corpo_mail = quote('Olá,\n\nEmpresa:\nFunção ou funções:\nRegião:\nPara quando:\nPara que é (bandas salariais, anúncio, estudo, peça):\n\nObrigado.')
    amostra = quote('ganhas.pt - amostra grátis')
    corpo_amostra = quote('Olá,\n\nGostava de uma amostra para esta função e região:\nFunção:\nRegião:\n\nObrigado.')
    corpo = f'''
{migalhas([(None, "Para empresas e jornalistas")])[0]}
<section class="sec" style="padding-top:24px"><div class="mold">
<h1 class="h1-pag">Quanto paga o mercado, em números que podes defender</h1>
<p class="lede">Dados oficiais e partilhas anónimas de quem trabalha em Portugal, por função e região. Para definir um salário,
preparar as bandas salariais que a diretiva europeia vai exigir, ou escrever uma peça.</p>
<p class="acoes"><a class="botao" href="mailto:{legal.EMAIL}?subject={amostra}&amp;body={corpo_amostra}">Pedir uma amostra grátis</a>
<a class="botao sec2" href="mailto:{legal.EMAIL}?subject={assunto}&amp;body={corpo_mail}">Pedir proposta</a></p>
</div></section>

<section class="sec"><div class="mold ofertas">
<div class="entra"><h2>Relatório por função</h2>
<p>Ganho médio e mediano por função e região, com as fontes oficiais ao lado e, quando há 5 ou mais pessoas, as partilhas da comunidade.
Para quem vai contratar e não quer errar na proposta.</p></div>
<div class="entra"><h2>Bandas para a transparência salarial</h2>
<p>A diretiva europeia obriga a mostrar o salário ou a banda nos anúncios e a justificar diferenças entre pessoas na mesma função.
Preparamos as comparações de mercado que sustentam essas bandas.</p></div>
<div class="entra"><h2>Imprensa e estudos</h2>
<p>Números à medida, cruzamentos e gráficos prontos a publicar. Podes sempre usar os números do site com uma ligação para a página de onde vieram.</p></div>
</div></section>

<section class="sec folha"><div class="mold grelha2">
<div class="entra"><h2>Um exemplo do que recebes</h2>
<p class="lede espaco">Uma amostra com números reais para enfermeiros no Norte. Num relatório, cada função vem assim, com a fonte de cada número.</p>
<p class="espaco"><a class="botao" href="mailto:{legal.EMAIL}?subject={amostra}&amp;body={corpo_amostra}">Pedir a minha amostra</a></p></div>
<div class="recibo entra" aria-label="Exemplo de relatório">
<h3>Enfermeiro, Norte</h3>
{f'<div class="linha"><span class="r">Grupo dos especialistas, Norte ({g2.get("ano")})</span><span class="p"></span><span class="v">{euro(norte)}</span></div>' if norte else ''}
{f'<div class="linha"><span class="r">Grupo dos especialistas, Portugal</span><span class="p"></span><span class="v">{euro(g2.get("ganho"))}</span></div>' if g2.get("ganho") else ''}
{f'<div class="linha"><span class="r">Ganho médio no Porto, todas as funções</span><span class="p"></span><span class="v">{euro(porto["ganho_medio"])}</span></div>' if porto else ''}
{f'<div class="linha"><span class="r">Função pública, 1.ª posição ({O["funcao_publica"]["ano"]})</span><span class="p"></span><span class="v">{euro(enf["min"], 2)}</span></div>' if enf.get("min") else ''}
{f'<div class="linha"><span class="r">Função pública, topo da carreira</span><span class="p"></span><span class="v">{euro(enf["max"], 2)}</span></div>' if enf.get("max") else ''}
<div class="linha"><span class="r">Partilhas da comunidade</span><span class="p"></span><span class="v">com 5 ou mais</span></div>
<p class="fonte">Fontes: INE e GEP/MTSSS, Quadros de Pessoal (setor privado, ganho bruto mensal); DGAEP (remuneração base).</p>
</div>
</div></section>

<section class="sec"><div class="mold">
<h2 class="entra">Porque podes confiar nos números</h2>
<div class="ofertas" style="margin-top:32px">
<div class="entra"><h3>Fontes oficiais</h3><p>INE, Ministério do Trabalho, Autoridade Tributária, DGAEP e Eurostat. Cada número diz de onde vem e de que ano é.
O <a href="/metodo/">método</a> está publicado.</p></div>
<div class="entra"><h3>Nunca uma pessoa</h3><p>Só agregados, com pelo menos 5 pessoas diferentes por número, publicados 24 horas depois e arredondados à dezena.</p></div>
<div class="entra"><h3>RGPD de raiz</h3><p>Sem contas, sem cookies e sem guardar o IP. Os dados ficam em servidores na União Europeia.</p></div>
</div>
<p class="acoes" style="margin-top:56px"><a class="botao" href="mailto:{legal.EMAIL}?subject={assunto}&amp;body={corpo_mail}">Pedir proposta</a>
<a class="botao sec2" href="/dados/">Ver os dados abertos</a></p>
</div></section>'''
    pagina('/para-empresas/', 'Dados salariais para empresas, RH e jornalistas',
           'Relatórios salariais por função e região, bandas para a transparência salarial e dados para jornalistas, com fontes oficiais e partilhas anónimas.',
           corpo, prioridade=0.6)


def dados_abertos():
    os.makedirs(os.path.join(SAIDA, 'dados-abertos'), exist_ok=True)
    pub = {'aviso': 'Dados oficiais tratados pelo ganhas.pt. Cite a fonte original e o ganhas.pt.', 'fontes': O['fontes'],
           'distribuicao': O['distribuicao'], 'grupos_profissionais': O['grupos'], 'concelhos': O['concelhos'],
           'funcao_publica': O.get('funcao_publica'), 'atualizado': O['atualizado']}
    with open(os.path.join(SAIDA, 'dados-abertos', 'ganhas-oficial.json'), 'w', encoding='utf-8') as f:
        json.dump(pub, f, ensure_ascii=False, indent=1)
    with open(os.path.join(SAIDA, 'dados-abertos', 'concelhos.csv'), 'w', encoding='utf-8') as f:
        f.write('concelho;codigo_nuts2024;regiao;sub_regiao;ano;ganho_medio_eur;' + ';'.join(f'grupo_{k}_eur' for k in '123456789') + '\n')
        for c in sorted(O['concelhos'], key=lambda c: c['nome']):
            g = c.get('grupos') or {}
            f.write(f'{c["nome"]};{c["geocod"]};{O["nuts2"].get(c["nuts2"], "")};{c.get("nuts3_nome", "")};{O["concelhos_ano"]};{c["ganho_medio"]};'
                    + ';'.join(str(g.get(k, '')) for k in '123456789') + '\n')
    with open(os.path.join(SAIDA, 'dados-abertos', f'funcao-publica-{O["funcao_publica"]["ano"]}.csv'), 'w', encoding='utf-8') as f:
        f.write('grupo;carreira;subgrupo;categoria;posicao;nivel;indice;bruto_mensal_eur\n')
        for c in O['funcao_publica']['carreiras']:
            for q in c['posicoes']:
                f.write(';'.join(str(x).replace(';', ',') for x in (c['grupo'], c['carreira'], c.get('subgrupo', ''), c['nome'], q['posicao'], q['nivel'], q.get('indice', ''), q['valor'])) + '\n')
    corpo = f'''
{migalhas([(None, "Dados abertos")])[0]}
<section class="sec" style="padding-top:24px"><div class="mold texto">
<h1>Dados abertos</h1>
<p class="lede">Os números oficiais que usamos, já tratados e prontos a usar. Cada ficheiro indica a fonte original.</p>
<ul>
<li><a href="/dados-abertos/ganhas-oficial.json">ganhas-oficial.json</a>: distribuição nacional, grupos de profissões, concelhos e função pública.</li>
<li><a href="/dados-abertos/concelhos.csv">concelhos.csv</a>: ganho médio dos 308 concelhos, total e por grupo de profissões ({O["concelhos_ano"]}).</li>
<li><a href="/dados-abertos/funcao-publica-{O["funcao_publica"]["ano"]}.csv">funcao-publica-{O["funcao_publica"]["ano"]}.csv</a>: remuneração de cada categoria e posição das carreiras da função pública ({O["funcao_publica"]["ano"]}).</li>
</ul>
<p>Podes reutilizar estes ficheiros, também para fins comerciais, desde que indiques a fonte original (INE e GEP/MTSSS, DGAEP) e o ganhas.pt
(<a href="https://creativecommons.org/licenses/by/4.0/deed.pt" rel="noopener">licença CC BY 4.0</a>).</p>
<p>Os dados da comunidade (partilhas) não são publicados em bruto. Para estatísticas agregadas, vê a página <a href="/para-empresas/">Para empresas e jornalistas</a>.</p>
</div></section>'''
    ld = [{'@type': 'Dataset', 'name': 'Salários em Portugal (dados oficiais tratados)', 'description': 'Ganho mensal por concelho, por grupo de profissões e distribuição nacional, com base no INE e no GEP/MTSSS.',
           'url': DOMINIO + '/dados/', 'inLanguage': 'pt-PT', 'creator': {'@id': DOMINIO + '/#org'}, 'isAccessibleForFree': True,
           'spatialCoverage': 'Portugal', 'distribution': [
               {'@type': 'DataDownload', 'encodingFormat': 'application/json', 'contentUrl': DOMINIO + '/dados-abertos/ganhas-oficial.json'},
               {'@type': 'DataDownload', 'encodingFormat': 'text/csv', 'contentUrl': DOMINIO + '/dados-abertos/concelhos.csv'},
               {'@type': 'DataDownload', 'encodingFormat': 'text/csv', 'contentUrl': DOMINIO + f'/dados-abertos/funcao-publica-{O["funcao_publica"]["ano"]}.csv'}],
           'license': 'https://creativecommons.org/licenses/by/4.0/', 'temporalCoverage': f'{O["concelhos_ano"]}/{O["funcao_publica"]["ano"]}'}]
    pagina('/dados/', 'Dados abertos sobre salários em Portugal', 'Descarrega os dados oficiais de salários em Portugal já tratados: concelhos, profissões e distribuição nacional.',
           corpo, ld=ld, prioridade=0.4)


def modelo_empresa():
    """Modelo para as páginas das empresas geradas no servidor (ficheiro escondido: o Caddy não o serve)."""
    destino = os.path.join(SAIDA, '.modelo.html')
    pagina('/empresa/__CAMINHO__/', '@@TITULO@@', '@@DESCRICAO@@', '@@CORPO@@', sitemap=False, destino=destino, h_titulo='@@TITULO@@ · ganhas.pt')
    with open(destino, encoding='utf-8') as f:
        t = f.read()
    t = t.replace(DOMINIO + '/empresa/__CAMINHO__/', DOMINIO + '@@CAMINHO@@')
    with open(destino, 'w', encoding='utf-8') as f:
        f.write(t)


def nao_encontrada():
    corpo = '''<section class="sec"><div class="mold texto"><h1>Esta página não existe</h1>
<p class="lede">Pode ter mudado de sítio. Experimenta comparar o teu salário ou procurar a tua profissão.</p>
<p style="margin-top:28px;display:flex;flex-wrap:wrap;gap:12px"><a class="botao" href="/">Comparar o meu salário</a><a class="botao sec2" href="/profissoes/">Profissões</a></p></div></section>'''
    pagina('/404/', 'Página não encontrada', 'Esta página não existe.', corpo, indexar=False)
    shutil.move(os.path.join(SAIDA, '404', 'index.html'), os.path.join(SAIDA, '404.html'))
    shutil.rmtree(os.path.join(SAIDA, '404'), ignore_errors=True)


# ---------------------------------------------------------------- ficheiros do site

def ficheiros():
    for nome in ('estilo.css', 'app.js', 'prova.js'):
        shutil.copy(os.path.join(MODELO, nome), os.path.join(SAIDA, nome))
    shutil.copytree(os.path.join(MODELO, 'fontes'), os.path.join(SAIDA, 'fontes'), dirs_exist_ok=True)
    for nome in os.listdir(os.path.join(MODELO, 'imagens')) if os.path.isdir(os.path.join(MODELO, 'imagens')) else []:
        destino = os.path.join(SAIDA, 'og' if nome.startswith('og-') else '', nome.replace('og-', '') if nome.startswith('og-') else nome)
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        shutil.copy(os.path.join(MODELO, 'imagens', nome), destino)
    with open(os.path.join(SAIDA, 'robots.txt'), 'w') as f:
        f.write('User-agent: *\nAllow: /\nDisallow: /api/\n\n'
                '# Recolha automática dos dados não é permitida (ver /termos/)\n'
                'User-agent: CCBot\nDisallow: /\n\nSitemap: https://ganhas.pt/sitemap.xml\nSitemap: https://ganhas.pt/sitemap-empresas.xml\n')
    urls = ''.join(f'<url><loc>{DOMINIO}{c}</loc><lastmod>{HOJE}</lastmod><priority>{p:.1f}</priority></url>' for c, p in sorted(PAGINAS))
    with open(os.path.join(SAIDA, 'sitemap.xml'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls + '</urlset>\n')
    with open(os.path.join(SAIDA, 'manifest.webmanifest'), 'w', encoding='utf-8') as f:
        json.dump({'name': 'ganhas.pt', 'short_name': 'ganhas', 'lang': 'pt-PT', 'start_url': '/', 'display': 'standalone',
                   'background_color': '#F7F7F2', 'theme_color': '#F7F7F2',
                   'icons': [{'src': '/icone-192.png', 'sizes': '192x192', 'type': 'image/png'},
                             {'src': '/icone-512.png', 'sizes': '512x512', 'type': 'image/png'}]}, f, ensure_ascii=False)
    llms()


def llms():
    d = O['distribuicao']
    eu = O.get('europa') or {}
    pt = next((x for x in eu.get('liquido', []) if x['codigo'] == 'PT'), None)
    linhas = [
        '# ganhas.pt', '',
        '> Salários reais em Portugal: dados oficiais (INE, GEP/MTSSS, AT, DGAEP, Eurostat) e partilhas anónimas de quem trabalha. Em português de Portugal.', '',
        '## Números principais', '',
        f'- Outubro de {d["ano"]}, {d["ambito"]}, trabalhadores por conta de outrem a tempo completo (Quadros de Pessoal, DGCP/MTSSS):',
        f'  - remuneração base mediana: {euro(d["base"]["mediana"])}; {pct(d["base"]["ate_1000"])} tinham base até 1 000 €;',
        f'  - ganho mensal mediano (com prémios e subsídios regulares): {euro(d["ganho"]["mediana"])}; ganho médio: {euro(d["media"])};',
        f'  - 10 % ganhavam mais de {euro(d["ganho"]["d9"])} (9.º decil do ganho).',
        f'- Ganho médio mensal em Portugal, {O["concelhos_ano"]} (INE, Quadros de Pessoal): {euro(O["media_nacional"])}; por concelho em https://ganhas.pt/concelhos/.',
        f'- Salário mínimo nacional em {smn_hoje()[0]}: {euro(smn_hoje()[1])} brutos por mês'
        + (f' ({euro(O["smn"][str(smn_hoje()[0] + 1)])} previstos para {smn_hoje()[0] + 1}).' if str(smn_hoje()[0] + 1) in O['smn'] else '.'),
    ]
    if pt:
        linhas.append(f'- Salário líquido anual de uma pessoa sozinha sem filhos com o salário médio em Portugal, {eu["ano"]}: {euro(pt["eur"])} (Eurostat).')
    if O.get('funcao_publica'):
        linhas.append(f'- Base remuneratória da Administração Pública em {O["funcao_publica"]["ano"]}: {euro(O["funcao_publica"]["brap"], 2)}.')
    linhas += ['', '## Páginas', '',
               '- [Comparador de salários](https://ganhas.pt/): onde estás na distribuição dos salários em Portugal.',
               f'- [Calculadora de salário líquido {O["irs"]["ano"]}](https://ganhas.pt/calculadora/): bruto para líquido com as tabelas oficiais de IRS.',
               '- [Salários por profissão](https://ganhas.pt/profissoes/)', '- [Salários por concelho](https://ganhas.pt/concelhos/)',
               '- [Função pública: todas as carreiras com bruto e líquido](https://ganhas.pt/funcao-publica/)', '- [Portugal e a Europa](https://ganhas.pt/europa/)',
               '- [Método e fontes](https://ganhas.pt/metodo/)', '- [Dados abertos](https://ganhas.pt/dados/)', '',
               '## Regras dos dados da comunidade', '',
               '- Só aparecem números com pelo menos 5 pessoas diferentes, 24 horas depois e arredondados à dezena.',
               '- Ao citar, indicar a fonte original e ligar para a página do ganhas.pt.', '']
    with open(os.path.join(SAIDA, 'llms.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(linhas))


def main():
    if os.path.isdir(SAIDA):
        shutil.rmtree(SAIDA)
    os.makedirs(SAIDA)
    inicio(); calculadora(); partilhar(); profissoes(); concelhos(); europa(); funcao_publica()
    empresas_b2b(); dados_abertos(); paginas_texto(); nao_encontrada(); modelo_empresa(); ficheiros()
    print(len(PAGINAS), 'páginas em', SAIDA)


if __name__ == '__main__':
    main()
