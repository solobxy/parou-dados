# ganhas.pt — DESIGN.md

Ler antes de mexer em qualquer página. O site é gerado por `ganhas/gerar.py` para `sites/ganhas/`.

## 1. Tema e atmosfera

O objeto deste mundo é o **recibo de vencimento**: papel branco, linhas «Vencimento base», «Subsídio de alimentação»,
«Segurança Social 11 %», «Retenção de IRS», «Líquido a receber». Quem quer perceber o recibo passa-lhe um
**marcador fluorescente** por cima e escreve à margem com **caneta azul**.

A ideia da página: **«Nesta página, a linha do teu salário no recibo torna-se um traço de marcador que mostra onde
estás no país.»** (teste do concorrente: Glassdoor, Paylab e levels.fyi não usam nada disto.)

Tom: jornal de dados português, direto, sem hipérbole. Os números são o herói. Não há fotografias: num produto de
dados, as imagens são os próprios gráficos (exceção consciente à regra das 4 imagens reais).

## 2. Paleta (função antes de cor)

| Nome | Hex | Função |
|---|---|---|
| papel | `#F7F7F2` | fundo |
| folha | `#FFFFFF` | superfícies (calculadora, formulário) |
| tinta | `#111311` | texto e gráficos (texto corrido sempre na tinta cheia) |
| tinta-2 | `#4A4F4A` | texto secundário (≥ 7:1 sobre papel) |
| risco | `#DCDDD4` | divisões por degrau de tom (decorativo, nunca para dados) |
| barra | `#868980` | barras neutras dos gráficos (3,3:1 sobre papel, acima dos 3:1 da WCAG para gráficos) |
| marcador | `#FFE500` | acento único: botão principal e o traço «tu estás aqui». Texto sobre ele sempre em tinta (contraste 14,6:1) |
| caneta | `#1F3FD8` | ligações e anotações à margem (7,1:1 sobre papel) |
| alerta | `#B42318` | erros de formulário (com ícone e texto, nunca só cor) |

Modo escuro: papel `#0F110F`, folha `#171A17`, tinta `#F1F2EC`, tinta-2 `#B9BDB5`, risco `#2C302C`,
marcador igual (texto em `#111311` por cima), caneta `#8FA5FF`.

## 3. Tipografia

- **Bricolage Grotesque** (variável: wght 200–800, wdth 75–100, opsz 12–96) só para títulos e números grandes.
  Números gigantes com `wdth 75` (condensado), tracking −0,03 em, entrelinha 0,9.
- **Schibsted Grotesk** (variável 400–900) para texto, interface e tabelas. Sem `tabular-nums`: nestas fontes o tnum também alarga a vírgula e o ponto e o texto fica «1 . 200 , 00».
- Escala (px): 14 · 16 · 18 · 24 · 36 · 56 · clamp(64, 18vw, 200) para o «Quanto ganhas?».
- Texto 17 px telemóvel / 18 px desktop, entrelinha 1,55, máx. 68 caracteres.
- `text-wrap: balance` em títulos, `pretty` em parágrafos. Aspas « », reticências …, espaço inseparável antes de €.

## 4. Componentes e estados

- **Botão principal:** fundo marcador, texto tinta, raio 0 (canto vivo, como papel), altura 56 px, peso 700.
  Estados: hover escurece para `#F5D800`; foco = contorno 3 px caneta com 2 px de afastamento; ativo desce 1 px;
  a carregar mostra «A enviar…» e fica ativo até o pedido começar.
- **Botão secundário:** sublinhado caneta, sem caixa.
- **Campo de salário:** número gigante (Bricolage 56–96 px), `inputmode="decimal"`, sufixo «€ brutos por mês»,
  linha inferior de 2 px tinta (como a linha do recibo); erro por baixo com ícone.
- **Linhas de recibo:** pares rótulo · valor alinhados à direita com pontilhado de guia (o recibo verdadeiro).
- **Traço de marcador:** `::before` com `transform: scaleX()` de 0 a 1 em 520 ms, origem à esquerda,
  ligeira inclinação de −1° e bordos irregulares (máscara SVG). É o movimento assinatura.
- **Navegação:** marca «ganhas.pt» + 4 ligações (Calculadora, Profissões, Concelhos, Partilhar). No telemóvel,
  barra inferior fixa só com «Partilhar o meu salário» quando o comparador já não está à vista.

## 5. Layout e espaço

- Base 4 px; passos 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192.
- Grelha de 12 colunas no desktop (máx. 1240 px), margens 20 px no telemóvel e 40 px no desktop.
- Entre secções 128–192 px no desktop, 96 px no telemóvel. Secções vizinhas com composições diferentes
  (gráfico largo → recibo estreito → lista em duas colunas → número gigante).
- Sem caixas dentro de caixas. Separar com espaço e degrau de tom (papel ↔ folha), nunca com sombras.

## 6. Profundidade

Nenhuma sombra em coisas paradas. A única elevação é a folha (branco) sobre o papel. Folhas que abrem
(partilhar, menu) sobem com sombra curta `0 8px 24px rgb(0 0 0 / .12)` porque estão mesmo por cima.

## 7. Fazer e não fazer

Fazer: números completos e com fonte e data; mediana antes da média; «bruto» e «líquido» sempre escritos;
dizer quantas respostas há; mostrar «faltam X respostas» em vez de inventar.
Não fazer: estrelas, testemunhos ou contadores falsos; gradientes; cartões com ícone; pílulas; maiúsculas
espaçadas; monoespaçada; emoji; numeração 01/02/03; urgência falsa; anúncios por cima do conteúdo.

## 8. Responsivo

- Desenhado primeiro para 360–390 px. Pontos de quebra 640, 960, 1280.
- Alvos de toque ≥ 48 px. Nada partido a 320 px. `env(safe-area-inset-*)` na barra inferior.
- Gráficos: histograma passa de horizontal (desktop) para barras empilhadas mais altas (telemóvel);
  tabelas grandes viram listas de linhas de recibo.

## 9. Movimento

- Assinatura: traço de marcador nos números-chave quando entram no ecrã (uma vez).
- O número do resultado conta até ao valor final em 600 ms (ease-out).
- O marcador «tu» do histograma desliza para a posição (transform, 450 ms).
- Entradas por secção: título → texto → gráfico, 70 ms entre si, subida 20 px, uma só vez.
- Com `prefers-reduced-motion` (e em poupança de bateria) **mantém-se** o traço de marcador, a contagem e os
  estados (não mexem o espaço nem causam enjoo); só se tiram as subidas e deslizes. Nada fica escondido sem script.
- Só `transform` e `opacity`; nunca `transition: all`.

## 10. Guia rápido para agentes

- Cores: papel F7F7F2, tinta 111311, marcador FFE500, caneta 1F3FD8.
- Fontes: Bricolage (títulos/números), Schibsted (resto).
- Regra de dados: cada número na página tem fonte, ano e ligação em `/fontes`. Comunidade só com n ≥ 5.
- Crédito no rodapé: «Feito por dinissousa» com ligação para https://dinissousa.pt.
