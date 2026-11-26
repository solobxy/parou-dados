# Alterações à app à espera de publicação

- `app-greve-desta.patch` (26/11/2026): «desta quinta-feira» numa notícia passa a ser o próprio dia. Sem isto, a notícia da RTP sobre a greve da CP de 26/11 cria uma greve falsa da CP a 3/12. Aplicar em `solobxy/parou` com `git am`, correr o `a-bordo.yml` e publicar. O teste já está em `auditoria/greves-noticias.mjs` (falha até a correção entrar na app).
