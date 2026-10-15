# Corre-se NO SERVIDOR (pelo workflow «Servidor», acao=comando): testa, com a base e o servidor a sério, que as linhas e as viagens
# se desenham pela estrada ou pelo carril (auditoria/percurso-estrada.mjs). Escreve no fim «As linhas e as viagens desenham-se pela estrada.»
# só se tudo passou.
cd /opt/parou/servidor && git log --oneline -1
cd /opt/parou/atual && APP=/opt/parou/atual BASE=http://127.0.0.1:3000 DB=/var/lib/parou/gtfs.db timeout 600 node --import tsx /opt/parou/servidor/auditoria/percurso-estrada.mjs 2>&1 | grep -v ExperimentalWarning | grep -v trace-warnings | tail -90
