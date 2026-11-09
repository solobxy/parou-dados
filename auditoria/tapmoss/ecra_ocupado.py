# Uso: python3 auditoria/tapmoss/preparar_copia.py sites/tapmoss /tmp/tm && (cd /tmp/tm && python3 -m http.server 8801 &)
#      python3 auditoria/tapmoss/ecra_ocupado.py http://127.0.0.1:8801/pt/ /tmp/capturas
# As janelas que abrem sozinhas (cartões de nível, pedir o nome, escolher a linhagem) nunca aparecem por cima
# da casa, da mina ou do ecrã das linhagens; esperam e aparecem quando a pessoa sai (não se perdem).
# Uso: python3 ecra_ocupado.py http://127.0.0.1:8801/pt/ pasta_capturas
import sys, json, os
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else 'cap'
os.makedirs(OUT, exist_ok=True)
falhas = total = 0
def ok(nome, cond, extra=''):
    global falhas, total
    total += 1
    if not cond: falhas += 1
    print(('OK     ' if cond else 'FALHOU ') + nome, extra)

def run(W, H, rm, pw):
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': W, 'height': H}, locale='pt-PT', is_mobile=True, has_touch=True, device_scale_factor=2)
    ctx.add_init_script("window.__TM_DEBUG={skipTitle:true,noApi:true,fresh:true};")
    ctx.route('**/api/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{}'))
    ctx.route('**/pagead2.googlesyndication.com/**', lambda r: r.abort())
    p = ctx.new_page()
    erros = []
    p.on('pageerror', lambda e: erros.append(str(e)[:200]))
    p.goto(URL, wait_until='load')
    p.wait_for_timeout(3500)
    ev = lambda s: p.evaluate('s=>window.__ev(s)', s)
    espera = lambda ms: p.wait_for_timeout(ms)
    tag = f'{W}x{H}{"_rm" if rm else ""}'
    # jogo a meio: nível 40, casa e mina abertas, linhagem para depois, sem cartões em fila
    ev("(()=>{S.started=true;S.level=40;S.linLater=now();S.autoName=0;msQ.length=0;closeModal();if(!S.casa)S.casa=hsNew('cabana');S.uf=S.uf||{};for(const k in UF)S.uf[k]=1;"
       + ("S.rm=true;setRM();" if rm else "") + "return 1})()")
    espera(800)
    ev("(()=>{msQ.length=0;closeModal();for(const k in UF)S.uf[k]=1;return 1})()")
    espera(300)

    # 0. controlo: no jardim, sem nada aberto, um cartão aparece (a guarda não pode bloquear tudo)
    ev("(()=>{msLast=-1e9;msRun=0;msQueue({ic:'em',title:'TESTE-JARDIM',text:'cartão de teste'});return 1})()")
    espera(1500)
    ok(f'{tag} no jardim, o cartão aparece', ev("modalOn&&$('#mcard').textContent.includes('TESTE-JARDIM')"))
    ev("(()=>{closeModal();msQ.length=0;return 1})()"); espera(300)

    # 1. casa + cartão de nível
    ev("(()=>{hsOpen();return HSR})()"); espera(600)
    ok(f'{tag} a casa abriu', ev('HSR'))
    ev("(()=>{msLast=-1e9;msRun=0;msQueue({ic:'em',title:'TESTE-CASA',text:'cartão de teste'});return 1})()")
    espera(2000)
    p.screenshot(path=f'{OUT}/{tag}_1_casa.png')
    ok(f'{tag} na casa, o cartão NÃO abre por cima', not ev('modalOn'), f"modalOn={ev('modalOn')}")
    ev("(()=>{closeModal();hsBack();return HSR})()"); espera(1800)
    ok(f'{tag} ao sair da casa, o cartão aparece (não se perde)', ev("modalOn&&$('#mcard').textContent.includes('TESTE-CASA')"))
    ev("(()=>{closeModal();msQ.length=0;return 1})()"); espera(300)

    # 2. ecrã das linhagens + pedir o nome
    ev("(()=>{S.lin=null;lnOpen('pick');S.autoName=1;return LNU.on})()"); espera(2000)
    p.screenshot(path=f'{OUT}/{tag}_2_linhagem.png')
    ok(f'{tag} no ecrã das linhagens, o pedido do nome NÃO abre', not ev('modalOn') and ev('S.autoName===1'), f"modalOn={ev('modalOn')} autoName={ev('S.autoName')}")
    ev("(()=>{closeModal();S.linLater=now();lnClose();return LNU.on})()"); espera(1500)
    ok(f'{tag} ao sair das linhagens, o pedido do nome aparece', ev('modalOn') and ev('S.autoName===2'))
    ev("(()=>{closeModal();S.autoName=0;return 1})()"); espera(300)

    # 3. mina + pedir o nome
    ev("(()=>{if(S.mina&&!S.mina.on)mnUnlock(true);msQ.length=0;closeModal();return 1})()"); espera(300)
    ev("(()=>{closeModal();mnOpen();return MNR})()"); espera(1200)
    ev("(()=>{closeModal();S.autoName=1;return 1})()"); espera(2000)  # fecha o «Bem-vindo à mina» da 1.ª vez
    ok(f'{tag} a mina abriu', ev('MNR'))
    p.screenshot(path=f'{OUT}/{tag}_3_mina.png')
    ok(f'{tag} na mina, o pedido do nome NÃO abre', not ev('modalOn') and ev('S.autoName===1'), f"modalOn={ev('modalOn')} autoName={ev('S.autoName')}")
    ev("(()=>{closeModal();mnClose();return MNR})()"); espera(1500)
    ok(f'{tag} ao sair da mina, o pedido do nome aparece', ev('modalOn') and ev('S.autoName===2'))
    ev("(()=>{closeModal();S.autoName=0;msQ.length=0;return 1})()"); espera(300)

    # 4. casa + escolha da linhagem
    ev("(()=>{S.lin=null;S.linLater=0;hsOpen();return HSR})()"); espera(500)
    ev("(()=>{linMaybe();return LNU.on})()"); espera(800)
    ok(f'{tag} na casa, a escolha da linhagem NÃO abre', not ev('LNU.on'))
    ev("(()=>{hsBack();return HSR})()"); espera(500)
    ev("(()=>{closeModal();msQ.length=0;linMaybe();return LNU.on})()"); espera(800)
    ok(f'{tag} ao sair da casa, a escolha da linhagem abre', ev('LNU.on'))
    ev("(()=>{S.linLater=now();lnClose();return 1})()"); espera(300)

    ok(f'{tag} sem erros de JavaScript', not erros, ' | '.join(erros[:3]))
    b.close()

with sync_playwright() as pw:
    run(390, 844, False, pw)
    run(360, 740, True, pw)
print(f'{total-falhas}/{total} testes OK')
sys.exit(1 if falhas else 0)
