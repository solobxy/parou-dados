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
    echo "Estatísticas (hash da chave): $(printf '%s' "${ESTAT_CHAVE:-}" | sha256sum | cut -c1-64)"
    echo "Reinícios pela vigia: $(tail -n 3 /var/lib/parou-estado/reinicios.log 2>/dev/null | tr '\n' ';' || true)"
    echo "caiu.pt recolha: $(systemctl show caiu-recolha.service -p ActiveState -p Result -p ExecMainStatus 2>/dev/null | tr '\n' ' ')"
    echo "caiu.pt últimas linhas: $(journalctl -u caiu-recolha -n 4 --no-pager -o cat 2>/dev/null | cut -c1-200 | tr '\n' ';')"
    echo "caiu.pt API: $(systemctl is-active caiu-api 2>/dev/null) $(curl -s -m 3 http://127.0.0.1:3150/api/saude 2>/dev/null | cut -c1-120)"
    echo "caiu.pt avisos: $(cat /var/lib/caiu-api/alertas.json 2>/dev/null | cut -c1-240)"
    echo "ganhas.pt API: $(systemctl is-active ganhas-api 2>/dev/null) $(curl -s -m 3 http://127.0.0.1:3140/api/estado 2>/dev/null | cut -c1-80)"
    echo "ganhas.pt páginas: $(systemctl show ganhas-paginas.service -p Result -p ExecMainStatus 2>/dev/null | tr '\n' ' ') $(journalctl -u ganhas-paginas -n 12 --no-pager -o cat 2>/dev/null | grep -v -E '^(Starting|Started|Finished|Failed to start|ganhas-paginas)' | tail -3 | cut -c1-200 | tr '\n' ';')"
    cat /var/lib/parou-estado/vigia-projetos.txt 2>/dev/null | sed -E 's/([0-9]{1,3}\.){3}[0-9]{1,3}/<ip>/g' | cut -c1-300
    echo
    echo "--- Últimas linhas da app ---"
    # Esta página é pública: esconde emails e endereços IP que alguma linha possa ter
    journalctl -u parou -n 40 --no-pager -o cat 2>/dev/null | sed -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/<email>/g; s/([0-9]{1,3}\.){3}[0-9]{1,3}/<ip>/g' | cut -c1-240
  } > "$ESTADO.tmp" && mv "$ESTADO.tmp" "$ESTADO"
  chmod 644 "$ESTADO"
}

# 1. Caddy
source /etc/parou-servidor.env
# Estatísticas: chave que só o Caddy deste servidor conhece (gerada aqui; o Supabase guarda só o hash,
# que aparece em /_estado-servidor para se poder atualizar se o servidor for recriado)
if [ ! -s /etc/estatisticas.env ]; then
  (umask 077; echo "ESTAT_CHAVE=$(openssl rand -hex 32)" > /etc/estatisticas.env)
fi
source /etc/estatisticas.env
sed -e "s/{HOST_TESTE}/$HOST_TESTE/g" -e "s/{ESTAT_CHAVE}/${ESTAT_CHAVE:-sem-chave}/g" "$SERV/Caddyfile" > /tmp/Caddyfile.novo
# O domínio só entra quando já aponta para este servidor (senão o Caddy falhava o
# certificado e ficava a tentar com esperas cada vez maiores)
MEU_IP="$(echo "${HOST_TESTE%%.sslip.io}" | tr '-' '.')"
for DOM in parou.pt www.parou.pt goodman.pt www.goodman.pt anjinho.pt www.anjinho.pt jinxed.world www.jinxed.world duplicasa.pt www.duplicasa.pt chave.pt www.chave.pt dinissousa.pt www.dinissousa.pt adribodypiercing.pt www.adribodypiercing.pt jaesta.pt www.jaesta.pt apalavrado.pt www.apalavrado.pt tapmoss.com www.tapmoss.com caiu.pt www.caiu.pt ganhas.pt www.ganhas.pt; do
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

# Estatísticas: o script /_e.js é servido por todos os sites a partir de /var/www/_estatisticas
EJ="$SERV/estatisticas/e.js"
if [ -f "$EJ" ] && ! cmp -s "$EJ" /var/www/_estatisticas/e.js; then
  install -d -m 755 /var/www/_estatisticas && install -m 644 "$EJ" /var/www/_estatisticas/e.js.novo \
    && mv /var/www/_estatisticas/e.js.novo /var/www/_estatisticas/e.js
fi
# Jinxed: site estático em sites/jinxed (antes só existia no servidor, copiado à mão).
# Copia só quando mudou, para uma pasta nova, e troca de uma vez (nunca fica meio copiado).
JX=$BASE/servidor/sites/jinxed
if [ -f "$JX/index.html" ] && ! diff -rq "$JX" /var/www/jinxed >/dev/null 2>&1; then
  rm -rf /var/www/jinxed.novo && mkdir -p /var/www && cp -r "$JX" /var/www/jinxed.novo \
    && chmod -R a+rX /var/www/jinxed.novo \
    && rm -rf /var/www/jinxed.velho && { [ ! -d /var/www/jinxed ] || mv /var/www/jinxed /var/www/jinxed.velho; } \
    && mv /var/www/jinxed.novo /var/www/jinxed && rm -rf /var/www/jinxed.velho
fi
if [ -f /var/www/jinxed/index.html ] && ! grep -q '/_e.js' /var/www/jinxed/index.html; then
  sed -i '0,/<\/head>/s##<script defer src="/_e.js" data-site="jinxed"></script></head>#' /var/www/jinxed/index.html
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

# AdriBodyPiercing: site do estúdio do Adriano, estático, em sites/adribodypiercing.
# Copia só quando mudou, para uma pasta nova, e troca de uma vez (nunca fica meio copiado).
AB=$BASE/servidor/sites/adribodypiercing
if [ -f "$AB/index.html" ] && ! diff -rq "$AB" /var/www/adribodypiercing >/dev/null 2>&1; then
  rm -rf /var/www/adribodypiercing.novo && mkdir -p /var/www && cp -r "$AB" /var/www/adribodypiercing.novo \
    && chmod -R a+rX /var/www/adribodypiercing.novo \
    && rm -rf /var/www/adribodypiercing.velho && { [ ! -d /var/www/adribodypiercing ] || mv /var/www/adribodypiercing /var/www/adribodypiercing.velho; } \
    && mv /var/www/adribodypiercing.novo /var/www/adribodypiercing && rm -rf /var/www/adribodypiercing.velho
fi

# já está: sites feitos antes de pedir (página da marca, modelos em /m e pré-visualizações em /p),
# site estático em sites/jaesta. Copia só quando mudou, para uma pasta nova, e troca de uma vez.
JE=$BASE/servidor/sites/jaesta
if [ -f "$JE/index.html" ] && ! diff -rq "$JE" /var/www/jaesta >/dev/null 2>&1; then
  rm -rf /var/www/jaesta.novo && mkdir -p /var/www && cp -r "$JE" /var/www/jaesta.novo \
    && chmod -R a+rX /var/www/jaesta.novo \
    && rm -rf /var/www/jaesta.velho && { [ ! -d /var/www/jaesta ] || mv /var/www/jaesta /var/www/jaesta.velho; } \
    && mv /var/www/jaesta.novo /var/www/jaesta && rm -rf /var/www/jaesta.velho
fi

# Goodman: advogado virtual, site estático em sites/goodman.
# Copia só quando mudou, para uma pasta nova, e troca de uma vez (nunca fica meio copiado).
GM=$BASE/servidor/sites/goodman
if [ -f "$GM/index.html" ] && ! diff -rq "$GM" /var/www/goodman >/dev/null 2>&1; then
  rm -rf /var/www/goodman.novo && mkdir -p /var/www && cp -r "$GM" /var/www/goodman.novo \
    && chmod -R a+rX /var/www/goodman.novo \
    && rm -rf /var/www/goodman.velho && { [ ! -d /var/www/goodman ] || mv /var/www/goodman /var/www/goodman.velho; } \
    && mv /var/www/goodman.novo /var/www/goodman && rm -rf /var/www/goodman.velho
fi

# tapmoss: jogo de fazer crescer musgo (instalável, funciona sem rede), site estático em sites/tapmoss.
# Copia só quando mudou, para uma pasta nova, e troca de uma vez (nunca fica meio copiado).
TM=$BASE/servidor/sites/tapmoss
if [ -f "$TM/index.html" ] && ! diff -rq "$TM" /var/www/tapmoss >/dev/null 2>&1; then
  rm -rf /var/www/tapmoss.novo && mkdir -p /var/www && cp -r "$TM" /var/www/tapmoss.novo \
    && chmod -R a+rX /var/www/tapmoss.novo \
    && rm -rf /var/www/tapmoss.velho && { [ ! -d /var/www/tapmoss ] || mv /var/www/tapmoss /var/www/tapmoss.velho; } \
    && mv /var/www/tapmoss.novo /var/www/tapmoss && rm -rf /var/www/tapmoss.velho
fi

# AdriBodyPiercing: agenda (API em 127.0.0.1:3120, atrás do Caddy). A password fica só como hash em
# /etc/adri-agenda/agenda.env, fora do repositório (posta lá pelo servidor.yml, acao=chaves-adri).
if [ -f "$SERV/adri-agenda.service" ] && [ -f "$BASE/servidor/adri/agenda.py" ]; then
  install -d -m 750 -o root -g parou /etc/adri-agenda
  if [ ! -f /etc/adri-agenda/agenda.env ]; then
    printf 'ORIGENS=https://adribodypiercing.pt https://www.adribodypiercing.pt https://adribodypiercing.2-31-13-85.sslip.io\n' > /etc/adri-agenda/agenda.env
    chown root:parou /etc/adri-agenda/agenda.env && chmod 640 /etc/adri-agenda/agenda.env
  fi
  if ! cmp -s "$SERV/adri-agenda.service" /etc/systemd/system/adri-agenda.service; then
    cp "$SERV/adri-agenda.service" /etc/systemd/system/adri-agenda.service && systemctl daemon-reload
  fi
  systemctl is-enabled --quiet adri-agenda.service 2>/dev/null || systemctl enable --now adri-agenda.service >/dev/null 2>&1
  V=$( { sha256sum "$BASE/servidor/adri/agenda.py" /etc/adri-agenda/agenda.env 2>/dev/null; } | sha256sum | cut -c1-16)
  if [ "$(cat /etc/adri-agenda/versao 2>/dev/null)" != "$V" ]; then
    systemctl restart adri-agenda.service && echo "$V" > /etc/adri-agenda/versao
  fi
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

# API da DupliCasa (contas, preferências, alertas). Os segredos ficam em /etc/duaschaves/api.env, fora do repositório.
if [ -f "$SERV/duaschaves-api.service" ] && [ -f "$BASE/servidor/duaschaves/api.py" ]; then
  install -d -m 750 -o root -g parou /etc/duaschaves
  if [ ! -f /etc/duaschaves/api.env ]; then
    printf 'ORIGENS=https://duplicasa.pt https://www.duplicasa.pt https://duaschaves.2-31-13-85.sslip.io\nEMAIL_DE=DupliCasa <ola@duplicasa.pt>\n' > /etc/duaschaves/api.env
    chown root:parou /etc/duaschaves/api.env && chmod 640 /etc/duaschaves/api.env
  fi
  # Nova marca (DupliCasa): troca o domínio e o remetente no ficheiro já existente, sem mexer nos segredos
  if grep -q 'duaschaves\.pt' /etc/duaschaves/api.env; then
    sed -i 's#https://www\.duaschaves\.pt#https://www.duplicasa.pt#g; s#https://duaschaves\.pt#https://duplicasa.pt#g; s#^EMAIL_DE=Duas Chaves <ola@duaschaves\.pt>$#EMAIL_DE=DupliCasa <ola@duplicasa.pt>#' /etc/duaschaves/api.env
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

# apalavrado: mercado social. Código no repositório privado solobxy/apalavrado, lido com uma chave só de leitura
# (/root/.ssh/apalavrado_deploy). Site em /var/www/apalavrado; API em /opt/apalavrado/api (apalavrado-api.service);
# dados em /var/lib/apalavrado-api (fora do repositório); configuração em /etc/apalavrado/api.env.
APA=/opt/apalavrado-repo
if [ -f /root/.ssh/apalavrado_deploy ]; then
  export GIT_SSH_COMMAND="ssh -i /root/.ssh/apalavrado_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
  if [ -d "$APA/.git" ]; then
    git -C "$APA" fetch -q --depth 1 origin main && git -C "$APA" reset -q --hard origin/main || true
  else
    git clone -q --depth 1 git@github.com:solobxy/apalavrado.git "$APA" || rm -rf "$APA"
  fi
  unset GIT_SSH_COMMAND
fi
if [ -f "$APA/site/index.html" ] && [ -f "$APA/api/api.py" ]; then
  if ! diff -rq "$APA/site" /var/www/apalavrado >/dev/null 2>&1; then
    rm -rf /var/www/apalavrado.novo && mkdir -p /var/www && cp -r "$APA/site" /var/www/apalavrado.novo \
      && chmod -R a+rX /var/www/apalavrado.novo \
      && rm -rf /var/www/apalavrado.velho && { [ ! -d /var/www/apalavrado ] || mv /var/www/apalavrado /var/www/apalavrado.velho; } \
      && mv /var/www/apalavrado.novo /var/www/apalavrado && rm -rf /var/www/apalavrado.velho
  fi
  if ! diff -rq "$APA/api" /opt/apalavrado/api >/dev/null 2>&1; then
    rm -rf /opt/apalavrado/api.novo && mkdir -p /opt/apalavrado && cp -r "$APA/api" /opt/apalavrado/api.novo \
      && chmod -R a+rX /opt/apalavrado/api.novo && rm -rf /opt/apalavrado/api.velho \
      && { [ ! -d /opt/apalavrado/api ] || mv /opt/apalavrado/api /opt/apalavrado/api.velho; } \
      && mv /opt/apalavrado/api.novo /opt/apalavrado/api && rm -rf /opt/apalavrado/api.velho
  fi
  install -d -m 750 -o root -g parou /etc/apalavrado
  if [ ! -f /etc/apalavrado/api.env ]; then
    printf 'ORIGENS=https://apalavrado.pt https://www.apalavrado.pt https://apalavrado.%s\nADMINS=diniscash@gmail.com\nAPA_PAGAMENTOS=teste\n' "$HOST_TESTE" > /etc/apalavrado/api.env
    chown root:parou /etc/apalavrado/api.env && chmod 640 /etc/apalavrado/api.env
  fi
  if ! cmp -s "$SERV/apalavrado-api.service" /etc/systemd/system/apalavrado-api.service; then
    cp "$SERV/apalavrado-api.service" /etc/systemd/system/apalavrado-api.service && systemctl daemon-reload
  fi
  systemctl is-enabled --quiet apalavrado-api.service 2>/dev/null || systemctl enable --now apalavrado-api.service >/dev/null 2>&1
  V=$( { cat /opt/apalavrado/api/*.py /etc/apalavrado/api.env 2>/dev/null; } | sha256sum | cut -c1-16)
  if [ "$(cat /etc/apalavrado/api.versao 2>/dev/null)" != "$V" ]; then
    systemctl restart apalavrado-api.service && echo "$V" > /etc/apalavrado/api.versao
  fi
  systemctl is-active --quiet apalavrado-api.service || systemctl start apalavrado-api.service
fi

# caiu.pt: comparador de preços dos supermercados. Site estático em sites/caiu; os preços são recolhidos
# aqui, de manhã e à tarde (caiu-recolha.timer), para /var/lib/caiu-dados, e o Caddy serve-os em /dados/.
CU=$BASE/servidor/sites/caiu
if [ -f "$CU/index.html" ] && ! diff -rq "$CU" /var/www/caiu >/dev/null 2>&1; then
  rm -rf /var/www/caiu.novo && mkdir -p /var/www && cp -r "$CU" /var/www/caiu.novo \
    && chmod -R a+rX /var/www/caiu.novo \
    && rm -rf /var/www/caiu.velho && { [ ! -d /var/www/caiu ] || mv /var/www/caiu /var/www/caiu.velho; } \
    && mv /var/www/caiu.novo /var/www/caiu && rm -rf /var/www/caiu.velho
fi
if [ -f "$SERV/caiu-recolha.service" ] && [ -f "$BASE/servidor/caiu/recolher.py" ]; then
  for f in caiu-recolha.service caiu-recolha.timer; do
    if ! cmp -s "$SERV/$f" "/etc/systemd/system/$f"; then cp "$SERV/$f" "/etc/systemd/system/$f" && systemctl daemon-reload; fi
  done
  systemctl is-enabled --quiet caiu-recolha.timer 2>/dev/null || systemctl enable --now caiu-recolha.timer >/dev/null 2>&1
  # API (pesquisa, seguir preços, avisos) e avisos depois de cada recolha. Segredos em /etc/caiu/api.env
  # (ação «chaves-caiu» do workflow Servidor); sem eles a API funciona, só não envia e-mails.
  install -d -m 750 -o root -g parou /etc/caiu
  for f in caiu-api.service caiu-alertas.service; do
    if [ -f "$SERV/$f" ] && ! cmp -s "$SERV/$f" "/etc/systemd/system/$f"; then cp "$SERV/$f" "/etc/systemd/system/$f" && systemctl daemon-reload; fi
  done
  if [ -f /etc/systemd/system/caiu-api.service ]; then
    systemctl is-enabled --quiet caiu-api.service 2>/dev/null || systemctl enable --now caiu-api.service >/dev/null 2>&1
    V=$( { sha256sum "$BASE/servidor/caiu/api.py" "$BASE/servidor/caiu/comum.py" /etc/caiu/api.env 2>/dev/null; } | sha256sum | cut -c1-16)
    if [ "$(cat /etc/caiu/api.versao 2>/dev/null)" != "$V" ]; then
      systemctl restart caiu-api.service && echo "$V" > /etc/caiu/api.versao
    fi
    systemctl is-active --quiet caiu-api.service || systemctl start caiu-api.service
  fi
  # Recolha já (na primeira instalação e sempre que caiu/forcar-recolha muda)
  FR=$(cat "$BASE/servidor/caiu/forcar-recolha" 2>/dev/null)
  if [ -n "$FR" ] && [ "$(cat /var/lib/caiu-estado/forcar 2>/dev/null)" != "$FR" ]; then
    install -d -m 755 /var/lib/caiu-estado && echo "$FR" > /var/lib/caiu-estado/forcar
    systemctl start --no-block caiu-recolha.service
  fi
fi

# ganhas.pt: salários reais em Portugal. Site estático em sites/ganhas (gerado por ganhas/gerar.py); API das partilhas
# em ganhas-api.service (127.0.0.1:3140, dados em /var/lib/ganhas-api, fora do repositório); páginas das empresas e
# cópias de segurança de hora a hora (ganhas-paginas.timer). Configuração em /etc/ganhas/api.env.
GA=$BASE/servidor/sites/ganhas
if [ -f "$GA/index.html" ] && ! diff -rq "$GA" /var/www/ganhas >/dev/null 2>&1; then
  rm -rf /var/www/ganhas.novo && mkdir -p /var/www && cp -r "$GA" /var/www/ganhas.novo \
    && chmod -R a+rX /var/www/ganhas.novo \
    && rm -rf /var/www/ganhas.velho && { [ ! -d /var/www/ganhas ] || mv /var/www/ganhas /var/www/ganhas.velho; } \
    && mv /var/www/ganhas.novo /var/www/ganhas && rm -rf /var/www/ganhas.velho
fi
if [ -f "$SERV/ganhas-api.service" ] && [ -f "$BASE/servidor/ganhas/api.py" ]; then
  install -d -m 750 -o root -g parou /etc/ganhas
  if [ ! -f /etc/ganhas/api.env ]; then
    printf 'ORIGENS=https://ganhas.pt https://www.ganhas.pt https://ganhas.%s\nPOW_BITS=17\n' "$HOST_TESTE" > /etc/ganhas/api.env
    chown root:parou /etc/ganhas/api.env && chmod 640 /etc/ganhas/api.env
  fi
  for f in ganhas-api.service ganhas-paginas.service ganhas-paginas.timer; do
    if [ -f "$SERV/$f" ] && ! cmp -s "$SERV/$f" "/etc/systemd/system/$f"; then cp "$SERV/$f" "/etc/systemd/system/$f" && systemctl daemon-reload; fi
  done
  systemctl is-enabled --quiet ganhas-api.service 2>/dev/null || systemctl enable --now ganhas-api.service >/dev/null 2>&1
  systemctl is-enabled --quiet ganhas-paginas.timer 2>/dev/null || systemctl enable --now ganhas-paginas.timer >/dev/null 2>&1
  V=$( { sha256sum "$BASE/servidor/ganhas/api.py" "$BASE/servidor/ganhas/catalogo.json" /etc/ganhas/api.env 2>/dev/null; } | sha256sum | cut -c1-16)
  if [ "$(cat /etc/ganhas/api.versao 2>/dev/null)" != "$V" ]; then
    systemctl restart ganhas-api.service && echo "$V" > /etc/ganhas/api.versao
  fi
  systemctl is-active --quiet ganhas-api.service || systemctl start ganhas-api.service
  # Páginas das empresas: logo que o gerador muda (e depois de hora a hora, pelo timer)
  # limpeza única: a partilha de teste feita pelo teste automático de 11/11/2026 (14:20–14:45 UTC)
  if [ -f /var/lib/ganhas-api/dados.db ] && [ ! -f /etc/ganhas/limpeza-teste-20261111 ]; then
    runuser -u parou -- python3 -c "import sqlite3; c=sqlite3.connect('/var/lib/ganhas-api/dados.db'); n=c.execute(\"DELETE FROM partilhas WHERE profissao='enfermeiro' AND distrito='porto' AND bruto_mes=1650 AND horas=40 AND contrato='efetivo' AND experiencia='3-5' AND criado BETWEEN 1794406800 AND 1794408300\").rowcount; c.commit(); print(n)" > /etc/ganhas/limpeza-teste-20261111 2>&1
  fi
  PV=$(sha256sum "$BASE/servidor/ganhas/paginas_empresas.py" 2>/dev/null | cut -c1-16)
  if [ -n "$PV" ] && [ "$(cat /etc/ganhas/paginas.versao 2>/dev/null)" != "$PV" ]; then
    systemctl start --no-block ganhas-paginas.service && echo "$PV" > /etc/ganhas/paginas.versao
  fi
fi

# Vigia dos projetos (de 10 em 10 minutos): serviços parados, APIs bloqueadas, dados velhos e o Supabase do Goodman acordado
if [ -f "$SERV/vigia-projetos.sh" ]; then
  if ! cmp -s "$SERV/vigia-projetos.sh" /usr/local/bin/vigia-projetos; then install -m 755 "$SERV/vigia-projetos.sh" /usr/local/bin/vigia-projetos; fi
  for f in vigia-projetos.service vigia-projetos.timer; do
    if ! cmp -s "$SERV/$f" "/etc/systemd/system/$f"; then cp "$SERV/$f" "/etc/systemd/system/$f" && systemctl daemon-reload; fi
  done
  systemctl is-enabled --quiet vigia-projetos.timer 2>/dev/null || systemctl enable --now vigia-projetos.timer >/dev/null 2>&1
  systemctl is-active --quiet vigia-projetos.timer || systemctl start vigia-projetos.timer
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
