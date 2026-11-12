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


NAV_EN = [('/en/salary-calculator/', 'Salary calculator'), ('/en/average-salary-portugal/', 'Average salary'),
          ('/en/minimum-wage-portugal/', 'Minimum wage')]


def pagina(caminho, titulo, descricao, corpo, *, dados=None, ld=None, prioridade=0.6, og=None, barra=False, h_titulo=None,
           indexar=True, sitemap=True, destino=None, lang='pt', alternos=None):
    """Escreve sites/ganhas<caminho>index.html. alternos = {'pt': caminho, 'en': caminho} (hreflang)."""
    url = DOMINIO + caminho
    og = og or '/og/geral.png'
    # o Google corta perto dos 60 caracteres no título e dos 160 na descrição
    def curto(t, n):
        return t if len(t) <= n else t[:n - 1].rsplit(' ', 1)[0].rstrip(',;:(') + '…'
    titulo_meta = curto(titulo, 62)
    tit = h_titulo or (titulo_meta + ' · ganhas.pt' if len(titulo_meta) <= 50 else titulo_meta)
    descricao = curto(descricao, 160)
    nav = ''.join(f'<a href="{h}"{" aria-current=\"page\"" if caminho.startswith(h) else ""}>{t}</a>' for h, t in (NAV_EN if lang == 'en' else NAV))
    alt_html = ''.join(f'<link rel="alternate" hreflang="{"pt-PT" if l == "pt" else l}" href="{DOMINIO}{c}">' for l, c in (alternos or {}).items())
    if alternos:
        alt_html += f'<link rel="alternate" hreflang="x-default" href="{DOMINIO}{alternos["pt"]}">'
    lds = [ORG, SITE] + (ld or [])
    head_extra = f'<meta name="google-site-verification" content="{e(GOOGLE_VERIFICACAO)}">' if GOOGLE_VERIFICACAO else ''
    # entre marcas: o servidor (paginas_empresas.py) tira o noindex quando a página passa a ter números da comunidade
    robots = '<!--robots-->' + ('' if indexar else '<meta name="robots" content="noindex, follow">') + '<!--/robots-->'
    dados_html = ('<script type="application/json" id="dados">' + json.dumps(dados, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') + '</script>') if dados else ''
    barra_html = ''  # o botão «Partilhar» do topo já está sempre à vista; uma segunda barra fixa tapava o conteúdo
    doc = f'''<!doctype html>
<html lang="{"en" if lang == "en" else "pt-PT"}" class="sem-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(tit)}</title>
<meta name="description" content="{e(descricao)}">
<link rel="canonical" href="{e(url)}">{alt_html}
{robots}{head_extra}
<meta property="og:type" content="website">
<meta property="og:site_name" content="ganhas.pt">
<meta property="og:locale" content="{"en_GB" if lang == "en" else "pt_PT"}">
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
<a class="salto" href="#conteudo">{"Skip to content" if lang == "en" else "Saltar para o conteúdo"}</a>
<header class="topo"><div class="mold">
<a class="marca" href="{"/en/salary-calculator/" if lang == "en" else "/"}" aria-label="{"ganhas.pt, home" if lang == "en" else "ganhas.pt, início"}">ganhas<span>.pt</span></a>
<nav class="nav" aria-label="{"Main" if lang == "en" else "Principal"}">{nav}</nav>
{'<a class="botao topo-sec" href="/" hreflang="pt-PT">Português</a>' if lang == 'en' else '<a class="botao topo-sec" href="/partilhar/">Partilhar</a>'}
</div></header>
<main id="conteudo">
{corpo}
</main>
{rodape_en() if lang == 'en' else rodape()}
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
<ul><li><a href="/calculadora/">Calculadora de salário líquido</a></li><li><a href="/salario-minimo/">Salário mínimo</a></li><li><a href="/salario-medio/">Salário médio</a></li><li><a href="/profissoes/">Salários por profissão</a></li>
<li><a href="/concelhos/">Salários por concelho</a></li><li><a href="/funcao-publica/">Função pública</a></li><li><a href="/europa/">Portugal e a Europa</a></li><li><a href="/empresa/">Quanto pagam as empresas</a></li>
<li><a href="/estudos/salarios-por-profissao/">Estudo: 10 anos de salários por profissão</a></li></ul>
<ul><li><a href="/partilhar/">Partilhar o meu salário</a></li><li><a href="/metodo/">Método e fontes</a></li><li><a href="/dados/">Dados abertos</a></li>
<li><a href="/para-empresas/">Para empresas e jornalistas</a></li><li><a href="/en/salary-calculator/" hreflang="en">English</a></li></ul>
<ul><li><a href="/privacidade/">Privacidade</a></li><li><a href="/termos/">Termos</a></li><li><a href="/cookies/">Cookies</a></li>
<li><a href="mailto:{legal.EMAIL}">Contacto</a></li></ul>
</div>
<p class="peq">Dados oficiais do INE, GEP/MTSSS, AT, DGAEP e Eurostat, com a fonte em cada número. Atualizado a {dt.date.fromisoformat(O["atualizado"]).strftime("%d/%m/%Y")}.</p>
</div></footer>'''


def migalhas(itens, lang='pt'):
    ini = ('/en/salary-calculator/', 'ganhas.pt') if lang == 'en' else ('/', 'Início')
    partes = [f'<a href="{ini[0]}">{ini[1]}</a>'] + [f'<a href="{h}">{e(t)}</a>' if h else e(t) for h, t in itens]
    ld = {'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': t, 'item': DOMINIO + (h or '')} for i, (h, t) in enumerate([ini] + itens)]}
    return f'<nav class="migalhas mold" aria-label="{"You are here" if lang == "en" else "Estás aqui"}">' + ' / '.join(partes) + '</nav>', ld


def rodape_en():
    return f'''<footer class="rodape"><div class="mold">
<a class="marca" href="/en/salary-calculator/">ganhas<span>.pt</span></a>
<div class="rodape-grelha">
<div><p>Real salaries in Portugal: official figures and anonymous shares from people who work here. No accounts, no cookies.</p>
<p class="credito">Made by <a href="https://dinissousa.pt">dinissousa.pt</a></p></div>
<ul><li><a href="/en/salary-calculator/">Net salary calculator</a></li><li><a href="/en/average-salary-portugal/">Average salary in Portugal</a></li>
<li><a href="/en/minimum-wage-portugal/">Minimum wage in Portugal</a></li></ul>
<ul><li><a href="/" hreflang="pt-PT">ganhas.pt em português</a></li><li><a href="/profissoes/" hreflang="pt-PT">Salários por profissão (PT)</a></li>
<li><a href="/concelhos/" hreflang="pt-PT">Salários por concelho (PT)</a></li><li><a href="/privacidade/">Privacy (PT)</a></li></ul>
</div>
<p class="peq">Official data from INE, GEP/MTSSS, the Tax Authority (AT), DGAEP and Eurostat, with the source under each figure. Updated {dt.date.fromisoformat(O["atualizado"]).strftime("%d/%m/%Y")}.</p>
</div></footer>'''


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
    n_prof = len(CAT['profissoes'])
    corpo = f'''
<section class="heroi"><div class="mold heroi-grelha">
<div class="heroi-esq">
<h1>Quanto ganhas?</h1>
<p class="lede curta">Vê onde está o teu salário no país, em 5 segundos. Sem conta, sem nome.</p>
<form class="comparador" id="comparador" action="/" novalidate>
<label class="caixa-salario" for="salario">
<span class="caixa-rotulo">O teu salário bruto por mês</span>
<span class="caixa-linha"><input id="salario" name="salario" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="ex.: 1200" aria-describedby="salario-ajuda"><span class="unid">€</span></span>
</label>
<p class="ajuda" id="salario-ajuda">Antes dos descontos, como aparece no recibo.</p>
<p class="erro-campo" id="salario-erro" role="alert" hidden>Escreve um valor, por exemplo 1200.</p>
<button class="botao largo" type="submit" id="comparar">Comparar</button>
<details class="afinar">
<summary><span id="afinar-resumo">Só o vencimento base · 14 meses</span><span class="afinar-mudar">Mudar</span></summary>
<div class="opcoes" role="radiogroup" aria-label="O que escreveste">
<label><input type="radio" name="tipo" value="base" checked><span>Só o vencimento base</span></label>
<label><input type="radio" name="tipo" value="ganho"><span>Com prémios e subsídios regulares</span></label>
</div>
<div class="opcoes" role="radiogroup" aria-label="Quantos salários recebes por ano">
<label><input type="radio" name="meses" value="14" checked><span>14 meses</span></label>
<label><input type="radio" name="meses" value="12"><span>12 meses (duodécimos)</span></label>
</div>
</details>
</form>
</div>
<div class="res-cartao" id="resultado" data-estado="vazio" tabindex="-1">
<div aria-live="polite">
<p class="res-pre" id="res-pre">Metade de quem trabalha a tempo completo ganha menos de</p>
<p class="res-grande"><span class="mk on" id="res-num">{euro(b["mediana"])}</span></p>
<p class="res-pos" id="res-pos">E tu? Escreve o teu salário.</p>
</div>
{histograma_html(d, "base", True)}{histograma_html(d, "ganho", False)}
<div class="res-dados" id="res-dados" hidden>
<a class="rd" id="res-liq-a" href="/calculadora/"><span class="rd-r">Levas para casa</span><span class="rd-v" id="res-liq">–</span><span class="rd-n">por mês, sem dependentes ›</span></a>
<div class="rd"><span class="rd-r">Metade ganha menos de</span><span class="rd-v" id="res-med">{euro(b["mediana"])}</span><span class="rd-n" id="res-dif">–</span></div>
</div>
<p class="res-partilha" id="res-partilha" hidden><button class="ligacao-botao" type="button" id="partilhar-resultado">Partilhar o resultado</button><span id="partilha-ok" class="res-nota" hidden>Copiado. Cola onde quiseres.</span></p>
<p class="fonte" id="res-fonte">Quem trabalhava a tempo completo, {e(d["ambito"])}, outubro de {ano}: os dados oficiais mais recentes (<a href="{e(O["fontes"]["decis"]["url"])}" rel="noopener">DGCP/MTSSS</a>). Os salários subiram desde então, por isso hoje a tua posição é um pouco mais baixa.</p>
</div>
</div>
<div class="mold">
<h2 class="vis">Compara mais</h2>
<nav class="seguir" aria-label="Compara mais">
<a class="cartao-seguir principal" id="seguir-liquido" href="/calculadora/"><b>Quanto levas para casa</b><span>O recibo linha a linha, com o IRS de {O["irs"]["ano"]}</span></a>
<a class="cartao-seguir" href="/profissoes/"><b>Na tua profissão</b><span>{n_prof} profissões</span></a>
<a class="cartao-seguir" href="/concelhos/"><b>No teu concelho</b><span>Os 308 concelhos</span></a>
<a class="cartao-seguir" href="/funcao-publica/"><b>No Estado</b><span>{len(por)} carreiras, bruto e líquido</span></a>
<a class="cartao-seguir" href="/europa/"><b>Na Europa</b><span>Portugal ao lado dos outros</span></a>
<a class="cartao-seguir" href="/partilhar/"><b>A tua empresa paga bem?</b><span>Partilha o teu salário em 30 segundos</span></a>
</nav>
<p class="fonte" data-contador hidden></p>
</div></section>

<section class="sec"><div class="mold">
<h2 class="entra">Portugal em {ano}, em 3 números</h2>
<div class="tres-numeros">
<div class="entra"><p class="gigante-n">{euro(g["mediana"])}</p><p>Metade ganhava menos do que isto, contando prémios e subsídios. A média era {euro(d["media"])}, puxada pelos salários mais altos.</p></div>
<div class="entra"><p class="gigante-n">{pct(b["ate_1000"])}</p><p>tinha um vencimento base até {euro(1000)}, com o salário mínimo nos {euro(d["minimo"])}.</p></div>
<div class="entra"><p class="gigante-n">1 em 10</p><p>ganhava mais de {euro(g["d9"])} por mês.</p></div>
</div>
{fonte("decis")}
</div></section>

<section class="sec folha"><div class="mold grelha2">
<div class="entra"><h2>Bruto não é o que levas para casa</h2>
<p class="lede espaco">Com as tabelas de IRS de {O["irs"]["ano"]}, a Segurança Social e o subsídio de alimentação, a calculadora mostra o teu recibo linha a linha.{(chr(10) + f'Em novembro de {O["irs"]["ano"]}, a retenção de IRS é metade.') if NOV else ''}</p>
<p class="espaco"><a class="botao" href="/calculadora/">Abrir a calculadora</a></p></div>
<div class="recibo entra" aria-label="Exemplo de recibo">
<h3 id="ex-tit">Exemplo: {euro(O["exemplo"]["bruto"])} brutos</h3>
<div class="linha"><span class="r">Vencimento base</span><span class="p"></span><span class="v" id="ex-base">{euro(O["exemplo"]["bruto"], 2)}</span></div>
<div class="linha menos"><span class="r">Segurança Social (11 %)</span><span class="p"></span><span class="v" id="ex-ss">− {euro(O["exemplo"]["ss"], 2)}</span></div>
<div class="linha menos"><span class="r">Retenção de IRS</span><span class="p"></span><span class="v" id="ex-irs">− {euro(O["exemplo"]["irs"], 2)}</span></div>
<div class="linha total"><span class="r">Líquido</span><span class="p"></span><span class="v"><span class="mk" id="ex-liq">{euro(O["exemplo"]["liquido"], 2)}</span></span></div>
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
<p class="lede espaco">Partilha o teu salário em 30 segundos, sem nome. Uma empresa só aparece quando há pelo menos 5 pessoas.</p>
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
<h2 class="recibo-t">O teu recibo</h2>
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
           corpo, dados={'irs': dados_irs()}, ld=ld, prioridade=0.9, og='/og/calculadora.png',
           alternos={'pt': '/calculadora/', 'en': '/en/salary-calculator/'})


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
<li>As partilhas só contam 24 horas depois, arredondadas a 50 € até haver 10 pessoas e à dezena a partir daí.</li>
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


# Uma página por profissão indexada só quando tem números que são dela (Google penaliza páginas em massa iguais):
# - o representante de cada subgrupo (CPP, 2 dígitos) leva o dado oficial do subgrupo, que é igual para todas as
#   profissões desse subgrupo; as outras do mesmo subgrupo ficam com noindex (continuam a existir para quem lá chega);
# - a profissão «dona» de uma carreira da função pública (tabela que é só dela) também é indexada;
# - quando uma profissão chega às 5 pessoas na comunidade, o servidor tira o noindex (paginas_empresas.py).
# Escolha do representante: o nome mais procurado do subgrupo, por critério editorial (sem volumes de pesquisa).
REPRESENTA = {
    '11': 'diretor-geral', '12': 'diretor-financeiro', '13': 'diretor-de-informatica', '14': 'gerente-de-loja',
    '21': 'engenheiro-civil', '22': 'enfermeiro', '23': 'professor-do-3-o-ciclo-e-secundario', '24': 'contabilista-certificado',
    '25': 'programador', '26': 'advogado', '31': 'encarregado-de-obra', '32': 'tecnico-de-radiologia',
    '33': 'assistente-administrativo', '34': 'chefe-de-cozinha', '35': 'tecnico-de-apoio-informatico', '41': 'empregado-de-escritorio',
    '42': 'operador-de-call-center', '43': 'fiel-de-armazem', '44': 'carteiro', '51': 'cozinheiro', '52': 'operador-de-loja',
    '53': 'auxiliar-de-saude', '54': 'vigilante', '61': 'agricultor', '71': 'pedreiro', '72': 'mecanico-de-automoveis',
    '74': 'eletricista', '75': 'padeiro-ou-pasteleiro', '81': 'operador-de-maquinas-de-alimentacao',
    '82': 'montador-de-componentes-eletronicos', '83': 'motorista-de-pesados', '91': 'trabalhador-de-limpeza',
    '93': 'operador-de-armazem', '94': 'ajudante-de-cozinha', '96': 'estafeta'}
# parte da carreira pública que é desta profissão (posto, categoria); sem filtro, a carreira toda
PROF_FP_FILTRO = {'oficial-das-forcas-armadas': ('subgrupo', 'Oficiais', None), 'sargento-das-forcas-armadas': ('subgrupo', 'Sargentos', None),
                  'praca-das-forcas-armadas': ('subgrupo', 'Praças', None),
                  'agente-de-policia': ('subgrupo', 'Agentes de polícia', 'de agente a agente coordenador'),
                  'guarda-prisional': ('subgrupo', 'Guarda prisional', 'de guarda a guarda principal'),
                  'bombeiro': ('subgrupo', 'Bombeiro sapador', 'de bombeiro sapador a chefe principal, sem os cargos de comando'),
                  'medico-de-medicina-geral': ('subgrupo', '40H/semana', 'no regime de 40 horas, conforme a categoria'),
                  'medico-especialista': ('subgrupo', '40H/semana', 'no regime de 40 horas, conforme a categoria'),
                  'nutricionista': ('subgrupo', 'Tempo Completo', 'a 35 horas por semana, de assistente a assessor superior')}
# quem fica com a tabela pública para efeitos de indexação (as outras profissões ligadas à mesma tabela repetiam-na)
FP_DONO = {'enfermeiros': 'enfermeiro', 'medicos': 'medico-de-medicina-geral', 'professores': 'professor-do-3-o-ciclo-e-secundario',
           'docente-universitario': 'professor-do-ensino-superior', 'psp': 'agente-de-policia', 'guarda-prisional': 'guarda-prisional',
           'bombeiros-sapadores': 'bombeiro', 'teph': 'tecnico-de-emergencia-medica', 'tsdt': 'fisioterapeuta',
           'farmaceuticos': 'farmaceutico', 'tecnico-auxiliar-de-saude': 'auxiliar-de-saude',
           'assistente-operacional': 'assistente-operacional-escolar', 'assistente-tecnico': 'assistente-administrativo',
           'especialista-de-informatica': 'programador', 'tecnico-de-informatica': 'tecnico-de-apoio-informatico',
           'tecnico-superior-de-saude': 'nutricionista'}
# carreiras públicas que juntam várias profissões (o texto diz «a carreira onde entram os …»)
CARREIRA_GENERICA = {'especialista-de-informatica': 'especialista de informática', 'tecnico-de-informatica': 'técnico de informática',
                     'tecnico-superior': 'técnico superior', 'assistente-tecnico': 'assistente técnico', 'assistente-operacional': 'assistente operacional',
                     'tsdt': 'técnico superior de diagnóstico e terapêutica', 'tecnico-superior-de-saude': 'técnico superior de saúde',
                     'tecnico-auxiliar-de-saude': 'técnico auxiliar de saúde'}
NOMES_SG_EXTRA = {'95': 'Vendedores ambulantes e prestadores de serviços na rua'}


def data_pt(d):
    return dt.date.fromisoformat(d).strftime('%d/%m/%Y')


def fontes_curtas(chaves):
    ls = [f'<a href="{e(O["fontes"][k]["url"])}" rel="noopener">{e(O["fontes"][k]["nome"])}</a>' for k in chaves]
    return ('Fonte: ' if len(ls) == 1 else 'Fontes: ') + '; '.join(ls) + '.'


def nome_sg(k):
    return (CAT.get('subgrupos') or {}).get(k) or NOMES_SG_EXTRA.get(k) or ((O.get('subgrupos') or {}).get('linhas', {}).get(k) or {}).get('nome_oficial', k)


def dados_sg(k):
    """(ganho, base, tco, ganho do 1.º ano) do subgrupo no último ano, ou None."""
    s = (O.get('subgrupos') or {}).get('linhas', {}).get(k)
    if not s or not s.get('ganho') or s['ganho'][-1] is None:
        return None
    return {'ganho': s['ganho'][-1], 'base': s['base'][-1], 'tco': s['tco'][-1], 'ganho0': s['ganho'][0], 'serie': s['ganho']}


def fp_da_profissao(pid):
    """(carreira, mínimo, máximo, texto do âmbito) da parte da carreira pública que é desta profissão."""
    fp_id = PROF_FP.get(pid)
    x = carreiras_fp().get(fp_id) if fp_id else None
    if not x:
        return None
    filtro = PROF_FP_FILTRO.get(pid)
    if not filtro:
        return (x, x['min'], x['max'], None) if x.get('min') else None
    campo, valor, texto = filtro
    formacao = re.compile(r'cadete|aluno|aspirante|estagi|instrução|tirocin|\bformação|pré-carreira|interno', re.I)  # «\b»: «informação» não é formação
    cats = [c for c in x['categorias'] if (c.get(campo) or '').startswith(valor) and not formacao.search(c['nome'])]
    vals = [q['valor'] for c in cats for q in c['posicoes'] if q['valor'] >= smn_hoje()[1]]
    if not vals:
        return None
    if not texto:  # militares: do posto mais baixo ao mais alto («de alferes a general»)
        texto = f'de {minusc(cats[-1]["nome"].split(" / ")[-1])} a {minusc(cats[0]["nome"].split(" / ")[-1])}'
    return (x, min(vals), max(vals), texto)


def indexavel(p):
    fp_id = PROF_FP.get(p['id'])
    return (REPRESENTA.get(p['subgrupo']) == p['id'] or (fp_id and FP_DONO.get(fp_id) == p['id'])
            or (p['grupo'] == '0' and fp_da_profissao(p['id'])))  # cada posto militar tem a sua parte da tabela


def milhares(n):
    return f'{n:,}'.replace(',', '.')


def resposta_profissao(p, sg, fpd):
    """A resposta direta do topo (40 a 60 palavras), só com números oficiais. A comunidade entra no servidor."""
    nome = minusc(p['nome'])
    a = (O.get('subgrupos') or {}).get('ano')
    a_fp = O['funcao_publica']['ano']
    sub = f'«{e(nome_sg(p["subgrupo"]))}»' if sg else ''
    if fpd:
        x, mn, mx, ambito = fpd
        if x['id'] in CARREIRA_GENERICA:  # a carreira não tem o nome da profissão: diz-se qual é
            txt = (f'Na função pública, a carreira de {e(CARREIRA_GENERICA[x["id"]])}, onde entram os {e(plural(nome))}, paga em {a_fp} '
                   f'entre <span class="mk">{euro(mn)}</span> e {euro(mx)} brutos por mês{", " + e(ambito) if ambito else ""}.')
            return txt + (f' Nas empresas, privadas e públicas, o subgrupo {sub} ganhava em média {euro(sg["ganho"])} em outubro de {a}.' if sg else '')
        onde = (f', {e(ambito)}' if ambito else ', conforme a posição na carreira' if x.get('principal')
                else ', conforme a categoria e a posição')
        txt = f'Na função pública, um {e(nome)} ganha em {a_fp} entre <span class="mk">{euro(mn)}</span> e {euro(mx)} brutos por mês{onde}.'
        if sg:
            return txt + (f' Nas empresas, privadas e públicas, não há número oficial só para {e(plural(nome))}: o subgrupo onde entram, {sub}, '
                          f'ganhava em média {euro(sg["ganho"])} em outubro de {a}.')
        return txt + (' Os militares não entram nos Quadros de Pessoal, por isso não há uma média do setor privado para comparar.'
                      if p['grupo'] == '0' else '')
    if sg:
        return (f'Não há um número oficial só para {e(plural(nome))}. O mais próximo é o do subgrupo {sub}: '
                f'em outubro de {a} ganhavam em média <span class="mk">{euro(sg["ganho"])}</span> brutos por mês no Continente, '
                f'com uma remuneração base média de {euro(sg["base"])}. É a média de todas as profissões desse subgrupo.')
    return 'Ainda não temos um número oficial para esta profissão.'


def plural(nome):
    """Plural do nome da profissão (para frases); os casos que a regra simples erra estão escritos à mão."""
    fixos = {'diretor-geral': 'diretores-gerais', 'estatístico ou atuário': 'estatísticos ou atuários', 'designer gráfico': 'designers gráficos',
             'personal trainer': 'personal trainers', 'fiel de armazém': 'fiéis de armazém', 'barman': 'barmen',
             'técnico instalador de telecomunicações': 'técnicos instaladores de telecomunicações', 'padeiro ou pasteleiro': 'padeiros ou pasteleiros'}
    if nome in fixos:
        return fixos[nome]
    excecoes = {'técnico': 'técnicos', 'agente': 'agentes', 'operador': 'operadores', 'motorista': 'motoristas'}
    partes = nome.split(' ')
    w = partes[0]
    if w in excecoes:
        w = excecoes[w]
    elif w.endswith('ão'):
        w = w[:-2] + 'ões'
    elif w.endswith('l'):
        w = w[:-1] + 'is'
    elif w.endswith(('r', 'z', 's')):
        w = w + 'es' if not w.endswith('s') else w
    elif w.endswith('m'):
        w = w[:-1] + 'ns'
    else:
        w = w + 's'
    # adjetivos logo a seguir concordam («engenheiros civis», «assistentes operacionais escolares»)
    adj = {'civil': 'civis', 'mecânico': 'mecânicos', 'químico': 'químicos', 'eletrotécnico': 'eletrotécnicos', 'industrial': 'industriais',
           'especialista': 'especialistas', 'dentista': 'dentistas', 'veterinário': 'veterinários', 'gráfico': 'gráficos', 'social': 'sociais',
           'financeiro': 'financeiros', 'certificado': 'certificados', 'administrativo': 'administrativos', 'fabril': 'fabris',
           'imobiliário': 'imobiliários', 'familiar': 'familiares', 'operacional': 'operacionais', 'prisional': 'prisionais',
           'geral': 'gerais', 'web': 'web', 'técnico': 'técnicos', 'doméstico': 'domésticos', 'superior': 'superiores',
           'comercial': 'comerciais', 'escolar': 'escolares', 'clínico': 'clínicos'}
    resto = partes[1:]
    for i, x in enumerate(resto):
        if x not in adj:
            break
        resto[i] = adj[x]
    return ' '.join([w] + resto)


def profissoes():
    grupos = O['grupos']
    ano = grupos_ano()
    sgs = O.get('subgrupos') or {}
    a_sg = sgs.get('ano')
    por_g, por_sg = {}, {}
    for p in CAT['profissoes']:
        por_g.setdefault(p['grupo'], []).append(p)
        por_sg.setdefault(p['subgrupo'], []).append(p)
    blocos = []
    for k in sorted(por_g, key=lambda s: -((grupos.get(s) or {}).get('ganho') or 0)):
        g = grupos.get(k) or {}
        itens = ''.join(f'<li data-nome="{e(slug(p["pesquisa"] + " " + p["nome"]).replace("-", " "))}"><a href="/profissoes/{p["id"]}/">{e(p["nome"])}</a>'
                        f'{"<span class=cifra>" + euro(dados_sg(p["subgrupo"])["ganho"]) + "</span>" if dados_sg(p["subgrupo"]) else ""}</li>'
                        for p in sorted(por_g[k], key=lambda x: x['nome']))
        info = (f'Ganho médio do grupo: <strong>{euro(g["ganho"])}</strong> brutos por mês, {ano}. Ao lado de cada profissão, o ganho médio do seu subgrupo ({a_sg}).'
                if g.get('ganho') else 'Sem dado nos Quadros de Pessoal: vê a <a href="/funcao-publica/militares/">tabela dos militares</a>')
        blocos.append(f'<div class="entra bloco-grupo" id="g{k}"><h2 class="h3-pag">{e(GC.get(k, k))}</h2>'
                      f'<p class="res-extra" style="margin-top:6px">{info}</p>'
                      f'<ul class="lista-colunas" style="margin-top:16px">{itens}</ul></div>')
    linhas = ''.join(f'<tr><td><a href="#g{k}">{e(GC[k])}</a></td><td class="n">{euro(v["ganho"])}</td></tr>'
                     for k, v in sorted(grupos.items(), key=lambda kv: -kv[1]['ganho']))
    subs = sorted(((k, dados_sg(k)) for k in sgs.get('linhas', {}) if len(k) == 2 and dados_sg(k)), key=lambda kv: -kv[1]['ganho'])
    def sg_nome_ligado(k):
        rep = REPRESENTA.get(k)
        return f'<a href="/profissoes/{rep}/">{e(nome_sg(k))}</a>' if rep else e(nome_sg(k))
    tab_sg = ''
    resposta = ''
    if subs:
        tab_sg = (f'<section class="sec"><div class="mold"><h2 class="h2-pag">Os {len(subs)} subgrupos de profissões, do que mais ganha ao que menos ganha</h2>'
                  f'<p class="lede" style="margin-top:16px">É o dado oficial mais fino que existe por profissão em Portugal: o subgrupo junta profissões parecidas '
                  f'(por exemplo, todos os especialistas de informática). Outubro de {a_sg}, Continente, quem trabalha a tempo completo no setor privado e nas empresas públicas.</p>'
                  + tabela_html(['Subgrupo de profissões', 'Ganho médio', 'Base média', 'Trabalhadores'],
                                [[sg_nome_ligado(k), euro(v['ganho']), euro(v['base']), milhares(v['tco'])] for k, v in subs],
                                f'Ganho médio mensal por subgrupo de profissões, {a_sg}')
                  + fonte('subgrupos', 'O ganho junta à base os subsídios regulares, prémios e horas extra do mês. «Trabalhadores» conta todos os trabalhadores por conta de outrem do subgrupo.')
                  + '<p class="espaco"><a class="ligacao" href="/estudos/salarios-por-profissao/">O que mudou em 10 anos, por profissão</a> · '
                    '<a class="ligacao" href="/dados-abertos/subgrupos-profissoes.csv">Descarregar os dados (CSV)</a></p></div></section>')
        topo, fundo = subs[0], subs[-1]
        resposta = (f'<p class="lede resposta">Em outubro de {a_sg}, quem trabalhava a tempo completo em empresas privadas e públicas ganhava em média {euro(sgs["linhas"]["T"]["ganho"][-1])} brutos por mês. '
                    f'O subgrupo mais bem pago era o dos {e(minusc(nome_sg(topo[0])))} (<span class="mk">{euro(topo[1]["ganho"])}</span>) e o menos pago o dos '
                    f'{e(minusc(nome_sg(fundo[0])))} ({euro(fundo[1]["ganho"])}).</p>'
                    f'<p class="fonte">Dados atualizados a {data_pt(O["atualizado"])} · {fontes_curtas(["subgrupos"])}</p>')
    corpo = f'''
{migalhas([(None, "Profissões")])[0]}
<section class="sec" style="padding-top:24px"><div class="mold">
<h1 class="h1-pag">Quanto se ganha em cada profissão</h1>
{resposta}
<p class="lede" style="margin-top:20px">Procura a tua profissão: cada página junta o número oficial do subgrupo, a tabela da função pública quando existe e as partilhas de quem trabalha, a partir de 5 pessoas.</p>
<div class="grelha2" style="margin-top:40px">
<div><div class="f" style="max-width:560px"><label for="filtro-prof">Procurar profissão</label>
<input type="search" id="filtro-prof" data-filtro="#lista-prof" data-vazio="#prof-vazio" placeholder="Enfermeiro, programador, caixa…" autocomplete="off"></div>
<p class="vazio" id="prof-vazio" hidden style="margin-top:16px">Não encontrámos essa profissão. <a href="/partilhar/">Partilha o teu salário</a> e escolhe a mais próxima.</p></div>
<table class="tabela"><caption class="vis">Ganho médio por grupo de profissões</caption><thead><tr><th>Grande grupo de profissões ({ano})</th><th class="n">Ganho médio</th></tr></thead><tbody>{linhas}</tbody></table>
</div>
<div id="lista-prof">{"".join(blocos)}</div>
{fonte("grupos")}
</div></section>
{tab_sg}'''
    ld = [migalhas([('/profissoes/', 'Profissões')])[1]]
    if subs:
        ld.append(dataset_subgrupos())
    pagina('/profissoes/', 'Salários por profissão em Portugal',
           (f'Ganho médio de {len(subs)} subgrupos de profissões em {a_sg}, do que mais ganha ao que menos ganha, '
            f'e {len(CAT["profissoes"])} profissões com dados oficiais e partilhas anónimas.') if subs else
           f'Quanto se ganha em Portugal em cada profissão: ganho médio mensal por grupo de profissões ({ano}) e partilhas anónimas.',
           corpo, prioridade=0.9, ld=ld, og='/og/profissoes.png')
    for p in CAT['profissoes']:
        pagina_profissao(p, por_sg[p['subgrupo']], por_g[p['grupo']])


def dataset_subgrupos():
    sgs = O['subgrupos']
    return {'@type': 'Dataset', 'name': f'Salários por subgrupo de profissões em Portugal, {sgs["anos"][0]}–{sgs["ano"]}',
            'description': 'Ganho médio mensal, remuneração base média e número de trabalhadores por conta de outrem em cada subgrupo da '
                           'Classificação Portuguesa das Profissões (CPP/2010, 2 dígitos), Continente, a partir dos Quadros de Pessoal (DGCP/MTSSS).',
            'url': DOMINIO + '/dados/', 'inLanguage': 'pt-PT', 'creator': {'@id': DOMINIO + '/#org'}, 'isAccessibleForFree': True,
            'license': 'https://creativecommons.org/licenses/by/4.0/', 'spatialCoverage': 'Portugal Continental',
            'temporalCoverage': f'{sgs["anos"][0]}/{sgs["ano"]}', 'isBasedOn': O['fontes']['subgrupos']['url'],
            'distribution': [{'@type': 'DataDownload', 'encodingFormat': 'text/csv', 'contentUrl': DOMINIO + '/dados-abertos/subgrupos-profissoes.csv'}]}


def pagina_profissao(p, irmas_sg, irmas_g):
    g = O['grupos'].get(p['grupo']) or {}
    nome = p['nome']
    titulo_h1 = f'Quanto ganha {artigo(nome)} {minusc(nome)}?'
    ano = g.get('ano') or grupos_ano()
    sg = dados_sg(p['subgrupo'])
    a_sg = (O.get('subgrupos') or {}).get('ano')
    fpd = fp_da_profissao(p['id'])
    idx = bool(indexavel(p))
    fontes_usadas = []
    recibo_sg = ''
    if sg:
        fontes_usadas.append('subgrupos')
        sobe = 100 * (sg['ganho'] / sg['ganho0'] - 1) if sg['ganho0'] else None
        tot = (O['subgrupos']['linhas'].get('T') or {}).get('ganho') or [None]
        sobe_t = 100 * (tot[-1] / tot[0] - 1) if tot[0] else None
        anos = O['subgrupos']['anos']
        mx = max(v for v in sg['serie'] if v) or 1
        barras = ''.join(f'<div class="barra-h{" pt" if i == len(anos) - 1 else ""}"><span>{a}</span><i style="--w:{round(100 * v / mx, 1)}%"></i><b>{euro(v)}</b></div>'
                         for i, (a, v) in enumerate(zip(anos, sg['serie'])) if v)
        recibo_sg = (f'<div class="recibo" style="margin-top:40px"><h2 class="recibo-t">Subgrupo «{e(nome_sg(p["subgrupo"]))}»</h2>'
                     f'<div class="linha"><span class="r">Ganho médio ({a_sg})</span><span class="p"></span><span class="v">{euro(sg["ganho"])}</span></div>'
                     f'<div class="linha"><span class="r">Remuneração base média</span><span class="p"></span><span class="v">{euro(sg["base"])}</span></div>'
                     f'<div class="linha"><span class="r">Média de todas as profissões</span><span class="p"></span><span class="v">{euro(tot[-1])}</span></div>'
                     f'<div class="linha"><span class="r">Trabalhadores no subgrupo</span><span class="p"></span><span class="v">{milhares(sg["tco"])}</span></div>'
                     + (f'<div class="linha"><span class="r">Subida desde {anos[0]}</span><span class="p"></span><span class="v">{"+" if sobe >= 0 else ""}{pct(sobe)}</span></div>' if sobe is not None else '')
                     + f'<p class="fonte">Continente, outubro de cada ano, quem trabalha a tempo completo no setor privado e no setor empresarial do Estado. '
                       f'De {anos[0]} a {a_sg}, a média de todas as profissões subiu {pct(sobe_t)}. Os números são do subgrupo inteiro, iguais para todas as profissões que o compõem.</p></div>'
                     f'<h2 class="h2-pag" style="margin-top:56px">Ganho médio do subgrupo, {anos[0]} a {a_sg}</h2>'
                     f'<div class="barras-h" style="margin-top:24px">{barras}</div>'
                     + fonte('subgrupos'))
    publico = ''
    if fpd:
        x, mn, mx_, ambito = fpd
        fontes_usadas.append('tru')
        publico = (f'<div class="recibo" style="margin-top:40px"><h2 class="recibo-t">Na função pública, {O["funcao_publica"]["ano"]}</h2>'
                   f'<div class="linha"><span class="r">Primeira posição</span><span class="p"></span><span class="v">{euro(mn, 2)}</span></div>'
                   f'<div class="linha"><span class="r">Topo</span><span class="p"></span><span class="v">{euro(mx_, 2)}</span></div>'
                   f'<p class="fonte"><a href="/funcao-publica/{x["id"]}/">{e(x["titulo"])}: tabela completa de {O["funcao_publica"]["ano"]}, com o líquido</a>. '
                   f'Remuneração base, sem suplementos.</p></div>')
    elif p['grupo'] == '0':
        publico = '<p class="lede" style="margin-top:20px">As Forças Armadas não entram nos Quadros de Pessoal. O salário de cada posto está na <a href="/funcao-publica/militares/">tabela dos militares</a>.</p>'
    reg = g.get('regioes') or {}
    tab_reg = ''
    if reg:
        filas = ''.join(f'<tr><td>{e(O["nuts2"].get(r, r))}</td><td class="n">{euro(reg[r])}</td></tr>' for r in sorted((r for r in reg if r != 'PT'), key=lambda r: -reg[r]))
        tab_reg = (f'<h2 class="h2-pag" style="margin-top:56px">O grande grupo em cada região</h2>'
                   f'<p class="dica" style="margin-top:12px">«{e(GC[p["grupo"]])}», ganho médio mensal, {ano}. É o único corte oficial por região: junta mais profissões do que o subgrupo.</p>'
                   f'<table class="tabela" style="margin-top:20px"><thead><tr><th>Região</th><th class="n">Ganho médio</th></tr></thead><tbody>{filas}</tbody></table>'
                   + fonte('grupos', 'Pelo local de trabalho.'))
    outras_sg = ''.join(f'<li><a href="/profissoes/{x["id"]}/">{e(x["nome"])}</a></li>' for x in sorted(irmas_sg, key=lambda x: x['nome']) if x['id'] != p['id'])
    outras_g = ''.join(f'<li><a href="/profissoes/{x["id"]}/">{e(x["nome"])}</a></li>' for x in sorted(irmas_g, key=lambda x: x['nome'])
                       if x['id'] != p['id'] and x['subgrupo'] != p['subgrupo'])
    comunidade = (f'<!--comunidade--><div><h2 class="h2-pag">Na comunidade ganhas.pt</h2>'
                  f'<div data-comunidade="profissao={p["id"]}" style="margin-top:20px"><p class="lede">Ainda não há 5 pessoas desta profissão a partilhar o salário. '
                  f'Mostramos a mediana, o intervalo e o número de respostas a partir de 5 pessoas diferentes, também por distrito.</p></div>'
                  f'<p style="margin-top:28px;display:flex;flex-wrap:wrap;gap:12px"><a class="botao" href="/partilhar/?p={p["id"]}">Partilhar o meu salário</a>'
                  f'<a class="botao sec2" href="/calculadora/">Calcular o líquido</a></p></div><!--/comunidade-->')
    corpo = f'''
{migalhas([("/profissoes/", "Profissões"), (None, nome)])[0]}
<section class="sec" style="padding-top:24px"><div class="mold grelha2">
<div>
<h1 class="h1-pag h1-media">{e(titulo_h1)}</h1>
<!--resposta--><p class="lede resposta" style="margin-top:20px">{resposta_profissao(p, sg, fpd)}</p><!--/resposta-->
<p class="fonte">Dados atualizados a {data_pt(O["atualizado"])} · {fontes_curtas(fontes_usadas or ["grupos"])} · <a href="/metodo/">método</a></p>
{recibo_sg}
{publico}
{tab_reg}
</div>
{comunidade}
</div></section>
<section class="sec"><div class="mold">
{('<h2 class="h2-pag">No mesmo subgrupo</h2><p class="dica" style="margin-top:12px">Têm os mesmos números oficiais do subgrupo; mudam a função pública e as partilhas.</p><ul class="lista-colunas" style="margin-top:24px">' + outras_sg + '</ul>') if outras_sg else ''}
{('<h2 class="h2-pag" style="margin-top:64px">No mesmo grande grupo</h2><ul class="lista-colunas" style="margin-top:24px">' + outras_g + '</ul>') if outras_g else ''}
<p style="margin-top:40px"><a class="ligacao" href="/profissoes/">Todas as profissões</a> · <a class="ligacao" href="/estudos/salarios-por-profissao/">O que mudou em 10 anos</a></p>
</div></section>'''
    ld = [migalhas([('/profissoes/', 'Profissões'), (f'/profissoes/{p["id"]}/', nome)])[1]]
    salarios = []
    if fpd:
        salarios.append({'@type': 'MonetaryAmount', 'name': f'função pública, {O["funcao_publica"]["ano"]} (DGAEP)', 'currency': 'EUR',
                         'value': {'@type': 'QuantitativeValue', 'minValue': round(fpd[1], 2), 'maxValue': round(fpd[2], 2), 'unitText': 'MONTH'}})
    if sg:
        salarios.append({'@type': 'MonetaryAmount', 'name': f'ganho médio do subgrupo «{nome_sg(p["subgrupo"])}», setor privado, {a_sg} (DGCP/MTSSS)',
                         'currency': 'EUR', 'value': {'@type': 'QuantitativeValue', 'value': round(sg['ganho'], 2), 'unitText': 'MONTH'}})
    if salarios:
        ld.append({'@type': 'Occupation', 'name': nome, 'occupationalCategory': f'CPP {p["cpp"]}',
                   'occupationLocation': {'@type': 'Country', 'name': 'Portugal'}, 'estimatedSalary': salarios})
    if fpd and sg:
        desc = (f'Quanto ganha {artigo(nome)} {minusc(nome)}: de {euro(fpd[1])} a {euro(fpd[2])} brutos na função pública ({O["funcao_publica"]["ano"]}) '
                f'e {euro(sg["ganho"])} de média nas empresas ({a_sg}). Partilhas anónimas.')
    elif fpd:
        desc = f'Quanto ganha {artigo(nome)} {minusc(nome)} em {O["funcao_publica"]["ano"]}: de {euro(fpd[1])} a {euro(fpd[2])} brutos por mês, posto a posto, com o líquido.'
    elif sg:
        desc = (f'Quanto ganha {artigo(nome)} {minusc(nome)} em Portugal: {euro(sg["ganho"])} brutos de média no subgrupo ({a_sg}), '
                f'evolução desde {O["subgrupos"]["anos"][0]} e partilhas anónimas.')
    else:
        desc = f'Quanto ganha {artigo(nome)} {minusc(nome)} em Portugal: dados oficiais e partilhas anónimas.'
    titulo = f'Quanto ganha {artigo(nome)} {minusc(nome)} em Portugal'
    if len(titulo) > 60:  # o Google corta perto dos 60 caracteres: sai o «em Portugal», que já está na descrição
        titulo = f'Quanto ganha {artigo(nome)} {minusc(nome)}'
    pagina(f'/profissoes/{p["id"]}/', titulo, desc, corpo, ld=ld, prioridade=0.7,
           og='/og/profissoes.png', indexar=idx)


# ---------------------------------------------------------------- concelhos

# artigo dos concelhos que o levam («no Porto», «na Amadora», «nos Arcos de Valdevez», «nas Caldas da Rainha»)
CONC_ARTIGO = {
    'o': ['Porto', 'Barreiro', 'Seixal', 'Montijo', 'Cartaxo', 'Entroncamento', 'Bombarral', 'Cadaval', 'Crato', 'Gavião', 'Redondo',
          'Alandroal', 'Sabugal', 'Fundão', 'Funchal', 'Corvo', 'Nordeste', 'Marco de Canaveses', 'Porto Moniz', 'Porto Santo',
          'Sardoal', 'Peso da Régua', 'Carregal do Sal', 'Sobral de Monte Agraço'],
    'a': ['Amadora', 'Moita', 'Nazaré', 'Golegã', 'Lourinhã', 'Batalha', 'Figueira da Foz', 'Figueira de Castelo Rodrigo', 'Guarda', 'Maia',
          'Mealhada', 'Covilhã', 'Trofa', 'Póvoa de Varzim', 'Póvoa de Lanhoso', 'Ribeira Grande', 'Ribeira Brava', 'Ribeira de Pena',
          'Horta', 'Lousã', 'Murtosa', 'Sertã', 'Chamusca', 'Azambuja', 'Mêda', 'Pampilhosa da Serra', 'Ponta do Sol',
          'Calheta (R.A.A.)', 'Calheta (R.A.M.)', 'Marinha Grande', 'Madalena', 'Povoação', 'Castanheira de Pêra', 'Vidigueira',
          'Vila da Praia da Vitória'],
    'os': ['Arcos de Valdevez'],
    'as': ['Caldas da Rainha', 'Lajes das Flores', 'Lajes do Pico', 'Velas'],
}
_ART = {n: a for a, ns in CONC_ARTIGO.items() for n in ns}


def no(nome):
    """«em Lisboa», «no Porto», «na Amadora»."""
    a = _ART.get(nome)
    return {'o': 'no', 'a': 'na', 'os': 'nos', 'as': 'nas'}[a] + ' ' + nome if a else 'em ' + nome


def do(nome):
    a = _ART.get(nome)
    return {'o': 'do', 'a': 'da', 'os': 'dos', 'as': 'das'}[a] + ' ' + nome if a else 'de ' + nome


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
           corpo, prioridade=0.9, og='/og/concelhos.png', ld=[migalhas([('/concelhos/', 'Concelhos')])[1], {
               '@type': 'Dataset', 'name': f'Ganho médio mensal nos 308 concelhos de Portugal ({ano})',
               'description': 'Ganho médio mensal bruto de quem trabalha por conta de outrem a tempo completo, pelo concelho do local de trabalho, total e por grande grupo de profissões (INE e GEP/MTSSS, Quadros de Pessoal).',
               'url': DOMINIO + '/dados/', 'inLanguage': 'pt-PT', 'creator': {'@id': DOMINIO + '/#org'}, 'isAccessibleForFree': True,
               'license': 'https://creativecommons.org/licenses/by/4.0/', 'spatialCoverage': 'Portugal', 'temporalCoverage': str(ano),
               'isBasedOn': O['fontes']['concelhos']['url'],
               'distribution': [{'@type': 'DataDownload', 'encodingFormat': 'text/csv', 'contentUrl': DOMINIO + '/dados-abertos/concelhos.csv'}]}])
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
            tab_g = (f'<section class="sec"><div class="mold"><h2 class="h2-pag">Por grupo de profissões {e(no(c["nome"]))}</h2>'
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
<div><h1 class="h1-pag h1-media">Salário médio {e(no(c["nome"]))}</h1>
<p class="lede resposta" style="margin-top:20px">Em {ano}, quem trabalhava a tempo completo {e(no(c["nome"]))} ganhava em média <span class="mk">{euro(c["ganho_medio"])}</span> brutos por mês: {c["pos"]}.º de 308 concelhos, {euro(abs(dif))} {"acima" if dif > 0 else "abaixo"} da média nacional ({euro(med_nac)}). Contam todas as pessoas que trabalham no concelho, vivam onde viverem.</p>
{fonte("concelhos", f"Pelo local de trabalho, não pela residência. Não inclui a Administração Pública. Dados atualizados a {data_pt(O['atualizado'])}.")}</div>
<div class="recibo"><h2 class="recibo-t">{e(c["nome"])}, {ano}</h2>
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
        pagina(f'/concelhos/{c["id"]}/', f'Salário médio {no(c["nome"])} ({ano})',
               f'{no(c["nome"])[:1].upper() + no(c["nome"])[1:]}, o ganho médio mensal bruto era {euro(c["ganho_medio"])} em {ano} ({c["pos"]}.º de 308 concelhos). Por grupo de profissões e comparado com o país.',
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
    formacao = re.compile(r'cadete|aluno|aspirante|estagi|instrução|tirocin|\bformação|pré-carreira|interno', re.I)  # «\b»: «informação» não é formação
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
           corpo, prioridade=0.8, og='/og/funcao-publica.png', ld=[migalhas([('/funcao-publica/', 'Função pública')])[1], {
               '@type': 'Dataset', 'name': f'Remuneração das carreiras da função pública em {fp["ano"]}',
               'description': 'Remuneração base mensal de cada categoria e posição das carreiras da Administração Pública, com a Tabela Remuneratória Única (DGAEP).',
               'url': DOMINIO + '/dados/', 'inLanguage': 'pt-PT', 'creator': {'@id': DOMINIO + '/#org'}, 'isAccessibleForFree': True,
               'license': 'https://creativecommons.org/licenses/by/4.0/', 'spatialCoverage': 'Portugal', 'temporalCoverage': str(fp['ano']),
               'isBasedOn': O['fontes']['tru']['url'],
               'distribution': [{'@type': 'DataDownload', 'encodingFormat': 'text/csv', 'contentUrl': DOMINIO + f'/dados-abertos/funcao-publica-{fp["ano"]}.csv'}]}])
    for x in por.values():
        pagina_carreira(x, fp)


def profs_da_carreira(cid):
    """Ligação de volta às páginas de profissão que usam esta carreira (público e empresas lado a lado)."""
    ps = [p for p in CAT['profissoes'] if PROF_FP.get(p['id']) == cid]
    if not ps:
        return ''
    return ('<p class="espaco">Público e empresas lado a lado, com as partilhas de quem trabalha: ' +
            ', '.join(f'<a href="/profissoes/{p["id"]}/">quanto ganha {artigo(p["nome"])} {e(minusc(p["nome"]))}</a>' for p in ps) + '.</p>')


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
        nivel = 'h3' if sub_atual else 'h2 class="h3-pag"'  # sem subgrupo por cima, a categoria é o 2.º nível
        blocos.append(f'<div class="entra" style="margin-top:40px"><{nivel}>{e(c["nome"])}</{nivel.split()[0]}><div class="rolar"><table class="tabela" style="margin-top:16px"><thead><tr>'
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
{profs_da_carreira(x["id"])}
</div></section>'''
    titulo = f'Quanto ganha {x["quem"]} em {fp["ano"]}' if x['quem'] else f'{x["titulo"]}: salários na função pública em {fp["ano"]}'
    if x['id'] in set(PROF_FP.values()):
        # a página da profissão já responde a «quanto ganha um …»; esta fica com a «tabela salarial» (sem canibalizar)
        titulo = f'{x["titulo"]}: tabela salarial {fp["ano"]}' + (' na função pública' if x['id'] in PUBLICO_E_PRIVADO else '')
        if len(titulo) > 60:
            titulo = f'{x["titulo"]}: tabela salarial {fp["ano"]}'
    if len(titulo) > 60:
        titulo = f'{x["titulo"]}: salários em {fp["ano"]}'
    desc = (f'{x["titulo"]}: salário bruto e líquido de cada categoria e posição em {fp["ano"]}, de {euro(x["min"])} a {euro(x["max"])} por mês. Dados oficiais da DGAEP.'
            if x['min'] else f'{x["titulo"]}: remuneração de cada categoria em {fp["ano"]}, com dados oficiais da DGAEP.')
    pagina(f'/funcao-publica/{x["id"]}/', titulo, desc, corpo, prioridade=0.6, og='/og/funcao-publica.png',
           ld=[migalhas([('/funcao-publica/', 'Função pública'), (f'/funcao-publica/{x["id"]}/', x['titulo'])])[1]])


# ---------------------------------------------------------------- estudo: salários por profissão em 10 anos
# Tudo calculado a partir dos quadros 19, 28 e 40 da série dos Quadros de Pessoal (DGCP/MTSSS). Muda sozinho
# quando sai um ano novo: os textos dizem «subiu/desceu», «estreitou/alargou» conforme os números.
SMN_OUTUBRO = {2014: (505, 'Decreto-Lei n.º 144/2014'), 2024: (820, 'Decreto-Lei n.º 107/2023')}


def estudo_profissoes():
    sgs = O.get('subgrupos')
    if not sgs:
        return
    a0, a1 = sgs['anos'][0], sgs['ano']
    T = sgs['linhas']['T']
    subs = {k: v for k, v in sgs['linhas'].items() if len(k) == 2 and v['ganho'][-1] and v['ganho'][0]}
    media, media0 = T['ganho'][-1], T['ganho'][0]
    sobe_t = 100 * (media / media0 - 1)
    ordem = sorted(subs, key=lambda k: -subs[k]['ganho'][-1])
    topo, fundo = ordem[0], ordem[-1]
    razao = subs[topo]['ganho'][-1] / subs[fundo]['ganho'][-1]
    o0 = sorted(subs, key=lambda k: -subs[k]['ganho'][0])
    razao0 = subs[o0[0]]['ganho'][0] / subs[o0[-1]]['ganho'][0]
    abaixo = sum(v['tco'][-1] or 0 for v in subs.values() if v['ganho'][-1] < media)
    p_abaixo = 100 * abaixo / T['tco'][-1]
    sobe = {k: 100 * (v['ganho'][-1] / v['ganho'][0] - 1) for k, v in subs.items()}
    mais = sorted(subs, key=lambda k: -sobe[k])[:5]
    menos = sorted(subs, key=lambda k: sobe[k])[:5]
    extra = {k: 100 * (1 - v['base'][-1] / v['ganho'][-1]) for k, v in subs.items() if v['base'][-1]}
    ex_mais = sorted(extra, key=lambda k: -extra[k])[:5]
    ex_menos = sorted(extra, key=lambda k: extra[k])[:3]
    mediana = (O.get('distribuicao') or {}).get('ganho', {}).get('mediana') if (O.get('distribuicao') or {}).get('ano') == a1 else None
    baixos0, altos0 = o0[-10:], o0[:10]  # os 10 subgrupos que menos e mais ganhavam no 1.º ano
    sobe_baixos = sum(sobe[k] for k in baixos0) / len(baixos0)
    sobe_altos = sum(sobe[k] for k in altos0) / len(altos0)
    fracoes = {75: 'Três em cada quatro', 67: 'Dois em cada três', 50: 'Metade', 80: 'Quatro em cada cinco', 60: 'Três em cada cinco'}
    perto = min(fracoes, key=lambda f: abs(f - p_abaixo))
    tit_abaixo = (f'{fracoes[perto]} trabalham abaixo da média' if abs(perto - p_abaixo) <= 2.5 else f'{pct(p_abaixo)} trabalham abaixo da média')
    smn0, smn1 = SMN_OUTUBRO.get(a0), SMN_OUTUBRO.get(a1)

    def lst(ks, f):
        return '<ul class="lista-colunas" style="margin-top:20px;columns:1">' + ''.join(
            f'<li><span>{sg_link(k)}</span><span class="cifra">{f(k)}</span></li>' for k in ks) + '</ul>'

    def sg_link(k):
        rep = REPRESENTA.get(k)
        return f'<a href="/profissoes/{rep}/">{e(nome_sg(k))}</a>' if rep else f'<span style="font-weight:600">{e(nome_sg(k))}</span>'

    resposta = (f'Em outubro de {a1}, quem trabalhava a tempo completo em empresas privadas e públicas ganhava em média {euro(media)} brutos por mês, '
                f'{pct(abs(sobe_t), 1)} {"mais" if sobe_t >= 0 else "menos"} do que em {a0}. Mas {pct(p_abaixo)} dos trabalhadores estavam em '
                f'subgrupos de profissões com ganho médio abaixo desse valor, e o subgrupo mais bem pago ganhava {str(round(razao, 1)).replace(".", ",")} vezes '
                f'o menos pago.')
    tabela = tabela_html(  # poucas colunas, para caber no telemóvel; o resto está no CSV
        ['Subgrupo de profissões', f'Ganho {a1}', f'Desde {a0}', 'Trabalhadores'],
        [[sg_link(k), euro(subs[k]['ganho'][-1]), ('+' if sobe[k] >= 0 else '') + pct(sobe[k], 1), milhares(subs[k]['tco'][-1])] for k in ordem],
        f'Ganho médio mensal por subgrupo de profissões, {a1}, e variação desde {a0}')
    corpo = f'''
{migalhas([("/profissoes/", "Profissões"), (None, "Estudo: salários por profissão")])[0]}
<section class="sec" style="padding-top:24px"><div class="mold texto">
<p class="fonte" style="margin-top:0">Estudo ganhas.pt · edição de {data_pt(sgs.get("entrou") or O["atualizado"])} · dados de outubro de {a1}</p>
<h1>Salários por profissão em Portugal: o que mudou de {a0} a {a1}</h1>
<p class="lede resposta">{resposta}</p>
<p class="fonte">{fontes_curtas(["subgrupos"])} Cálculos do ganhas.pt. Valores nominais (sem descontar a inflação). Dados atualizados a {data_pt(O["atualizado"])}.</p>

<h2>{tit_abaixo}</h2>
<p>A média é puxada para cima pelos salários mais altos. Em {a1}, {milhares(abaixo)} dos {milhares(T["tco"][-1])} trabalhadores por conta de outrem
({pct(p_abaixo)}) estavam em subgrupos cujo ganho médio ficava abaixo dos {euro(media)}.{f" O salário do meio, a mediana, era {euro(mediana)}." if mediana else ""}
Só {sum(1 for k in subs if subs[k]["ganho"][-1] >= media)} dos {len(subs)} subgrupos ficavam acima da média.</p>

<h2>{"Quem ganhava menos subiu mais" if sobe_baixos > sobe_altos else "Quem ganhava mais subiu mais"}</h2>
<p>De {a0} a {a1}, o ganho médio de todas as profissões subiu {pct(sobe_t, 1)}.{f" No mesmo período, o salário mínimo passou de {euro(smn0[0])} ({smn0[1]}) para {euro(smn1[0])} ({smn1[1]}), mais {pct(100 * (smn1[0] / smn0[0] - 1), 1)}." if smn0 and smn1 else ""}
Os 10 subgrupos que menos ganhavam em {a0} subiram em média {pct(sobe_baixos, 1)}; os 10 que mais ganhavam, {pct(sobe_altos, 1)}.
As maiores subidas:</p>
{lst(mais, lambda k: "+" + pct(sobe[k], 1))}
<p style="margin-top:24px">E as mais pequenas:</p>
{lst(menos, lambda k: ("+" if sobe[k] >= 0 else "") + pct(sobe[k], 1))}
<p style="margin-top:24px">A distância entre o topo e o fundo {"estreitou" if razao < razao0 else "alargou"}: em {a0}, o subgrupo mais bem pago ganhava
{str(round(razao0, 1)).replace(".", ",")} vezes o menos pago; em {a1}, {str(round(razao, 1)).replace(".", ",")} vezes
({e(minusc(nome_sg(topo)))}, {euro(subs[topo]["ganho"][-1])}, contra {e(minusc(nome_sg(fundo)))}, {euro(subs[fundo]["ganho"][-1])}).</p>

<h2>Onde os extras pesam mais</h2>
<p>O ganho junta à remuneração base os subsídios regulares, prémios e horas extra do mês. A diferença entre os dois mostra quem depende mais
do que não está no salário base:</p>
{lst(ex_mais, lambda k: pct(extra[k]) + " do ganho")}
<p style="margin-top:24px">No outro extremo, com quase tudo no salário base: {", ".join(f"{e(minusc(nome_sg(k)))} ({pct(extra[k])})" for k in ex_menos)}.</p>

<h2>Os {len(subs)} subgrupos, lado a lado</h2>
</div>
<div class="mold" style="margin-top:24px">{tabela}
<p class="dica" style="margin-top:12px">«Trabalhadores»: todos os trabalhadores por conta de outrem do subgrupo, incluindo a tempo parcial. A remuneração base e todos os anos estão no CSV.</p>
{fonte("subgrupos")}
<p class="espaco"><a class="botao" href="/dados-abertos/subgrupos-profissoes.csv">Descarregar os dados (CSV, {a0} a {a1})</a></p></div>
<div class="mold texto" style="margin-top:64px">
<h2>Como foi feito</h2>
<ul>
<li><strong>Fonte:</strong> <a href="{e(O["fontes"]["subgrupos"]["url"])}" rel="noopener">{e(O["fontes"]["subgrupos"]["nome"])}</a>, a partir dos Quadros de Pessoal que as empresas entregam todos os anos ao Ministério do Trabalho.</li>
<li><strong>Quem conta:</strong> trabalhadores por conta de outrem a tempo completo com remuneração completa em outubro, no {e(sgs["ambito"])}, no setor privado e no setor empresarial do Estado. A Administração Pública não entra: os salários do Estado estão na <a href="/funcao-publica/">tabela de cada carreira</a>.</li>
<li><strong>Profissões:</strong> os {len(subs)} subgrupos da Classificação Portuguesa das Profissões (CPP/2010, 2 dígitos). Não há números oficiais publicados por profissão mais fina.</li>
<li><strong>O que não diz:</strong> são médias, não medianas; valores nominais, sem descontar a inflação; não separa homens e mulheres nem anos de experiência.</li>
<li><strong>Como citar:</strong> «Fonte: DGCP/MTSSS, Quadros de Pessoal; cálculos do ganhas.pt», com ligação para esta página.</li>
</ul>
</div></section>'''
    ld = [migalhas([('/profissoes/', 'Profissões'), ('/estudos/salarios-por-profissao/', 'Estudo: salários por profissão')])[1],
          {'@type': 'Article', 'headline': f'Salários por profissão em Portugal: o que mudou de {a0} a {a1}', 'inLanguage': 'pt-PT',
           'datePublished': sgs.get('entrou') or O['atualizado'], 'dateModified': O['atualizado'],
           'author': {'@id': DOMINIO + '/#org'}, 'publisher': {'@id': DOMINIO + '/#org'},
           'mainEntityOfPage': DOMINIO + '/estudos/salarios-por-profissao/', 'image': DOMINIO + '/og/profissoes.png',
           'isBasedOn': O['fontes']['subgrupos']['url']},
          dataset_subgrupos()]
    pagina('/estudos/salarios-por-profissao/', f'Salários por profissão em Portugal: {a0} a {a1}',
           f'{pct(p_abaixo)} dos trabalhadores estão em profissões com ganho médio abaixo dos {euro(media)}. Os {len(subs)} subgrupos, de {a0} a {a1}, com dados oficiais.',
           corpo, ld=ld, prioridade=0.8, og='/og/profissoes.png')


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
<p>Números à medida, cruzamentos e gráficos prontos a publicar. Podes sempre usar os números do site com uma ligação para a página de onde vieram.
O estudo mais recente: <a href="/estudos/salarios-por-profissao/">10 anos de salários por profissão</a>.</p></div>
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
<div class="entra"><h3>Nunca uma pessoa</h3><p>Só agregados, com pelo menos 5 pessoas diferentes por número, publicados 24 horas depois e arredondados (a 50 € abaixo de 10 pessoas). Um recorte pequeno, como uma profissão num distrito, só aparece se o resto também tiver 5 ou mais.</p></div>
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
           'funcao_publica': O.get('funcao_publica'), 'subgrupos_profissoes': O.get('subgrupos'), 'atualizado': O['atualizado']}
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
    sgs = O.get('subgrupos')
    if sgs:
        with open(os.path.join(SAIDA, 'dados-abertos', 'subgrupos-profissoes.csv'), 'w', encoding='utf-8') as f:
            f.write('cpp_2digitos;subgrupo;ano;ganho_medio_eur;remuneracao_base_media_eur;trabalhadores_por_conta_de_outrem;ambito\n')
            for k in sorted((k for k in sgs['linhas'] if len(k) == 2), key=int):
                v = sgs['linhas'][k]
                for i, a in enumerate(sgs['anos']):
                    f.write(f'{k};{nome_sg(k)};{a};{v["ganho"][i] if v["ganho"][i] is not None else ""};'
                            f'{v["base"][i] if v["base"][i] is not None else ""};{v["tco"][i] if v["tco"][i] is not None else ""};{sgs["ambito"]}\n')
    corpo = f'''
{migalhas([(None, "Dados abertos")])[0]}
<section class="sec" style="padding-top:24px"><div class="mold texto">
<h1>Dados abertos</h1>
<p class="lede">Os números oficiais que usamos, já tratados e prontos a usar. Cada ficheiro indica a fonte original.</p>
<ul>
<li><a href="/dados-abertos/ganhas-oficial.json">ganhas-oficial.json</a>: distribuição nacional, grupos de profissões, concelhos e função pública.</li>
<li><a href="/dados-abertos/concelhos.csv">concelhos.csv</a>: ganho médio dos 308 concelhos, total e por grupo de profissões ({O["concelhos_ano"]}).</li>
<li><a href="/dados-abertos/funcao-publica-{O["funcao_publica"]["ano"]}.csv">funcao-publica-{O["funcao_publica"]["ano"]}.csv</a>: remuneração de cada categoria e posição das carreiras da função pública ({O["funcao_publica"]["ano"]}).</li>
{f'<li><a href="/dados-abertos/subgrupos-profissoes.csv">subgrupos-profissoes.csv</a>: ganho médio, remuneração base média e trabalhadores de cada subgrupo de profissões (CPP, 2 dígitos), {sgs["anos"][0]} a {sgs["ano"]}, {sgs["ambito"]} (DGCP/MTSSS).</li>' if sgs else ''}
</ul>
<p class="fonte">Dados atualizados a {data_pt(O["atualizado"])}.</p>
<p>Podes reutilizar estes ficheiros, também para fins comerciais, desde que indiques a fonte original (INE, GEP/MTSSS e DGCP/MTSSS, DGAEP) e o ganhas.pt
(<a href="https://creativecommons.org/licenses/by/4.0/deed.pt" rel="noopener">licença CC BY 4.0</a>).</p>
<p>Os dados da comunidade (partilhas) não são publicados em bruto. Para estatísticas agregadas, vê a página <a href="/para-empresas/">Para empresas e jornalistas</a>.</p>
</div></section>'''
    ld = [{'@type': 'Dataset', 'name': 'Salários em Portugal (dados oficiais tratados)', 'description': 'Ganho mensal por concelho, por grupo de profissões e distribuição nacional, com base no INE e no GEP/MTSSS.',
           'url': DOMINIO + '/dados/', 'inLanguage': 'pt-PT', 'creator': {'@id': DOMINIO + '/#org'}, 'isAccessibleForFree': True,
           'spatialCoverage': 'Portugal', 'distribution': [
               {'@type': 'DataDownload', 'encodingFormat': 'application/json', 'contentUrl': DOMINIO + '/dados-abertos/ganhas-oficial.json'},
               {'@type': 'DataDownload', 'encodingFormat': 'text/csv', 'contentUrl': DOMINIO + '/dados-abertos/concelhos.csv'},
               {'@type': 'DataDownload', 'encodingFormat': 'text/csv', 'contentUrl': DOMINIO + f'/dados-abertos/funcao-publica-{O["funcao_publica"]["ano"]}.csv'}]
               + ([{'@type': 'DataDownload', 'encodingFormat': 'text/csv', 'contentUrl': DOMINIO + '/dados-abertos/subgrupos-profissoes.csv'}] if O.get('subgrupos') else []),
           'dateModified': O['atualizado'],
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
    # chave do IndexNow (servidor/indexnow-sites.py avisa o Bing das páginas novas ou mudadas)
    with open(os.path.join(SAIDA, '442644c16cf8fc26416691d7b34ead8e.txt'), 'w') as f:
        f.write('442644c16cf8fc26416691d7b34ead8e')
    with open(os.path.join(SAIDA, 'robots.txt'), 'w') as f:
        f.write('User-agent: *\nAllow: /\nDisallow: /api/\n\n'
                '# Recolha automática dos dados não é permitida (ver /termos/)\n'
                'User-agent: CCBot\nDisallow: /\n\nSitemap: https://ganhas.pt/sitemap.xml\nSitemap: https://ganhas.pt/sitemap-empresas.xml\n'
                'Sitemap: https://ganhas.pt/sitemap-comunidade.xml\n')
    datas = datas_de_mudanca()
    urls = ''.join(f'<url><loc>{DOMINIO}{c}</loc><lastmod>{datas.get(c, HOJE)}</lastmod></url>' for c, p in sorted(PAGINAS))
    with open(os.path.join(SAIDA, 'sitemap.xml'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls + '</urlset>\n')
    with open(os.path.join(SAIDA, 'manifest.webmanifest'), 'w', encoding='utf-8') as f:
        json.dump({'name': 'ganhas.pt', 'short_name': 'ganhas', 'lang': 'pt-PT', 'start_url': '/', 'display': 'standalone',
                   'background_color': '#F7F7F2', 'theme_color': '#F7F7F2',
                   'icons': [{'src': '/icone-192.png', 'sizes': '192x192', 'type': 'image/png'},
                             {'src': '/icone-512.png', 'sizes': '512x512', 'type': 'image/png'}]}, f, ensure_ascii=False)
    llms()


def datas_de_mudanca():
    """lastmod verdadeiro: a data em que o conteúdo de cada página mudou (título, descrição e <main>), guardada em
    ganhas/dados/paginas.json. Antes, todas as páginas diziam «hoje» a cada geração e o Google deixa de confiar nisso."""
    fe = os.path.join(AQUI, 'dados', 'paginas.json')
    try:
        antes = json.load(open(fe, encoding='utf-8'))
    except Exception:  # noqa: BLE001
        antes = {}
    agora = {}
    for c, _ in PAGINAS:
        f = os.path.join(SAIDA, 'index.html') if c == '/' else os.path.join(SAIDA, c.strip('/'), 'index.html')
        t = open(f, encoding='utf-8').read()
        m = re.search(r'<title>.*?</title>', t, re.S)
        parte = (m.group(0) if m else '') + re.search(r'<meta name="description"[^>]*>', t).group(0) + t[t.find('<main'):t.find('</main>')]
        h = hashlib.sha256(parte.encode()).hexdigest()[:16]
        v = antes.get(c)
        agora[c] = [h, v[1] if v and v[0] == h else HOJE]
    if agora != antes:
        with open(fe, 'w', encoding='utf-8') as f:  # uma página por linha, para o histórico do git ler bem
            f.write('{\n' + ',\n'.join(f'{json.dumps(c, ensure_ascii=False)}: {json.dumps(agora[c])}' for c in sorted(agora)) + '\n}\n')
    return {c: v[1] for c, v in agora.items()}


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
    sgs = O.get('subgrupos')
    if sgs:
        T = sgs['linhas']['T']
        subs = sorted(((k, v) for k, v in sgs['linhas'].items() if len(k) == 2 and v['ganho'][-1]), key=lambda kv: -kv[1]['ganho'][-1])
        linhas.append(f'- Ganho médio mensal por subgrupo de profissões (CPP, 2 dígitos), outubro de {sgs["ano"]}, {sgs["ambito"]} (DGCP/MTSSS, Quadros de Pessoal): '
                      f'média {euro(T["ganho"][-1])}; mais alto «{nome_sg(subs[0][0])}» {euro(subs[0][1]["ganho"][-1])}; mais baixo «{nome_sg(subs[-1][0])}» '
                      f'{euro(subs[-1][1]["ganho"][-1])}. Tabela completa em https://ganhas.pt/profissoes/ e CSV em https://ganhas.pt/dados-abertos/subgrupos-profissoes.csv.')
    linhas += ['', '## Páginas', '',
               '- [Comparador de salários](https://ganhas.pt/): onde estás na distribuição dos salários em Portugal.',
               f'- [Calculadora de salário líquido {O["irs"]["ano"]}](https://ganhas.pt/calculadora/): bruto para líquido com as tabelas oficiais de IRS.',
               '- [Salários por profissão](https://ganhas.pt/profissoes/): os subgrupos oficiais e uma página por profissão.',
               '- [Estudo: salários por profissão em 10 anos](https://ganhas.pt/estudos/salarios-por-profissao/)',
               '- [Salários por concelho](https://ganhas.pt/concelhos/)',
               '- [Função pública: todas as carreiras com bruto e líquido](https://ganhas.pt/funcao-publica/)', '- [Portugal e a Europa](https://ganhas.pt/europa/)',
               '- [Método e fontes](https://ganhas.pt/metodo/)', '- [Dados abertos](https://ganhas.pt/dados/)', '',
               '## Regras dos dados da comunidade', '',
               '- Só aparecem números com pelo menos 5 pessoas diferentes, 24 horas depois, arredondados a 50 € abaixo de 10 pessoas e à dezena a partir daí.',
               '- Uma profissão num distrito ou numa empresa só aparece se o resto do conjunto também tiver 0 ou 5 ou mais pessoas (supressão complementar).',
               '- Ao citar, indicar a fonte original e ligar para a página do ganhas.pt.', '']
    with open(os.path.join(SAIDA, 'llms.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(linhas))


# ---------------------------------------------------------------- salário mínimo, salário médio e páginas em inglês
# Pesquisas reais (sugestões do Google, 11/11/2026): «salário mínimo 2026», «ordenado minimo portugal 2027», «salário médio
# portugal», «salary portugal calculator», «net salary portugal», «average salary in portugal», «portugal tax calculator».

def hora_smn(v, horas=40):
    """Valor por hora: (retribuição mensal × 12) / (52 × horas por semana), artigo 271.º do Código do Trabalho."""
    return v * 12 / (52 * horas)


def euro_en(v, casas=0):
    if v is None:
        return '—'
    return '€' + f'{v:,.{casas}f}'


def tabela_html(cab, linhas, legenda=''):
    th = ''.join(f'<th{" class=\"n\"" if i else ""}>{e(c)}</th>' for i, c in enumerate(cab))
    tr = ''.join('<tr>' + ''.join(f'<td{" class=\"n\"" if i else ""}>{c}</td>' for i, c in enumerate(l)) + '</tr>' for l in linhas)
    cap = f'<caption class="vis">{e(legenda)}</caption>' if legenda else ''
    return f'<div class="rolar"><table class="tabela">{cap}<thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div>'


def perguntas_html(perg):
    return ''.join(f'<h3>{e(q)}</h3><p>{r}</p>' for q, r in perg)


def faq_ld(perg):
    return {'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': re.sub(r'<[^>]+>', '', r)}} for q, r in perg]}


def salario_minimo():
    d = O['smn']
    a, v = smn_hoje()
    prox = d.get(str(a + 1))
    liq = liquido_simples(v)
    irs_ano = O['irs']['ano']
    anos = sorted(d, key=int)
    linhas = []
    for i, x in enumerate(anos):
        ant = d[anos[i - 1]] if i else None
        linhas.append([x, euro(d[x]), (('+' + euro(d[x] - ant)) if ant else '—'), euro(d[x] * 14)])
    perg = [
        (f'Qual é o salário mínimo em {a}?', f'O salário mínimo nacional em {a} é de {euro(v)} brutos por mês, pagos 14 vezes por ano ({euro(v * 14)} por ano).'),
        (f'Quanto é o salário mínimo líquido em {a}?', f'Para quem não é casado e não tem dependentes, {euro(liq, 2)} por mês: o salário mínimo não paga retenção de IRS '
         f'e desconta {pct(100 * O["irs"]["ss"])} para a Segurança Social (tabelas de retenção de {irs_ano}).'
         if reter(v) == 0 else f'Para quem não é casado e não tem dependentes, cerca de {euro(liq, 2)} por mês (tabelas de retenção de {irs_ano}).'),
        (f'Quanto é o salário mínimo à hora?', f'Com 40 horas por semana, {euro(hora_smn(v), 2)} por hora: (salário mensal × 12) ÷ (52 × 40), como manda o artigo 271.º do Código do Trabalho.'),
    ]
    if prox:
        perg.append((f'Qual vai ser o salário mínimo em {a + 1}?', f'{euro(prox)} por mês, mais {euro(prox - v)} do que em {a}, segundo o acordo de Concertação Social. '
                     f'Com as tabelas de retenção de {irs_ano}, ficariam {euro(liquido_simples(prox), 2)} líquidos; as tabelas de {a + 1} ainda podem mudar este valor.'))
    corpo = f'''
{migalhas([(None, "Salário mínimo")])[0]}
<section class="sec" style="padding-top:24px"><div class="mold">
<h1 class="h1-pag">Salário mínimo {a}: {euro(v)}</h1>
<p class="lede">Em {a}, o salário mínimo nacional é de <strong>{euro(v)}</strong> brutos por mês, 14 vezes por ano. Líquido, para quem é solteiro e sem dependentes, ficam <strong>{euro(liq, 2)}</strong>.{f" Em {a + 1} passa para {euro(prox)}." if prox else ""}</p>
<p class="acoes" style="margin-top:24px"><a class="botao" href="/calculadora/?bruto={int(v)}">Calcular o meu líquido</a><a class="botao sec2" href="/">Comparar com Portugal</a></p>
</div></section>
<section class="sec"><div class="mold texto">
<h2>Evolução do salário mínimo</h2>
{tabela_html(["Ano", "Por mês", "Aumento", "Por ano (14 meses)"], linhas, "Salário mínimo nacional por ano")}
{fonte("smn")}
<h2>Perguntas</h2>
{perguntas_html(perg)}
<p>Quanto ganham as outras pessoas? Vê o <a href="/salario-medio/">salário médio em Portugal</a>, os <a href="/profissoes/">salários por profissão</a> e por <a href="/concelhos/">concelho</a>.</p>
</div></section>'''
    pagina('/salario-minimo/', f'Salário mínimo {a} em Portugal: {euro(v)} bruto e líquido',
           f'O salário mínimo em {a} é de {euro(v)} brutos ({euro(liq, 2)} líquidos, {euro(hora_smn(v), 2)} à hora).' + (f' Em {a + 1}: {euro(prox)}.' if prox else '') + ' Valores oficiais e evolução.',
           corpo, ld=[migalhas([('/salario-minimo/', 'Salário mínimo')])[1], faq_ld(perg)], prioridade=0.8,
           alternos={'pt': '/salario-minimo/', 'en': '/en/minimum-wage-portugal/'})


REGIOES_EN = {'Grande Lisboa': 'Greater Lisbon', 'Península de Setúbal': 'Setúbal Peninsula', 'Norte': 'North', 'Centro': 'Centre',
              'Oeste e Vale do Tejo': 'Oeste and Tagus Valley', 'Alentejo': 'Alentejo', 'Algarve': 'Algarve',
              'Região Autónoma dos Açores': 'Azores', 'Região Autónoma da Madeira': 'Madeira'}
EDU_EN = {'Inferior ao 1.º ciclo': 'Less than primary school', '1.º ciclo do ensino básico': 'Primary (4 years)', '2.º ciclo do ensino básico': '6 years of school',
          '3.º ciclo do ensino básico': '9 years of school', 'Ensino secundário': 'Secondary school', 'Curso técnico superior profissional': 'Higher technical course',
          'Bacharelato': 'Bachelor (3 years, old system)', 'Licenciatura': "Bachelor's degree", 'Mestrado': "Master's degree", 'Doutoramento': 'PhD'}


def dados_medio():
    sx = O['sexo']
    dist = O['distribuicao']
    reg = [(O['nuts2'].get(k, k), v) for k, v in O['sexo_regioes'].items()]
    reg.sort(key=lambda x: -(x[1]['H'] + x[1]['M']))
    idades = sorted(((k, v) for k, v in O['idades'].items() if k != 'Desconhecido'), key=lambda kv: int(re.findall(r'\d+', kv[0])[0]) if re.findall(r'\d+', kv[0]) else 0)
    idades = [x for x in idades if not x[0].startswith('Menos')]
    edu = [(k, v) for k, v in O['educacao']['valores'].items() if k != 'Total']
    edu.sort(key=lambda kv: kv[1])
    dim = list(O['dimensao']['valores'].items())
    return sx, dist, reg, idades, edu, dim


def salario_medio():
    sx, dist, reg, idades, edu, dim = dados_medio()
    ano = sx['ano']
    media, med = sx['HM'], dist['ganho']['mediana']
    liq = liquido_simples(round(media))
    perg = [
        ('Qual é o salário médio em Portugal?', f'Em {ano}, o ganho médio mensal bruto de quem trabalhava a tempo completo no setor privado foi de {euro(media)} '
         f'(INE e GEP/MTSSS, Quadros de Pessoal). Líquido, para quem é solteiro e sem dependentes, ficam cerca de {euro(liq)}.'),
        ('E o salário mais comum?', f'A média é puxada para cima pelos salários altos. A mediana, o salário do meio, foi de {euro(med)}: metade de quem trabalhava a tempo completo '
         f'no Continente ganhava menos do que isso ({dist["ref"]}).'),
        ('Os homens ganham mais do que as mulheres?', f'Sim: {euro(sx["H"])} contra {euro(sx["M"])} em média, uma diferença de {pct(100 * (sx["H"] - sx["M"]) / sx["H"])}.'),
    ]
    corpo = f'''
{migalhas([(None, "Salário médio")])[0]}
<section class="sec" style="padding-top:24px"><div class="mold">
<h1 class="h1-pag">Salário médio em Portugal: {euro(media)}</h1>
<p class="lede">Em {ano}, quem trabalhava a tempo completo no setor privado ganhava em média <strong>{euro(media)}</strong> brutos por mês. Mas metade ganhava menos de <strong>{euro(med)}</strong>.</p>
<p class="acoes" style="margin-top:24px"><a class="botao" href="/">Ver onde fico em Portugal</a><a class="botao sec2" href="/calculadora/?bruto={int(round(media))}">Quanto fica líquido</a></p>
</div></section>
<section class="sec"><div class="mold texto">
<h2>Por região</h2>
{tabela_html(["Região", "Homens", "Mulheres"], [[e(n), euro(v["H"]), euro(v["M"])] for n, v in reg], "Ganho médio mensal por região e sexo")}
<h2>Por idade</h2>
{tabela_html(["Idade", "Ganho médio"], [[e(k.replace(" - ", "–")), euro(v)] for k, v in idades], "Ganho médio mensal por idade")}
{fonte("sexo_idade")}
<h2>Por escolaridade</h2>
{tabela_html(["Escolaridade", "Ganho médio"], [[e(k), euro(v)] for k, v in edu], "Ganho médio mensal por escolaridade")}
{fonte("educacao")}
<h2>Pelo tamanho da empresa</h2>
{tabela_html(["Pessoas na empresa", "Ganho médio"], [[e(k), euro(v)] for k, v in dim], "Ganho médio mensal pela dimensão da empresa")}
{fonte("dimensao")}
<h2>Perguntas</h2>
{perguntas_html(perg)}
{fonte("qp")}
<p>Vê também o <a href="/salario-minimo/">salário mínimo</a>, os <a href="/profissoes/">salários por profissão</a>, por <a href="/concelhos/">concelho</a> e na <a href="/funcao-publica/">função pública</a>.</p>
</div></section>'''
    pagina('/salario-medio/', f'Salário médio em Portugal: {euro(media)} ({ano}), por região e idade',
           f'O salário médio em Portugal é de {euro(media)} brutos por mês e a mediana de {euro(med)}. Por região, idade, escolaridade e tamanho da empresa, com dados do INE.',
           corpo, ld=[migalhas([('/salario-medio/', 'Salário médio')])[1], faq_ld(perg)], prioridade=0.8,
           alternos={'pt': '/salario-medio/', 'en': '/en/average-salary-portugal/'})


def paginas_en():
    irs = O['irs']
    a, v = smn_hoje()
    prox = O['smn'].get(str(a + 1))
    liq_min = liquido_simples(v)
    sx, dist, reg, idades, edu, dim = dados_medio()
    media, med = sx['HM'], dist['ganho']['mediana']
    liq_med = liquido_simples(round(media))
    src = lambda k: (f'<p class="fonte">Source: <a href="{e(O["fontes"][k]["url"])}" rel="noopener">{e(O["fontes"][k]["nome"])}</a>'
                     f'{", " + e(O["fontes"][k]["ref"]) if O["fontes"][k].get("ref") else ""}.</p>')

    # calculadora (o mesmo app.js: os ids são os da página portuguesa)
    perg = [
        ('How is net salary calculated in Portugal?', f'Gross salary minus {pct(100 * irs["ss"])} Social Security and the IRS withholding tax from the official {irs["ano"]} tables, '
         'which depend on your marital status and number of dependants. Holiday and Christmas pay are taxed separately.'),
        ('Is this the final income tax?', 'No. Withholding is an advance on your income tax (IRS). The final tax is settled in the annual tax return, the following spring.'),
        (f'What is the net minimum wage in {a}?', f'The minimum wage is {euro_en(v)} gross a month in {a}. For a single person without dependants it is {euro_en(liq_min, 2)} net.'),
        ('Does it include IRS Jovem or the non-habitual resident regime?', 'No. The calculator uses the standard withholding tables for residents of mainland Portugal. '
         'IRS Jovem and special regimes lower the tax and are not included.'),
    ]
    corpo = f'''
{migalhas([(None, "Net salary calculator")], 'en')[0]}
<section class="sec" style="padding-top:24px"><div class="mold">
<h1 class="h1-pag">Portugal net salary calculator {irs["ano"]}</h1>
<p class="lede">From gross to net pay with the official {irs["ano"]} IRS withholding tables (mainland Portugal), Social Security and meal allowance. Amounts in euros, per month.</p>
<div class="grelha2" style="margin-top:48px" id="calculadora">
<form class="form" id="form-calc" aria-label="Your details">
<div class="f"><label for="c-bruto">Gross monthly salary</label><input type="text" id="c-bruto" inputmode="decimal" autocomplete="off" placeholder="1 200" value="1500"></div>
<div class="f"><label for="c-situacao">Status</label><select id="c-situacao">
<option value="nc">Single (or divorced, widowed)</option>
<option value="c2">Married or civil partners, both earning</option>
<option value="c1">Married or civil partners, one earning</option></select></div>
<div class="f"><label for="c-dep">Dependants</label><select id="c-dep"><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5 or more</option></select></div>
<div class="f"><label for="c-meses">Paid in</label><select id="c-meses"><option value="14">14 payments (holiday and Christmas pay separate)</option><option value="12">12 payments (bonuses spread monthly)</option></select></div>
<div class="f"><label for="c-subs">Meal allowance per day <span class="opc">(optional)</span></label><input type="text" id="c-subs" inputmode="decimal" placeholder="{str(irs["subsidio_dinheiro"]).replace(".", ",")}"></div>
<div class="f"><label for="c-subs-tipo">Paid as</label><select id="c-subs-tipo"><option value="cartao">Meal card or voucher</option><option value="dinheiro">Cash, with the salary</option></select>
<p class="dica">Tax-free up to {euro_en(irs["subsidio_dinheiro"], 2)} a day in cash and {euro_en(irs["subsidio_cartao"], 2)} on a meal card. We count 22 days a month.</p></div>
</form>
<div class="recibo" aria-live="polite">
<h2 class="recibo-t">Your payslip</h2>
<div class="linha"><span class="r">Base salary</span><span class="p"></span><span class="v" id="c-r-base">—</span></div>
<div class="linha" id="c-l-subs" hidden><span class="r">Meal allowance</span><span class="p"></span><span class="v" id="c-r-subs">—</span></div>
<div class="linha" id="c-l-duo" hidden><span class="r">Holiday and Christmas pay (spread)</span><span class="p"></span><span class="v" id="c-r-duo">—</span></div>
<div class="linha menos"><span class="r">Social Security ({pct(100 * irs["ss"])})</span><span class="p"></span><span class="v" id="c-r-ss">—</span></div>
<div class="linha menos"><span class="r">IRS withholding tax</span><span class="p"></span><span class="v" id="c-r-irs">—</span></div>
<div class="linha total"><span class="r">Net per month</span><span class="p"></span><span class="v" id="c-r-liq">—</span></div>
<div class="linha"><span class="r">Net per year</span><span class="p"></span><span class="v" id="c-r-ano">—</span></div>
<div class="linha"><span class="r">Withholding rate</span><span class="p"></span><span class="v" id="c-r-taxa">—</span></div>
<div class="linha destaque" id="c-l-nov" hidden><span class="r">Net in November {irs["ano"]}</span><span class="p"></span><span class="v" id="c-r-nov">—</span></div>
<div class="linha"><span class="r">Cost to the employer</span><span class="p"></span><span class="v" id="c-r-custo">—</span></div>
<p class="fonte">Withholding is an advance on income tax: the final tax is settled in the annual return. The employer cost adds {pct(100 * irs["tsu_empresa"], 2)} Social Security (TSU). IRS Jovem and special regimes are not included.</p>
</div>
</div>
</div></section>
<section class="sec"><div class="mold texto">
<h2>Questions</h2>
{perguntas_html(perg)}
<p>See also the <a href="/en/average-salary-portugal/">average salary in Portugal</a> and the <a href="/en/minimum-wage-portugal/">minimum wage</a>.</p>
{src("irs")}
{src("tsu")}
</div></section>'''
    ld = [{'@type': 'WebApplication', 'name': f'Portugal net salary calculator {irs["ano"]}', 'url': DOMINIO + '/en/salary-calculator/',
           'applicationCategory': 'FinanceApplication', 'operatingSystem': 'All', 'inLanguage': 'en',
           'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'EUR'}}, migalhas([('/en/salary-calculator/', 'Net salary calculator')], 'en')[1], faq_ld(perg)]
    pagina('/en/salary-calculator/', f'Portugal net salary calculator {irs["ano"]}: gross to net',
           f'Calculate your net salary in Portugal for {irs["ano"]} with the official IRS withholding tables, Social Security and meal allowance. Free, in euros.',
           corpo, dados={'irs': dados_irs()}, ld=ld, prioridade=0.9, og='/og/calculadora.png', lang='en',
           alternos={'pt': '/calculadora/', 'en': '/en/salary-calculator/'})

    # salário médio
    perg = [
        ('What is the average salary in Portugal?', f'In {sx["ano"]}, the average gross monthly earnings of full-time private-sector employees were {euro_en(media)} '
         f'(INE and GEP/MTSSS, Quadros de Pessoal). That is about {euro_en(liq_med)} net for a single person without dependants, paid 14 times a year.'),
        ('What is the median salary in Portugal?', f'{euro_en(med)} a month: half of full-time employees in mainland Portugal earned less than this (October {dist["ano"]}).'),
        ('Is the salary paid 14 times a year?', 'Yes. Most employees in Portugal receive 14 payments: 12 monthly salaries plus holiday pay (summer) and Christmas pay.'),
        ('Where are salaries highest?', f'In Greater Lisbon: {euro_en(O["sexo_regioes"].get("1A", {}).get("H"))} for men and {euro_en(O["sexo_regioes"].get("1A", {}).get("M"))} for women on average.'),
    ]
    corpo = f'''
{migalhas([(None, "Average salary in Portugal")], 'en')[0]}
<section class="sec" style="padding-top:24px"><div class="mold">
<h1 class="h1-pag">Average salary in Portugal: {euro_en(media)} a month</h1>
<p class="lede">In {sx["ano"]}, full-time private-sector employees in Portugal earned on average <strong>{euro_en(media)}</strong> gross a month, paid 14 times a year. Half earned less than <strong>{euro_en(med)}</strong>.</p>
<p class="acoes" style="margin-top:24px"><a class="botao" href="/en/salary-calculator/?bruto={int(round(media))}">Calculate net pay</a></p>
</div></section>
<section class="sec"><div class="mold texto">
<h2>By region</h2>
{tabela_html(["Region", "Men", "Women"], [[e(REGIOES_EN.get(n, n)), euro_en(v["H"]), euro_en(v["M"])] for n, v in reg], "Average monthly earnings by region and sex")}
<h2>By age</h2>
{tabela_html(["Age", "Average earnings"], [[e(re.sub(r" anos$", "", k).replace(" - ", "–").replace("65 e mais", "65 and over")), euro_en(v)] for k, v in idades], "Average monthly earnings by age")}
{src("sexo_idade")}
<h2>By education</h2>
{tabela_html(["Education", "Average earnings"], [[e(EDU_EN.get(k, k)), euro_en(v)] for k, v in edu], "Average monthly earnings by education")}
{src("educacao")}
<h2>By company size</h2>
{tabela_html(["Employees", "Average earnings"], [[e(k.replace(" pessoas", "").replace(" a ", "–").replace(" ou mais", " or more")), euro_en(v)] for k, v in dim], "Average monthly earnings by company size")}
{src("dimensao")}
<h2>Questions</h2>
{perguntas_html(perg)}
{src("qp")}
<p>Salaries by profession and municipality are on <a href="/profissoes/" hreflang="pt-PT">ganhas.pt in Portuguese</a>.</p>
</div></section>'''
    pagina('/en/average-salary-portugal/', f'Average salary in Portugal: {euro_en(media)} a month ({sx["ano"]})',
           f'The average salary in Portugal is {euro_en(media)} gross a month and the median {euro_en(med)}. By region, age, education and company size, with official INE data.',
           corpo, ld=[migalhas([('/en/average-salary-portugal/', 'Average salary in Portugal')], 'en')[1], faq_ld(perg)], prioridade=0.8, lang='en',
           alternos={'pt': '/salario-medio/', 'en': '/en/average-salary-portugal/'})

    # salário mínimo
    d = O['smn']
    anos = sorted(d, key=int)
    linhas = [[x, euro_en(d[x]), (('+' + euro_en(d[x] - d[anos[i - 1]])) if i else '—'), euro_en(d[x] * 14)] for i, x in enumerate(anos)]
    perg = [
        (f'What is the minimum wage in Portugal in {a}?', f'{euro_en(v)} gross a month, paid 14 times a year ({euro_en(v * 14)} a year).'),
        (f'What is the net minimum wage in Portugal?', f'{euro_en(liq_min, 2)} a month for a single person without dependants: the minimum wage pays no IRS withholding '
         f'and {pct(100 * irs["ss"])} goes to Social Security.' if reter(v) == 0 else f'About {euro_en(liq_min, 2)} a month for a single person without dependants.'),
        ('What is the hourly minimum wage?', f'{euro_en(hora_smn(v), 2)} an hour for a 40-hour week: (monthly wage × 12) ÷ (52 × 40), as set by article 271 of the Labour Code.'),
    ]
    if prox:
        perg.append((f'What will the minimum wage be in {a + 1}?', f'{euro_en(prox)} a month, {euro_en(prox - v)} more than in {a}, under the social partners agreement.'))
    corpo = f'''
{migalhas([(None, "Minimum wage in Portugal")], 'en')[0]}
<section class="sec" style="padding-top:24px"><div class="mold">
<h1 class="h1-pag">Minimum wage in Portugal {a}: {euro_en(v)}</h1>
<p class="lede">In {a}, the national minimum wage in Portugal is <strong>{euro_en(v)}</strong> gross a month, paid 14 times a year. Net, for a single person without dependants: <strong>{euro_en(liq_min, 2)}</strong>.{f" In {a + 1} it rises to {euro_en(prox)}." if prox else ""}</p>
<p class="acoes" style="margin-top:24px"><a class="botao" href="/en/salary-calculator/?bruto={int(v)}">Calculate net pay</a></p>
</div></section>
<section class="sec"><div class="mold texto">
<h2>Minimum wage by year</h2>
{tabela_html(["Year", "Per month", "Increase", "Per year (14 payments)"], linhas, "National minimum wage in Portugal by year")}
{src("smn")}
<h2>Questions</h2>
{perguntas_html(perg)}
<p>See also the <a href="/en/average-salary-portugal/">average salary in Portugal</a>.</p>
</div></section>'''
    pagina('/en/minimum-wage-portugal/', f'Minimum wage in Portugal {a}: {euro_en(v)} gross and net',
           f'The minimum wage in Portugal in {a} is {euro_en(v)} gross a month ({euro_en(liq_min, 2)} net, {euro_en(hora_smn(v), 2)} an hour).' + (f' In {a + 1}: {euro_en(prox)}.' if prox else ''),
           corpo, ld=[migalhas([('/en/minimum-wage-portugal/', 'Minimum wage in Portugal')], 'en')[1], faq_ld(perg)], prioridade=0.8, lang='en',
           alternos={'pt': '/salario-minimo/', 'en': '/en/minimum-wage-portugal/'})


def main():
    if os.path.isdir(SAIDA):
        shutil.rmtree(SAIDA)
    os.makedirs(SAIDA)
    inicio(); calculadora(); partilhar(); profissoes(); concelhos(); europa(); funcao_publica()
    salario_minimo(); salario_medio(); paginas_en(); estudo_profissoes()
    empresas_b2b(); dados_abertos(); paginas_texto(); nao_encontrada(); modelo_empresa(); ficheiros()
    print(len(PAGINAS), 'páginas em', SAIDA)


if __name__ == '__main__':
    main()
