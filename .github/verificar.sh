echo "== $(date -u +%FT%TZ)"
echo "-- versão do repositório no servidor: $(git -C /opt/parou/servidor log -1 --format='%h %s' 2>/dev/null)"
echo "-- serviços"
for s in parou parou-pontualidade caddy duaschaves-api caiu-api; do echo "$s: $(systemctl is-active $s 2>/dev/null)"; done
systemctl list-timers --all --no-pager 2>/dev/null | grep -E "pontualidade|duaschaves-recolha|NEXT" | cut -c1-160
echo "-- recursos do serviço novo"
systemctl show parou-pontualidade -p MainPID -p MemoryCurrent -p CPUUsageNSec -p NRestarts -p ActiveEnterTimestamp 2>/dev/null
echo "-- carga e memória do servidor"
uptime; free -m | head -2
echo "-- estado da gravação"
cat /var/lib/parou-pontualidade/estado.json 2>/dev/null; echo
ls -la /var/lib/parou-pontualidade/bruto/*/ 2>/dev/null | tail -8
echo "-- erros gravados"
tail -n 5 /var/lib/parou-pontualidade/bruto/*/erros.jsonl 2>/dev/null | cut -c1-300
echo "-- últimas linhas do serviço"
journalctl -u parou-pontualidade -n 15 --no-pager -o cat 2>/dev/null | cut -c1-240
echo "-- DupliCasa: histórico"
ls -la /var/lib/duaschaves-dados/historico.db 2>/dev/null || echo "ainda sem historico.db (aparece depois da próxima recolha)"
grep -n "arquivar" /etc/systemd/system/duaschaves-recolha.service 2>/dev/null
echo "-- tempo de resposta do site"
curl -s -o /dev/null -w "parou.pt local: %{http_code} em %{time_total}s\n" -H "Host: parou.pt" http://127.0.0.1:3000/ 2>/dev/null || true
