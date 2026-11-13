# AdriBodyPiercing: design

Ler antes de mexer em `sites/adribodypiercing/index.html` (página única, CSS e JS dentro do ficheiro).

## Tema
Estúdio de um piercer só, no Kaos Tattoo (Porto). Escuro e calmo, com o osso e o dourado do logótipo, mas com cara de pessoa: o Adri aparece logo no herói e a secção «Quem te vai furar» vem a seguir às fotos. Tom de conversa, sem ar de luxo.

## Paleta
| Nome | Hex | Função |
|---|---|---|
| noite | #0E0C0B | fundo escuro principal |
| noite-2 | #171513 | degrau de tom (joias, vale, perguntas) |
| cartão | #211E1B / #2A2622 | cartões em fundo escuro, planos, sem contorno nem brilho |
| osso | #EEE8DF | fundo claro e texto em fundo escuro |
| osso-2 | #E4DCD0 | degrau claro (secção «Quem te vai furar») |
| tinta | #141210 | texto em fundo claro |
| ouro | #D9B676 | botão principal e pouco mais |
| ouro-tinta | #7A5820 | dourado em fundo claro (contraste) |

## Tipo
Bricolage Grotesque nos títulos e preços, Figtree no texto. Maiúscula só no início.

## Ordem da página (argumento)
herói → fotos de trabalhos → quem te vai furar → escolhe o sítio (orelha) → preços → como corre → só titânio → vale → depois do piercing → perguntas → marcar → contacto.

## Regras
- A joia é sempre titânio: nada de dourado nas imagens de joias nem no 3D. A imagem fixa do herói é um render do mesmo `monograma('titanio')` do 3D.
- Na tabela de preços, a orelha diz o preço uma vez (é igual em todos os sítios); cada linha fica com nome, tempo de cicatrização e o «+».
- A lista `S` e o `COMBINA` são lidos por `adri/paginas.py`: não mudar os nomes. Depois de mexer nos preços, correr `python3 adri/paginas.py`.
- No computador, o painel ao lado da orelha começa com o hélix como exemplo; no telemóvel a ficha abre ao tocar.
- Verificar a 320, 390 e 1280 px; a 390×844 o botão «Marcar piercing» do herói tem de caber no primeiro ecrã.
