"""caiu.pt — página /luz-e-gas/ (feita por energia.py todos os dias).

O topo e as tabelas «as mais baratas hoje» vêm já escritos (para quem chega do Google e para quem não tem JavaScript);
a conta de cada pessoa é feita no telemóvel por sites/caiu/energia.js com os mesmos dados (/dados/energia.json).
"""
import html, json
from datetime import date

import paginas as PG

e = html.escape
SITE = PG.SITE
URL = SITE + '/luz-e-gas/'
CSS_V = '1'
JS_V = '1'
MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']


def eur(v, casas=2):
    s = ('{:,.%df}' % casas).format(v).replace(',', ' ').replace('.', ',')
    return s + ' €'


def mes(v):
    return eur(v / 12)


def data_longa(iso):
    d = date.fromisoformat(iso)
    return f'{d.day} de {MESES[d.month - 1]} de {d.year}'


def nome_com(D, com):
    if '+' in com:
        return ' + '.join(nome_com(D, c) for c in com.split('+'))
    return (D['com'].get(com) or {}).get('n', com)


def avisos_linha(l):
    a = []
    if l.get('tmp'):
        a.append('desconto só nos primeiros 12 meses')
    if l.get('novos'):
        a.append('só para novos clientes')
    if l.get('servicos'):
        a.append('inclui serviço extra (%s por ano)' % eur(l['servicos'], 0))
    return a


def cartao_top(D, l, i):
    melhor = i == 0
    sub = e(l['n'])
    return (f'<li class="pl{" pl--melhor" if melhor else ""}">'
            + ('<span class="carimbo carimbo--real pl__carimbo">Mais barata</span>' if melhor else '')
            + f'<span class="pl__loja">{e(nome_com(D, l["com"]))}</span>'
            f'<span class="pl__total preco">{mes(l["total"])}<small>/mês</small></span>'
            f'<span class="pl__sub">{sub} · {eur(l["total"], 0)} por ano</span></li>')


def tabela(D, caso):
    c = D['casos'][caso]
    linhas = []
    for i, l in enumerate(c['top'][:6]):
        av = avisos_linha(l)
        linhas.append(f'<tr><td class="lgt__n">{i + 1}</td><td><b>{e(nome_com(D, l["com"]))}</b><small>{e(l["n"])}'
                      + (f' · {e("; ".join(av))}' if av else '') + '</small></td>'
                      f'<td class="preco">{mes(l["total"])}</td><td class="preco">{eur(l["total"], 0)}</td></tr>')
    return (f'<details class="lgt"{" open" if caso == "e2" else ""}><summary><span>{e(c["nome"])}</span><small>{e(c["desc"])}</small></summary>'
            f'<div class="lgt__corpo"><table><thead><tr><th scope="col">#</th><th scope="col">Oferta</th><th scope="col">Por mês</th>'
            f'<th scope="col">Por ano</th></tr></thead><tbody>{"".join(linhas)}</tbody></table></div></details>')


def parcerias(D):
    out = []
    textos = {
        'combina': ('Galp COMBINA', 'Luz e gás da Galp com saldo no Cartão Continente: 2 a 10 % nas compras do Continente e 20 a 30 cênt./l '
                    'na Galp, conforme junte 1, 2 ou 3 serviços (luz, gás, solar Galp, pacote NOS com TV). Conta se fizer compras no '
                    'Continente ou abastecer na Galp.'),
        'casa_estrada': ('Galp Casa & Estrada', 'Desconto de 4 a 8 % na fatura durante 12 meses e cashback na app Mundo Galp em cada litro abastecido.'),
        'edp_pingodoce': ('EDP + Pingo Doce', 'Na oferta «Parceria Pingo Doce», 10 % da fatura volta em saldo na app O Meu Pingo Doce, até 10 € por mês.'),
        'my_repsol': ('Repsol + My Repsol', 'Saldo de 2 a 3 % da fatura e até 20 cênt./l em combustível Repsol. Clientes Vodafone, Santander e '
                      'sócios de alguns clubes têm ofertas próprias com mais desconto no kWh.'),
        'meo_dados': ('MEO Energia', 'Clientes MEO com pacotes M4e ou M5e pagam menos 2 cênt. por kWh e têm dados móveis ilimitados.'),
        'edp_poupamais_bp': ('EDP + bp (Poupa Mais)', 'Desconto na fatura EDP por cada 40 litros abastecidos na bp com o Poupa Mais. '
                             'Fica fora das contas: não encontrámos as condições atuais numa página oficial.'),
    }
    for v in D['vant']:
        if v['id'] not in textos:
            continue
        titulo, txt = textos[v['id']]
        st = v.get('estado')
        quando = (f'Confirmado a {data_longa(v["confirmado"])}' if v.get('confirmado') else 'Por confirmar')
        if st == 'parado' and v['tipo'] != 'nota':
            quando = 'Não conseguimos confirmar: fica fora das contas'
        fonte = (v.get('fonte') or {}).get('url')
        out.append(f'<li class="lgp"><h3>{e(titulo)}</h3><p>{e(txt)}</p><p class="lgp__pe">{e(quando)}'
                   + (f' · <a href="{e(fonte)}" rel="noopener nofollow" target="_blank">Condições ↗</a>' if fonte and fonte.startswith('http') else '')
                   + '</p></li>')
    return ''.join(out)


def pagina(D):
    dia, hora = D['dia'], D['atualizado'][11:16]
    n_of = len(D['of'])
    n_com = len({o['com'] for o in D['of']})
    top = D['casos']['e2']['top']
    m = top[0]
    resp = (f'Hoje, {data_longa(dia)}, a eletricidade mais barata para um casal com dois filhos (6,9 kVA, 5000 kWh por ano) '
            f'é a {nome_com(D, m["com"])} ({m["n"]}): {mes(m["total"])} por mês, com impostos. Comparamos {n_of} ofertas de '
            f'{n_com} comercializadores com os dados da ERSE, as tabelas da Galp e as parcerias com supermercados e combustível.')
    titulo = 'Luz e gás mais baratos hoje: compara todas as ofertas | caiu.pt'
    desc = ('Todas as ofertas de luz e gás com campanhas e parcerias (Galp COMBINA, EDP e Pingo Doce, Repsol). '
            'Diz o que gastas e vê quem é mais barato para ti.')
    ld = {'@context': 'https://schema.org', '@graph': [{
        '@type': 'WebPage', '@id': URL, 'url': URL, 'name': 'Luz e gás mais baratos hoje', 'inLanguage': 'pt-PT',
        'dateModified': D['atualizado'], 'description': desc, 'isPartOf': {'@id': SITE + '/#site'}}]}
    cab = PG.cabeca(titulo, desc, URL, ld, dia)
    cab = cab.replace('</head>', f'<link rel="stylesheet" href="/energia.css?v={CSS_V}">\n'
                                 f'<link rel="preload" href="/dados/energia.json" as="fetch" crossorigin>\n'
                                 f'<script defer src="/energia-calc.js?v={JS_V}"></script>\n<script defer src="/energia.js?v={JS_V}"></script>\n'
                                 '<script>document.documentElement.classList.add("js");window.estat=window.estat||function(){(estat.q=estat.q||[]).push(arguments)}</script>\n</head>')
    conf = D.get('confirmado') or {}
    if conf.get('casos') and conf.get('ok'):
        conf_txt = (f'Hoje confirmámos {conf["casos"]} contas com o simulador da ERSE: a maior diferença foi de '
                    f'{eur(conf.get("max_dif") or 0)}.')
    elif conf.get('casos'):
        conf_txt = f'Hoje confirmámos {conf["casos"]} contas com o simulador da ERSE; algumas tiveram diferenças e estão a ser revistas.'
    else:
        conf_txt = 'O simulador da ERSE não respondeu hoje; usamos as regras da última confirmação.'
    galp = (D['fonte'].get('galp') or {}).get('combina') or {}
    galp_txt = f' As tabelas da Galp em vigor desde {data_longa(galp["vigor"])}.' if galp.get('vigor') else ''
    corpo = f'''<main id="conteudo" class="lg">
  <section class="lg-topo" aria-labelledby="t-lg">
    <div class="caixa">
      <p class="lg-topo__sobre">Luz e gás · <time datetime="{e(D["atualizado"])}">hoje às {hora}</time></p>
      <h1 id="t-lg">Quem tem a luz mais barata para ti?</h1>
      <p class="lg-topo__apoio">{n_of} ofertas de {n_com} comercializadores, com campanhas e parcerias somadas ao que gastas.</p>
      <ol class="lojas3 lg-top3">{"".join(cartao_top(D, l, i) for i, l in enumerate(top[:3]))}</ol>
      <p class="lg-topo__nota">Casal com 2 filhos: 6,9 kVA, 5000 kWh por ano, com impostos. <a href="#conta">Faz a tua conta ↓</a></p>
    </div>
  </section>

  <section class="bloco lg-conta" id="conta" aria-labelledby="t-conta">
    <div class="caixa">
      <h2 id="t-conta">A tua conta</h2>
      <p class="lead">Escolhe a tua casa e o que já tens. Contamos a fatura, as campanhas de adesão e o saldo que ganhas no supermercado e no combustível.</p>
      <div class="lg-grelha">
        <form class="lgf" id="lgForm" autocomplete="off" novalidate>
          <fieldset class="seg"><legend>Comparar</legend><div class="seg__op">
            <label><input type="radio" name="tipo" value="E" checked><span>Luz</span></label>
            <label><input type="radio" name="tipo" value="G"><span>Gás</span></label>
            <label><input type="radio" name="tipo" value="D"><span>Luz e gás</span></label></div></fieldset>
          <fieldset class="seg"><legend>Em casa</legend><div class="seg__op">
            <label><input type="radio" name="casa" value="1"><span>1–2</span></label>
            <label><input type="radio" name="casa" value="2" checked><span>3–4</span></label>
            <label><input type="radio" name="casa" value="3"><span>5 ou mais</span></label></div></fieldset>
          <details class="lgf__mais" id="lgAjustar"><summary>Usar os números da minha fatura</summary>
            <div class="lgf__campos">
              <label class="lgf__c" data-so="E D"><span>Potência</span><select name="kva" id="lgKva"></select></label>
              <label class="lgf__c" data-so="E D"><span>Luz por mês</span><span class="lgf__un"><input type="number" name="kwh" id="lgKwh" inputmode="numeric" min="10" max="5000" step="1"><i>kWh</i></span></label>
              <fieldset class="seg lgf__c" data-so="E D"><legend>Horário</legend><div class="seg__op">
                <label><input type="radio" name="ciclo" value="1" checked><span>Simples</span></label>
                <label><input type="radio" name="ciclo" value="2"><span>Bi-horário</span></label></div></fieldset>
              <label class="lgf__c" data-so="E D" data-ciclo="2"><span>Em vazio</span><span class="lgf__un"><input type="number" name="vazio" id="lgVazio" inputmode="numeric" min="0" max="100" step="1" value="40"><i>%</i></span></label>
              <label class="lgf__c" data-so="G D"><span>Gás por mês</span><span class="lgf__un"><input type="number" name="gkwh" id="lgGkwh" inputmode="numeric" min="10" max="9000" step="1"><i>kWh</i></span></label>
              <label class="lgf__c" data-so="G D"><span>Código postal</span><input type="text" name="cp" id="lgCp" inputmode="numeric" maxlength="4" placeholder="4420" pattern="[0-9]{{4}}"></label>
            </div>
            <p class="lgf__ajuda">Está na fatura: potência contratada e consumo em kWh. O código postal serve para o gás regulado.</p>
          </details>
          <fieldset class="lgf__tem"><legend>O que já tens</legend><div class="pilhas" id="lgTem"></div></fieldset>
          <div class="lgf__habitos">
            <label class="lgf__c"><span>Compras no Continente</span><span class="lgf__un"><input type="number" name="continente" inputmode="numeric" min="0" max="3000" step="10" placeholder="0"><i>€/mês</i></span></label>
            <label class="lgf__c"><span>Compras no Pingo Doce</span><span class="lgf__un"><input type="number" name="pingodoce" inputmode="numeric" min="0" max="3000" step="10" placeholder="0"><i>€/mês</i></span></label>
            <fieldset class="seg lgf__c lgf__marca"><legend>Abasteces na</legend><div class="seg__op seg__op--quebra">
              <label><input type="radio" name="marca" value="" checked><span>Não sei</span></label>
              <label><input type="radio" name="marca" value="galp"><span>Galp</span></label>
              <label><input type="radio" name="marca" value="repsol"><span>Repsol</span></label>
              <label><input type="radio" name="marca" value="bp"><span>bp</span></label></div></fieldset>
            <label class="lgf__c" data-marca="1"><span>Litros por mês</span><span class="lgf__un"><input type="number" name="litros" inputmode="numeric" min="0" max="250" step="5" value="80"><i>litros</i></span></label>
          </div>
          <details class="lgf__mais"><summary>Mais opções</summary>
            <div class="lgf__opcoes">
              <label class="caixinha caixinha--escura"><input type="checkbox" name="dd" checked> Aceito débito direto</label>
              <label class="caixinha caixinha--escura"><input type="checkbox" name="fe" checked> Aceito fatura eletrónica</label>
              <label class="caixinha caixinha--escura"><input type="checkbox" name="servicos" checked> Mostrar ofertas com serviços extra pagos</label>
              <label class="caixinha caixinha--escura"><input type="checkbox" name="indexado"> Mostrar preços indexados (mudam todos os meses)</label>
              <label class="lgf__c"><span>Já és cliente de</span><select name="cliente" id="lgCliente"><option value="">Nenhum destes</option></select></label>
            </div>
          </details>
        </form>
        <div class="lg-res" aria-live="polite">
          <div class="lg-res__ops">
            <label class="caixinha caixinha--escura"><input type="checkbox" id="lgCamp" checked> Contar campanhas de adesão</label>
            <label class="caixinha caixinha--escura"><input type="checkbox" id="lgParc" checked> Contar saldo e descontos fora da fatura</label>
          </div>
          <figure class="talao lg-talao" id="lgTalao"><figcaption class="talao__cab"><strong>A carregar as ofertas…</strong></figcaption></figure>
          <ol class="lgl" id="lgLista"></ol>
          <button class="botao botao--leve mais" type="button" id="lgMais" hidden>Ver mais ofertas</button>
        </div>
      </div>
    </div>
  </section>

  <section class="bloco" id="comparar" aria-labelledby="t-comp" hidden>
    <div class="caixa">
      <h2 id="t-comp">Cada um, no melhor que tem para ti</h2>
      <p class="lead" id="lgCompLead"></p>
      <ol class="barras lg-barras espera" id="lgBarras"></ol>
    </div>
  </section>

  <section class="bloco" id="parcerias" aria-labelledby="t-parc">
    <div class="caixa">
      <h2 id="t-parc">As parcerias, sem letras pequenas</h2>
      <p class="lead">Só entram nas contas as que confirmamos na fonte oficial. Saldo em cartão conta como dinheiro se o usares nessa loja.</p>
      <ul class="lgps">{parcerias(D)}</ul>
    </div>
  </section>

  <section class="bloco" id="hoje" aria-labelledby="t-hoje">
    <div class="caixa">
      <h2 id="t-hoje">As mais baratas hoje</h2>
      <p class="lead lg-resposta">{e(resp)}</p>
      <p class="lg-hoje__nota">A melhor oferta de cada comercializador nos casos tipo da ERSE: preços fixos, sem condições especiais, sem saldo fora da fatura e com campanhas de adesão.</p>
      <div class="lgts">{"".join(tabela(D, c) for c in ("e1", "e2", "e3", "g1", "g2", "d2"))}</div>
    </div>
  </section>

  <section class="bloco bloco--metodo" id="metodo" aria-labelledby="t-met">
    <div class="caixa">
      <h2 id="t-met">Como fazemos as contas</h2>
      <ul class="lg-metodo">
        <li>Todos os dias descarregamos o ficheiro da ERSE com as ofertas de todos os comercializadores, que são obrigados a enviá-las.{e(galp_txt)}</li>
        <li>A fatura é a de um ano, com IVA (6 % nos primeiros 200 kWh por mês até 6,9 kVA), imposto especial de consumo e contribuição audiovisual. A taxa DGEG (0,07 € por mês) e a taxa de ocupação do subsolo do gás ficam de fora, como no simulador da ERSE.</li>
        <li>As campanhas de adesão contam no 1.º ano; o saldo em cartão e o desconto em combustível contam pelo que dizes que gastas.</li>
        <li>{e(conf_txt)}</li>
        <li>O caiu.pt não tem ligação a nenhum comercializador e não ganha nada com a tua escolha. Confirma sempre as condições na página da oferta.</li>
      </ul>
    </div>
  </section>
</main>
'''
    rod = f'''<footer class="rodape">
  <div class="caixa rodape__in">
    <p class="rodape__marca" aria-hidden="true">ca<span class="marca__i">ı<span class="marca__ponto"></span></span>u</p>
    <p class="rodape__dados">Ofertas de luz e gás atualizadas a <time datetime="{dia}">{data_longa(dia)}</time>, às <time>{hora}</time>, com os dados da ERSE e as tabelas da Galp.</p>
    <p class="rodape__links"><a href="/">Supermercados</a> · <a href="/promocoes/">Promoções da semana</a> · <a href="/cabaz-mais-barato/">Cabaz mais barato</a> · <a href="/luz-e-gas/">Luz e gás</a> · <a href="/privacidade.html">Privacidade</a></p>
    <p class="rodape__autor">Feito por <a href="https://dinissousa.pt" rel="noopener">dinissousa.pt</a></p>
  </div>
</footer>
</body>
</html>
'''
    return cab + corpo + rod
