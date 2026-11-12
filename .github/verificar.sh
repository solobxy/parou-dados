echo "== $(date -u +%FT%TZ)"
echo "-- versão do repositório no servidor: $(git -C /opt/parou/servidor log -1 --format='%h %s' 2>/dev/null | cut -c1-90)"
# esperar pela versão nova (o servidor atualiza de 2 em 2 min) e pela primeira recolha da luz e gás
for i in $(seq 1 42); do
  V=$(git -C /opt/parou/servidor rev-parse --short=8 HEAD 2>/dev/null)
  D=$(python3 -c "import json;print(json.load(open('/var/lib/caiu-dados/energia-estado.json'))['dia'])" 2>/dev/null)
  A=$(systemctl is-active caiu-energia.service 2>/dev/null)
  echo "  $(date -u +%T) versão=$V estado=$D serviço=$A"
  if [ -n "$D" ] && [ "$A" != "activating" ] && [ "$A" != "active" ] && git -C /opt/parou/servidor merge-base --is-ancestor 4f8180a6 HEAD 2>/dev/null; then break; fi
  sleep 10
done
echo "-- pdftotext: $(command -v pdftotext || echo 'NÃO INSTALADO')"
echo "-- unidades"
ls -la /etc/systemd/system/caiu-energia.* 2>/dev/null
systemctl is-enabled caiu-energia.timer 2>/dev/null
systemctl list-timers --all --no-pager 2>/dev/null | grep -E "caiu-energia|NEXT" | cut -c1-160
systemctl show caiu-energia.service -p Result -p ExecMainStatus -p ExecMainExitTimestamp 2>/dev/null
echo "-- últimas linhas da recolha"
journalctl -u caiu-energia.service -n 25 --no-pager -o cat 2>/dev/null | cut -c1-260
echo "-- ficheiros"
ls -la /var/lib/caiu-dados/energia.json /var/lib/caiu-dados/energia-estado.json /var/lib/caiu-dados/energia-paginas/luz-e-gas/ 2>&1
ls -la /var/lib/caiu-energia/ 2>&1 | head -12
echo "-- estado (sem o detalhe)"
python3 - <<'PY' 2>&1
import json
try:
    e = json.load(open('/var/lib/caiu-dados/energia-estado.json'))
except Exception as x:
    print('sem estado:', x); raise SystemExit
c = dict(e.get('confirmado') or {}); c.pop('detalhe', None)
print('dia', e.get('dia'), e.get('hora'), 'segundos', e.get('segundos'))
print('erse', e.get('erse')); print('galp', json.dumps(e.get('galp'), ensure_ascii=False))
print('param', e.get('param')); print('confirmado', c)
print('vantagens', e.get('vantagens')); print('avisos', e.get('avisos'))
d = json.load(open('/var/lib/caiu-dados/energia.json'))
for k, v in (d.get('casos') or {}).items():
    print(k, v.get('nome'), [(t.get('n') or t.get('id'), t.get('com'), t.get('total')) for t in v.get('top', [])[:3]])
PY
echo "-- Caddy"
systemctl is-active caddy; caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -2
grep -c "luz-e-gas" /etc/caddy/Caddyfile
echo "-- pedidos (como um visitante)"
for u in /luz-e-gas/ /luz-e-gas /dados/energia.json /dados/energia-estado.json /energia-calc.js /energia.js /energia.css /dados/energia-paginas/luz-e-gas/index.html /sitemap-paginas.xml; do
  curl -s -o /tmp/r.out -w "$u -> %{http_code} %{size_download} B %{content_type} cache=%header{cache-control}\n" --resolve caiu.pt:443:127.0.0.1 "https://caiu.pt$u"
done
curl -s --resolve caiu.pt:443:127.0.0.1 https://caiu.pt/sitemap-paginas.xml | grep -c luz-e-gas
curl -s --resolve caiu.pt:443:127.0.0.1 https://caiu.pt/luz-e-gas/ | grep -o '<title>[^<]*</title>\|<h1[^>]*>[^<]*</h1>\|<span class="pl__loja">[^<]*</span><span class="pl__total preco">[^<]*' | head -6
