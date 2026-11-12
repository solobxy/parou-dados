echo "== $(date -u +%FT%TZ)"
cd /var/lib/caiu-dados || exit 0
ls -la resumo.json lista.json estado.json 2>&1
python3 - <<'PY'
import json
r = json.load(open('resumo.json'))
print('chaves', sorted(r.keys()))
print('dia', r.get('dia'), r.get('atualizado'))
for k in ('fachada', 'reais', 'pvpr_top', 'diferenca'):
    print(k, len(r.get(k) or []))
PY
echo "-- sitemap com luz e gás: $(grep -c luz-e-gas paginas/sitemap-paginas.xml 2>/dev/null)"
echo "-- RESUMO-INICIO"
gzip -9c resumo.json | base64 -w0
echo
echo "-- RESUMO-FIM"
echo "-- HIST-INICIO"
python3 - <<'PY' | gzip -9c | base64 -w0
import json, os
r = json.load(open('resumo.json'))
ids = []
for k in ('fachada', 'reais', 'pvpr_top', 'diferenca'):
    ids += [a[0] for a in (r.get(k) or [])[:8]]
out = {}
for i in ids:
    p = os.path.join('h', i + '.json')
    if os.path.exists(p):
        out[i] = json.load(open(p))
print(json.dumps(out, separators=(',', ':')))
PY
echo
echo "-- HIST-FIM"
