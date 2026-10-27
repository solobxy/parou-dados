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
