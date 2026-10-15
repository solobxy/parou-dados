#!/bin/bash
# Lê o resultado do teste dos desenhos pela estrada (resultado.txt do workflow «Servidor») e sai com 1 se não houver prova de que passou.
# Uso: ler-resultado-estradas.sh <resultado.txt> [limite_de_idade_em_segundos]
f="${1:?falta o ficheiro}"; limite="${2:-0}"
[ -s "$f" ] || { echo "Sem resultado."; exit 1; }
if [ "$limite" -gt 0 ]; then
  carimbo=$(head -1 "$f" | sed -n 's/^== \([0-9T:Z-]*\) .*/\1/p')
  [ -n "$carimbo" ] || { echo "O resultado não tem hora."; exit 1; }
  idade=$(( $(date -u +%s) - $(date -u -d "$carimbo" +%s) ))
  [ "$idade" -le "$limite" ] || { echo "O resultado é velho ($idade s): o teste não correu agora."; exit 1; }
fi
if grep -q '^FALHOU' "$f"; then echo "Falhou:"; grep '^FALHOU' "$f" | head -20; exit 1; fi
grep -q 'As linhas e as viagens desenham-se pela estrada\.' "$f" || { echo "O teste não chegou ao fim (sem a frase final)."; tail -20 "$f"; exit 1; }
[ "$(grep -c '^OK ' "$f")" -ge 30 ] || { echo "Poucos testes OK: $(grep -c '^OK ' "$f")"; exit 1; }
echo "Tudo certo: $(grep -c '^OK ' "$f") testes OK."
