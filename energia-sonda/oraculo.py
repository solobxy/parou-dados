"""Pede ao simulador da ERSE as simulações de alguns perfis (todas as ofertas) e guarda as respostas em saida/oraculo_*.json.
Serve para comparar, oferta a oferta, o cálculo do caiu.pt com o oficial."""
import json, os, time, urllib.parse, urllib.request

UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
BASE = 'https://simuladorprecos.erse.pt'
os.makedirs('saida', exist_ok=True)

FILTROS = {'idioma': '1', 'socialOffer': '1', 'filtro_IndexacaoSpot': '1', 'filtro_ServicosAdicionais': '1',
           'filtro_SemRestricoesAdicionais': '1', 'filtro_SemPrecosIndexados': '1', 'filtro_SemReembolsos': '1',
           'filtro_energia100Renovavel': '0', 'filtro_Fidelizacao': '1', 'filtro_FamiliasNumerosas': '0',
           'filtro_NovosClientes': '1', 'pageStartIndex': '0', 'pageStep': '2000', 'filtro_comercializadores': '',
           'filtro_contratacao': '1', 'filtro_faturacao': '1', 'filtro_pagamento': '1', 'filtro_TipoOfertaELE': '1',
           'filtro_TipoOfertaGas': '1', 'filtro_gas100Renovavel': '0', 'filtro_comercializadorUnico': '0'}

PERFIS = [
    ('e1', 'simular_eletricidade', {'caseType': '3', 'electSupply': '2', 'cycle': '1', 'electCalendar': '2', 'electPonta': '1900', 'showElectPrice': 'false'}),
    ('e2', 'simular_eletricidade', {'caseType': '3', 'electSupply': '5', 'cycle': '1', 'electCalendar': '2', 'electPonta': '5000', 'showElectPrice': 'false'}),
    ('e3', 'simular_eletricidade', {'caseType': '3', 'electSupply': '5', 'cycle': '2', 'electCalendar': '2', 'electPonta': '3000', 'electCheias': '2000', 'showElectPrice': 'false'}),
    ('e4', 'simular_eletricidade', {'caseType': '3', 'electSupply': '7', 'cycle': '1', 'electCalendar': '2', 'electPonta': '10900', 'showElectPrice': 'false'}),
    ('e5', 'simular_eletricidade', {'caseType': '3', 'electSupply': '3', 'cycle': '1', 'electCalendar': '2', 'electPonta': '2500', 'showElectPrice': 'false'}),
    ('e6', 'simular_eletricidade', {'caseType': '3', 'electSupply': '2', 'cycle': '1', 'electCalendar': '0', 'electPonta': '150', 'showElectPrice': 'false'}),
    ('g1', 'simular_gas', {'caseType': '3', 'gasCodPostal': '4420', 'codPostal': '4420', 'gasCalendar': '2', 'gasConsumo': '3407', 'showGasPrice': 'false'}),
    ('g2', 'simular_gas', {'caseType': '3', 'gasCodPostal': '1000', 'codPostal': '1000', 'gasCalendar': '2', 'gasConsumo': '1610', 'showGasPrice': 'false'}),
    ('d1', 'simular_dual', {'caseType': '3', 'electSupply': '5', 'cycle': '1', 'electCalendar': '2', 'electPonta': '5000', 'showElectPrice': 'false',
                            'gasCaseType': '3', 'gasCodPostal': '1000', 'codPostal': '1000', 'gasCalendar': '2', 'gasConsumo': '3407', 'showGasPrice': 'false'}),
]

for nome, servico, campos in PERFIS:
    dados = dict(FILTROS)
    dados.update(campos)
    corpo = urllib.parse.urlencode(dados).encode()
    r = urllib.request.Request('%s/connectors/%s/' % (BASE, servico), data=corpo, method='POST', headers={
        'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01', 'Origin': BASE, 'Referer': BASE + '/eletricidade/'})
    try:
        with urllib.request.urlopen(r, timeout=120) as f:
            b = f.read()
            estado = f.status
    except urllib.error.HTTPError as e:
        b, estado = e.read(200000), e.code
    except Exception as e:
        b, estado = str(e).encode(), 0
    open('saida/oraculo_%s.json' % nome, 'wb').write(b)
    print(nome, servico, estado, len(b), b[:300].decode('utf-8', 'replace').replace('\n', ' '), flush=True)
    time.sleep(3)
