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
- **Folha do produto**: `<dialog>` que sobe de baixo no telemóvel e fica ao centro no computador.

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
Tokens em `sites/caiu/estilo.css` (`:root`). Dados em `/dados/*.json`, escritos por `caiu/recolher.py`
(formato compacto descrito na função `comp`). Estatísticas: `data-site="caiu"`; eventos próprios
`pesquisa`, `lista`, `loja`, `produto`.
