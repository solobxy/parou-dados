#!/bin/bash
# Vigia dos projetos (de 10 em 10 minutos, pelo vigia-projetos.timer).
# Faz com que tudo continue a funcionar sozinho, sem ninguém ter de olhar:
#   1. serviços e temporizadores parados voltam a ser ligados;
#   2. uma API que deixa de responder 3 vezes seguidas (~30 min) é reiniciada;
#   3. dados velhos (preços do caiu.pt, anúncios da DupliCasa) obrigam a uma recolha nova;
#   4. o projeto do Goodman no Supabase recebe uma leitura por dia (no plano gratuito, um projeto
#      sem pedidos durante 7 dias é posto em pausa e o chat e a atualização semanal das leis param).
# O resumo fica em /var/lib/parou-estado/vigia-projetos.txt (aparece em /_estado-servidor).
set -uo pipefail
D=/var/lib/parou-estado
LOG=$D/vigia-projetos.log
EST=$D/vigia-projetos.txt
mkdir -p "$D/vigia"
reg() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$LOG"; }
idade_min() { local f="$1"; [ -e "$f" ] || { echo 999999; return; }; echo $(( ($(date +%s) - $(stat -c %Y "$f")) / 60 )); }
# só deixa fazer uma ação de X em X minutos (para nunca entrar em ciclo)
pode() { local k="$D/vigia/$1.ultima" m="$2"; [ "$(idade_min "$k")" -ge "$m" ] || return 1; touch "$k"; }

# 1. Serviços e temporizadores
for s in caddy parou anjinho duaschaves-api caiu-api ganhas-api adri-agenda; do
  systemctl is-enabled --quiet "$s" 2>/dev/null || continue
  if ! systemctl is-active --quiet "$s"; then systemctl start "$s" && reg "$s estava parado: liguei-o"; fi
done
for t in parou-atualizar.timer caiu-recolha.timer duaschaves-recolha.timer duaschaves-alertas.timer ganhas-paginas.timer; do
  systemctl is-enabled --quiet "$t" 2>/dev/null || continue
  if ! systemctl is-active --quiet "$t"; then systemctl start "$t" && reg "$t estava parado: liguei-o"; fi
done

# 2. APIs: responder (seja com que código for) quer dizer que estão vivas
api() { # nome porta caminho serviço
  local f="$D/vigia/$1.falhas" c
  systemctl is-enabled --quiet "$4" 2>/dev/null || return 0
  c=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "http://127.0.0.1:$2$3" 2>/dev/null || true)
  if [ -n "$c" ] && [ "$c" != "000" ]; then rm -f "$f"; return 0; fi
  local n=$(( $(cat "$f" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$f"
  if [ "$n" -ge 3 ]; then systemctl restart "$4"; rm -f "$f"; reg "$1 não respondia há 3 voltas: reiniciei $4"; fi
}
api duplicasa 3110 /api/saude duaschaves-api
api adri 3120 / adri-agenda
api anjinho 3100 / anjinho
api ganhas 3140 /api/estado ganhas-api
api caiu 3150 /api/saude caiu-api

# 3. Dados frescos
# caiu.pt: há 3 recolhas por dia (07:20, 12:50, 18:20); mais de 14 h sem preços novos é sinal de falha
if [ -d /var/lib/caiu-dados ] && [ "$(idade_min /var/lib/caiu-dados/resumo.json)" -gt 840 ] \
   && ! systemctl is-active --quiet caiu-recolha.service && pode caiu-recolha 180; then
  systemctl start --no-block caiu-recolha.service && reg "caiu.pt: preços com mais de 14 h, comecei uma recolha"
fi
# DupliCasa: recolha de 30 em 30 minutos; mais de 3 h sem mexer é sinal de falha
if [ -f /var/lib/duaschaves-dados/anuncios.json ] && [ "$(idade_min /var/lib/duaschaves-dados/anuncios.json)" -gt 180 ] && pode duplicasa-recolha 120; then
  systemctl restart --no-block duaschaves-recolha.service && reg "DupliCasa: anúncios com mais de 3 h, recomecei a recolha"
fi

# 4. Supabase do Goodman acordado (uma leitura por dia chega)
GM_URL=https://wbbnbtvtkzbrxomlorop.supabase.co
GM_ANON=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiYm5idHZ0a3picnhvbWxvcm9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMTY4NTcsImV4cCI6MjEwODY5Mjg1N30.39aOSFOwYoX-xxNjZKV3vTdeMK5gryj9bB5_SNdCRsE
GM_EST=""
if [ "$(idade_min "$D/vigia/goodman-supabase.ok")" -ge 1200 ]; then
  c=$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$GM_URL/rest/v1/diplomas?select=id&limit=1" -H "apikey: $GM_ANON" -H "Authorization: Bearer $GM_ANON" 2>/dev/null || true)
  if [ "$c" = "200" ]; then touch "$D/vigia/goodman-supabase.ok"; else reg "Goodman (Supabase) respondeu $c à leitura diária"; fi
fi
GM_EST="última leitura há $(idade_min "$D/vigia/goodman-supabase.ok") min"

{
  echo "Vigia: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "caiu.pt preços: há $(idade_min /var/lib/caiu-dados/resumo.json) min · DupliCasa anúncios: há $(idade_min /var/lib/duaschaves-dados/anuncios.json) min · Goodman Supabase: $GM_EST"
  echo "Últimas ações: $(tail -n 4 "$LOG" 2>/dev/null | tr '\n' ';')"
} > "$EST.tmp" && mv "$EST.tmp" "$EST" && chmod 644 "$EST"
[ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 400 ] && { tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; }
exit 0
