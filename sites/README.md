# Sites estáticos servidos pelo servidor da Hetzner

## duaschaves/
Site de arrendamento Duas Chaves (protótipo com dados de demonstração).

- Publicar: alterar `sites/duaschaves/` e fazer push para `main`. O servidor copia a pasta para
  `/var/www/duaschaves` em menos de 2 minutos (passo «Duas Chaves» em `servidor/atualizar.sh`).
- Endereço de testes: `https://duaschaves.<ip-com-tracos>.sslip.io` (bloco no `servidor/Caddyfile`).
- Domínio: há blocos prontos para `duaschaves.pt` e `chave.pt` (e `www.`). Basta apontar o registo A
  do domínio para o IP do servidor; o atualizador vê o DNS a cada 2 minutos, liga o bloco e o Caddy
  pede o certificado sozinho.
- Enquanto for protótipo, o Caddy manda `X-Robots-Tag: noindex` e há um `robots.txt` que bloqueia tudo.
  Tirar os dois no lançamento.

## goodman/
Goodman, advogado virtual para a lei portuguesa (goodman.pt). A fonte e o construtor vivem fora deste
repositório; aqui fica só o site já construído.

- Publicar: substituir os ficheiros de `sites/goodman/` e fazer push para `main` (passo «Goodman» em `servidor/atualizar.sh`).
- Endereço de testes: `https://goodman.<ip-com-tracos>.sslip.io`, fora do Google.
- Domínio: blocos prontos para `goodman.pt` e `www.goodman.pt`; ligam-se sozinhos quando o registo A apontar para o servidor.
- O chat usa a função `goodman` no Supabase, que só aceita pedidos das origens autorizadas (segredo `ORIGENS`).

## caiu/
caiu.pt, comparador de preços do Continente, Pingo Doce e Auchan que diz se a promoção é a sério.
Desenho em `caiu/DESIGN.md`.

- Publicar: alterar `sites/caiu/` e fazer push para `main` (passo «caiu.pt» em `servidor/atualizar.sh`).
- Preços: `caiu/recolher.py` corre no servidor às 07:20, 12:50 e 18:20 (`caiu-recolha.timer`) e escreve em
  `/var/lib/caiu-dados` (o site lê `/dados/resumo.json`, `/dados/lista.json` e `/dados/h/<id>.json`).
  O histórico fica em `historico.db` (SQLite, nunca servido). Para forçar uma recolha, mudar `caiu/forcar-recolha`.
  As pesquisas feitas em cada loja estão em `caiu/termos.txt`. Teste à mão: workflow «Caiu - recolha de preços (teste)».
- Páginas para o Google e as IAs: `caiu/paginas.py` corre depois de cada recolha e escreve em
  `/var/lib/caiu-dados/paginas` (o Caddy serve-as com o mesmo caminho): `/preco/<termo>/`, `/produto/<nome>/`
  (só produtos com dados que cheguem), `/promocoes/<loja>/`, `/supermercado-mais-barato/`, `/cabaz-mais-barato/`
  (com `historico.csv`), `/estudos/` (só quando um mês tem dados completos) e os sitemaps (`/sitemap.xml` é um
  índice). O endereço de cada produto fica em `estado-paginas.json` e não muda. Testes: `python3 caiu/verificar/test_paginas.py`.
- Endereço de testes: `https://caiu.<ip-com-tracos>.sslip.io`, fora do Google.
- Domínio: blocos prontos para `caiu.pt` e `www.caiu.pt`; ligam-se sozinhos quando o registo A apontar para o servidor.

## webase/
webase.pt, CRM para negócios portugueses (fichas de cliente, pontos, pacotes, leads, chamadas, contratos, equipa
com permissões, marketplace e fórum). Site e app em `sites/webase/` (app em `/app/`, sem compilação); API em
`webase/` (Python, sem dependências). Desenho em `webase/DESIGN.md`.

- Publicar: alterar e fazer push para `main` (passo «webase» em `servidor/atualizar.sh`). A API reinicia sozinha
  quando os `.py` mudam (`webase-api.service`, 127.0.0.1:3160, dados em `/var/lib/webase-api`, configuração em
  `/etc/webase/api.env`).
- Páginas geradas (soluções, preços, marketplace, privacidade, termos): `python3 webase/gerar_paginas.py`
  depois de mudar `sites/webase/index.html`.
- Testes: `python3 webase/testes/teste_api.py` (local) e o workflow «webase - verificar ao vivo» (servidor).
- Endereço de testes: `https://webase.<ip-com-tracos>.sslip.io`, fora do Google. Domínio: blocos prontos para
  `webase.pt` e `www.webase.pt`; ligam-se sozinhos quando o registo A apontar para o servidor.
- Pagamentos desligados (`WB_PAGAMENTOS=desligado`): planos pagos e vendas pagas do marketplace ficam em
  «interesse»/«reservada» até haver um fornecedor de pagamentos.
