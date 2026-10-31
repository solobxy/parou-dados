-- Estatísticas próprias de todos os sites (sem cookies, sem guardar IPs)
create extension if not exists pgcrypto with schema extensions;

create schema if not exists estat;

create table estat.sites (
  id text primary key,
  nome text not null,
  dominios text[] not null,
  criado timestamptz not null default now()
);

create table estat.fusos (fuso text primary key, pais text not null);

create table estat.config (chave text primary key, valor text not null);

-- Sal diário para o identificador de visitante (apagado ao fim de 2 dias: depois disso ninguém
-- consegue voltar a ligar um identificador a um IP)
create table estat.sal (
  vaga smallint primary key,
  dia date not null,
  valor bytea not null
);

create table estat.visitas (
  id uuid primary key,
  site text not null references estat.sites(id),
  inicio timestamptz not null default now(),
  atualizado timestamptz not null default now(),
  visitante text not null,
  sessao uuid not null,
  entrada boolean not null default false,
  teste boolean not null default false,
  host text,
  caminho text not null,
  titulo text,
  referencia text,
  ref_dominio text,
  fonte text not null default 'Direto',
  app text,
  anuncio text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  pais text, regiao text, fuso text, idioma text,
  dispositivo text, so text, navegador text,
  ecra_l int, ecra_a int, janela_l int, janela_a int,
  tempo_ativo_ms int not null default 0,
  scroll_max smallint not null default 0,
  altura_pagina int,
  interacoes int not null default 0,
  lcp_ms int, cls numeric(7,4), inp_ms int, ttfb_ms int, carregamento_ms int
);
create index visitas_site_inicio on estat.visitas (site, inicio);
create index visitas_inicio on estat.visitas (inicio);
create index visitas_visitante on estat.visitas (site, visitante, inicio desc);
create index visitas_sessao on estat.visitas (sessao);

create table estat.cliques (
  id bigint generated always as identity primary key,
  visita uuid not null,
  site text not null,
  quando timestamptz not null default now(),
  caminho text not null,
  dispositivo text,
  teste boolean not null default false,
  x int, y int, altura_pagina int, janela_l int,
  elemento text, texto text, href text, tag text,
  interativo boolean not null default true,
  raiva boolean not null default false
);
create index cliques_site_quando on estat.cliques (site, quando);
create index cliques_visita on estat.cliques (visita);

create table estat.eventos (
  id bigint generated always as identity primary key,
  visita uuid not null,
  site text not null,
  quando timestamptz not null default now(),
  caminho text,
  teste boolean not null default false,
  nome text not null,
  valor text
);
create index eventos_site_quando on estat.eventos (site, quando);

create table estat.erros (
  id bigint generated always as identity primary key,
  visita uuid not null,
  site text not null,
  quando timestamptz not null default now(),
  caminho text,
  teste boolean not null default false,
  mensagem text not null,
  ficheiro text, linha int, coluna int,
  navegador text
);
create index erros_site_quando on estat.erros (site, quando);

-- Pedidos recusados (chave errada, robôs, site desconhecido): só contagens por dia, para dar pelo
-- problema se a recolha parar
create table estat.rejeitados (
  dia date not null,
  motivo text not null,
  n int not null default 0,
  ultimo timestamptz,
  primary key (dia, motivo)
);

alter table estat.sites enable row level security;
alter table estat.fusos enable row level security;
alter table estat.config enable row level security;
alter table estat.sal enable row level security;
alter table estat.visitas enable row level security;
alter table estat.cliques enable row level security;
alter table estat.eventos enable row level security;
alter table estat.erros enable row level security;
alter table estat.rejeitados enable row level security;

create function estat.int(t text) returns int language sql immutable as $$
  select case when t ~ '^-?\d{1,9}$' then t::int end
$$;

create function estat.num(t text) returns numeric language sql immutable as $$
  select case when t ~ '^\d{1,4}(\.\d{1,6})?$' then t::numeric end
$$;

create function estat.txt(t text, n int) returns text language sql immutable as $$
  select nullif(left(regexp_replace(coalesce(t, ''), '[\x01-\x1f]', '', 'g'), n), '')
$$;

create function estat.fonte(rd text, us text, app text) returns text language sql immutable as $$
  select case
    when coalesce(us, '') <> '' then case
      when us ~* '^(fb|facebook|meta)' then 'Facebook'
      when us ~* '^(ig|instagram)' then 'Instagram'
      when us ~* 'google' then 'Google'
      when us ~* 'tiktok' then 'TikTok'
      when us ~* 'whatsapp|^wa$' then 'WhatsApp'
      when us ~* 'mail|newsletter' then 'Email'
      when us ~* 'chatgpt|openai' then 'ChatGPT'
      else initcap(left(us, 30)) end
    when app = 'Instagram' then 'Instagram'
    when app = 'Facebook' then 'Facebook'
    when app = 'TikTok' then 'TikTok'
    when app = 'LinkedIn' then 'LinkedIn'
    when rd is null or rd = '' then 'Direto'
    when rd ~ '(^|\.)(gemini|bard)\.google\.com$' then 'Gemini'
    when rd ~ 'com\.google\.android\.gm$|(^|\.)mail\.|outlook\.|webmail' then 'Email'
    when rd ~ '(^|\.)google\.' or rd ~ '^com\.google\.' then 'Google'
    when rd ~ '(^|\.)bing\.com$' then 'Bing'
    when rd ~ 'duckduckgo' then 'DuckDuckGo'
    when rd ~ '(^|\.)instagram\.com$' or rd ~ '^com\.instagram' then 'Instagram'
    when rd ~ '(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$' or rd ~ '^com\.facebook' then 'Facebook'
    when rd ~ '(^|\.)(t\.co|twitter\.com|x\.com)$' then 'X'
    when rd ~ 'tiktok' then 'TikTok'
    when rd ~ '(youtube\.com|youtu\.be)$' then 'YouTube'
    when rd ~ 'linkedin|lnkd\.in' then 'LinkedIn'
    when rd ~ 'whatsapp|(^|\.)wa\.me$' then 'WhatsApp'
    when rd ~ '(chatgpt\.com|openai\.com)$' then 'ChatGPT'
    when rd ~ 'perplexity' then 'Perplexity'
    when rd ~ '(^|\.)claude\.ai$' then 'Claude'
    when rd ~ 'copilot' then 'Copilot'
    when rd ~ 'reddit' then 'Reddit'
    when rd ~ 'pinterest' then 'Pinterest'
    when rd ~ 'yahoo' then 'Yahoo'
    when rd ~ 'ecosia' then 'Ecosia'
    when rd ~ '(^|\.)sapo\.pt$' then 'SAPO'
    else rd end
$$;

create function estat.rejeitar(motivo text) returns void language sql security definer set search_path = '' as $$
  insert into estat.rejeitados (dia, motivo, n, ultimo)
  values ((now() at time zone 'Europe/Lisbon')::date, motivo, 1, now())
  on conflict (dia, motivo) do update set n = estat.rejeitados.n + 1, ultimo = now()
$$;

-- Recebe o que o script /_e.js envia (pelo Caddy de cada site, que junta a chave e o IP)
create function public.recolher(d jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  h json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  ua text := left(coalesce(h->>'user-agent', ''), 400);
  ip text := coalesce(h->>'x-estat-ip', '');
  v_site text := left(coalesce(d->>'s', ''), 40);
  v_host text := lower(left(coalesce(d->>'h', ''), 120));
  v_agora timestamptz := now();
  v_dia date := (now() at time zone 'Europe/Lisbon')::date;
  v_id uuid;
  v_dom text[];
  v_teste boolean;
  v_sal bytea;
  v_vis text;
  v_sessao uuid;
  v jsonb;
  m jsonb;
  v_fuso text;
  v_pais text;
  v_rd text;
begin
  if jsonb_typeof(d) is distinct from 'object' then perform estat.rejeitar('formato'); return; end if;
  if encode(extensions.digest(coalesce(h->>'x-estat-chave', ''), 'sha256'), 'hex')
     is distinct from (select valor from estat.config where chave = 'hash_chave') then
    perform estat.rejeitar('chave'); return;
  end if;
  if ua = '' or ua ~* '(bot|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|preview|python|curl|wget|httpclient|phantom|selenium|puppeteer|playwright|scrapy|axios|node-fetch|go-http|java/|okhttp)' then
    perform estat.rejeitar('robo'); return;
  end if;
  select dominios into v_dom from estat.sites where id = v_site;
  if not found then perform estat.rejeitar('site'); return; end if;
  if coalesce(d->>'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    perform estat.rejeitar('id'); return;
  end if;
  v_id := (d->>'id')::uuid;
  v_teste := not (regexp_replace(v_host, '^www\.', '') = any (v_dom));

  -- Início de uma página vista
  v := d->'v';
  if jsonb_typeof(v) = 'object' then
    -- Duas vagas que se revezam: o sal de anteontem é substituído pelo de hoje
    select valor into v_sal from estat.sal where vaga = (v_dia - date '2000-01-01') % 2 and dia = v_dia;
    if not found then
      insert into estat.sal (vaga, dia, valor) values ((v_dia - date '2000-01-01') % 2, v_dia, extensions.gen_random_bytes(32))
      on conflict (vaga) do update set dia = excluded.dia, valor = excluded.valor where estat.sal.dia <> excluded.dia;
      select valor into v_sal from estat.sal where vaga = (v_dia - date '2000-01-01') % 2;
    end if;
    v_vis := left(encode(extensions.digest(v_sal || convert_to(v_site || '|' || ip || '|' || ua, 'UTF8'), 'sha256'), 'hex'), 20);
    select sessao into v_sessao from estat.visitas
      where site = v_site and visitante = v_vis and atualizado > v_agora - interval '30 minutes'
      order by inicio desc limit 1;
    v_fuso := estat.txt(v->>'fu', 60);
    select pais into v_pais from estat.fusos where fuso = v_fuso;
    if v_pais is null and coalesce(v->>'il', '') ~ '^[a-zA-Z]{2,3}-[a-zA-Z]{2}$' then
      v_pais := upper(right(v->>'il', 2));
    end if;
    v_rd := lower(estat.txt(v->>'rd', 120));
    insert into estat.visitas (
      id, site, inicio, atualizado, visitante, sessao, entrada, teste, host, caminho, titulo,
      referencia, ref_dominio, fonte, app, anuncio,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      pais, regiao, fuso, idioma, dispositivo, so, navegador, ecra_l, ecra_a, janela_l, janela_a)
    values (
      v_id, v_site, v_agora, v_agora, v_vis, coalesce(v_sessao, gen_random_uuid()), v_sessao is null, v_teste, v_host,
      coalesce(estat.txt(v->>'p', 300), '/'), estat.txt(v->>'ti', 200),
      estat.txt(v->>'r', 300), v_rd,
      estat.fonte(v_rd, estat.txt(v->>'us', 60), estat.txt(v->>'ap', 30)),
      estat.txt(v->>'ap', 30), estat.txt(v->>'ad', 20),
      estat.txt(v->>'us', 100), estat.txt(v->>'um', 100), estat.txt(v->>'uc', 150), estat.txt(v->>'uo', 150), estat.txt(v->>'ut', 150),
      v_pais,
      case v_fuso when 'Atlantic/Azores' then 'Açores' when 'Atlantic/Madeira' then 'Madeira' when 'Europe/Lisbon' then 'Continente' end,
      v_fuso, estat.txt(v->>'il', 20),
      estat.txt(v->>'dp', 20), estat.txt(v->>'so', 30), estat.txt(v->>'nv', 30),
      estat.int(v->>'el'), estat.int(v->>'ea'), estat.int(v->>'jl'), estat.int(v->>'ja'))
    on conflict (id) do nothing;
  end if;

  -- Tempo ativo, scroll e velocidade (valores acumulados: fica sempre o maior)
  m := d->'m';
  if jsonb_typeof(m) = 'object' then
    update estat.visitas set
      tempo_ativo_ms = greatest(tempo_ativo_ms, least(coalesce(estat.int(m->>'t'), 0), 14400000)),
      scroll_max = greatest(scroll_max, least(greatest(coalesce(estat.int(m->>'sc'), 0), 0), 100))::smallint,
      altura_pagina = coalesce(estat.int(m->>'ap'), altura_pagina),
      interacoes = greatest(interacoes, least(coalesce(estat.int(m->>'n'), 0), 100000)),
      lcp_ms = coalesce(estat.int(m->>'lcp'), lcp_ms),
      cls = coalesce(estat.num(m->>'cls'), cls),
      inp_ms = greatest(inp_ms, estat.int(m->>'inp')),
      ttfb_ms = coalesce(ttfb_ms, estat.int(m->>'tt')),
      carregamento_ms = coalesce(carregamento_ms, estat.int(m->>'cg')),
      atualizado = v_agora
    where id = v_id and site = v_site and inicio > v_agora - interval '12 hours';
  end if;

  -- Cliques (para o mapa de cliques e os elementos mais clicados)
  if jsonb_typeof(d->'c') = 'array' then
    insert into estat.cliques (visita, site, quando, caminho, dispositivo, teste, x, y, altura_pagina, janela_l,
                               elemento, texto, href, tag, interativo, raiva)
    select v_id, v_site, v_agora, vi.caminho, vi.dispositivo, vi.teste,
           least(greatest(estat.int(cc.c->>'x'), 0), 1000), greatest(estat.int(cc.c->>'y'), 0), estat.int(cc.c->>'ap'), estat.int(cc.c->>'jl'),
           estat.txt(cc.c->>'el', 200), estat.txt(cc.c->>'tx', 80), estat.txt(cc.c->>'hr', 300), estat.txt(cc.c->>'tg', 20),
           coalesce(cc.c->>'i', '1') = '1', coalesce(cc.c->>'r', '0') = '1'
    from (select value as c from jsonb_array_elements(d->'c') limit 60) cc
    join estat.visitas vi on vi.id = v_id and vi.site = v_site and vi.inicio > v_agora - interval '12 hours'
    where jsonb_typeof(cc.c) = 'object';
  end if;

  -- Ações: WhatsApp, telefone, email, links externos, formulários, downloads e eventos próprios
  if jsonb_typeof(d->'e') = 'array' then
    insert into estat.eventos (visita, site, quando, caminho, teste, nome, valor)
    select v_id, v_site, v_agora, vi.caminho, vi.teste, estat.txt(ee.e->>'n', 40), estat.txt(ee.e->>'v', 200)
    from (select value as e from jsonb_array_elements(d->'e') limit 30) ee
    join estat.visitas vi on vi.id = v_id and vi.site = v_site and vi.inicio > v_agora - interval '12 hours'
    where jsonb_typeof(ee.e) = 'object' and estat.txt(ee.e->>'n', 40) is not null;
  end if;

  -- Erros de JavaScript (para eu corrigir o que estiver partido)
  if jsonb_typeof(d->'x') = 'array' then
    insert into estat.erros (visita, site, quando, caminho, teste, mensagem, ficheiro, linha, coluna, navegador)
    select v_id, v_site, v_agora, vi.caminho, vi.teste, estat.txt(xx.x->>'m', 300), estat.txt(xx.x->>'f', 200),
           estat.int(xx.x->>'l'), estat.int(xx.x->>'c'), vi.navegador
    from (select value as x from jsonb_array_elements(d->'x') limit 10) xx
    join estat.visitas vi on vi.id = v_id and vi.site = v_site and vi.inicio > v_agora - interval '12 hours'
    where jsonb_typeof(xx.x) = 'object' and estat.txt(xx.x->>'m', 300) is not null;
  end if;
exception when others then
  perform estat.rejeitar('erro');
end;
$$;

grant execute on function public.recolher(jsonb) to anon;

insert into estat.sites (id, nome, dominios) values
  ('parou', 'PAROU', array['parou.pt']),
  ('anjinho', 'anjinho', array['anjinho.pt']),
  ('jinxed', 'Jinxed', array['jinxed.world']),
  ('duplicasa', 'DupliCasa', array['duplicasa.pt', 'chave.pt']),
  ('dinissousa', 'Dinis Sousa', array['dinissousa.pt']),
  ('goodman', 'Goodman', array['goodman.pt']),
  ('adribodypiercing', 'AdriBodyPiercing', array['adribodypiercing.pt']),
  ('jaesta', 'já está', array['jaesta.pt']);
