#!/usr/bin/env python3
"""ganhas.pt: páginas das empresas a partir das partilhas (corre no servidor, de hora a hora).

Uso: python3 paginas_empresas.py <dados.db> <pasta-de-saída> <modelo.html>
Só entra uma empresa com pelo menos 5 pessoas diferentes (por dispositivo e por ligação do dia), com partilhas com
mais de 24 h e valores arredondados à dezena. Nunca escreve valores individuais.
Faz também uma cópia de segurança diária da base de dados em /var/lib/ganhas-copias (guarda 14 dias).
"""
import datetime as dt, html, json, math, os, shutil, sqlite3, sys, time

DB, SAIDA, MODELO = sys.argv[1:4]
AQUI = os.path.dirname(os.path.abspath(__file__))
K = 5
ATRASO = 24 * 3600
COPIAS = '/var/lib/ganhas-copias'
e = html.escape

with open(os.path.join(AQUI, 'catalogo.json'), encoding='utf-8') as f:
    CAT = json.load(f)
PROF = {p['id']: p for p in CAT['profissoes']}
CONTRATOS = {'efetivo': 'Sem termo', 'termo': 'A termo', 'temporario': 'Temporário', 'recibos': 'Recibos verdes',
             'estagio': 'Estágio', 'outro': 'Outro'}


def euro(v):
    s = f'{v:,.0f}'.replace(',', '.')
    return s + ' €'


def quantil(v, q):
    pos = (len(v) - 1) * q
    a, b = math.floor(pos), math.ceil(pos)
    return v[a] + (v[b] - v[a]) * (pos - a)


def arred(x):
    return int(round(x / 10) * 10)


def pessoas(linhas):
    return min(len({(r['ip'], r['disp']) for r in linhas}), len({r['ip'] for r in linhas}))


def resumo(linhas):
    v = sorted(r['v'] for r in linhas)
    return {'n': pessoas(linhas), 'p25': arred(quantil(v, .25)), 'mediana': arred(quantil(v, .5)), 'p75': arred(quantil(v, .75))}


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


def main():
    if not os.path.exists(DB):
        print('ainda não há base de dados'); return
    modelo = open(MODELO, encoding='utf-8').read()
    c = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
    limiar = int(time.time()) - ATRASO
    q = c.execute("SELECT empresa_id, empresa, profissao, bruto_mes * 40.0 / horas, ip_dia, dispositivo, contrato FROM partilhas "
                  "WHERE estado='ok' AND criado < ? AND empresa_id IS NOT NULL", (limiar,)).fetchall()
    c.close()
    empresas = {}
    for eid, nome, prof, v, ip, disp, contrato in q:
        empresas.setdefault(eid, []).append({'nome': nome, 'prof': prof, 'v': v, 'ip': ip, 'disp': disp, 'contrato': contrato})
    novo = SAIDA + '.novo'
    shutil.rmtree(novo, ignore_errors=True)
    os.makedirs(os.path.join(novo, 'empresa'))
    publicadas = []
    for eid, linhas in empresas.items():
        if pessoas(linhas) < K:
            continue
        nomes = {}
        for r in linhas:
            nomes[r['nome']] = nomes.get(r['nome'], 0) + 1
        nome = max(nomes, key=nomes.get)
        geral = resumo(linhas)
        por_prof = {}
        for r in linhas:
            por_prof.setdefault(r['prof'], []).append(r)
        tabela = ''.join(
            f'<tr><td><a href="/profissoes/{p}/">{e(PROF.get(p, {}).get("nome", p))}</a></td><td class="n">{euro(s["mediana"])}</td><td class="n">{s["n"]}</td></tr>'
            for p, s in sorted(((p, resumo(l)) for p, l in por_prof.items() if pessoas(l) >= K), key=lambda x: -x[1]['n']))
        contratos = {}
        for r in linhas:
            contratos[r['contrato']] = contratos.get(r['contrato'], 0) + 1
        tot = sum(contratos.values())
        lc = ''.join(f'<div class="linha"><span class="r">{e(CONTRATOS.get(k, k))}</span><span class="p"></span><span class="v">{round(100 * n / tot)} %</span></div>'
                     for k, n in sorted(contratos.items(), key=lambda x: -x[1]))
        caminho = f'/empresa/{eid}/'
        ld = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Início', 'item': 'https://ganhas.pt/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Empresas', 'item': 'https://ganhas.pt/empresa/'},
            {'@type': 'ListItem', 'position': 3, 'name': nome, 'item': 'https://ganhas.pt' + caminho}]}
        corpo = f'''<nav class="migalhas mold" aria-label="Estás aqui"><a href="/">Início</a> / <a href="/empresa/">Empresas</a> / {e(nome)}</nav>
<section class="sec" style="padding-top:24px"><div class="mold par">
<div><h1 style="font-size:clamp(44px,9vw,96px);font-stretch:82%;line-height:.92">{e(nome)}</h1>
<p class="lede" style="margin-top:20px">Segundo {geral["n"]} pessoas que lá trabalham, a mediana do salário bruto mensal é <span class="mk">{euro(geral["mediana"])}</span>.
Metade ganha entre {euro(geral["p25"])} e {euro(geral["p75"])}.</p>
<p class="fonte">Partilhas anónimas no ganhas.pt, convertidas para 40 horas por semana e arredondadas à dezena. Não é um número oficial da empresa.</p></div>
<div class="recibo"><h3>Tipo de contrato</h3>{lc}</div>
</div></section>
<section class="sec"><div class="mold">
{('<h2 style="font-size:clamp(28px,4vw,40px)">Por profissão</h2><table class="tabela" style="margin-top:24px"><thead><tr><th>Profissão</th><th class="n">Mediana</th><th class="n">Pessoas</th></tr></thead><tbody>' + tabela + '</tbody></table>') if tabela else '<p class="lede">Ainda não há 5 pessoas da mesma profissão para mostrar o detalhe.</p>'}
<p style="margin-top:40px;display:flex;flex-wrap:wrap;gap:12px"><a class="botao" href="/partilhar/">Partilhar o meu salário</a><a class="botao sec2" href="/empresa/">Ver outras empresas</a></p>
</div></section>
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False).replace("</", "<\\/")}</script>'''
        pagina = (modelo.replace('@@TITULO@@', e(f'{nome}: salários partilhados por quem lá trabalha'))
                  .replace('@@DESCRICAO@@', e(f'{nome}: mediana de {euro(geral["mediana"])} brutos por mês segundo {geral["n"]} pessoas no ganhas.pt. Por profissão e tipo de contrato.'))
                  .replace('@@CAMINHO@@', caminho).replace('@@CORPO@@', corpo))
        os.makedirs(os.path.join(novo, 'empresa', eid), exist_ok=True)
        with open(os.path.join(novo, 'empresa', eid, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(pagina)
        publicadas.append((eid, nome, geral))
    publicadas.sort(key=lambda x: -x[2]['n'])
    linhas = ''.join(f'<tr><td><a href="/empresa/{eid}/">{e(nome)}</a></td><td class="n">{euro(g["mediana"])}</td><td class="n">{g["n"]}</td></tr>'
                     for eid, nome, g in publicadas)
    corpo = f'''<nav class="migalhas mold" aria-label="Estás aqui"><a href="/">Início</a> / Empresas</nav>
<section class="sec" style="padding-top:24px"><div class="mold">
<h1 style="font-size:clamp(44px,9vw,96px);font-stretch:82%;line-height:.92;margin-bottom:20px">Quanto pagam as empresas</h1>
<p class="lede">Empresas com pelo menos 5 pessoas diferentes a partilhar o salário. Valores brutos mensais a 40 horas, arredondados à dezena.</p>
{('<table class="tabela" style="margin-top:32px"><thead><tr><th>Empresa</th><th class="n">Mediana</th><th class="n">Pessoas</th></tr></thead><tbody>' + linhas + '</tbody></table>') if linhas else '<p class="vazio" style="margin-top:32px">Ainda nenhuma empresa chegou às 5 pessoas. Sê o primeiro da tua.</p>'}
<p style="margin-top:40px"><a class="botao" href="/partilhar/">Partilhar o meu salário</a></p>
</div></section>'''
    pag = (modelo.replace('@@TITULO@@', 'Quanto pagam as empresas em Portugal').replace('@@CAMINHO@@', '/empresa/')
           .replace('@@DESCRICAO@@', 'Salários partilhados de forma anónima por quem trabalha em cada empresa, só com 5 ou mais pessoas.')
           .replace('@@CORPO@@', corpo))
    with open(os.path.join(novo, 'empresa', 'index.html'), 'w', encoding='utf-8') as f:
        f.write(pag)
    hoje = dt.date.today().isoformat()
    urls = ''.join(f'<url><loc>https://ganhas.pt/empresa/{eid}/</loc><lastmod>{hoje}</lastmod></url>' for eid, _, _ in publicadas)
    with open(os.path.join(novo, 'sitemap-empresas.xml'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                f'<url><loc>https://ganhas.pt/empresa/</loc><lastmod>{hoje}</lastmod></url>{urls}</urlset>\n')
    # troca atómica: o Caddy nunca vê uma pasta a meio
    velho = SAIDA + '.velho'
    shutil.rmtree(velho, ignore_errors=True)
    os.makedirs(SAIDA, exist_ok=True)
    for nome in os.listdir(novo):
        alvo = os.path.join(SAIDA, nome)
        if os.path.exists(alvo):
            os.makedirs(velho, exist_ok=True)
            os.replace(alvo, os.path.join(velho, nome))
        os.replace(os.path.join(novo, nome), alvo)
    shutil.rmtree(novo, ignore_errors=True)
    shutil.rmtree(velho, ignore_errors=True)
    print(f'{len(publicadas)} empresas publicadas de {len(empresas)} com partilhas')
    copia_seguranca()


if __name__ == '__main__':
    main()
