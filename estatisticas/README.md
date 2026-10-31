# Estatísticas dos sites

Recolha própria de estatísticas para todos os sites (sem cookies e sem guardar IPs) e o painel privado.

## Como funciona

1. Cada página carrega `<script defer src="/_e.js" data-site="ID"></script>`.
2. O Caddy de cada domínio serve o script (`servidor/estatisticas/e.js`, copiado para `/var/www/_estatisticas`)
   e recebe os dados em `/_e`, que envia para o Supabase (projeto **estatisticas**, `hvvvswhwcpavucwrvlsf`,
   função `public.recolher`). O Caddy junta o IP (só para o identificador diário, nunca guardado) e uma chave.
3. A chave fica só no servidor, em `/etc/estatisticas.env` (gerada pelo `atualizar.sh`). O Supabase guarda
   o hash dela em `estat.config` (`hash_chave`). O hash aparece em `/_estado-servidor` (endereço de testes).
   Se o servidor for recriado, a chave muda: copiar o hash novo para `estat.config` (o painel mostra
   «Chave errada» no separador Técnico enquanto não for feito).
4. Os dados ficam no esquema `estat` (visitas, cliques, eventos, erros). As funções `estat.painel_*`
   devolvem cada parte do painel em JSON, por exemplo:
   `select estat.painel_paginas('parou', '2026-11-01', '2026-11-30', false, null, null);`

## O que se recolhe

Páginas vistas, visitas (30 min sem atividade), tempo ativo, scroll, cliques (posição, elemento,
se é clicável, cliques de raiva), origem (Google, Instagram, ...), UTM e cliques de anúncios
(fbclid, gclid, ttclid), país pelo fuso horário, aparelho, sistema, navegador, idioma, ecrã,
velocidade (LCP, CLS, INP, TTFB), erros de JavaScript e ações (WhatsApp, telefone, email,
formulários, downloads, ligações para fora). Robôs e o modo `?naocontar` não contam.

Eventos próprios numa página: `estat('subscrever', 'mensal')` (com a linha
`window.estat=window.estat||function(){(estat.q=estat.q||[]).push(arguments)}` antes, se for chamado
antes de o script carregar).

## Site novo

1. `insert into estat.sites (id, nome, dominios) values ('id', 'Nome', array['dominio.pt']);`
2. No `servidor/Caddyfile`, `import estatisticas` no bloco do site.
3. A etiqueta do script em todas as páginas públicas (nunca nas páginas de administração).
4. Correr o workflow «Estatísticas - visita de verificação» com o endereço do site.

## Painel

O painel é um artefacto do tipo Dashboard que lê as funções `estat.painel_*` pelo conector do Supabase.
`estatisticas/painel/` tem a cópia da página (index.html, app.js, estilo.css).
