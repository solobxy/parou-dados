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
for DOM in parou.pt www.parou.pt anjinho.pt www.anjinho.pt jinxed.world www.jinxed.world duplicasa.pt www.duplicasa.pt chave.pt www.chave.pt dinissousa.pt www.dinissousa.pt; do
  # Pergunta a dois DNS: basta um dizer que o domínio aponta para aqui (durante uma mudança
  # de DNS uns ainda dão o endereço antigo e o domínio entrava e saía a cada 2 minutos)
  IPS="$( (dig +short +time=3 +tries=2 A "$DOM" @1.1.1.1; dig +short +time=3 +tries=2 A "$DOM" @8.8.8.8) 2>/dev/null | grep -E '^[0-9.]+$' | sort -u)"
  [ -n "$IPS" ] || IPS="$(getent ahostsv4 "$DOM" 2>/dev/null | awk '{print $1}' | sort -u)"
  # Sem resposta nenhuma (falha de rede): fica como está agora, não tira o domínio por isso
  if [ -z "$IPS" ] && grep -qx "# INICIO $DOM" /etc/caddy/Caddyfile 2>/dev/null; then continue; fi
  if ! printf '%s\n' "$IPS" | grep -qx "$MEU_IP"; then
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
# O código da anjinho vive no repositório privado solobxy/anjinho; o servidor lê-o com uma chave só de leitura
ANJ=/opt/anjinho-repo
if [ -f /root/.ssh/anjinho_deploy ]; then
  export GIT_SSH_COMMAND="ssh -i /root/.ssh/anjinho_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
  if [ -d "$ANJ/.git" ]; then
    git -C "$ANJ" fetch -q --depth 1 origin main && git -C "$ANJ" reset -q --hard origin/main || true
  else
    git clone -q --depth 1 git@github.com:solobxy/anjinho.git "$ANJ" || rm -rf "$ANJ"
  fi
  unset GIT_SSH_COMMAND
fi
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

# dinissousa.pt: portfólio do Dinis, site estático que vive neste repositório, em sites/dinissousa.
# Copia só quando mudou, para uma pasta nova, e troca de uma vez (nunca fica meio copiado).
DS=$BASE/servidor/sites/dinissousa
if [ -f "$DS/index.html" ] && ! diff -rq "$DS" /var/www/dinissousa >/dev/null 2>&1; then
  rm -rf /var/www/dinissousa.novo && mkdir -p /var/www && cp -r "$DS" /var/www/dinissousa.novo \
    && chmod -R a+rX /var/www/dinissousa.novo \
    && rm -rf /var/www/dinissousa.velho && { [ ! -d /var/www/dinissousa ] || mv /var/www/dinissousa /var/www/dinissousa.velho; } \
    && mv /var/www/dinissousa.novo /var/www/dinissousa && rm -rf /var/www/dinissousa.velho
fi

# Duas Chaves: site estático (protótipo) que vive neste repositório, em sites/duaschaves.
# Copia só quando mudou, para uma pasta nova, e troca de uma vez (nunca fica meio copiado).
DC=$BASE/servidor/sites/duaschaves
if [ -f "$DC/index.html" ] && ! diff -rq "$DC" /var/www/duaschaves >/dev/null 2>&1; then
  rm -rf /var/www/duaschaves.novo && mkdir -p /var/www && cp -r "$DC" /var/www/duaschaves.novo \
    && chmod -R a+rX /var/www/duaschaves.novo \
    && rm -rf /var/www/duaschaves.velho && { [ ! -d /var/www/duaschaves ] || mv /var/www/duaschaves /var/www/duaschaves.velho; } \
    && mv /var/www/duaschaves.novo /var/www/duaschaves && rm -rf /var/www/duaschaves.velho
fi
# Recolha de anúncios a cada 30 min, no próprio servidor. Na primeira vez usa a cópia do repositório.
if [ -f "$SERV/duaschaves-recolha.service" ]; then
  if [ ! -s /var/lib/duaschaves-dados/anuncios.json ] && [ -f "$DC/anuncios.json" ]; then
    install -d -o parou -g parou -m 755 /var/lib/duaschaves-dados && install -o parou -g parou -m 644 "$DC/anuncios.json" /var/lib/duaschaves-dados/anuncios.json
  fi
  for f in duaschaves-recolha.service duaschaves-recolha.timer; do
    if ! cmp -s "$SERV/$f" "/etc/systemd/system/$f"; then cp "$SERV/$f" "/etc/systemd/system/$f" && systemctl daemon-reload; fi
  done
  systemctl is-enabled --quiet duaschaves-recolha.timer 2>/dev/null || systemctl enable --now duaschaves-recolha.timer >/dev/null 2>&1
  # Forçar uma recolha já: mudar o conteúdo de duaschaves/forcar-recolha (para a volta em curso e começa outra com o código novo)
  FR=$(cat "$BASE/servidor/duaschaves/forcar-recolha" 2>/dev/null)
  if [ -n "$FR" ] && [ "$(cat /var/lib/duaschaves-dados/.forcar 2>/dev/null)" != "$FR" ]; then
    echo "$FR" > /var/lib/duaschaves-dados/.forcar && systemctl restart --no-block duaschaves-recolha.service
  fi
  # Páginas para o Google: geradas logo que o gerador muda (e depois de cada recolha, pelo serviço)
  PV=$(sha256sum "$BASE/servidor/duaschaves/paginas.py" 2>/dev/null | cut -c1-16)
  if [ -n "$PV" ] && [ "$(cat /var/lib/duaschaves-dados/.paginas.versao 2>/dev/null)" != "$PV" ]; then
    runuser -u parou -- /usr/bin/python3 "$BASE/servidor/duaschaves/paginas.py" /var/lib/duaschaves-dados/anuncios.json /var/lib/duaschaves-dados/seo \
      && echo "$PV" > /var/lib/duaschaves-dados/.paginas.versao
  fi
fi

# API da Duplicasa (contas, preferências, alertas). Os segredos ficam em /etc/duaschaves/api.env, fora do repositório.
if [ -f "$SERV/duaschaves-api.service" ] && [ -f "$BASE/servidor/duaschaves/api.py" ]; then
  install -d -m 750 -o root -g parou /etc/duaschaves
  if [ ! -f /etc/duaschaves/api.env ]; then
    printf 'ORIGENS=https://duplicasa.pt https://www.duplicasa.pt https://duaschaves.2-31-13-85.sslip.io\nEMAIL_DE=Duplicasa <ola@duplicasa.pt>\n' > /etc/duaschaves/api.env
    chown root:parou /etc/duaschaves/api.env && chmod 640 /etc/duaschaves/api.env
  fi
  # Nova marca (Duplicasa): troca o domínio e o remetente no ficheiro já existente, sem mexer nos segredos
  if grep -q 'duaschaves\.pt' /etc/duaschaves/api.env; then
    sed -i 's#https://www\.duaschaves\.pt#https://www.duplicasa.pt#g; s#https://duaschaves\.pt#https://duplicasa.pt#g; s#^EMAIL_DE=Duas Chaves <ola@duaschaves\.pt>$#EMAIL_DE=Duplicasa <ola@duplicasa.pt>#' /etc/duaschaves/api.env
  fi
  if ! cmp -s "$SERV/duaschaves-api.service" /etc/systemd/system/duaschaves-api.service; then
    cp "$SERV/duaschaves-api.service" /etc/systemd/system/duaschaves-api.service && systemctl daemon-reload
  fi
  systemctl is-enabled --quiet duaschaves-api.service 2>/dev/null || systemctl enable --now duaschaves-api.service >/dev/null 2>&1
  for f in duaschaves-alertas.service duaschaves-alertas.timer; do
    if [ -f "$SERV/$f" ] && ! cmp -s "$SERV/$f" "/etc/systemd/system/$f"; then cp "$SERV/$f" "/etc/systemd/system/$f" && systemctl daemon-reload; fi
  done
  [ -f /etc/systemd/system/duaschaves-alertas.timer ] && { systemctl is-enabled --quiet duaschaves-alertas.timer 2>/dev/null || systemctl enable --now duaschaves-alertas.timer >/dev/null 2>&1; }
  V=$( { sha256sum "$BASE/servidor/duaschaves/api.py" "$BASE/servidor/duaschaves/estatisticas.py" /etc/duaschaves/api.env 2>/dev/null; } | sha256sum | cut -c1-16)
  if [ "$(cat /etc/duaschaves/api.versao 2>/dev/null)" != "$V" ]; then
    systemctl restart duaschaves-api.service && echo "$V" > /etc/duaschaves/api.versao
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
  # Vigia: se a app está "ligada" mas não responde (bloqueada) em 3 verificações
  # seguidas (~6 min), reinicia-a. Uma falha isolada (ex.: muito tráfego) não conta, e nos
  # primeiros 8 minutos depois de arrancar também não (a app ainda está a preparar os índices;
  # a 30/10/2026 reiniciá-la nessa fase deixou-a em ciclo de reinícios durante quase 2 horas).
  FALHAS=/var/lib/parou-estado/falhas-health
  INICIO=$(systemctl show parou -p ActiveEnterTimestamp --value 2>/dev/null)
  LIGADA_HA=$(( $(date +%s) - $(date -d "$INICIO" +%s 2>/dev/null || echo 0) ))
  if curl -fsS -m 15 http://127.0.0.1:3000/health >/dev/null 2>&1; then
    rm -f "$FALHAS"
  elif [ "$LIGADA_HA" -lt 480 ]; then
    : # ainda a arrancar
  else
    N=$(( $(cat "$FALHAS" 2>/dev/null || echo 0) + 1 ))
    echo "$N" > "$FALHAS"
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) /health sem resposta ($N)" >> /var/lib/parou-estado/reinicios.log
    if [ "$N" -ge 3 ]; then
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
# Mantém os pedaços (assets) da versão anterior: quem tinha a app aberta continua a conseguir abrir
# os ecrãs (sem isto aparecia "Failed to fetch dynamically imported module" logo a seguir a cada versão)
if [ -n "$ANTERIOR" ] && [ -d "$ANTERIOR/dist/assets" ] && [ -d "$DIR/dist/assets" ]; then
  cp -n "$ANTERIOR"/dist/assets/* "$DIR/dist/assets/" 2>/dev/null || true
fi
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
