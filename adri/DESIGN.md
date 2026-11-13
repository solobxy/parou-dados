# AdriBodyPiercing: design

Ler antes de mexer em `sites/adribodypiercing/index.html` (página única, CSS e JS dentro do ficheiro).

## Tema
Estúdio de um piercer só, no Kaos Tattoo (Porto). Claro, limpo e descontraído, sem ar de luxo. O Adri aparece logo no herói e a secção «Quem te vai furar» vem a seguir às fotos. A cor vem do titânio: grafite como o metal e o azul do titânio anodizado.

## Paleta (60-30-10)
| Nome | Hex | Função |
|---|---|---|
| osso | #EFEAE3 | 60 %: fundo da maior parte das secções |
| osso-2 | #E5DFD6 | degrau de tom (quem te vai furar, preços, vale, perguntas) |
| grafite (noite / tinta) | #1C1B1D | 30 %: texto, herói, fotos, joias, contacto, cartões escuros |
| noite-2 | #232225 | degrau escuro (joias) |
| acento (azul anodizado) | #4258DE | 10 %: botões, ponto escolhido no mapa, barra do logótipo. Texto branco 5,7:1 |
| acento-tinta | #2F49D1 | azul em texto sobre fundo claro (5,3:1 ou mais) |
| acento-claro | #9AA8FF | azul em texto ou foco sobre fundo escuro (7,7:1) |
| sec-claro / sec-escuro | #55524E / #B9B7BC | texto secundário no claro / no escuro |

Nada de dourado: contradiz «Só titânio». As páginas /piercing/ (adri/paginas.py), o 404, o ícone e a imagem de partilha seguem a mesma paleta.

## Tipo
Bricolage Grotesque nos títulos e preços, Figtree no texto. Maiúscula só no início.

## Ordem da página (argumento)
herói → fotos de trabalhos → quem te vai furar → escolhe o sítio (orelha) → preços → como corre → só titânio → vale → depois do piercing → perguntas → marcar → contacto.

## Regras
- A joia é sempre titânio: nada de dourado nas imagens de joias, no 3D nem na interface. A imagem fixa do herói é um render do mesmo `monograma('titanio')` do 3D.
- Na tabela de preços, a orelha diz o preço uma vez (é igual em todos os sítios); cada linha fica com nome, tempo de cicatrização e o «+».
- A lista `S` e o `COMBINA` são lidos por `adri/paginas.py`: não mudar os nomes. Depois de mexer nos preços, correr `python3 adri/paginas.py`.
- No computador, o painel ao lado da orelha começa com o hélix como exemplo; no telemóvel a ficha abre ao tocar.
- Verificar a 320, 390 e 1280 px; a 390×844 o botão «Marcar piercing» do herói tem de caber no primeiro ecrã.

## Painel do Adri (/adri-agenda-k7q2/)
- Três secções: **Agenda** (pedidos, marcações, bloqueios, mensagens), **Site** (preços, horário e morada, fotos, avaliações) e **Números** (visitas do site e números da agenda).
- O que ele muda fica na tabela `config` da agenda e o site lê tudo em `/api/site` (index, páginas /piercing/). A página já vem com os valores de origem, por isso funciona mesmo se a API falhar.
- Fotos: o telemóvel reduz a foto antes de enviar; a agenda só aceita WebP ou JPEG verdadeiros até 3 MB, com nome aleatório, servidos em /api/fotos/.
- Avaliações: link de uso único (90 dias) em /avaliar/#código; a avaliação aparece logo na secção «Quem já furou comigo» (escondida enquanto não houver nenhuma). Esconder só serve para textos ofensivos.
- Testes: `python3 adri/test_agenda.py` (corre todos os dias no guarda-testes).
