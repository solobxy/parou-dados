# webase — DESIGN.md

Lê isto antes de mexer em qualquer ecrã da webase (site público e app).

## 1. Tema e atmosfera

A webase é a base de clientes de um negócio português: da barbearia à equipa de vendas de telecomunicações.
O mundo de onde vem: o caderno de clientes ao balcão, a ficha em papel, o cartão de carimbos do café.
A marca transforma esses objetos numa ferramenta calma e exata. Papel claro, tinta escura, um azul de carimbo.

Ideia da página pública: **o cartão de carimbos de papel torna-se a ficha viva do cliente.**
Movimento assinatura: **o carimbo** — um círculo azul que pousa (escala 1,12 → 1, rotação −8° → −4°, 240 ms, ease-out)
quando algo importante acontece: cliente criado, pontos dados, negócio ganho, compra feita.

## 2. Paleta

| Nome | Hex | Função |
|---|---|---|
| Papel | `#F4F4F1` | fundo do site e da app |
| Folha | `#FFFFFF` | superfícies (fichas, tabelas, painéis) |
| Folha 2 | `#ECECE7` | degrau de tom (linhas alternadas, zonas de apoio) |
| Tinta | `#14161B` | texto e ícones |
| Tinta 2 | `#4B505B` | texto secundário (7,6:1 sobre Papel) |
| Carimbo | `#2B3FD6` | ação principal, ligações, o carimbo (7,6:1 com branco) |
| Carimbo escuro | `#1C2BA8` | hover/ativo do Carimbo |
| Noite | `#0F1438` | campo de cor do site (secções escuras) |
| Verde | `#1E7A4C` | ganho, ativo, pago |
| Âmbar | `#8A5A00` | a terminar, a renovar, atenção |
| Vermelho | `#B42318` | perdido, erro, apagar |

Regra: o Carimbo vai no botão principal e, no máximo, em mais uma coisa por ecrã. Estados nunca só por cor
(sempre com texto: «Ativo», «A terminar», «Perdido»).

## 3. Tipografia

Uma família: **Instrument Sans** (variável, `wght` 400–700, `wdth` 75–100), servida pelo próprio site (`/fontes/instrument.woff2`).

| Papel | Tamanho | Peso / largura | Entrelinha | Tracking |
|---|---|---|---|---|
| Display (site) | clamp(40px, 6.4vw, 88px) | 600 / 82 | 0,96 | −0,035em |
| Título 2 | clamp(30px, 4vw, 52px) | 600 / 85 | 1,02 | −0,03em |
| Título 3 / app h1 | 22–26px | 600 / 90 | 1,15 | −0,015em |
| Texto | 17px (site), 15px (app) | 400 / 100 | 1,5 | 0 |
| Pequeno | 13px | 500 / 100 | 1,4 | 0 |
| Números | herdam, `tabular-nums` | — | — | — |

Maiúscula só no início. Sem maiúsculas pequenas espaçadas, sem monoespaçada.

## 4. Componentes

- **Botão principal**: Carimbo cheio, texto branco 15px/600, altura 44px, raio total (pílula). Hover: Carimbo escuro. Ativo: escala 0,98. Foco: anel 3px Carimbo a 40 % + 2px de afastamento. A carregar: texto mantém-se, botão desativado com «A guardar…».
- **Botão secundário**: fundo Folha 2, texto Tinta. **Botão perigoso**: texto Vermelho sobre Folha 2; confirmação sempre.
- **Campos**: altura 44px, raio 6px, fundo Folha, contorno interior de 1,5px `#C9CAC2` (3:1 sobre Folha); foco Carimbo. Rótulo sempre visível por cima. Erro por baixo, em Vermelho, com o que fazer.
- **Fichas/painéis**: Folha, raio 8px, sem sombra quando parados. Sombra só em coisas que flutuam (menus, folhas, diálogos): `0 1px 2px rgb(20 22 27 / .06), 0 12px 32px rgb(20 22 27 / .12)`.
- **Estado (etiqueta)**: texto 13px/600 com ponto de cor antes (●), sem caixa.
- **Navegação da app**: computador — barra lateral 248px (Tinta sobre Papel); telemóvel — barra inferior com 5 destinos + «Mais».
- **Navegação do site**: marca, 4 ligações, «Entrar» e «Criar conta grátis».

## 5. Layout e espaço

Escala de espaço (px): 4, 8, 12, 16, 24, 32, 48, 64, 96, 144. Site: margens laterais 20px (telemóvel) a 48px; largura máxima 1240px;
entre secções 144px no computador, 96px no telemóvel. App: conteúdo até 1180px, margens 16–32px.

## 6. Profundidade

Plano por omissão. Separação por degrau de tom (Papel → Folha → Folha 2), não por linhas. Linhas só em tabelas da app, 1px `#E4E4DE`.

## 7. Fazer e não fazer

Fazer: imagens reais da app (capturas), conteúdo completo, números com `Intl` pt-PT (1 234,50 €), datas dd/mm/aaaa, aspas « ».
Não fazer: cartões com ícone em fila, gradientes, vidro desfocado, emoji, dashboards inventados, testemunhos ou logótipos falsos,
etiquetas em pílula acima dos títulos, numeração 01/02/03, «tudo-em-um», «revolucionar», «sem esforço».

## 8. Responsivo

Quebras: 560, 900, 1200px. Alvos de toque ≥ 44px. Tabelas da app passam a lista de fichas abaixo de 900px.
Kanban: arrastar no computador; em qualquer ecrã há o botão «Mover para…» (alternativa ao arrastar).
`env(safe-area-inset-*)` na barra inferior. Sem scroll horizontal a 320px.

## 9. Movimento

Só `transform` e `opacity`. Entradas 200–260ms ease-out, saídas 160ms ease-in. Stagger 40ms, máximo 6 itens, só na primeira entrada.
`prefers-reduced-motion: reduce` → sem deslocações nem escala; o carimbo aparece já pousado. O conteúdo nunca depende do script para aparecer.
Com poupança de bateria (sem `requestAnimationFrame` fluido) nada fica a meio: as animações são CSS e acabam no estado final.

## 10. Guia rápido para agentes

Fundo `#F4F4F1` · superfície `#FFFFFF` · texto `#14161B` · secundário `#4B505B` · ação `#2B3FD6` · campo escuro `#0F1438`.
Fonte: `"Instrument Sans", system-ui`. Títulos 600 com `font-stretch: 82%`. Raio: pílula nos botões, 6px nos campos, 8px nas fichas.
