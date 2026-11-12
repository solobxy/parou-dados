"""Guarda as respostas do simulador da ERSE para os casos de calibrar e confirmar de caiu/energia.py (fixtures dos testes)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import energia as E
os.makedirs('saida', exist_ok=True)
for item in E.CALIBRAR + E.CONFIRMAR:
    nome, servico, campos = item[0], item[1], item[2]
    j = E.simular(servico, campos, None, nome)
    json.dump(j, open('saida/oraculo_%s.json' % nome, 'w'), ensure_ascii=False)
    print(nome, 'ok' if j else 'FALHOU', len(j['Resultados']) if j else 0, flush=True)
