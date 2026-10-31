# DESIGN.md — já está (jaesta)

## 1. Tema e ideia
Serviço do Dinis Sousa: faz o site de um negócio local **antes** de o vender. Ideia: «Nesta marca, o carimbo de "feito" torna-se o logótipo». O acento do «já» é um visto azul; o selo redondo «já está · feito para [negócio]» bate no ecrã (página da marca, folha da oferta, imagens de partilha).

## 2. Paleta
| Nome | Hex | Função |
|---|---|---|
| papel | #FAFAF7 | fundo |
| papel-2 | #EFEFE8 | superfícies, botão secundário |
| tinta | #101114 | texto, barra da pré-visualização |
| apoio | #55565E | texto secundário (6,9:1 sobre papel) |
| azul carimbo | #2B3FE0 | ação principal, visto, selo |
| azul claro | #8C9BFF | visto sobre fundo escuro, foco |

## 3. Tipografia
- Archivo variável (a mesma família do dinissousa.pt, para ligar a marca ao Dinis), noutra largura: títulos peso 800, largura 92 %, tracking −0,035 em, entrelinha 0,96.
- Texto 18 px, entrelinha 1,55. Escala: 13 · 15 · 18 · 19–22 · 30–52 · 44–112 px.
- Logótipo: «já está.» em Archivo 850/94, convertido em contornos (img/jaesta-logo.svg). Nunca escrever o logótipo com texto.

## 4. Componentes
- Botão principal: azul, totalmente redondo, 56 px, texto «Quero ver o meu» (página) ou «Quero este site» (pré-visualização).
- Selo: círculo com contorno duplo azul, rodado −12°, «já está / FEITO PARA / nome».
- Barra da pré-visualização (m/demo.css): cápsula tinta em baixo, símbolo azul, «Quero este site»; por cima, a cápsula «Cores» com 3 versões.

## 5. Layout
Margens 20 px (telemóvel) e 56 px (computador); largura máxima 1200 px; secções 104/176 px.

## 6. Profundidade
Sem sombras em coisas paradas; só o telemóvel do topo e as camadas flutuantes (barra, folha, aviso).

## 7. Fazer e não fazer
- Fazer: dados verdadeiros do negócio (nome, horário, morada, nota e número de avaliações do Google); nomes inventados só nos exemplos e sempre ditos como inventados.
- Não fazer: fotos tiradas do Google ou do Instagram do negócio sem autorização; nomes ou texto de avaliações; preços inventados; testemunhos.

## 8. Modelos por ramo (m/)
Cada ramo tem desenho próprio:
- barbearia: noite + osso + vermelho, letra Bookman (TeX Gyre Bonum), poste de barbeiro a rodar, «senha de vez» que imprime.
- obras: betão + tinta + laranja, Helvetica condensada (Heros Cn), planta que se desenha, folha de obra para orçamento.
- beleza: pele + ameixa + rosa, Lora itálico, espelho com a inicial e reflexo, cartão de marcação.
- oficina: asfalto + amarelo, Helvetica itálica, matrícula portuguesa onde se escreve, ficha de serviço.
Todos: 3 versões de cores (window.VERSOES), «aberto agora» na hora de Portugal, horário com o dia de hoje, botões que em pré-visualização mostram o que fariam.

## 9. Movimento
Assinatura: o selo «já está» bate (escala 1,7 → 1, 550 ms). Entradas por secção: subida de 26 px, uma vez. Com movimento reduzido, tudo continua a acontecer (preferência do Dinis), mas as animações sem fim ficam mais lentas e as entradas sem deslocação. Animações em CSS (funcionam em poupança de bateria); o telemóvel do topo para quando não está à vista.

## 10. Guia para agentes
- Dados de um negócio: m/demo.js lê window.D, ou #d=<base64 JSON> no endereço.
- Pré-visualizações fixas: `python3 ferramentas/gerar.py prospetos.json` cria p/<nome>/index.html.
- Preço e renovação estão em m/demo.js (PRECO, RENOVACAO) e em index.html.
