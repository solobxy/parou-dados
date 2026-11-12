# caiu.pt — DESIGN.md

Comparador de preços do Continente, Pingo Doce e Auchan que diz se a promoção é a sério.
Ler antes de mexer no site (`sites/caiu/`).

## 1. Tema e ideia
Nesta página, **a etiqueta de prateleira torna-se um carimbo de verdade**: cada produto aparece como uma
etiqueta de preço (amarela, número grande e estreito) e o veredito é um carimbo inclinado («A sério»,
«Fachada», «Sobre o PVPR»). A lista de compras é um **talão** que soma em cada loja.
Tom: direto, um pouco trocista com as promoções, nunca com as pessoas. Nada de «poupe já!».

## 2. Paleta
| nome | hex | papel |
|---|---|---|
| papel | `#F2F2EC` | fundo |
| superfície | `#FFFFFF` | etiquetas, talão, folha do produto |
| tinta | `#141414` | texto, botões |
| tinta-2 | `#55554F` | texto secundário (contraste 7,3:1 no papel) |
| etiqueta | `#FFD83D` | campo de cor: topo da página, etiquetas de preço (o acento) |
| a-sério | `#0B7A43` | carimbo «A sério» (sempre com texto) |
| fachada | `#D0242C` | carimbo «Fachada» (sempre com texto) |
| pvpr | `#8A5A00` | carimbo «Sobre o PVPR» (sempre com texto) |
Cor nunca é a única pista: cada carimbo tem a palavra.

## 3. Tipografia
Uma família: **Mona Sans** variável (wdth 75–125, wght 200–900), auto-alojada (`fontes/mona.woff`, OFL).
| uso | tamanho | wdth | wght | notas |
|---|---|---|---|---|
| H1 | clamp(44px, 9vw, 104px) | 112 | 850 | entrelinha 0,92, tracking −0,03 em |
| H2 | clamp(30px, 5vw, 56px) | 108 | 800 | entrelinha 1 |
| preço | 30–64px | 75 | 850 | `tabular-nums`, o «€» a 0,5 em |
| texto | 17px | 100 | 430 | entrelinha 1,5, 45–70 caracteres |
| pequeno | 14px | 100 | 500 | datas, preço por unidade |

## 4. Componentes
- **Etiqueta** (cartão de produto): superfície branca, foto em cima à esquerda, nome, preço grande; faixa
  amarela com o preço da loja em promoção; carimbo por cima, rodado −7°.
- **Carimbo**: contorno de 3 px na cor do veredito, texto na mesma cor, cantos 4 px, rodado. Entra com um
  «toque» (escala 1,35 → 1) uma vez, quando aparece. Em movimento reduzido aparece logo.
- **Botões**: planos, tinta sobre papel ou papel sobre tinta, totalmente redondos, 48 px de altura.
  Estados: foco (contorno 3 px tinta, afastado 3 px), ativo (escala 0,97), desativado (40 %).
- **Talão**: superfície branca, borda de baixo em zigue-zague (máscara), linhas com pontos até ao valor.
- **Cabaz do essencial** (`#essencial`): 28 produtos básicos com quantidades de referência de 1 adulto por semana
  (`caiu/cabaz.py`). Botões segmentados (pessoas, semana/mês), três cartões de loja com o total (o mais barato
  em amarelo com o carimbo «Mais barato»), lista de produtos em `<details>` e gráfico do total por dia.
- **Folha do produto**: `<dialog>` que sobe de baixo no telemóvel e fica ao centro no computador.
- **Página do produto** (`/produto/<nome>/`, feita por `caiu/paginas.py`, estilos em `sites/caiu/paginas.css`):
  a folha do produto em página inteira. Topo: migalhas, foto, nome (H1), resposta direta de 40 a 60 palavras e a
  hora da recolha em `<time>`; ao lado (computador) ou logo a seguir (telemóvel) os cartões das lojas, o mais
  barato em amarelo, com carimbo, preço riscado e o mais baixo dos 30 dias anteriores. Depois «A promoção é a
  sério?», o histórico (gráfico igual ao da folha, desenhado no servidor em duas larguras, tabela de 30 dias,
  últimas mudanças com «subiu/desceu» e os preços dia a dia num `<details>`), outros produtos do mesmo termo e o
  método. Movimento: o carimbo bate uma vez ao abrir; as linhas do gráfico riscam-se ao entrar no ecrã (só onde
  há `animation-timeline`); com movimento reduzido fica tudo parado.
- **Cabaz mais barato** (`/cabaz-mais-barato/`): resposta direta, os três cartões de loja do cabaz do essencial
  (média da semana), tabela por agregado e mês, tabela dos produtos com a loja mais barata a amarelo, gráfico e
  tabela por semana, CSV com os dados (CC BY 4.0).

## 5. Layout
Base 4 px (4, 8, 12, 16, 24, 32, 48, 64, 96, 160). Margem 20 px no telemóvel, 48 px no computador,
largura máxima 1240 px. Entre secções 96 px (telemóvel) a 160 px (computador). Secções vizinhas com
composições diferentes (grelha de etiquetas, barras do cabaz, lista em coluna, talão).

## 6. Profundidade
Sem sombras em coisas paradas. A folha do produto tem uma sombra (está mesmo por cima).
Separação por degrau de tom (papel → branco → amarelo).

## 7. Fazer / não fazer
- Fazer: números reais do dia; dizer a hora da recolha; ligar para a página da loja.
- Não fazer: logótipos das lojas, preços inventados, «ofertas imperdíveis», pílulas, ícones em cartões,
  gradientes, emoji, contadores falsos.

## 8. Responsivo
390 px primeiro. Etiquetas: 1 coluna até 560 px, 2 até 960 px, 3 acima. Alvos de toque ≥ 48 px.
Sem scroll horizontal a 320 px. `env(safe-area-inset-bottom)` na folha do produto.

## 9. Para agentes
Páginas para o Google: `caiu/paginas.py` (testes em `caiu/verificar/test_paginas.py`). Regras: resposta direta no
topo (40 a 60 palavras) com números do dia, data visível em `<time>`, schema só com dados verdadeiros, uma página
de produto só quando há dados que cheguem (2+ lojas, ou 7+ dias com mudança de preço ou promoção), endereços que
não mudam. O que está entre `<!--indexnow-->` é o que conta para avisar o Bing de que a página mudou.

Tokens em `sites/caiu/estilo.css` (`:root`). Dados em `/dados/*.json`, escritos por `caiu/recolher.py`
(formato compacto descrito na função `comp`). Estatísticas: `data-site="caiu"`; eventos próprios
`pesquisa`, `lista`, `loja`, `produto`.
