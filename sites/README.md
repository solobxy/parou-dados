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
