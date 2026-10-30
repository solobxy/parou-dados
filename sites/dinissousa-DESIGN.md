# DESIGN.md — dinissousa.pt

## 1. Tema e ideia
Portfólio e página de venda do Dinis Sousa. Ideia: «Nesta página, cada projeto real torna-se o mundo da página»: ao fazer scroll, o site inteiro muda para as cores do projeto que está à vista. O logótipo (marcas de corte à volta de um quadrado, «a seleção») acompanha: o quadrado ganha a cor do mundo atual.

## 2. Paleta (base)
| Nome | Hex | Função |
|---|---|---|
| papel | #F1F1EF | fundo base |
| tinta | #0E0E0E | texto e botão principal |
| apoio | #55554F | texto secundário (6,6:1 sobre papel) |
| superfície | #E2E2DE | cartões e botão secundário |

Mundos (fundo / tinta / apoio / acento):
- PAROU: #16151A / #FFFFFF / #A8A6AE / #FF6B1A
- anjinho: #DCE8F4 / #1D1719 / #4D4A55 / #1D1719 (rosa #F2A7BD só em pormenor)
- jinxed: #110D0E / #EAE3DA / #A69F98 / #D6101C
- Duplicasa: #F3F5F4 / #10241B / #4A5A52 / #0E6B4F

## 3. Tipografia
- Archivo variável (largura 62–125, peso 100–900), alojada no próprio site.
  - Nome e títulos: peso 800, largura 108–112, tracking −0,035 em, entrelinha 0,88–1,05.
  - Texto: 17–19 px, entrelinha 1,5, largura 100.
- Newsreader itálico 500: só na pré-visualização «Suave».
- Escala: 15 · 17 · 21 · 28 · 44 · clamp(64–176) px.

## 4. Componentes
- Botão principal: tinta cheia, totalmente redondo, 54 px de altura, texto «Pedir o meu site» igual em todo o site.
- Botão secundário: superfície, mesmo formato.
- Telemóveis: imagem real com aro de 7 px da cor de aro do mundo, raio 34 px.
- Cartões de preço: quadrados (raio 0), separados por tom; o recomendado em tinta.

## 5. Layout
- Margens: 20 px (telemóvel), 56 px (computador). Largura máxima 1320 px.
- Espaço entre secções: 112 px (telemóvel), 176 px (computador).
- Projetos alternam lado do telemóvel no computador.

## 6. Profundidade
Sem sombras em elementos parados. Separação por tom e espaço.

## 7. Fazer e não fazer
- Fazer: imagens reais, uma ação por ecrã, texto em PT-PT, prova verdadeira.
- Não fazer: monoespaçada, etiquetas pequenas acima de títulos, numeração 01/02, linhas de 1 px, gradientes, vidro desfocado, emoji, testemunhos ou números inventados.

## 8. Responsivo
Pontos de quebra: 720 px e 1080 px. Alvos de toque ≥ 44 px. Sem scroll horizontal a 320 px.

## 9. Movimento
- Momento assinatura: ao abrir, o nome estica de condensado para largo, as marcas de corte do logótipo «selecionam» o quadrado e os telemóveis abrem em leque.
- Scroll: mudança de mundo (cor de fundo e texto, 600 ms).
- Entradas por secção: subida de 24 px, 70 ms entre elementos, uma vez.
- Movimento reduzido: tudo continua a acontecer, mas sem deslocações grandes (só opacidade, cor e escala até 2%).
