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
    echo "Reinícios pela vigia: $(tail -n 3 /var/lib/parou-estado/reinicios.log 2>/dev/null | tr '\n' ';' || true)"
    echo
    echo "--- Últimas linhas da app ---"
    # Esta página é pública: esconde emails e endereços IP que alguma linha possa ter
    journalctl -u parou -n 40 --no-pager -o cat 2>/dev/null | sed -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/<email>/g; s/([0-9]{1,3}\.){3}[0-9]{1,3}/<ip>/g' | cut -c1-240
  } > "$ESTADO.tmp" && mv "$ESTADO.tmp" "$ESTADO"
  chmod 644 "$ESTADO"
}

# 1. Caddy
source /etc/parou-servidor.env
sed "s/{HOST_TESTE}/$HOST_TESTE/g" "$SERV/Caddyfile" > /tmp/Caddyfile.novo
# O domínio só entra quando já aponta para este servidor (senão o Caddy falhava o
# certificado e ficava a tentar com esperas cada vez maiores)
MEU_IP="$(echo "${HOST_TESTE%%.sslip.io}" | tr '-' '.')"
for DOM in parou.pt www.parou.pt anjinho.pt www.anjinho.pt; do
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

# anjinho.pt: site estático e lista de espera (os emails ficam em /var/lib/anjinho, fora do repositório)
ANJ=$BASE/servidor/anjinho
if [ -d "$ANJ/site" ]; then
  if ! diff -rq "$ANJ/site" /var/www/anjinho >/dev/null 2>&1; then
    rm -rf /var/www/anjinho.novo && mkdir -p /var/www && cp -r "$ANJ/site" /var/www/anjinho.novo \
      && chmod -R a+rX /var/www/anjinho.novo \
      && rm -rf /var/www/anjinho.velho && { [ ! -d /var/www/anjinho ] || mv /var/www/anjinho /var/www/anjinho.velho; } \
      && mv /var/www/anjinho.novo /var/www/anjinho && rm -rf /var/www/anjinho.velho
  fi
  REINICIAR_ANJ=""
  if ! cmp -s "$ANJ/lista.mjs" /opt/anjinho/lista.mjs; then
    mkdir -p /opt/anjinho && install -m 644 "$ANJ/lista.mjs" /opt/anjinho/lista.mjs && REINICIAR_ANJ=1
  fi
  if ! cmp -s "$SERV/anjinho.service" /etc/systemd/system/anjinho.service; then
    cp "$SERV/anjinho.service" /etc/systemd/system/anjinho.service && systemctl daemon-reload && REINICIAR_ANJ=1
  fi
  systemctl is-enabled --quiet anjinho 2>/dev/null || systemctl enable anjinho >/dev/null 2>&1
  if [ -n "$REINICIAR_ANJ" ]; then systemctl restart anjinho; else systemctl is-active --quiet anjinho || systemctl start anjinho; fi
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

# Resumo do registo de segurança da app (só totais por tipo e por dia: sem IPs, sem rotas, sem códigos de origem).
# Fica ao lado da página de estado, para a vigia automática do GitHub o poder ler e avisar o criador.
if [ -s /var/lib/parou/seguranca-resumo.json ]; then
  cp /var/lib/parou/seguranca-resumo.json /var/lib/parou-estado/seguranca.json.tmp \
    && mv /var/lib/parou-estado/seguranca.json.tmp /var/lib/parou-estado/seguranca.json \
    && chmod 644 /var/lib/parou-estado/seguranca.json
fi

# Registos do servidor: no máximo 30 dias (como diz a política de privacidade) e 500 MB
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nMaxRetentionSec=30day\nSystemMaxUse=500M\n' > /tmp/parou-journald.conf
if ! cmp -s /tmp/parou-journald.conf /etc/systemd/journald.conf.d/parou.conf; then
  cp /tmp/parou-journald.conf /etc/systemd/journald.conf.d/parou.conf
  systemctl restart systemd-journald || true
fi

# Segurança do servidor (cada passo só mexe se ainda não está assim)
# 1. SSH só com chave: ninguém tem palavra-passe, por isso fecha-se a porta a tentativas de adivinhar.
#    O ficheiro começa por 00 porque no SSH vale o primeiro valor que aparece.
if [ ! -f /etc/ssh/sshd_config.d/00-parou.conf ]; then
  mkdir -p /etc/ssh/sshd_config.d
  printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/00-parou.conf
  if sshd -t 2>/dev/null && sshd -T 2>/dev/null | grep -q '^passwordauthentication no'; then
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
  else
    rm -f /etc/ssh/sshd_config.d/00-parou.conf   # não ficou bem: volta ao que estava
  fi
fi
# 2. A pasta dos dados (contas, favoritos, subscrições, cópias) só o utilizador da app e o root a abrem
if [ "$(stat -c %a /var/lib/parou 2>/dev/null)" != "750" ]; then chmod 750 /var/lib/parou 2>/dev/null || true; fi
# 3. Atualizações de segurança do Ubuntu já se instalam sozinhas; o kernel novo só vale depois de reiniciar,
#    por isso o servidor reinicia sozinho de madrugada quando há uma atualização que o exija (a app volta sozinha).
if [ ! -f /etc/apt/apt.conf.d/52parou-reinicio ]; then
  printf 'Unattended-Upgrade::Automatic-Reboot "true";\nUnattended-Upgrade::Automatic-Reboot-WithUsers "true";\nUnattended-Upgrade::Automatic-Reboot-Time "04:30";\n' > /etc/apt/apt.conf.d/52parou-reinicio
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
  # Sem código novo: garante que a app e o Caddy estão a correr e a responder
  systemctl is-active --quiet caddy || systemctl start caddy
  systemctl is-active --quiet parou || systemctl start parou
  # Vigia: se a app está "ligada" mas não responde (bloqueada) em 2 verificações
  # seguidas (~4 min), reinicia-a. Uma falha isolada (ex.: a arrancar) não conta.
  FALHAS=/var/lib/parou-estado/falhas-health
  if curl -fsS -m 10 http://127.0.0.1:3000/health >/dev/null 2>&1; then
    rm -f "$FALHAS"
  else
    N=$(( $(cat "$FALHAS" 2>/dev/null || echo 0) + 1 ))
    echo "$N" > "$FALHAS"
    if [ "$N" -ge 2 ]; then
      systemctl restart parou
      rm -f "$FALHAS"
      echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) app não respondia; reiniciada" >> /var/lib/parou-estado/reinicios.log
      tail -n 50 /var/lib/parou-estado/reinicios.log > /var/lib/parou-estado/reinicios.tmp && mv /var/lib/parou-estado/reinicios.tmp /var/lib/parou-estado/reinicios.log
      escrever_estado "a app não respondia; reiniciei-a às $(date -u +%H:%M) UTC"
      exit 0
    fi
  fi
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
