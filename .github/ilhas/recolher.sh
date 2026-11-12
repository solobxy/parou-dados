#!/usr/bin/env bash
# Recolhe respostas da PAROU e das fontes oficiais para a Madeira e os Açores (só leitura)
set -u
mkdir -p res/api res/fontes
B=https://parou.pt
C="curl -sS -m 60"
for row in $(jq -c '.[]' locais.json); do
  id=$(echo "$row" | jq -r .id); lat=$(echo "$row" | jq -r .lat); lon=$(echo "$row" | jq -r .lon)
  $C "$B/api/transit/nearby?lat=$lat&lon=$lon&radius=500" -o "res/api/perto-$id.json" -w "perto $id %{http_code} %{time_total}s\n"
  $C "$B/api/alertas?lat=$lat&lon=$lon" -o "res/api/alertas-$id.json" -w "alertas $id %{http_code} %{time_total}s\n"
done
for q in "Funchal" "Monte" "Lido" "Hospital Dr. Nélio Mendonça" "Câmara de Lobos" "Machico" "Aeroporto da Madeira" "Santana" "Porto Santo" "Ponta Delgada" "Angra do Heroísmo" "Mercado dos Lavradores" "Teleférico"; do
  f=$(echo "$q" | iconv -f utf8 -t ascii//TRANSLIT | tr ' ' '_' | tr -cd 'A-Za-z0-9_')
  $C -G "$B/api/transit/search" --data-urlencode "query=$q" -o "res/api/pesquisa-$f.json" -w "pesquisa $q %{http_code}\n"
done
$C "$B/api/mapa" -o res/api/mapa.json -w "mapa %{http_code}\n"
$C "$B/api/lines/cidades" -o res/api/cidades.json -w "cidades %{http_code}\n"
for p in /linhas/horarios-do-funchal /paragens/horarios-do-funchal /cidade/funchal /cidade/ponta-delgada /cobertura; do
  f=$(echo "$p" | tr '/' '_')
  $C "$B$p" -o "res/api/pagina$f.html" -w "pagina $p %{http_code}\n"
done
$C https://api.ipma.pt/open-data/distrits-islands.json -o res/fontes/ipma-distritos.json -w "ipma distritos %{http_code}\n"
$C https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json -o res/fontes/ipma-avisos.json -w "ipma avisos %{http_code}\n"
curl -sS -m 120 -D res/fontes/hf-cabecalhos.txt https://www.horariosdofunchal.pt/googletransit.zip -o res/fontes/hf.zip -w "hf gtfs %{http_code} %{size_download}\n"
(cd res/fontes && mkdir -p hf && unzip -oq hf.zip -d hf && rm -f hf/stop_times.txt hf/shapes.txt hf.zip && ls -la hf) || true
$C https://siga.madeira.gov.pt/public/horarios -o res/fontes/siga-horarios.html -w "siga lista %{http_code}\n"
for n in 1000 71 2029 4022; do
  $C "https://siga.madeira.gov.pt/public/horarios/$n" -o "res/fontes/siga-$n.html" -w "siga $n %{http_code}\n"
done
$C https://transportes.azores.gov.pt/ -o res/fontes/acores-transportes.html -w "acores portal %{http_code}\n"
curl -sS -m 180 -L https://files.mobilitydatabase.org/feeds_v2.csv -o res/fontes/mdb.csv -w "mdb %{http_code}\n" || true
if [ -s res/fontes/mdb.csv ]; then
  head -1 res/fontes/mdb.csv > res/fontes/mdb-ilhas.csv
  grep -iE "madeira|funchal|azores|a[cç]ores|ponta delgada|angra|terceira|s[aã]o miguel|porto santo|rodoeste|siga" res/fontes/mdb.csv >> res/fontes/mdb-ilhas.csv || true
  rm res/fontes/mdb.csv
fi
