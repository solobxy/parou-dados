#!/bin/bash
# Cópia dos dados dos outros projetos (para o workflow «Cópias de segurança», que a cifra e guarda 90 dias).
# Escreve um .tar.gz no stdout. As bases SQLite são copiadas com a API de cópia do SQLite (cópia
# consistente mesmo com a base a ser usada); o resto é copiado tal como está.
#   DupliCasa: contas, alertas e pedidos       /var/lib/duaschaves-api
#   caiu.pt:   quem segue preços, chaves push  /var/lib/caiu-api   + histórico de preços (não se recupera de outra forma)
#   ganhas.pt: partilhas de salários           /var/lib/ganhas-api
#   Adri:      marcações da agenda             /var/lib/adri-agenda
#   Jinxed:    o site                          /var/www/jinxed (também está no repositório, em sites/jinxed)
set -euo pipefail
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
copiar_db() { # origem destino
  [ -f "$1" ] || return 0
  mkdir -p "$(dirname "$2")"
  python3 - "$1" "$2" <<'PY'
import sqlite3, sys
a = sqlite3.connect(f'file:{sys.argv[1]}?mode=ro', uri=True)
b = sqlite3.connect(sys.argv[2])
a.backup(b); b.close(); a.close()
PY
}
for pasta in /var/lib/duaschaves-api /var/lib/caiu-api /var/lib/ganhas-api /var/lib/adri-agenda; do
  [ -d "$pasta" ] || continue
  dest="$T/$(basename "$pasta")"; mkdir -p "$dest"
  for f in "$pasta"/*; do
    [ -f "$f" ] || continue
    case "$f" in
      *.db) copiar_db "$f" "$dest/$(basename "$f")" ;;
      *-wal|*-shm) ;;
      *) cp -p "$f" "$dest/" ;;
    esac
  done
done
H=$(find /var/lib/caiu-dados -maxdepth 2 -name 'historico.db' 2>/dev/null | head -1)
[ -n "$H" ] && copiar_db "$H" "$T/caiu-dados/historico.db"
[ -d /var/www/jinxed ] && mkdir -p "$T/www" && cp -rp /var/www/jinxed "$T/www/jinxed"
{
  echo "quando=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  ( cd "$T" && find . -type f -printf '%p %s\n' | sort )
} > "$T/INFO.txt"
tar czf - -C "$T" .
