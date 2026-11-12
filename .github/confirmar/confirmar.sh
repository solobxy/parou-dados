# Só leitura: confirma a versão nova da app no servidor e as respostas nas ilhas
ESPERADO="ec1b4ff49850fb31ed8a44aebf9e7e1702f8cc64"
for i in $(seq 1 40); do v=$(cat /opt/parou/atual/.versao 2>/dev/null); [ "${v:0:7}" = "${ESPERADO:0:7}" ] && break; echo "à espera da versão ($v)"; sleep 15; done
echo "== versão no servidor: $(cat /opt/parou/atual/.versao 2>/dev/null)  esperada: $ESPERADO"
echo "== serviço: $(systemctl is-active parou)  reinícios: $(systemctl show parou -p NRestarts --value)"
for i in $(seq 1 30); do curl -s -m 5 http://127.0.0.1:3000/api/transit/loading-status | grep -q '"isLoading":false' && break; sleep 5; done
sleep 20
B=http://127.0.0.1:3000
echo "== Perto no Funchal"
curl -s -m 30 "$B/api/transit/nearby?lat=32.6478&lon=-16.9105&radius=500" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const p=j.stops||[];console.log("paragens",p.length,"com partidas",p.filter(x=>x.departures&&x.departures.length).length);console.log(p.slice(0,4).map(x=>x.name+" | "+(x.departures||[]).slice(0,2).map(d=>(d.lineCode||d.line||"")+" "+(d.destination||d.headsign||"")+" "+(d.time||d.scheduled_time||"")).join(" ; ")).join("\n"))})'
for s in "Funchal 32.6478 -16.9105" "Santana 32.805 -16.882" "PortoSanto 33.06 -16.34" "PontaDelgada 37.74 -25.668"; do set -- $s
  curl -s -m 30 "$B/api/alertas?lat=$2&lon=$3" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(process.argv[1],"->",j.local.distrito,j.local.area,"previsão",(j.tempo.dias||[]).length,"dias; escolha:",j.distritos.filter(d=>/^[MA]/.test(d.area)).map(d=>d.nome).join(", "))})' "$1"
done
echo "== páginas públicas"
curl -s -m 30 -o /tmp/p.html -w "paragem antiga 750B: %{http_code}\n" "$B/paragens/horarios-do-funchal/cam-trapiche-d2a-750b"; grep -o "<title>[^<]*" /tmp/p.html | head -1
curl -s -m 30 -o /tmp/l.html -w "linha 027: %{http_code}\n" "$B/linhas/horarios-do-funchal/027-centro-cam-ferro"; grep -o "<title>[^<]*" /tmp/l.html | head -1
echo "== erros desde o arranque"
journalctl -u parou --since "-15 min" --no-pager -o cat 2>/dev/null | grep -iE "error|erro|exception" | grep -v "SQL lento" | tail -10
