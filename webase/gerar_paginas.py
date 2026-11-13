#!/usr/bin/env python3
"""webase: gera as páginas interiores do site (soluções, preços, marketplace, privacidade, termos) com o topo e o rodapé
da página inicial. Correr depois de mudar site/index.html ou este ficheiro: python3 gerar_paginas.py"""
import json
import os
import re

AQUI = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(AQUI, '..', 'sites', 'webase')
INDEX = open(os.path.join(SITE, 'index.html'), encoding='utf-8').read()
TOPO = re.search(r'<header class="cab">.*?</header>', INDEX, re.S).group(0)
RODAPE = re.search(r'<footer class="rodape">.*?</footer>', INDEX, re.S).group(0)
ATUALIZADO = '13 de novembro de 2026'
CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>'


def img(nome, alt, sizes='(min-width: 960px) 700px, 94vw'):
    if os.path.exists(os.path.join(SITE, 'img', 'sec-%s-1400.webp' % nome)):
        try:
            from PIL import Image
            w, h = Image.open(os.path.join(SITE, 'img', 'sec-%s-1400.webp' % nome)).size
        except Exception:
            w, h = 1400, 1400
        tag = ('<img src="/img/sec-%s-1400.webp" srcset="/img/sec-%s-800.webp 800w, /img/sec-%s-1400.webp 1400w" '
               'sizes="%s" width="%d" height="%d" loading="lazy" alt="%s">') % (nome, nome, nome, sizes, w, h, alt)
    else:
        tag = ('<img src="/img/%s-1600.webp" srcset="/img/%s-1000.webp 1000w, /img/%s-1600.webp 1600w, /img/%s-2400.webp 2400w" '
               'sizes="%s" width="1600" height="1000" loading="lazy" alt="%s">') % (nome, nome, nome, nome, sizes, alt)
    if os.path.exists(os.path.join(SITE, 'img', 'tel-%s-780.webp' % nome)):
        return ('<div class="tabuleiro tem-tel surge"><picture><source media="(max-width: 699px)" srcset="/img/tel-%s-780.webp 780w, '
                '/img/tel-%s-1170.webp 1170w" sizes="300px" width="780" height="1688">%s</picture></div>') % (nome, nome, tag)
    return '<div class="tabuleiro surge">%s</div>' % tag


def pagina(caminho, titulo, descricao, corpo, atual=None):
    topo = TOPO
    if atual:
        topo = topo.replace('<a href="%s">' % atual, '<a href="%s" aria-current="page">' % atual, 1)
    html = f'''<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{titulo}</title>
<meta name="description" content="{descricao}">
<link rel="canonical" href="https://webase.pt{caminho}">
<meta name="theme-color" content="#F4F4F1">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_PT">
<meta property="og:title" content="{titulo}">
<meta property="og:description" content="{descricao}">
<meta property="og:url" content="https://webase.pt{caminho}">
<meta property="og:image" content="https://webase.pt/img/partilha.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/fontes/instrument.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/base.css">
<link rel="stylesheet" href="/css/site.css">
<script src="/js/js.js"></script>
<script type="module" src="/js/site.js"></script>
<script defer src="/_e.js" data-site="webase"></script>
</head>
<body class="site">
<a class="salto" href="#conteudo">Saltar para o conteúdo</a>
{topo}
<main id="conteudo">
{corpo}
</main>
{RODAPE}
</body>
</html>
'''
    destino = os.path.join(SITE, caminho.strip('/'), 'index.html')
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, 'w', encoding='utf-8') as f:
        f.write(html)


def lista(itens):
    return '<ul class="factos">' + ''.join('<li><strong>%s</strong> %s</li>' % x for x in itens) + '</ul>'


def passos(itens):
    return '<ol class="passos-s">' + ''.join('<li><span><strong>%s</strong> %s</span></li>' % x for x in itens) + '</ol>'


# ======================================================================== soluções
SETORES = [
    ('barbearias', 'barbearia', 'Barbearias e salões', 'Clientes que voltam, cortes que se contam.',
     'O caderno do balcão e o cartão de carimbos passam para o telemóvel. Cada cliente com o corte preferido, o barbeiro de sempre e os pontos que já juntou.',
     [('Pontos por cada corte.', 'O cliente junta e troca por um corte ou uma barba grátis.'),
      ('Pacotes de 10 cortes.', 'Cada visita desconta um uso; vês quantos faltam.'),
      ('Clube mensal.', 'Mensalidade de corte e barba à vontade, com aviso de quem está em atraso.'),
      ('Aniversários.', 'Aparecem no início do dia, para mandares uma mensagem.')],
     [('Importa a lista', 'de clientes que tens no telemóvel ou no Excel.'), ('Cria o prémio', '«Corte grátis — 150 pontos».'),
      ('Ao balcão,', 'procura o cliente e dá os pontos da compra.')], 'ficha',
     'Ficha de cliente de uma barbearia com corte preferido, barbeiro, pontos e pacote de 10 cortes.'),
    ('cafes-e-restaurantes', 'restauracao', 'Cafés e restaurantes', 'O café de sempre, com pontos.',
     'Os clientes da casa merecem ser reconhecidos. Pontos por cada compra, mensalidades de pequeno-almoço e uma lista de quem não aparece há muito tempo.',
     [('Pontos por euro.', 'Escolhes a regra: um ponto por euro, ou meio.'), ('Prémios simples.', '«Café grátis — 50 pontos», «Sobremesa — 120 pontos».'),
      ('Clientes por última visita.', 'Ordenas a lista e vês quem deixou de vir.'), ('Equipa ao balcão.', 'O papel «Balcão» dá pontos e regista visitas, mas não apaga nem exporta.')],
     [('Liga Pontos', 'e Subscrições nos módulos.'), ('Cria os prémios', 'que fazem sentido na tua casa.'), ('Dá acesso à equipa', 'com o papel «Balcão».')],
     'pontos', 'Página de pontos com movimentos recentes, prémios e clientes com mais pontos.'),
    ('bares-e-discotecas', 'bar', 'Bares e discotecas', 'Quem vem sempre, com nome e número.',
     'Listas de clientes para eventos, entradas e garrafas em pacote, e etiquetas para separar quem vem às sextas de quem vem aos sábados.',
     [('Etiquetas.', '«VIP», «aniversários», «sexta» — e filtras num toque.'), ('Pacotes.', 'Entradas ou garrafas pré-pagas, com usos a descontar.'),
      ('Consentimento registado.', 'Quem aceitou receber novidades fica marcado, com a data e como.'),
      ('Exportar para campanhas.', 'Tiras a lista para CSV, só com quem consentiu.')],
     [('Importa ou cria', 'a lista de clientes habituais.'), ('Marca com etiquetas', 'quem vem a cada noite.'), ('Regista o consentimento', 'no balcão ou à porta.')],
     'clientes', 'Lista de clientes com etiquetas, contactos, pontos e responsável.'),
    ('ginasios-e-clubes', 'desporto', 'Ginásios, clubes e desporto', 'Mensalidades em dia, sócios à vista.',
     'Planos mensais, pacotes de aulas e contratos anuais num sítio. Sabes quem está em atraso sem abrir o banco.',
     [('Mensalidades.', 'Próximo pagamento de cada sócio e quem está em atraso.'), ('Pacotes de aulas.', '8 aulas, 10 sessões de PT, com validade.'),
      ('Contratos anuais.', 'Com renovação automática e aviso antes do fim.'), ('Campos teus.', 'Número de sócio, objetivo, lesões, escalão.')],
     [('Cria os planos', 'e os pacotes de aulas.'), ('Vende a cada sócio', 'na ficha, num toque.'), ('Regista o pagamento', 'quando o sócio paga; a data seguinte faz-se sozinha.')],
     'pacotes', 'Subscrições e pacotes: ativas, mensalidades, a renovar e em atraso.'),
    ('telecomunicacoes-e-vendas', 'telecom', 'Telecomunicações e equipas de vendas', 'O funil da equipa, chamada a chamada.',
     'Para quem vende fibra, móveis e serviços ao telefone ou porta a porta: leads por fases, chamadas com resultado, contratos com fim de fidelização e uma carteira por comercial.',
     [('Funil com as tuas fases.', '«Por contactar», «Proposta enviada», «Fecho».'), ('Chamadas.', 'Recebidas e feitas, com resultado, duração e quando voltar a ligar.'),
      ('Contratos.', 'Valor mensal, fim da fidelização e renovação.'), ('Carteira por comercial.', 'Cada um vê só os seus clientes; o gestor vê tudo.'),
      ('Marketplace.', 'Compra, venda e partilha de bases de empresas entre contas.')],
     [('Cria as fases', 'com os nomes que a equipa usa.'), ('Adiciona a equipa', 'com papéis de comercial, operador e gestor.'),
      ('Importa as leads', 'ou recebe uma base no marketplace.')], 'leads', 'Funil de leads por fases de uma equipa de vendas de telecomunicações.'),
    ('servicos-e-lojas', 'servicos', 'Serviços, consultoria e lojas', 'Clientes, propostas e avenças.',
     'Para oficinas, clínicas, contabilistas, lojas e quem presta serviços: a ficha do cliente, as propostas em curso e as avenças mensais.',
     [('Avenças.', 'Contratos mensais com receita por mês somada.'), ('Propostas.', 'Leads com valor e próximo passo.'),
      ('Histórico.', 'Chamadas, notas e trabalhos de cada cliente na cronologia.'), ('NIF validado.', 'A webase confirma o dígito de controlo.')],
     [('Importa os clientes', 'do programa de faturação (CSV).'), ('Cria as avenças', 'como contratos mensais.'), ('Segue as propostas', 'nas leads.')],
     'contratos', 'Contratos com valor, periodicidade, datas e estado.'),
]

corpo = ['''<section class="cabeca-p"><div class="envolve" style="display:grid;gap:20px">
<h1 class="mega" style="max-width:14ch">Uma base para cada tipo de negócio.</h1>
<p class="apoio">A webase liga só os módulos que o teu negócio usa. Estas são as formas mais comuns de a usar; mudas tudo quando quiseres.</p>
<nav class="ancoras-s" aria-label="Setores">''' + ''.join('<a href="#%s">%s</a>' % (s[0], s[2]) for s in SETORES) + '</nav></div></section>']
for (ancora, setor, nome, frase, texto, factos, ps, imagem, alt) in SETORES:
    corpo.append(f'''<section class="envolve setor" id="{ancora}" aria-labelledby="s-{ancora}">
<div class="lado-texto surge">
<p class="miudo" style="font-weight:600">{nome}</p>
<h2 class="titulo" id="s-{ancora}">{frase}</h2>
<p class="apoio">{texto}</p>
{lista(factos)}
<h3 style="font-size:18px;margin-top:6px">Como começar</h3>
{passos(ps)}
<div><a class="bt bt-p" href="/app/registar?setor={setor}" data-estat="solucoes-{setor}">Criar conta para {nome.split(',')[0].split(' e ')[0].lower()}</a></div>
</div>
{img(imagem, alt)}
</section>''')
corpo.append('''<section class="seccao" style="padding-top:40px"><div class="envolve"><div class="final surge">
<div style="display:grid;gap:16px"><h2 class="titulo">O teu negócio não está aqui?</h2><p>Escolhe «Outro» ao criar a conta e liga os módulos que quiseres. Os campos da ficha e as fases das leads são teus.</p></div>
<a class="bt" href="/app/registar?setor=outro" data-estat="solucoes-outro">Criar conta grátis</a></div></div></section>''')
pagina('/solucoes/', 'Soluções — webase, o CRM para barbearias, cafés, ginásios e vendas',
       'Como barbearias, cafés, bares, ginásios, equipas de telecomunicações e prestadores de serviços usam a webase.', '\n'.join(corpo), '/solucoes/')

# ======================================================================== preços
LINHAS = [
    ('Pessoas na conta', '1', 'até 5', 'até 25'),
    ('Clientes', 'até 300', 'sem limite', 'sem limite'),
    ('Fichas de clientes, notas e cronologia', '✓', '✓', '✓'),
    ('Campos personalizados', '✓', '✓', '✓'),
    ('Pontos e prémios', '✓', '✓', '✓'),
    ('Leads com fases tuas', '✓', '✓', '✓'),
    ('Subscrições e pacotes', '—', '✓', '✓'),
    ('Chamadas e contratos', '—', '✓', '✓'),
    ('Ligar do computador com o teu telemóvel', '✓', '✓', '✓'),
    ('Importar e exportar (CSV para Excel)', '✓', '✓', '✓'),
    ('Logótipo e cor da tua marca', '✓', '✓', '✓'),
    ('Permissões por pessoa e «só os seus clientes»', '—', 'papéis prontos', '✓ caixa a caixa'),
    ('Registo de atividade', '—', '—', '✓'),
    ('Marketplace: comprar e receber', '✓', '✓', '✓'),
    ('Marketplace: vender bases', '—', '—', '✓'),
    ('Fórum', '✓', '✓', '✓'),
]
tabela = ('<div class="tabela-env surge" style="margin-top:56px;background:var(--folha);border-radius:12px;padding:8px 16px">'
          '<table class="tabela" style="font-size:15.5px"><caption class="so-leitor">Comparação dos planos</caption><thead><tr><th scope="col">O que inclui</th>'
          '<th scope="col">Grátis</th><th scope="col">Negócio</th><th scope="col">Equipa</th></tr></thead><tbody>' +
          ''.join('<tr style="cursor:default"><th scope="row" style="font-weight:500;color:var(--tinta);text-align:left">%s</th><td>%s</td><td>%s</td><td>%s</td></tr>' % l for l in LINHAS) +
          '</tbody></table></div>')
planos = re.search(r'<div class="planos">.*?</div>\s*<div class="ancora surge">.*?</div>\s*<div class="fundadores surge" data-bloco-fundadores>.*?</div>\s*</div>', INDEX, re.S).group(0)
corpo = f'''<section class="cabeca-p"><div class="envolve" style="display:grid;gap:20px">
<h1 class="mega" style="max-width:13ch">Um preço por negócio.</h1>
<p class="apoio">Os CRM grandes cobram por cada pessoa da equipa. Na webase pagas um valor pela conta e a equipa entra toda, até ao limite do plano.</p>
<p class="nota-suave" style="max-width:62ch"><strong>Acesso antecipado:</strong> enquanto os pagamentos não abrem, todas as contas têm todos os módulos abertos, sem pagar e sem cartão. Avisamos com 30 dias de antecedência antes de cobrar seja o que for, e só pagas se quiseres continuar num plano pago.</p>
</div></section>
<section style="padding-bottom:40px"><div class="envolve">
{planos}
{tabela}
<p class="fonte" style="margin-top:12px">Preços sem IVA (23&nbsp;%). Sem fidelização: mudas de plano ou sais quando quiseres.</p>
</div></section>
<section class="seccao" style="padding-top:80px"><div class="envolve">
<h2 class="titulo">Sobre pagamentos.</h2>
<div class="perguntas">
<details><summary>Quando é que começo a pagar?</summary><p>Só quando os planos pagos abrirem e se escolheres um. Avisamos todas as contas por e-mail com 30 dias de antecedência. Se não fizeres nada, a conta passa para o plano Grátis e os teus dados ficam lá.</p></details>
<details><summary>O que é o preço de fundador?</summary><p>As primeiras 100 contas criadas na webase ficam com 40&nbsp;% de desconto em qualquer plano pago, enquanto a conta existir. O número de lugares que restam é contado em direto.</p></details>
<details><summary>Como vou pagar?</summary><p>Estamos a preparar MB WAY, Multibanco e cartão. Recebes fatura com o NIF do negócio.</p></details>
<details><summary>E se passar o limite de pessoas ou de clientes?</summary><p>Nada se apaga. Avisamos e escolhes se passas para o plano seguinte.</p></details>
<details><summary>Posso sair quando quiser?</summary><p>Sim. Exportas tudo e apagas a conta nas definições. Não há fidelização nem multa.</p></details>
</div></div></section>'''
pagina('/precos/', 'Preços — webase', 'Grátis para começar. Negócio a 19 € por mês para até 5 pessoas e Equipa a 49 € por mês para até 25. Sem fidelização.', corpo, '/precos/')

# ======================================================================== marketplace
corpo = f'''<section class="cabeca-p"><div class="envolve" style="display:grid;gap:20px">
<h1 class="mega" style="max-width:13ch">Contactos entre negócios.</h1>
<p class="apoio">No marketplace da webase, as contas compram, vendem e partilham bases de contactos. Tudo fica dentro da webase: quem recebe, recebe direto nos seus clientes, com uma etiqueta para saber de onde vieram.</p>
</div></section>
<section class="envolve setor" style="padding-top:24px">
<div class="lado-texto surge">
<h2 class="titulo">Como funciona.</h2>
{passos([('Publicas uma base.', 'Escolhes os clientes (todos ou os de uma etiqueta), o tipo de contactos, os campos incluídos e o preço. Pode ser grátis.'),
         ('Quem compra vê uma amostra.', 'Nomes, telefones e e-mails aparecem escondidos (ex.: «R*** F***», «91******8») até à compra.'),
         ('Os contactos entram na conta de quem compra.', 'Com a etiqueta do anúncio e sem duplicar quem já existe.'),
         ('Também podes partilhar diretamente.', 'Com o código de outra conta (WB-XXXXXX); a outra conta aceita ou recusa.')])}
</div>
{img('marketplace', 'Marketplace da webase com uma base de comércio local do Grande Porto.')}
</section>
<section class="seccao" style="padding-top:40px"><div class="envolve">
<h2 class="titulo">As regras.</h2>
<div class="garantias">
<div class="surge"><strong>Quem vende responde pelos dados.</strong><p>Para publicar, quem vende declara que tem base legal para ceder os contactos, incluindo o consentimento das pessoas quando a lei o exige. A declaração fica registada com a data e a pessoa.</p></div>
<div class="surge"><strong>Particulares pedem mais cuidado.</strong><p>Em Portugal, o envio de publicidade a particulares precisa de consentimento prévio, dado a cada empresa que recebe os dados (Lei 41/2004 e Diretriz 1/2022 da CNPD). Se tens dúvidas, publica só contactos de empresas.</p></div>
<div class="surge"><strong>Os contactos chegam sem consentimento marcado.</strong><p>O consentimento de marketing não passa de uma conta para outra. Confirma a base legal antes de enviares publicidade.</p></div>
<div class="surge"><strong>Comissão de 15&nbsp;%.</strong><p>Nas vendas pagas, a webase fica com 15&nbsp;% do preço. Bases grátis e partilhas diretas não pagam nada.</p></div>
<div class="surge"><strong>Pagamentos a abrir.</strong><p>Enquanto os pagamentos não abrem, as bases pagas ficam reservadas e quem vende é avisado. As grátis e as partilhas funcionam já.</p></div>
<div class="surge"><strong>Denúncias.</strong><p>Bases com dados que não deviam estar ali são retiradas. Escreve-nos pelo contacto da página de privacidade.</p></div>
</div>
<p class="fonte" style="margin-top:32px">Isto é informação geral, não aconselhamento jurídico. Fonte: <a class="ligacao" href="https://www.garrigues.com/pt/pt-PT/news/nova-diretriz-da-cnpd-marketing-direto-o-tem-mudar-na-forma-empresas-fazem-marketing" rel="noopener">resumo da Diretriz 1/2022 da CNPD (Garrigues)</a>.</p>
</div></section>
<section class="seccao" style="padding-top:0"><div class="envolve"><div class="final surge">
<div style="display:grid;gap:16px"><h2 class="titulo">Publica a tua primeira base.</h2><p>Cria a conta, importa os teus contactos e escolhe o que queres partilhar.</p></div>
<a class="bt" href="/app/registar?setor=vendas" data-estat="marketplace">Criar conta grátis</a></div></div></section>'''
pagina('/marketplace/', 'Marketplace de contactos — webase', 'Compra, venda e partilha de bases de contactos entre contas da webase, com amostra escondida, etiqueta de origem e declaração de quem vende.', corpo, '/marketplace/')

# ======================================================================== privacidade
corpo = f'''<section class="cabeca-p"><div class="envolve" style="display:grid;gap:16px"><h1 class="titulo largo">Privacidade</h1>
<p class="apoio">O que a webase guarda, porquê e durante quanto tempo. Última atualização: {ATUALIZADO}.</p></div></section>
<section class="envolve prosa">
<h2>Quem é responsável</h2>
<p>Dinis Sousa, Avenida General Humberto Delgado, 875, 1.º Esq., 4420-155 Gondomar, Portugal. Contacto para tudo o que diga respeito a dados pessoais: <a href="mailto:diniscash@gmail.com">diniscash@gmail.com</a>.</p>
<h2>Duas situações diferentes</h2>
<p><strong>Os teus dados de conta</strong> (nome, e-mail, palavra-passe, nome do negócio): aqui a webase é responsável pelo tratamento.</p>
<p><strong>Os dados dos teus clientes</strong> que guardas na webase: aqui o teu negócio é o responsável e a webase trata-os apenas por tua conta, para te prestar o serviço (subcontratante, no RGPD). Não usamos os dados dos teus clientes para nada nosso, não os vendemos e não os mostramos a outras contas. Só saem da tua conta se tu os exportares, partilhares ou publicares no marketplace.</p>
<h2>O que guardamos sobre ti</h2>
<ul>
<li>Nome, e-mail e a palavra-passe guardada com scrypt (nunca em texto).</li>
<li>Dados do negócio que escreveres (nome, NIF, morada, telefone, logótipo, cor).</li>
<li>Sessões abertas (com o tipo de navegador, para as poderes reconhecer e fechar) e um registo de atividade da conta (entradas, exportações, mudanças de permissões), visível para quem gere a conta.</li>
<li>O que publicares no fórum, com o teu primeiro nome, a inicial do apelido e o nome do negócio.</li>
<li>Se ativares «Ligar do computador» num telemóvel: o endereço de avisos que o browser desse telemóvel dá, o nome do aparelho (ex.: «Android · Chrome») e os pedidos de chamada (número, nome e resultado), apagados ao fim de 30 dias.</li>
</ul>
<h2>Cookies e estatísticas</h2>
<p>A webase usa um único cookie, necessário para manter a sessão aberta. Não usamos cookies de publicidade. As estatísticas das páginas públicas são próprias, sem cookies e sem guardar endereços IP; a app (a área com sessão) não é medida.</p>
<h2>Durante quanto tempo</h2>
<ul><li>Dados da conta e dos clientes: enquanto a conta existir. Ao apagares a conta, os clientes, leads, chamadas, contratos, pontos e pacotes são apagados.</li>
<li>Sessões: até 30 dias, ou até saíres.</li>
<li>Registo de atividade: enquanto a conta existir, para segurança.</li></ul>
<h2>Onde ficam</h2>
<p>Num servidor alugado à Hetzner Online GmbH, que funciona como subcontratante, com ligações cifradas (HTTPS).</p>
<p>Os avisos de «Ligar do computador» passam pelo serviço de notificações do browser do teu telemóvel (Google, Apple, Mozilla ou Microsoft). A webase envia-lhes apenas um aviso vazio: o número e o nome nunca vão nesse aviso, o telemóvel vai buscá-los à webase com a tua sessão.</p>
<h2>Os teus direitos</h2>
<p>Podes pedir acesso, correção, apagamento, limitação, portabilidade ou opor-te ao tratamento, pelo e-mail acima. Muita coisa fazes sozinho: exportar tudo, mudar dados e apagar a conta estão nas definições. Se achares que os teus dados não foram bem tratados, podes reclamar à Comissão Nacional de Proteção de Dados (<a href="https://www.cnpd.pt" rel="noopener">cnpd.pt</a>).</p>
<h2>Se és cliente de um negócio que usa a webase</h2>
<p>Quem decide sobre os teus dados é esse negócio. Pede-lhe diretamente o acesso ou o apagamento; a webase dá-lhe as ferramentas para responder (descarregar e apagar a tua ficha). Se não conseguires, escreve-nos.</p>
</section>'''
pagina('/privacidade/', 'Privacidade — webase', 'O que a webase guarda, porquê e durante quanto tempo, e quem responde pelos dados dos clientes de cada negócio.', corpo)

# ======================================================================== termos
corpo = f'''<section class="cabeca-p"><div class="envolve" style="display:grid;gap:16px"><h1 class="titulo largo">Termos de utilização</h1>
<p class="apoio">As regras para usar a webase. Última atualização: {ATUALIZADO}.</p></div></section>
<section class="envolve prosa">
<h2>O serviço</h2>
<p>A webase é um CRM na internet: fichas de clientes, pontos, subscrições e pacotes, leads, chamadas, contratos, marketplace de contactos e fórum. É mantida por Dinis Sousa (Avenida General Humberto Delgado, 875, 1.º Esq., 4420-155 Gondomar; <a href="mailto:diniscash@gmail.com">diniscash@gmail.com</a>).</p>
<h2>Acesso antecipado e preços</h2>
<p>Enquanto os pagamentos não abrem, todas as contas usam todos os módulos sem pagar. Os preços publicados em <a href="/precos/">/precos</a> só se aplicam quando os planos pagos abrirem, com aviso de 30 dias. Se não escolheres um plano pago, a conta fica no plano Grátis. As primeiras 100 contas têm 40&nbsp;% de desconto nos planos pagos enquanto a conta existir.</p>
<h2>A tua conta</h2>
<ul><li>Tens de dar dados verdadeiros e guardar a palavra-passe só para ti.</li>
<li>Quem cria a conta é o dono: gere a equipa, as permissões e pode exportar ou apagar tudo.</li>
<li>Respondes pelo que as pessoas da tua equipa fazem na conta.</li></ul>
<h2>Os dados dos teus clientes</h2>
<p>O teu negócio é o responsável pelos dados dos clientes que guarda na webase, e tem de ter base legal para os tratar (por exemplo, a relação comercial ou o consentimento). A webase trata esses dados só por tua conta, para te prestar o serviço, como descrito na <a href="/privacidade/">política de privacidade</a>.</p>
<h2>Marketplace e partilhas</h2>
<ul><li>Ao publicar ou partilhar uma base, declaras que tens base legal para ceder esses dados (incluindo o consentimento das pessoas, quando a lei o exige) e respondes por eles perante quem os recebe e perante as autoridades.</li>
<li>Quem recebe uma base é responsável pelo uso que lhe dá, incluindo confirmar a base legal antes de enviar publicidade.</li>
<li>Nas vendas pagas, a webase fica com uma comissão de 15&nbsp;% do preço.</li>
<li>A webase pode retirar anúncios com dados que não deviam estar ali, ou suspender contas que abusem do marketplace.</li></ul>
<h2>Fórum</h2>
<p>Escreve como escreverias à frente das pessoas. Não publiques dados pessoais de terceiros, publicidade enganosa, insultos ou conteúdo ilegal. Tópicos e respostas que violem estas regras podem ser apagados.</p>
<h2>Disponibilidade</h2>
<p>Fazemos o possível para a webase estar sempre a funcionar e para os dados estarem seguros, mas não garantimos que nunca haja falhas. Exporta os teus dados com regularidade se forem críticos para o teu negócio.</p>
<h2>Sair</h2>
<p>Podes apagar a conta quando quiseres nas definições. Podemos suspender uma conta que viole estes termos ou a lei, avisando sempre que possível.</p>
<h2>Lei e litígios</h2>
<p>Aplica-se a lei portuguesa. Em caso de litígio de consumo, podes recorrer ao Livro de Reclamações Eletrónico (<a href="https://www.livroreclamacoes.pt" rel="noopener">livroreclamacoes.pt</a>) e a uma entidade de resolução alternativa de litígios.</p>
</section>'''
pagina('/termos/', 'Termos de utilização — webase', 'As regras para usar a webase: conta, dados dos clientes, marketplace, fórum e preços.', corpo)
print('páginas geradas')
