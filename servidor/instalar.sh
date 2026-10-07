#!/bin/bash
# PAROU.PT - instalação do servidor (corre uma vez, no primeiro arranque, pelo cloud-init)
#
# Instala Node.js 22, Caddy (https automático) e a app a partir do GitHub, e deixa
# um temporizador que a cada 2 minutos verifica se há código novo e atualiza sozinho.
#
# Pastas:
#   /opt/parou/servidor   cópia deste repositório (scripts do servidor)
#   /opt/parou/releases   uma pasta por versão da app (as 3 mais recentes)
#   /opt/parou/atual      ligação para a versão em uso
#   /var/lib/parou        base de dados de horários (fica entre atualizações)
set -euxo pipefail
exec > >(tee -a /var/log/parou-instalar.log) 2>&1
export DEBIAN_FRONTEND=noninteractive

# 1. Memória de reserva (swap) de 2 GB, para a compilação nunca ficar sem memória
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 2. Pacotes: git, firewall, Caddy (repositório do Ubuntu) e Node.js 22 (NodeSource)
apt-get update
apt-get install -y ca-certificates curl gnupg git ufw caddy xz-utils
if curl -fsSL https://deb.nodesource.com/setup_22.x -o /root/nodesource_setup.sh; then
  bash /root/nodesource_setup.sh && apt-get install -y nodejs || true
fi
# Se o NodeSource falhar, instala o Node.js 22 oficial a partir de nodejs.org
if ! node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)" 2>/dev/null; then
  PACOTE=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep -o 'node-v22[^ ]*-linux-x64.tar.xz' | head -1)
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/$PACOTE" | tar -xJ -C /usr/local --strip-components=1
  hash -r
fi
node --version

# 3. Utilizador e pastas
id parou >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/parou --shell /usr/sbin/nologin parou
mkdir -p /opt/parou/releases /var/lib/parou /var/lib/parou-estado
chown -R parou:parou /opt/parou /var/lib/parou
if [ ! -d /opt/parou/servidor/.git ]; then
  git clone -q https://github.com/solobxy/parou-dados.git /opt/parou/servidor
fi

# 4. Endereço de teste com https antes de mudar o domínio: <ip-com-tracos>.sslip.io
IP=$(curl -fsS -m 5 http://169.254.169.254/hetzner/v1/metadata/public-ipv4 || curl -fsS -m 5 https://api.ipify.org)
echo "HOST_TESTE=${IP//./-}.sslip.io" > /etc/parou-servidor.env

cat > /etc/parou.env <<'EOF'
NODE_ENV=production
PORT=3000
PAROU_DATA_DIR=/var/lib/parou
EOF

# 5. Serviços: a app, a atualização automática e o atualizador
cp /opt/parou/servidor/servidor/parou.service /etc/systemd/system/parou.service
cp /opt/parou/servidor/servidor/parou-atualizar.service /etc/systemd/system/parou-atualizar.service
cp /opt/parou/servidor/servidor/parou-atualizar.timer /etc/systemd/system/parou-atualizar.timer
install -m 755 /opt/parou/servidor/servidor/parou-atualizar /usr/local/bin/parou-atualizar
systemctl daemon-reload
systemctl enable parou.service

# 6. Firewall: só SSH, http e https (não se liga no ensaio do GitHub Actions)
if [ -z "${PAROU_ENSAIO:-}" ]; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 443/udp
  ufw --force enable
fi

# 7. Primeira instalação da app (pode demorar 3-5 minutos) e ligar a atualização automática
FORCAR=1 /usr/local/bin/parou-atualizar || echo "A primeira instalação falhou; o temporizador volta a tentar."
systemctl enable --now parou-atualizar.timer

echo "PAROU.PT instalado. Teste: https://${IP//./-}.sslip.io"
