#!/bin/bash
# PAROU.PT - atualização automática (corre a cada 2 minutos pelo parou-atualizar.timer)
#
# 1. Atualiza a configuração do Caddy se mudou no repositório.
# 2. Se houver um commit novo em solobxy/parou (ramo main), compila-o numa pasta nova,
#    troca para ele e reinicia a app. Se a app nova não responder, volta à anterior.
# 3. Escreve um resumo do estado em /var/lib/parou-estado/estado.txt
#    (visível em https://<servidor>/_estado-servidor).
set -uo pipefail
BASE=/opt/parou
REPO=https://github.com/solobxy/parou.git
SERV=$BASE/servidor/servidor
ESTADO=/var/lib/parou-estado/estado.txt
LOG=/var/lib/parou-estado/ultima-compilacao.log
mkdir -p /var/lib/parou-estado

escrever_estado() {
  {
    echo "Atualizado: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "Versão em uso: $(cat $BASE/atual/.versao 2>/dev/null || echo nenhuma)"
    echo "Última tentativa: ${1:-sem alterações}"
    echo "App: $(systemctl is-active parou 2>/dev/null)  Caddy: $(systemctl is-active caddy 2>/dev/null)"
    echo "Node: $(node --version 2>/dev/null)"
    echo "Memória (MB): $(free -m | awk '/Mem:/ {print "total " $2 ", usada " $3 ", disponível " $7}')"
    echo "Disco: $(df -h / | awk 'NR==2 {print $3 " usados de " $2 " (" $5 ")"}')"
    echo "Base de horários: $(ls -la /var/lib/parou/gtfs.db 2>/dev/null | awk '{print $5 " bytes, " $6 " " $7 " " $8}')"
    echo "Ligado desde: $(uptime -s)"
    echo
    echo "--- Últimas linhas da app ---"
    journalctl -u parou -n 40 --no-pager -o cat 2>/dev/null | cut -c1-300
  } > "$ESTADO.tmp" && mv "$ESTADO.tmp" "$ESTADO"
  chmod 644 "$ESTADO"
}

# 1. Caddy
source /etc/parou-servidor.env
sed "s/{HOST_TESTE}/$HOST_TESTE/g" "$SERV/Caddyfile" > /tmp/Caddyfile.novo
# O domínio só entra quando já aponta para este servidor (senão o Caddy falhava o
# certificado e ficava a tentar com esperas cada vez maiores)
MEU_IP="$(echo "${HOST_TESTE%%.sslip.io}" | tr '-' '.')"
for DOM in parou.pt www.parou.pt; do
  IP_DOM="$( (dig +short A "$DOM" @1.1.1.1 2>/dev/null || getent ahostsv4 "$DOM" | awk '{print $1}') | grep -E '^[0-9.]+$' | head -1)"
  if [ "$IP_DOM" != "$MEU_IP" ]; then
    sed -i "/^# INICIO $DOM\$/,/^# FIM $DOM\$/d" /tmp/Caddyfile.novo
  fi
done
if ! cmp -s /tmp/Caddyfile.novo /etc/caddy/Caddyfile; then
  if caddy validate --adapter caddyfile --config /tmp/Caddyfile.novo >/dev/null 2>&1; then
    cp /tmp/Caddyfile.novo /etc/caddy/Caddyfile
    systemctl reload caddy || systemctl restart caddy
  fi
fi

# O próprio atualizador, se mudou no repositório
if ! cmp -s "$SERV/parou-atualizar" /usr/local/bin/parou-atualizar; then
  install -m 755 "$SERV/parou-atualizar" /usr/local/bin/parou-atualizar
fi

# Serviços do systemd, se mudaram no repositório
for f in parou.service parou-atualizar.service parou-atualizar.timer; do
  if ! cmp -s "$SERV/$f" "/etc/systemd/system/$f"; then
    cp "$SERV/$f" "/etc/systemd/system/$f"
    systemctl daemon-reload
  fi
done

# Registos do servidor: no máximo 30 dias (como diz a política de privacidade) e 500 MB
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nMaxRetentionSec=30day\nSystemMaxUse=500M\n' > /tmp/parou-journald.conf
if ! cmp -s /tmp/parou-journald.conf /etc/systemd/journald.conf.d/parou.conf; then
  cp /tmp/parou-journald.conf /etc/systemd/journald.conf.d/parou.conf
  systemctl restart systemd-journald || true
fi

# Fuso horário de Portugal para a app (horas locais, "hoje", feriados)
if ! grep -q '^TZ=' /etc/parou.env 2>/dev/null; then
  echo 'TZ=Europe/Lisbon' >> /etc/parou.env
  systemctl restart parou || true
fi

# 2. App
NOVO=$(git ls-remote "$REPO" refs/heads/main | cut -f1)
ATUAL=$(cat $BASE/atual/.versao 2>/dev/null || true)
if [ -z "$NOVO" ]; then escrever_estado "não consegui ler o GitHub"; exit 0; fi
if [ "$NOVO" = "$ATUAL" ] && [ -z "${FORCAR:-}" ]; then
  # Sem código novo: só garante que a app está a correr e atualiza o estado de 10 em 10 minutos
  systemctl is-active --quiet parou || systemctl start parou
  if [ -z "$(find "$ESTADO" -mmin -10 2>/dev/null)" ]; then escrever_estado; fi
  exit 0
fi

DIR=$BASE/releases/$NOVO
rm -rf "$DIR"
if ! runuser -u parou -- env HOME=$BASE NODE_OPTIONS=--max-old-space-size=2048 bash -c "
  set -e
  git clone -q --depth 1 '$REPO' '$DIR'
  cd '$DIR'
  # O package-lock.json do AI Studio tem conflitos de versões (o AI Studio instala com o bun);
  # --legacy-peer-deps instala na mesma, como o bun faz.
  npm ci --no-audit --no-fund --legacy-peer-deps || npm install --no-audit --no-fund --legacy-peer-deps
  npm run build
  test -f dist/index.html
" > "$LOG" 2>&1; then
  escrever_estado "ERRO ao compilar ${NOVO:0:7} (a app continua na versão anterior). Fim do registo:
$(tail -n 30 "$LOG")"
  rm -rf "$DIR"
  exit 1
fi
echo "$NOVO" > "$DIR/.versao"

ANTERIOR=$(readlink -f $BASE/atual 2>/dev/null || true)
ln -sfn "$DIR" $BASE/atual.novo && mv -T $BASE/atual.novo $BASE/atual
systemctl restart parou

OK=""
for i in $(seq 1 45); do
  if curl -fsS -m 5 http://127.0.0.1:3000/health >/dev/null 2>&1; then OK=1; break; fi
  sleep 2
done
if [ -z "$OK" ] && [ -n "$ANTERIOR" ] && [ -d "$ANTERIOR" ]; then
  ln -sfn "$ANTERIOR" $BASE/atual.novo && mv -T $BASE/atual.novo $BASE/atual
  systemctl restart parou
  escrever_estado "ERRO: a versão ${NOVO:0:7} não arrancou; voltei à anterior."
  exit 1
fi

# Guarda só as 3 versões mais recentes
ls -1dt $BASE/releases/*/ 2>/dev/null | tail -n +4 | xargs -r rm -rf
escrever_estado "versão ${NOVO:0:7} instalada às $(date -u +%H:%M) UTC"
