# Dayla Araújo Body Piercing: design

Ler antes de mexer no site (`dayla/modelo.html` + `dayla/textos.py`, construído por `python3 dayla/construir.py`)
ou no painel (`sites/dayla/painel-dayla-r7k3/index.html`). Desenho próprio: não copiar o do AdriBodyPiercing.

## Tema
Piercer independente no Porto, sem estúdio fixo (atende no estúdio onde estiver nesse dia). Comunicativa, calma,
engraçada, estilosa, apaixonada por ténis de skate (Vans). Pedido do Dinis (14/11/2026): **preto em quase tudo,
detalhes brancos, rosa só onde dá charme**. Fotografia e vídeo reais dela à frente.

Ideia: **o xadrez dos ténis de skate** aparece só como assinatura (faixa que vira casa a casa, tira vertical ao lado
do vídeo, canhoto do bilhete) e há sempre **uma única casa rosa** em cada xadrez.

## Paleta
| Nome | Valor | Função |
|---|---|---|
| fundo | #0A0A0A | fundo de quase tudo |
| sup / sup-2 | #141414 / #1D1D1D | degrau de tom (preços, como funciona, perguntas, campos, cartões) |
| tx | #F4F3F0 | texto, botão principal (texto fundo), casas brancas do xadrez |
| tx-2 | #A3A3A0 | texto secundário (8:1 no fundo) |
| linha / linha-2 | branco a 12 % / 28 % | divisórias de listas e contornos finos de botões secundários |
| rosa | #F2B5CB | só: argola do logótipo, uma casa de cada xadrez, ponto dos pinos, ponto da barra, foco, erros, último passo |

## Tipo
Archivo variável (ficheiro próprio). Títulos 800, largura 74 %, entrelinha 0,94; preços 800 a 108 %; texto 400 a 17–18 px.
O h1 está partido em duas linhas fixas (`.l`), que sobem por máscara ao abrir.

## Componentes
- Botão principal: branco cheio, texto preto, pílula. Secundário: contorno de 1 px branco a 28 %, ou ligação com seta.
- Linha de preço: nome + cicatrização, preço, botão redondo «+» (contorno fino) que fica branco com visto quando escolhido.
- Visagismo: fotos reais da Dayla com pinos (anel branco, ponto rosa, onda 2 vezes) e etiquetas; «Projeto 1/2» alterna.
- Bilhete do pedido: cartão sup com canhoto em xadrez; cada escolha pinta uma casa de rosa.
- Campos: fundo sup, contorno 1 px, foco branco com halo rosa suave.
- Nada de rolagem lateral escondida: os botões das categorias quebram linha; no painel, «Site» é um menu em lista.

## Movimento
h1 por máscara (0,9 s), resto do herói a aparecer; faixa de xadrez vira casa a casa; pinos com onda; botões com mola curta.
Vídeo do herói: é fundo, não conteúdo. Toca sempre, sem som e sem botões (pedido do Dinis, 14/11/2026), em câmara lenta (2,5×, frames interpolados), estabilizado, com cor fria e dessaturada e um ciclo sem corte (dissolve de 1,2 s). Por cima, uma aproximação lenta (22 s) que desliga com redução de movimento; o vídeo continua. Pausa só quando sai do ecrã. Em poupança de bateria no iPhone arranca ao primeiro toque. Ficheiros com nome novo a cada versão (/vid/ fica 30 dias em cache).
(fica o cartaz). Com redução de movimento tudo passa a fades curtos.

## Fotos
`dayla/fotos-iniciais/` (com `lista.json`) entram na galeria na primeira vez que a agenda arranca; depois a Dayla gere-as
no painel. As mesmas estão em `sites/dayla/img/t-*.webp` para a página funcionar sem a API.
Os pontos do visagismo estão em `PROJETOS` (`dayla/construir.py`), em % da foto.

## Verificar
12 larguras (320 a 1920), com e sem redução de movimento, PT e EN: sem rolagem lateral e títulos em 2 linhas no máximo.

## Pré-visualizações dos links
Imagens de 1200×630 em sites/dayla/partilha (site PT e EN, painel, avaliar), geradas por `python3 dayla/partilha.py` com a letra e o logótipo do site: foto real com a margem esquerda a fundir no preto, título em duas linhas, faixa de xadrez em baixo com a casa rosa alinhada ao texto. No site, uma argola rosa marca o flat da foto (a mesma das marcações do visagismo). As etiquetas og: ficam no início do head. O servidor troca daylapiercing.pt pelo endereço que está a funcionar, para a imagem nunca falhar. Ao mudar uma imagem, mudar também o nome do ficheiro: o WhatsApp e o Facebook guardam a pré-visualização em cache.
