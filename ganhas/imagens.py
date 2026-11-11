#!/usr/bin/env python3
"""ganhas.pt: desenha os ícones e as imagens de partilha (Open Graph, 1200×630) com o Chromium (Playwright).

Uso: python3 ganhas/imagens.py   (escreve em ganhas/modelo/imagens/)
"""
import base64, json, os, pathlib
from playwright.sync_api import sync_playwright

AQUI = pathlib.Path(__file__).resolve().parent
IMG = AQUI / 'modelo' / 'imagens'
def _fonte(nome):
    return 'data:font/woff2;base64,' + base64.b64encode((AQUI / 'modelo' / 'fontes' / nome).read_bytes()).decode()


FB, FS = _fonte('bricolage.woff2'), _fonte('schibsted.woff2')
O = json.loads((AQUI / 'dados' / 'oficial.json').read_text(encoding='utf-8'))


def euro(v):
    return f'{v:,.0f}'.replace(',', '.') + ' €'


BASE = f'''<style>
@font-face{{font-family:B;src:url({FB});font-weight:200 800;font-stretch:75% 100%}}
@font-face{{font-family:S;src:url({FS});font-weight:400 900}}
*{{margin:0;box-sizing:border-box}}
body{{width:1200px;height:630px;background:#F7F7F2;color:#111311;font-family:S;overflow:hidden;position:relative}}
.m{{position:absolute;left:72px;top:64px;right:72px}}
h1{{font:800 140px/.9 B;font-stretch:84%;letter-spacing:-.03em}}
.mk{{position:relative;z-index:0}}
.mk::before{{content:"";position:absolute;z-index:-1;left:-.08em;right:-.08em;top:.16em;bottom:.04em;background:#FFE500;transform:skewY(-1.5deg)}}
p{{font:600 34px/1.25 S;margin-top:32px;max-width:900px}}
.marca{{position:absolute;left:72px;bottom:56px;font:800 40px/1 B;letter-spacing:-.03em}}
.marca span{{color:#4A4F4A;font-weight:500}}
.barras{{position:absolute;right:72px;bottom:56px;display:flex;gap:8px;align-items:flex-end;height:150px}}
.barras i{{display:block;width:26px;background:#868980}}
.barras i.tu{{background:#FFE500;box-shadow:inset 0 0 0 3px #111311}}
</style>'''


def barras():
    d = O['distribuicao']['ganho']['barras'][:-1]
    mx = max(d)
    meio = 4  # a barra da mediana (1 100–1 200 €)
    return '<div class="barras">' + ''.join(f'<i class="{"tu" if i == meio else ""}" style="height:{round(150 * b / mx)}px"></i>' for i, b in enumerate(d)) + '</div>'


def og(nome, titulo, frase, com_barras=True):
    return nome, (BASE + f'<div class="m"><h1>{titulo}</h1><p>{frase}</p></div>'
                  f'<div class="marca">ganhas<span>.pt</span></div>{barras() if com_barras else ""}')


def main():
    IMG.mkdir(parents=True, exist_ok=True)
    d = O['distribuicao']
    irs = O['irs']
    eu = O.get('europa') or {}
    pt = next((x for x in eu.get('liquido', []) if x['codigo'] == 'PT'), None)
    paginas = [
        og('og-geral.png', 'Quanto <span class="mk">ganhas</span>?', f'Metade de quem trabalha a tempo completo ganhava menos de {euro(d["ganho"]["mediana"])} brutos ({d["ano"]}). Compara o teu salário.'),
        og('og-calculadora.png', 'Bruto → <span class="mk">líquido</span>', f'Calculadora de salário líquido {irs["ano"]} com as tabelas oficiais de IRS.', False),
        og('og-profissoes.png', 'Quanto se ganha na tua <span class="mk">profissão</span>', 'Dados oficiais por grupo de profissões e partilhas anónimas.'),
        og('og-concelhos.png', 'E no teu <span class="mk">concelho</span>?', f'O ganho médio dos 308 concelhos de Portugal, do mais alto ao mais baixo ({O["concelhos_ano"]}).'),
        og('og-europa.png', 'Portugal ao lado da <span class="mk">Europa</span>', (f'Salário médio líquido de uma pessoa sozinha: {euro(pt["eur"])} por ano ({eu["ano"]}).' if pt else 'Salários líquidos e poder de compra.'), False),
        og('og-partilhar.png', 'Partilha o teu <span class="mk">salário</span>', '30 segundos, sem nome, sem conta. Só mostramos números com 5 ou mais pessoas.'),
        og('og-funcao-publica.png', 'Função <span class="mk">pública</span> 2026', 'Professores, enfermeiros, médicos, polícias: bruto e líquido de cada carreira.', False),
    ]
    svg = (IMG / 'favicon.svg').read_text()
    with sync_playwright() as p:
        nav = p.chromium.launch()
        pg = nav.new_page(viewport={'width': 1200, 'height': 630})
        for nome, html in paginas:
            pg.set_content(html, wait_until='load')
            pg.evaluate('document.fonts.ready')
            assert pg.evaluate("document.fonts.check('800 40px B') && document.fonts.check('600 20px S')"), 'fontes não carregaram'
            pg.wait_for_timeout(150)
            pg.screenshot(path=str(IMG / nome), type='png')
        for tam in (512, 192, 180, 32):
            pg = nav.new_page(viewport={'width': tam, 'height': tam})
            pg.set_content(f'<style>*{{margin:0}}svg{{width:{tam}px;height:{tam}px;display:block}}</style>{svg}')
            pg.screenshot(path=str(IMG / (f'icone-{tam}.png' if tam != 32 else 'favicon-32.png')), type='png')
        nav.close()
    # favicon.ico a partir do PNG de 32 px
    from PIL import Image
    Image.open(IMG / 'favicon-32.png').save(IMG / 'favicon.ico', sizes=[(32, 32)])
    (IMG / 'favicon-32.png').unlink()
    print('imagens prontas em', IMG)


if __name__ == '__main__':
    main()
