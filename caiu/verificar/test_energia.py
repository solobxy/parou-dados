"""Testa caiu/energia.py e o cálculo do site (sites/caiu/energia-calc.js) com dados reais de 12/11/2026
(caiu/verificar/energia: ficheiro da ERSE, respostas do simulador da ERSE, tabelas da Galp e a página do COMBINA):
- ofertas lidas (luz, gás e duais; Galp COMBINA e Casa & Estrada a partir das tabelas oficiais);
- tarifas de acesso tiradas do simulador e contas iguais às da ERSE, oferta a oferta (79 casos);
- vantagens confirmadas na fonte; a do Poupa Mais na bp fica só escrita (não há fonte oficial a confirmar);
- condições: quem não é cliente Vodafone não vê as tarifas Vodafone; ofertas «amigo» precisam de código;
- COMBINA: o saldo sobe com os serviços e desconta o vale que se perde;
- página /luz-e-gas/ com resposta no topo, três comercializadores diferentes e as tabelas dos casos tipo.
Uso: python3 caiu/verificar/test_energia.py   (precisa do node)
"""
import json, os, re, shutil, subprocess, sys, tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
CAIU = os.path.dirname(AQUI)
F = os.path.join(AQUI, 'energia')
falhas = 0


def ok(nome, cond, extra=''):
    global falhas
    if not cond:
        falhas += 1
    print(('OK     ' if cond else 'FALHOU ') + nome + (f'  {extra}' if extra else ''))


pasta = tempfile.mkdtemp(prefix='caiu-energia-')
estado = tempfile.mkdtemp(prefix='caiu-energia-estado-')
r = subprocess.run([sys.executable, os.path.join(CAIU, 'energia.py'), pasta, '--estado', estado, '--fixtures', F],
                   capture_output=True, text=True, env=dict(os.environ, CAIU_PAUSA='0'))
ok('energia.py corre', r.returncode == 0, r.stderr[-800:])
D = json.load(open(os.path.join(pasta, 'energia.json')))
E = json.load(open(os.path.join(pasta, 'energia-estado.json')))
of = {o['id']: o for o in D['of']}

# ---- ofertas
tipos = {t: sum(1 for o in D['of'] if o['t'] == t) for t in 'EGD'}
ok('ofertas de luz, gás e duais', tipos['E'] > 150 and tipos['G'] > 60 and tipos['D'] > 150, str(tipos))
ok('sem ofertas só para empresas', not any('empresa' in o.get('req', []) for o in D['of']))
ok('EDP com a oferta de 100 € para novos clientes', of.get('EDPC_14', {}).get('nc') == 100 and of['EDPC_14'].get('novos') == 1)
ok('EDP + Pingo Doce: 10 % da fatura até 10 € por mês', of.get('EDPC_09', {}).get('credito') == [0.1, 10.0])
ok('Repsol: saldo em combustível lido da ERSE', any(o.get('cpl') for o in D['of'] if o['com'] == 'REPSOL'))
ok('tarifas Vodafone pedem cliente Vodafone', all('vodafone' in o.get('req', []) for o in D['of'] if 'Vodafone' in o['n']))
ok('ofertas «amigo» pedem código de amigo', all('amigo' in o.get('req', []) for o in D['of'] if re.search(r'\bamigo\b', o['n'], re.I)))
ok('MEO M4e/M5e pede o pacote MEO', 'meo' in of.get('MEOENERGIA_02', {}).get('req', []))
ok('gás regulado por operador da rede', len(of.get('CUR', {}).get('go', {})) >= 10)
ok('códigos postais para o gás', D['cp'].get('1000') == 'LIS' and len(D['cp']) > 500)
g = of.get('GALP_COMBINA_E', {})
ok('Galp COMBINA da tabela oficial (6,9 kVA)', g.get('e', {}).get('6,9', {}).get('1') == [0.5969, 0.164], str(g.get('e', {}).get('6,9')))
ce = of.get('GALP_CE_D_DD', {})
ok('Galp Casa & Estrada: 8 % com 2 energias e débito direto', ce.get('g', {}).get('2', [0])[0] == round(0.1629 * 0.92, 4), str(ce.get('g', {}).get('2')))

# ---- contas iguais às da ERSE
c = E['confirmado']
ok('contas confirmadas com o simulador da ERSE', c['ok'] and c['casos'] >= 70, f"{c['casos']} casos, máx. {c['max_dif']} €")
ok('a maioria ao cêntimo', sum(1 for x in c['detalhe'] if abs(x['dif']) <= 0.05) >= 0.6 * len(c['detalhe']))
P = D['param']
ok('tarifa de acesso da luz (simulador)', abs(P['tar_tv'] - 0.0607) < 0.002 and abs(P['tar_tf_kva'] - 0.0498) < 0.002, str(P))
ok('tarifa de acesso do gás por escalão', len(P['gas_tar_tf']) == 4 and P['gas_tar_tf'][0] < P['gas_tar_tf'][3])
ok('sem avisos', not E['avisos'], str(E['avisos']))

# ---- vantagens
st = {v['id']: v['estado'] for v in D['vant']}
ok('COMBINA confirmado na tabela da Galp', st.get('combina') == 'ok')
ok('My Repsol e EDP + Pingo Doce confirmados na ERSE', st.get('my_repsol') == 'ok' and st.get('edp_pingodoce') == 'ok', str(st))
ok('Poupa Mais na bp fica fora das contas', st.get('edp_poupamais_bp') == 'parado')
comb = next(v for v in D['vant'] if v['id'] == 'combina')
ok('níveis COMBINA lidos da tabela (20/25/30 cênt., 2/5/10 %)', [n['cpl'] for n in comb['niveis']] == [0.2, 0.25, 0.3] and
   [n['continente'] for n in comb['niveis']] == [0.02, 0.05, 0.1])

# ---- cálculo (o mesmo do site)
teste = r'''
const C = require(process.argv[1]); const D = JSON.parse(require('fs').readFileSync(process.argv[2]));
const base = {tipo: 'D', ele: {kva: '6,9', kvaN: 6.9, ciclo: 1, kwh: [5000]}, gas: {kwh: 3407, ord: 'REN'}};
const r = {};
const semNada = C.comparar(D, Object.assign({}, base, {tipo: 'E'}));
r.vodafone_sem = semNada.some(l => /Vodafone/.test(l.of.n));
r.vodafone_com = C.comparar(D, Object.assign({}, base, {tipo: 'E', tem: {vodafone: true}})).some(l => /Vodafone/.test(l.of.n));
const p = Object.assign({}, base, {tem: {cartao_continente: true, nos_tv: true}, habitos: {continente: 300, litros: {galp: 80}}});
const lc = C.comparar(D, p).find(l => l.of.id === 'GALP_COMBINA_D');
r.combina3 = lc && lc.vantagens.find(v => v.id === 'combina').valor;      // 3 serviços: 10 % de 300 + 30 cênt. x 80 - vale 10 cênt. x 80
const p1 = Object.assign({}, p, {tipo: 'E', tem: {cartao_continente: true}});
const l1 = C.comparar(D, p1).find(l => l.of.id === 'GALP_COMBINA_E');
r.combina1 = l1 && l1.vantagens.find(v => v.id === 'combina').valor;      // 1 serviço: 2 % de 300 + 20 cênt. x 80 - 8
const pd = C.comparar(D, Object.assign({}, base, {tipo: 'E', tem: {pingodoce: true}, habitos: {pingodoce: 200}})).find(l => l.of.id === 'EDPC_09');
r.pingodoce = pd && pd.vantagens.find(v => v.id === 'edp_pingodoce').valor;
r.pingodoce_fatura = pd && pd.fatura.total;
const sem = C.comparar(D, Object.assign({}, base, {tipo: 'E', pref: {dd: false}}));
r.sem_dd = sem.every(l => !l.of.dd);
const d = C.comparar(D, base);
r.duais = d.length; r.par = d.some(l => l.partes);
r.ordenado = d.every((l, i) => i === 0 || d[i - 1].ano1 <= l.ano1);
console.log(JSON.stringify(r));
'''
calc = os.path.join(os.path.dirname(CAIU), 'sites', 'caiu', 'energia-calc.js')
n = subprocess.run(['node', '-e', teste, calc, os.path.join(pasta, 'energia.json')], capture_output=True, text=True)
R = json.loads(n.stdout or '{}')
ok('cálculo corre no node', n.returncode == 0, n.stderr[-500:])
ok('sem Vodafone não aparecem tarifas Vodafone', R.get('vodafone_sem') is False and R.get('vodafone_com') is True)
ok('COMBINA com 3 serviços = 552 € por ano', abs((R.get('combina3') or 0) - 552) < 0.01, str(R.get('combina3')))
ok('COMBINA com 1 serviço = 168 € por ano', abs((R.get('combina1') or 0) - 168) < 0.01, str(R.get('combina1')))
ok('EDP + Pingo Doce: 10 % da fatura, no máximo 120 € por ano',
   R.get('pingodoce') and abs(R['pingodoce'] - min(120, 0.1 * R['pingodoce_fatura'])) < 0.02, str(R.get('pingodoce')))
ok('sem débito direto: ofertas que o exigem ficam de fora', R.get('sem_dd') is True)
ok('luz e gás: duais e pares de contratos, por ordem', R.get('duais', 0) > 50 and R.get('par') and R.get('ordenado'))

# ---- página
h = open(os.path.join(pasta, 'energia-paginas', 'luz-e-gas', 'index.html'), encoding='utf-8').read()
ok('página com h1 e canonical', '<h1' in h and 'rel="canonical" href="https://caiu.pt/luz-e-gas/"' in h)
m3 = re.search(r'<ol class="lojas3 lg-top3">(.*?)</ol>', h, re.S)
top = re.findall(r'<span class="pl__loja">([^<]+)</span>', m3.group(1)) if m3 else []
ok('topo com três comercializadores diferentes', len(top) == 3 and len(set(top)) == 3, str(top))
ok('seis tabelas dos casos tipo', h.count('<details class="lgt"') == 6)
ok('resposta direta com números de hoje', re.search(r'Hoje, \d+ de \w+ de 2026, a eletricidade mais barata', h) is not None)
ok('liga o cálculo e os estilos', '/energia-calc.js' in h and '/energia.js' in h and '/energia.css' in h)
ok('sem restos (undefined, None, nan)', not re.search(r'undefined|>None<|\bnan\b', h))
ok('crédito no rodapé', 'Feito por <a href="https://dinissousa.pt"' in h)
ok('título e descrição com tamanho para o Google',
   len(re.search(r'<title>(.*?)</title>', h).group(1)) <= 70 and len(re.search(r'name="description" content="(.*?)"', h).group(1)) <= 170)

# ---- resumo para a página inicial (pequeno, com os mesmos três do topo)
rs = json.load(open(os.path.join(pasta, 'energia-resumo.json'), encoding='utf-8'))
ok('resumo para a página inicial com os três do topo', [x['com'] for x in rs['luz']['top']] == top
   and all(20 < x['mes'] < 300 for x in rs['luz']['top']) and len(rs['gas']['top']) == 3, str(rs['luz']['top']))
ok('resumo pequeno (menos de 2 KB)', os.path.getsize(os.path.join(pasta, 'energia-resumo.json')) < 2048,
   os.path.getsize(os.path.join(pasta, 'energia-resumo.json')))

shutil.rmtree(pasta, ignore_errors=True)
shutil.rmtree(estado, ignore_errors=True)
print('\nTudo OK' if not falhas else f'\n{falhas} falha(s)')
sys.exit(1 if falhas else 0)
