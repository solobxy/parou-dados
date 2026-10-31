-- Funções do painel de estatísticas: cada painel_<nome> devolve as linhas de uma parte do painel em JSON.
-- Exemplo para análise: select estat.painel_paginas('parou', '2026-11-01', '2026-11-30', false, null, null);

create or replace function estat.f_janela(p_site text, p_de date, p_ate date, p_teste boolean)
returns table (de date, ate date, site text, teste boolean, t0 timestamptz, t1 timestamptz)
language sql stable set search_path = '' as $f$
select d.de, d.ate, nullif(p_site, 'todos'), coalesce(p_teste, true),
       cast(d.de as timestamp) at time zone 'Europe/Lisbon', cast(d.ate + 1 as timestamp) at time zone 'Europe/Lisbon'
from (select coalesce(p_de, cast(now() at time zone 'Europe/Lisbon' as date) - 29) as de,
             coalesce(p_ate, cast(now() at time zone 'Europe/Lisbon' as date)) as ate) d
$f$;

create or replace function estat.f_visitas(p_site text, p_de date, p_ate date, p_teste boolean)
returns setof estat.visitas language sql stable set search_path = '' as $f$
select x.* from estat.visitas x, estat.f_janela(p_site, p_de, p_ate, p_teste) j
where x.inicio >= j.t0 and x.inicio < j.t1 and (j.site is null or x.site = j.site) and (j.teste or not x.teste)
$f$;

create or replace function estat.f_eventos(p_site text, p_de date, p_ate date, p_teste boolean)
returns setof estat.eventos language sql stable set search_path = '' as $f$
select x.* from estat.eventos x, estat.f_janela(p_site, p_de, p_ate, p_teste) j
where x.quando >= j.t0 and x.quando < j.t1 and (j.site is null or x.site = j.site) and (j.teste or not x.teste)
$f$;

create or replace function estat.f_erros(p_site text, p_de date, p_ate date, p_teste boolean)
returns setof estat.erros language sql stable set search_path = '' as $f$
select x.* from estat.erros x, estat.f_janela(p_site, p_de, p_ate, p_teste) j
where x.quando >= j.t0 and x.quando < j.t1 and (j.site is null or x.site = j.site) and (j.teste or not x.teste)
$f$;

create or replace function estat.painel_resumo(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
WITH j AS (SELECT * FROM estat.f_janela(p_site, p_de, p_ate, p_teste)),
v AS (SELECT * FROM estat.f_visitas(p_site, p_de, p_ate, p_teste)), a AS (
SELECT x.* FROM estat.visitas x CROSS JOIN j
WHERE x.inicio >= j.t0 - (j.t1 - j.t0) AND x.inicio < j.t0
AND (j.site IS NULL OR x.site = j.site)
AND (j.teste OR NOT x.teste)
), t AS (
SELECT 'atual' AS periodo, v.* FROM v
UNION ALL
SELECT 'anterior' AS periodo, a.* FROM a
), s AS (
SELECT periodo, sessao, count(*) AS paginas, sum(tempo_ativo_ms) AS tempo, sum(interacoes) AS inter
FROM t GROUP BY periodo, sessao
), k AS (
SELECT periodo, count(DISTINCT visitante) AS visitantes, count(DISTINCT sessao) AS visitas,
count(*) AS paginas_vistas, round(avg(scroll_max)) AS scroll_medio
FROM t GROUP BY periodo
), ks AS (
SELECT periodo, round(avg(tempo) / 1000.0) AS tempo_medio_s,
round(100.0 * avg(CASE WHEN paginas = 1 AND inter = 0 AND tempo < 10000 THEN 1 ELSE 0 END)) AS rejeicao
FROM s GROUP BY periodo
), c AS (
SELECT t.periodo, count(*) AS contactos, count(DISTINCT t.sessao) AS visitas_contacto
FROM estat.eventos e JOIN t ON t.id = e.visita
WHERE e.nome IN ('whatsapp', 'telefone', 'email', 'formulario')
GROUP BY t.periodo
), z AS (
SELECT per.periodo, COALESCE(k.visitantes, 0) AS visitantes, COALESCE(k.visitas, 0) AS visitas,
COALESCE(k.paginas_vistas, 0) AS paginas_vistas, k.scroll_medio, ks.tempo_medio_s, ks.rejeicao,
COALESCE(c.contactos, 0) AS contactos,
round(100.0 * COALESCE(c.visitas_contacto, 0) / NULLIF(k.visitas, 0), 1) AS taxa_contacto
FROM (VALUES ('atual'), ('anterior')) AS per(periodo)
LEFT JOIN k ON k.periodo = per.periodo
LEFT JOIN ks ON ks.periodo = per.periodo
LEFT JOIN c ON c.periodo = per.periodo
), u AS (
SELECT max(visitantes) FILTER (WHERE periodo = 'atual') AS visitantes,
max(visitantes) FILTER (WHERE periodo = 'anterior') AS visitantes_antes,
max(visitas) FILTER (WHERE periodo = 'atual') AS visitas,
max(visitas) FILTER (WHERE periodo = 'anterior') AS visitas_antes,
max(paginas_vistas) FILTER (WHERE periodo = 'atual') AS paginas_vistas,
max(paginas_vistas) FILTER (WHERE periodo = 'anterior') AS paginas_vistas_antes,
max(tempo_medio_s) FILTER (WHERE periodo = 'atual') AS tempo_medio_s,
max(tempo_medio_s) FILTER (WHERE periodo = 'anterior') AS tempo_medio_s_antes,
max(rejeicao) FILTER (WHERE periodo = 'atual') AS rejeicao,
max(rejeicao) FILTER (WHERE periodo = 'anterior') AS rejeicao_antes,
max(scroll_medio) FILTER (WHERE periodo = 'atual') AS scroll_medio,
max(scroll_medio) FILTER (WHERE periodo = 'anterior') AS scroll_medio_antes,
max(contactos) FILTER (WHERE periodo = 'atual') AS contactos,
max(contactos) FILTER (WHERE periodo = 'anterior') AS contactos_antes,
max(taxa_contacto) FILTER (WHERE periodo = 'atual') AS taxa_contacto,
max(taxa_contacto) FILTER (WHERE periodo = 'anterior') AS taxa_contacto_antes
FROM z
)
SELECT to_char(j.de, 'YYYY-MM-DD') AS de, to_char(j.ate, 'YYYY-MM-DD') AS ate, u.*,
round(100.0 * (u.visitantes - u.visitantes_antes) / NULLIF(u.visitantes_antes, 0)) AS var_visitantes,
round(100.0 * (u.visitas - u.visitas_antes) / NULLIF(u.visitas_antes, 0)) AS var_visitas,
round(100.0 * (u.paginas_vistas - u.paginas_vistas_antes) / NULLIF(u.paginas_vistas_antes, 0)) AS var_paginas_vistas,
round(100.0 * (u.tempo_medio_s - u.tempo_medio_s_antes) / NULLIF(u.tempo_medio_s_antes, 0)) AS var_tempo_medio_s,
u.rejeicao - u.rejeicao_antes AS var_rejeicao,
u.scroll_medio - u.scroll_medio_antes AS var_scroll_medio,
round(100.0 * (u.contactos - u.contactos_antes) / NULLIF(u.contactos_antes, 0)) AS var_contactos,
u.taxa_contacto - u.taxa_contacto_antes AS var_taxa_contacto,
(SELECT count(DISTINCT x.visitante) FROM estat.visitas x
WHERE x.atualizado > now() - interval '5 minutes' AND (j.site IS NULL OR x.site = j.site) AND (j.teste OR NOT x.teste)) AS agora
FROM u CROSS JOIN j
) q
$f$;

create or replace function estat.painel_serie(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
WITH j AS (SELECT * FROM estat.f_janela(p_site, p_de, p_ate, p_teste)),
v AS (SELECT * FROM estat.f_visitas(p_site, p_de, p_ate, p_teste)), g AS (
SELECT to_char(gs, CASE WHEN j.de = j.ate THEN 'YYYY-MM-DD HH24:00' ELSE 'YYYY-MM-DD' END) AS quando
FROM j CROSS JOIN LATERAL generate_series(
CAST(j.de AS TIMESTAMP),
CASE WHEN j.de = j.ate THEN CAST(j.de AS TIMESTAMP) + interval '23 hours' ELSE CAST(j.ate AS TIMESTAMP) END,
CASE WHEN j.de = j.ate THEN interval '1 hour' ELSE interval '1 day' END) AS gs
), d AS (
SELECT to_char(v.inicio AT TIME ZONE 'Europe/Lisbon', CASE WHEN j.de = j.ate THEN 'YYYY-MM-DD HH24:00' ELSE 'YYYY-MM-DD' END) AS quando,
count(DISTINCT v.visitante) AS visitantes, count(DISTINCT v.sessao) AS visitas, count(*) AS paginas_vistas
FROM v CROSS JOIN j GROUP BY 1
), c AS (
SELECT to_char(e.quando AT TIME ZONE 'Europe/Lisbon', CASE WHEN j.de = j.ate THEN 'YYYY-MM-DD HH24:00' ELSE 'YYYY-MM-DD' END) AS quando,
count(*) AS contactos
FROM estat.eventos e JOIN v ON v.id = e.visita CROSS JOIN j
WHERE e.nome IN ('whatsapp', 'telefone', 'email', 'formulario')
GROUP BY 1
)
SELECT g.quando, COALESCE(d.visitantes, 0) AS visitantes, COALESCE(d.visitas, 0) AS visitas,
COALESCE(d.paginas_vistas, 0) AS paginas_vistas, COALESCE(c.contactos, 0) AS contactos
FROM g LEFT JOIN d ON d.quando = g.quando LEFT JOIN c ON c.quando = g.quando
ORDER BY g.quando
) q
$f$;

create or replace function estat.painel_sites(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
WITH j AS (SELECT * FROM estat.f_janela('todos', p_de, p_ate, p_teste)),
v AS (SELECT * FROM estat.f_visitas('todos', p_de, p_ate, p_teste)), s AS (
SELECT site, sessao, count(*) AS paginas, sum(tempo_ativo_ms) AS tempo, sum(interacoes) AS inter
FROM v GROUP BY site, sessao
), k AS (
SELECT site, count(DISTINCT visitante) AS visitantes, count(DISTINCT sessao) AS visitas, count(*) AS paginas_vistas,
round(100.0 * avg(CASE WHEN teste THEN 1 ELSE 0 END)) AS pct_teste
FROM v GROUP BY site
), ks AS (
SELECT site, round(avg(tempo) / 1000.0) AS tempo_medio_s, round(100.0 * avg(CASE WHEN paginas = 1 AND inter = 0 AND tempo < 10000 THEN 1 ELSE 0 END)) AS rejeicao
FROM s GROUP BY site
), c AS (
SELECT v.site, count(*) AS contactos
FROM estat.eventos e JOIN v ON v.id = e.visita
WHERE e.nome IN ('whatsapp', 'telefone', 'email', 'formulario')
GROUP BY v.site
), u AS (
SELECT site, max(inicio) AS ultima FROM estat.visitas GROUP BY site
), ag AS (
SELECT site, count(DISTINCT visitante) AS agora FROM estat.visitas
WHERE atualizado > now() - interval '5 minutes' GROUP BY site
)
SELECT st.id AS site, st.nome, st.dominios[1] AS dominio,
COALESCE(k.visitantes, 0) AS visitantes, COALESCE(k.visitas, 0) AS visitas,
COALESCE(k.paginas_vistas, 0) AS paginas_vistas, ks.tempo_medio_s, ks.rejeicao,
COALESCE(c.contactos, 0) AS contactos, COALESCE(k.pct_teste, 0) AS pct_teste,
COALESCE(ag.agora, 0) AS agora,
to_char(u.ultima AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') AS ultima
FROM estat.sites st
LEFT JOIN k ON k.site = st.id LEFT JOIN ks ON ks.site = st.id LEFT JOIN c ON c.site = st.id
LEFT JOIN u ON u.site = st.id LEFT JOIN ag ON ag.site = st.id
ORDER BY COALESCE(k.visitantes, 0) DESC, st.nome
) q
$f$;

create or replace function estat.painel_ultimas(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
WITH j AS (SELECT * FROM estat.f_janela(p_site, p_de, p_ate, p_teste)),
v AS (SELECT * FROM estat.f_visitas(p_site, p_de, p_ate, p_teste))
SELECT CAST(v.id AS TEXT) AS id, to_char(v.inicio AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') AS quando,
v.site, v.caminho, v.fonte, v.pais, v.dispositivo, CAST(round(v.tempo_ativo_ms / 1000.0) AS INT) AS tempo_s,
v.scroll_max, v.entrada, v.teste
FROM v ORDER BY v.inicio DESC LIMIT 25
) q
$f$;

create or replace function estat.painel_paginas(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
WITH j AS (SELECT * FROM estat.f_janela(p_site, p_de, p_ate, p_teste)),
v AS (SELECT * FROM estat.f_visitas(p_site, p_de, p_ate, p_teste)), o AS (
SELECT v.*, row_number() OVER (PARTITION BY v.sessao ORDER BY v.inicio DESC) AS ord_fim FROM v
), s AS (
SELECT sessao, count(*) AS paginas, sum(tempo_ativo_ms) AS tempo, sum(interacoes) AS inter FROM v GROUP BY sessao
), c AS (
SELECT e.visita, count(*) AS n FROM estat.eventos e JOIN v ON v.id = e.visita
WHERE e.nome IN ('whatsapp', 'telefone', 'email', 'formulario') GROUP BY e.visita
)
SELECT o.site || o.caminho AS chave, o.site, o.caminho, max(o.titulo) AS titulo,
count(*) AS vistas, count(DISTINCT o.visitante) AS visitantes,
count(*) FILTER (WHERE o.entrada) AS entradas, count(*) FILTER (WHERE o.ord_fim = 1) AS saidas,
round(avg(o.tempo_ativo_ms) / 1000.0) AS tempo_medio_s, round(avg(o.scroll_max)) AS scroll_medio,
round(100.0 * avg(CASE WHEN o.scroll_max >= 90 THEN 1 ELSE 0 END)) AS chegou_fim,
round(100.0 * avg(CASE WHEN s.paginas = 1 AND s.inter = 0 AND s.tempo < 10000 THEN 1 ELSE 0 END) FILTER (WHERE o.entrada)) AS rejeicao,
sum(o.interacoes) AS cliques, COALESCE(sum(c.n), 0) AS contactos
FROM o JOIN s ON s.sessao = o.sessao LEFT JOIN c ON c.visita = o.id
GROUP BY o.site, o.caminho ORDER BY vistas DESC LIMIT 200
) q
$f$;

create or replace function estat.painel_fontes(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
WITH j AS (SELECT * FROM estat.f_janela(p_site, p_de, p_ate, p_teste)),
v AS (SELECT * FROM estat.f_visitas(p_site, p_de, p_ate, p_teste)), s AS (
SELECT sessao, (array_agg(fonte ORDER BY inicio))[1] AS fonte, min(visitante) AS visitante,
count(*) AS paginas, sum(tempo_ativo_ms) AS tempo, sum(interacoes) AS inter
FROM v GROUP BY sessao
), c AS (
SELECT DISTINCT v.sessao FROM estat.eventos e JOIN v ON v.id = e.visita WHERE e.nome IN ('whatsapp', 'telefone', 'email', 'formulario')
)
SELECT s.fonte, count(*) AS visitas, count(DISTINCT s.visitante) AS visitantes,
round(100.0 * avg(CASE WHEN s.paginas = 1 AND s.inter = 0 AND s.tempo < 10000 THEN 1 ELSE 0 END)) AS rejeicao,
round(avg(s.tempo) / 1000.0) AS tempo_medio_s, round(avg(s.paginas), 1) AS paginas_por_visita,
count(c.sessao) AS visitas_com_contacto, round(100.0 * count(c.sessao) / count(*), 1) AS taxa_contacto
FROM s LEFT JOIN c ON c.sessao = s.sessao
GROUP BY s.fonte ORDER BY visitas DESC
) q
$f$;

create or replace function estat.painel_campanhas(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
WITH j AS (SELECT * FROM estat.f_janela(p_site, p_de, p_ate, p_teste)),
v AS (SELECT * FROM estat.f_visitas(p_site, p_de, p_ate, p_teste)), s AS (
SELECT sessao, count(*) AS paginas, sum(tempo_ativo_ms) AS tempo, sum(interacoes) AS inter FROM v GROUP BY sessao
), e AS (
SELECT DISTINCT ON (sessao) sessao, utm_source, utm_medium, utm_campaign, utm_content, anuncio, fonte
FROM v ORDER BY sessao, inicio
), c AS (
SELECT DISTINCT v.sessao FROM estat.eventos ev JOIN v ON v.id = ev.visita WHERE ev.nome IN ('whatsapp', 'telefone', 'email', 'formulario')
)
SELECT concat_ws(' / ', COALESCE(e.utm_campaign, '(sem nome)'), COALESCE(e.utm_source, e.fonte), e.utm_medium, e.utm_content, e.anuncio) AS chave,
COALESCE(e.utm_campaign, '(sem nome)') AS campanha, COALESCE(e.utm_source, e.fonte) AS origem, e.utm_medium AS meio,
e.utm_content AS conteudo, e.anuncio AS clique_anuncio,
count(*) AS visitas,
round(100.0 * avg(CASE WHEN s.paginas = 1 AND s.inter = 0 AND s.tempo < 10000 THEN 1 ELSE 0 END)) AS rejeicao,
round(avg(s.tempo) / 1000.0) AS tempo_medio_s, count(c.sessao) AS visitas_com_contacto,
round(100.0 * count(c.sessao) / count(*), 1) AS taxa_contacto
FROM e JOIN s ON s.sessao = e.sessao LEFT JOIN c ON c.sessao = e.sessao
WHERE e.utm_source IS NOT NULL OR e.utm_campaign IS NOT NULL OR e.anuncio IS NOT NULL
GROUP BY 1, 2, 3, 4, 5, 6 ORDER BY visitas DESC LIMIT 100
) q
$f$;

create or replace function estat.painel_referencias(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
WITH j AS (SELECT * FROM estat.f_janela(p_site, p_de, p_ate, p_teste)),
v AS (SELECT * FROM estat.f_visitas(p_site, p_de, p_ate, p_teste))
SELECT COALESCE(v.referencia, v.ref_dominio) AS referencia, v.fonte, count(*) AS visitas
FROM v WHERE v.entrada AND v.ref_dominio IS NOT NULL
GROUP BY 1, 2 ORDER BY visitas DESC LIMIT 50
) q
$f$;

create or replace function estat.painel_paises(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
WITH j AS (SELECT * FROM estat.f_janela(p_site, p_de, p_ate, p_teste)),
v AS (SELECT * FROM estat.f_visitas(p_site, p_de, p_ate, p_teste))
SELECT COALESCE(v.pais, 'ZZ') AS pais, count(DISTINCT v.visitante) AS visitantes, count(DISTINCT v.sessao) AS visitas,
round(100.0 * count(DISTINCT v.sessao) / NULLIF(sum(count(DISTINCT v.sessao)) OVER (), 0), 1) AS pct
FROM v GROUP BY 1 ORDER BY visitas DESC
) q
$f$;

create or replace function estat.painel_regioes(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
WITH j AS (SELECT * FROM estat.f_janela(p_site, p_de, p_ate, p_teste)),
v AS (SELECT * FROM estat.f_visitas(p_site, p_de, p_ate, p_teste))
SELECT COALESCE(v.regiao, 'Outra') AS regiao, count(DISTINCT v.sessao) AS visitas
FROM v WHERE v.pais = 'PT' GROUP BY 1 ORDER BY visitas DESC
) q
$f$;

create or replace function estat.painel_tecnologia(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
WITH j AS (SELECT * FROM estat.f_janela(p_site, p_de, p_ate, p_teste)),
v AS (SELECT * FROM estat.f_visitas(p_site, p_de, p_ate, p_teste)), e AS (
SELECT DISTINCT ON (sessao) sessao, dispositivo, so, navegador, idioma, janela_l FROM v ORDER BY sessao, inicio
), z AS (
SELECT 'dispositivo' AS dimensao, COALESCE(dispositivo, '?') AS valor FROM e
UNION ALL SELECT 'sistema', COALESCE(so, '?') FROM e
UNION ALL SELECT 'navegador', COALESCE(navegador, '?') FROM e
UNION ALL SELECT 'idioma', COALESCE(lower(left(idioma, 2)), '?') FROM e
UNION ALL SELECT 'largura', CASE WHEN janela_l IS NULL THEN '?' WHEN janela_l < 400 THEN 'até 399 px'
WHEN janela_l < 768 THEN '400 a 767 px' WHEN janela_l < 1024 THEN '768 a 1023 px'
WHEN janela_l < 1440 THEN '1024 a 1439 px' ELSE '1440 px ou mais' END FROM e
)
SELECT dimensao || ':' || valor AS chave, dimensao, valor, count(*) AS visitas,
round(100.0 * count(*) / NULLIF(sum(count(*)) OVER (PARTITION BY dimensao), 0), 1) AS pct
FROM z GROUP BY dimensao, valor ORDER BY dimensao, visitas DESC
) q
$f$;

create or replace function estat.painel_horas(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
WITH j AS (SELECT * FROM estat.f_janela(p_site, p_de, p_ate, p_teste)),
v AS (SELECT * FROM estat.f_visitas(p_site, p_de, p_ate, p_teste))
SELECT CAST(extract(isodow FROM v.inicio AT TIME ZONE 'Europe/Lisbon') AS INT) || '-' || CAST(extract(hour FROM v.inicio AT TIME ZONE 'Europe/Lisbon') AS INT) AS chave,
CAST(extract(isodow FROM v.inicio AT TIME ZONE 'Europe/Lisbon') AS INT) AS dia_semana,
CAST(extract(hour FROM v.inicio AT TIME ZONE 'Europe/Lisbon') AS INT) AS hora,
count(DISTINCT v.sessao) AS visitas, count(*) AS paginas_vistas
FROM v GROUP BY 2, 3, 1 ORDER BY 2, 3
) q
$f$;

create or replace function estat.painel_mapa(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
WITH j AS (SELECT * FROM estat.f_janela(p_site, p_de, p_ate, p_teste)),
v AS (SELECT * FROM estat.f_visitas(p_site, p_de, p_ate, p_teste)), q AS (
SELECT NULLIF(split_part(p_pagina, '|', 1), '') AS ps,
NULLIF(split_part(p_pagina, '|', 2), '') AS pc,
NULLIF(COALESCE(p_disp, 'telemovel'), 'todos') AS dp
), vv AS (
SELECT v.* FROM v CROSS JOIN q WHERE q.dp IS NULL OR v.dispositivo = q.dp
), topo AS (
SELECT site, caminho FROM vv GROUP BY site, caminho ORDER BY count(*) DESC LIMIT 1
), alvo AS (
SELECT COALESCE(q.ps, topo.site) AS site, COALESCE(q.pc, topo.caminho) AS caminho FROM q LEFT JOIN topo ON TRUE
), pv AS (
SELECT vv.* FROM vv JOIN alvo ON alvo.site = vv.site AND alvo.caminho = vv.caminho
)
SELECT c.id, c.site || '|' || c.caminho AS pagina, c.x, c.y, c.altura_pagina, c.janela_l,
COALESCE(NULLIF(c.texto, ''), c.elemento) AS elemento, c.interativo, c.raiva
FROM estat.cliques c JOIN pv ON pv.id = c.visita
ORDER BY c.quando DESC LIMIT 4000
) q
$f$;

create or replace function estat.painel_elementos(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
WITH j AS (SELECT * FROM estat.f_janela(p_site, p_de, p_ate, p_teste)),
v AS (SELECT * FROM estat.f_visitas(p_site, p_de, p_ate, p_teste)), q AS (
SELECT NULLIF(split_part(p_pagina, '|', 1), '') AS ps,
NULLIF(split_part(p_pagina, '|', 2), '') AS pc,
NULLIF(COALESCE(p_disp, 'telemovel'), 'todos') AS dp
), vv AS (
SELECT v.* FROM v CROSS JOIN q WHERE q.dp IS NULL OR v.dispositivo = q.dp
), topo AS (
SELECT site, caminho FROM vv GROUP BY site, caminho ORDER BY count(*) DESC LIMIT 1
), alvo AS (
SELECT COALESCE(q.ps, topo.site) AS site, COALESCE(q.pc, topo.caminho) AS caminho FROM q LEFT JOIN topo ON TRUE
), pv AS (
SELECT vv.* FROM vv JOIN alvo ON alvo.site = vv.site AND alvo.caminho = vv.caminho
), n AS (SELECT count(*) AS vistas FROM pv)
SELECT c.elemento || '|' || COALESCE(c.texto, '') || '|' || COALESCE(c.href, '') AS chave,
c.elemento, c.texto, c.href, bool_and(c.interativo) AS interativo,
count(*) AS cliques, count(DISTINCT c.visita) AS visitas,
round(100.0 * count(DISTINCT c.visita) / NULLIF(max(n.vistas), 0)) AS pct_visitas,
count(*) FILTER (WHERE c.raiva) AS raiva
FROM estat.cliques c JOIN pv ON pv.id = c.visita CROSS JOIN n
GROUP BY c.elemento, c.texto, c.href ORDER BY cliques DESC LIMIT 40
) q
$f$;

create or replace function estat.painel_scroll(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
WITH j AS (SELECT * FROM estat.f_janela(p_site, p_de, p_ate, p_teste)),
v AS (SELECT * FROM estat.f_visitas(p_site, p_de, p_ate, p_teste)), q AS (
SELECT NULLIF(split_part(p_pagina, '|', 1), '') AS ps,
NULLIF(split_part(p_pagina, '|', 2), '') AS pc,
NULLIF(COALESCE(p_disp, 'telemovel'), 'todos') AS dp
), vv AS (
SELECT v.* FROM v CROSS JOIN q WHERE q.dp IS NULL OR v.dispositivo = q.dp
), topo AS (
SELECT site, caminho FROM vv GROUP BY site, caminho ORDER BY count(*) DESC LIMIT 1
), alvo AS (
SELECT COALESCE(q.ps, topo.site) AS site, COALESCE(q.pc, topo.caminho) AS caminho FROM q LEFT JOIN topo ON TRUE
), pv AS (
SELECT vv.* FROM vv JOIN alvo ON alvo.site = vv.site AND alvo.caminho = vv.caminho
)
SELECT b.nivel, (SELECT alvo.site || '|' || alvo.caminho FROM alvo) AS pagina,
count(pv.id) AS vistas, count(pv.id) FILTER (WHERE pv.scroll_max >= b.nivel) AS chegaram,
round(100.0 * count(pv.id) FILTER (WHERE pv.scroll_max >= b.nivel) / NULLIF(count(pv.id), 0)) AS pct,
round(avg(pv.tempo_ativo_ms) / 1000.0) AS tempo_medio_s
FROM generate_series(10, 100, 10) AS b(nivel) LEFT JOIN pv ON TRUE
GROUP BY b.nivel ORDER BY b.nivel
) q
$f$;

create or replace function estat.painel_acoes(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
WITH j AS (SELECT * FROM estat.f_janela(p_site, p_de, p_ate, p_teste)),
ev AS (SELECT * FROM estat.f_eventos(p_site, p_de, p_ate, p_teste))
SELECT ev.nome, count(*) AS n, count(DISTINCT ev.visita) AS visitas,
CASE WHEN ev.nome IN ('whatsapp', 'telefone', 'email', 'formulario') THEN TRUE ELSE FALSE END AS contacto
FROM ev GROUP BY ev.nome ORDER BY n DESC
) q
$f$;

create or replace function estat.painel_acoes_detalhe(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
WITH j AS (SELECT * FROM estat.f_janela(p_site, p_de, p_ate, p_teste)),
ev AS (SELECT * FROM estat.f_eventos(p_site, p_de, p_ate, p_teste))
SELECT ev.nome || '|' || COALESCE(ev.valor, '') || '|' || ev.site || COALESCE(ev.caminho, '') AS chave,
ev.nome, ev.valor, ev.site, ev.caminho, count(*) AS n,
to_char(max(ev.quando) AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') AS ultima
FROM ev GROUP BY ev.nome, ev.valor, ev.site, ev.caminho ORDER BY n DESC LIMIT 100
) q
$f$;

create or replace function estat.painel_velocidade(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
WITH j AS (SELECT * FROM estat.f_janela(p_site, p_de, p_ate, p_teste)),
v AS (SELECT * FROM estat.f_visitas(p_site, p_de, p_ate, p_teste))
SELECT v.site || '|' || COALESCE(v.dispositivo, '?') AS chave, v.site, COALESCE(v.dispositivo, '?') AS dispositivo,
count(v.lcp_ms) AS amostras,
CAST(round(CAST(percentile_cont(0.75) WITHIN GROUP (ORDER BY v.lcp_ms) AS NUMERIC)) AS FLOAT8) AS lcp_ms,
CAST(round(CAST(percentile_cont(0.75) WITHIN GROUP (ORDER BY v.cls) AS NUMERIC), 3) AS FLOAT8) AS cls,
CAST(round(CAST(percentile_cont(0.75) WITHIN GROUP (ORDER BY v.inp_ms) AS NUMERIC)) AS FLOAT8) AS inp_ms,
CAST(round(CAST(percentile_cont(0.75) WITHIN GROUP (ORDER BY v.ttfb_ms) AS NUMERIC)) AS FLOAT8) AS ttfb_ms
FROM v GROUP BY v.site, v.dispositivo ORDER BY v.site, v.dispositivo
) q
$f$;

create or replace function estat.painel_erros(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
WITH j AS (SELECT * FROM estat.f_janela(p_site, p_de, p_ate, p_teste)),
er AS (SELECT * FROM estat.f_erros(p_site, p_de, p_ate, p_teste))
SELECT er.mensagem || '|' || COALESCE(er.ficheiro, '') || '|' || COALESCE(CAST(er.linha AS TEXT), '') AS chave,
er.mensagem, er.ficheiro, er.linha, string_agg(DISTINCT er.site, ', ') AS sites,
count(*) AS n, count(DISTINCT er.visita) AS visitas, string_agg(DISTINCT er.navegador, ', ') AS navegadores,
(array_agg(er.caminho ORDER BY er.quando DESC))[1] AS caminho,
to_char(max(er.quando) AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') AS ultima
FROM er GROUP BY er.mensagem, er.ficheiro, er.linha ORDER BY n DESC LIMIT 50
) q
$f$;

create or replace function estat.painel_recolha(p_site text, p_de date, p_ate date, p_teste boolean, p_pagina text, p_disp text)
returns json language sql stable set search_path = '' as $f$
select coalesce(json_agg(q), '[]'::json) from (
SELECT to_char(r.dia, 'YYYY-MM-DD') || '|' || r.motivo AS chave, to_char(r.dia, 'YYYY-MM-DD') AS dia, r.motivo, r.n,
to_char(r.ultimo AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI') AS ultimo
FROM estat.rejeitados r
WHERE r.dia >= CAST(now() AT TIME ZONE 'Europe/Lisbon' AS DATE) - 6
ORDER BY r.dia DESC, r.n DESC
) q
$f$;
