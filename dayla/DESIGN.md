# Dayla Araújo Body Piercing: design

Ler antes de mexer no site (`dayla/modelo.html`, construído por `dayla/construir.py`) ou no painel
(`sites/dayla/<painel>/index.html`). O desenho é próprio: não copiar o do AdriBodyPiercing.

## Tema
Piercer independente no Porto, sem estúdio fixo: atende por marcação no estúdio onde estiver nesse dia.
Comunicativa, calma, engraçada, descontraída, estilosa, apaixonada por ténis de skate (Vans). Quer uma sala
futura a preto e branco com o rosa só nos detalhes. O site é a primeira conversa: o cliente chega ao WhatsApp
já com os preços, os cuidados e o que quer.

Ideia: **o xadrez dos ténis de skate é o bilhete da marcação**. Cada piercing que o cliente escolhe vira uma
casa rosa no canhoto do bilhete. O rosa só aparece quando há uma escolha (botão, casa escolhida, seleção).

## Paleta (60-30-10)
| Nome | Hex | Função |
|---|---|---|
| papel | #F5F5F3 | 60 %: fundo da maior parte das secções |
| papel-2 | #E8E8E4 | degrau de tom (preços, perguntas, bilhete) |
| tinta | #101010 | 30 %: texto, herói, secções escuras, casas pretas do xadrez |
| tinta-2 | #1C1C1C | degrau escuro |
| rosa | #F7B8D2 | 10 %: botão principal (texto tinta, 11,5:1), casas escolhidas, seleção, foco no escuro |
| rosa-tinta | #B02A66 | rosa em texto pequeno sobre papel (5,7:1): só em ligações dentro de texto |
| sec / sec-escuro | #545454 / #B5B5B5 | texto secundário no claro (6,9:1) / no escuro (9,3:1) |

Nada de gradientes decorativos nem sombras paradas. O xadrez é um padrão (conic-gradient), nunca imagem.

## Tipo
Uma família: **Archivo** variável (peso 100–900, largura 62–125 %), ficheiro próprio em `/fonts/`.
- Títulos: 820, largura 72 % (condensado), entrelinha 0,92, tracking −0,02 em. Maiúscula só no início.
- Logótipo e preços grandes: 860, largura 118 % (largo).
- Texto: 400, largura 100 %, 17–18 px, entrelinha 1,5. Preços e horas com `tabular-nums`.

## Componentes
- Botão principal: rosa com texto tinta e contorno tinta de 2 px, raio 999 px. Secundário: contorno tinta, fundo transparente.
- Linha de preço: nome, tempo de cicatrização, preço e botão «+» de 44 px que vira «✓» (casa rosa).
- Bilhete: corpo papel-2, canhoto em xadrez 2×6 casas; cada escolha vira uma casa rosa (até 6).
- Campos: fundo branco, contorno tinta 2 px, rótulo sempre visível, erro por baixo do campo.

## Movimento
- Assinatura: casas do xadrez que viram (rotateY 180°, 420 ms, ease-out) quando se escolhe um piercing e, uma vez,
  na entrada do herói. Com redução de movimento: troca de cor com fade de 150 ms (continua a haver resposta).
- Entradas de secção: título, texto, resto (subida 20 px, 70 ms entre eles, uma vez). Só transform e opacity.
- Nada em ciclo contínuo (poupança de bateria).

## Layout
Base 4 px (8, 12, 16, 24, 32, 48, 64, 96, 128). Margem 20 px no telemóvel, 40 px no computador, largura máx. 1200 px.
Secções alternam composição: herói a duas colunas, preços em lista larga, projeto com texto + xadrez, como funciona
em linha de tempo, sobre com foto, cuidados em duas colunas, perguntas em acordeão, bilhete centrado.

## Ordem da página (argumento)
herói (quem, o quê, onde) → trabalhos (só com fotos) → preços (tudo à vista, toca para juntar ao pedido) →
projeto/visagismo → como funciona (sem estúdio fixo: «tu dizes quando, eu digo onde») → quem te vai furar →
avaliações (só quando houver) → joias (só quando houver) → cuidados → perguntas → pedido (bilhete) → contacto.

## Línguas
Português em `/` e inglês em `/en/`, gerados de `dayla/textos.py` por `python3 dayla/construir.py`.
Os textos que a Dayla muda no painel (nomes dos piercings, preços, nota dos preços) vêm em PT e EN.

## Painel (`/painel-dayla-r7k3/`)
Telemóvel primeiro, separadores em baixo: Pedidos, Dias, Site, Números. Mesmo papel/tinta/rosa do site,
mas mais calmo: sem xadrez, só uma casa rosa a marcar o separador ativo.

## Fazer e não fazer
- Fazer: preços completos, frases curtas na voz dela (primeira pessoa), PT-PT no português.
- Não fazer: logótipo, faixa lateral ou nome da Vans em imagens; fotos que não sejam dela; preços inventados;
  avaliações que não venham do link de uso único.
- Verificar a 320, 390 e 1280 px, com e sem redução de movimento.
