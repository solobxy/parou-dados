#!/usr/bin/env python3
"""Teste da webase ao vivo, num browser a sério (corre no GitHub Actions, pelo workflow webase-verificar).

Cria uma conta de teste, usa a app no telemóvel e no computador (ficha, pontos, lead, chamada) e apaga a conta no fim.
Também visita o site com ?utm_source=teste-estatisticas para confirmar a recolha de estatísticas.
Uso: python3 ao_vivo.py https://webase.2-31-13-85.sslip.io
"""
import json
import os
import secrets
import sys
import time

from playwright.sync_api import sync_playwright

URL = sys.argv[1].rstrip('/')
OUT = 'capturas'
os.makedirs(OUT, exist_ok=True)
EMAIL = 'teste-%s@webase.invalid' % secrets.token_hex(4)
SENHA = 'teste-ao-vivo-%s' % secrets.token_hex(6)
erros = []
passos = []


def passo(nome, ok=True, extra=''):
    passos.append(('ok ' if ok else 'FALHOU ') + nome + (' — ' + extra if extra else ''))


with sync_playwright() as p:
    b = p.chromium.launch(args=['--disable-blink-features=AutomationControlled'])
    # 1) site público em telemóvel e computador
    for nome, (w, h) in {'pc': (1440, 900), 'tel': (390, 844)}.items():
        ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=(w < 500), has_touch=(w < 500),
                            user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' if w < 500 else None)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: erros.append('site: ' + str(e)))
        pg.on('console', lambda m: erros.append('site consola: ' + m.text) if m.type == 'error' else None)
        pg.goto(URL + '/?utm_source=teste-estatisticas', wait_until='networkidle')
        for y in range(0, 12000, 600):
            pg.evaluate('window.scrollTo(0, %d)' % y)
            pg.wait_for_timeout(80)
        pg.wait_for_timeout(1500)
        larg = pg.evaluate('document.documentElement.scrollWidth')
        passo('site %s sem scroll horizontal' % nome, larg <= w, str(larg))
        pg.evaluate('window.scrollTo(0, 0)')
        pg.screenshot(path='%s/site-%s.png' % (OUT, nome))
        ctx.close()

    # 2) app: criar conta, configurar, usar, apagar
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: erros.append('app: ' + str(e)))
    pg.on('console', lambda m: erros.append('app consola: ' + m.text) if m.type == 'error' and '401' not in m.text else None)
    try:
        pg.goto(URL + '/app/registar')
        pg.fill('input[name=nome]', 'Teste Automático')
        pg.fill('input[name=negocio]', 'Teste ao vivo')
        pg.select_option('select[name=setor]', 'barbearia')
        pg.fill('input[name=email]', EMAIL)
        pg.fill('input[name=senha]', SENHA)
        pg.check('input[name=aceito]')
        pg.click('button[type=submit]')
        pg.wait_for_selector('text=Que tipo de negócio tens?', timeout=20000)
        passo('criar conta')
        pg.click('text=Continuar')
        pg.click('label.modulo:has-text("Leads") input')
        pg.click('label.modulo:has-text("Chamadas") input')
        pg.click('text=Começar a usar')
        pg.wait_for_selector('.casca main h1', timeout=20000)
        passo('configurar módulos')
        pg.click('main button:has-text("Novo cliente")')
        pg.fill('dialog input[name=nome]', 'Cliente de Teste')
        pg.fill('dialog input[name=telefone]', '912000000')
        pg.click('dialog button[type=submit]')
        pg.wait_for_selector('h1:has-text("Cliente de Teste")', timeout=20000)
        passo('criar ficha')
        pg.screenshot(path=OUT + '/app-ficha-tel.png', full_page=True)
        pg.click('button:has-text("Dar pontos")')
        pg.fill('dialog input[name=valor]', '12,50')
        pg.click('dialog button[type=submit]')
        pg.wait_for_selector('text=saldo', timeout=15000)
        passo('dar pontos')
        pg.goto(URL + '/app/leads')
        pg.wait_for_selector('.casca main h1')
        pg.click('main button:has-text("Criar lead")')
        pg.fill('dialog input[name=titulo]', 'Lead de teste')
        pg.fill('dialog input[name=valor]', '100')
        pg.click('dialog button[type=submit]')
        pg.wait_for_selector('.cartao:has-text("Lead de teste")', timeout=15000)
        passo('criar lead')
        pg.goto(URL + '/app/chamadas?nova=1')
        pg.wait_for_selector('dialog[open]')
        pg.fill('dialog input[name=numero]', '912000000')
        pg.click('dialog button[type=submit]')
        pg.wait_for_timeout(1500)
        passo('registar chamada', pg.locator('text=Cliente de Teste').count() > 0)
        pg.screenshot(path=OUT + '/app-chamadas-tel.png')
        for url in ['/app', '/app/clientes', '/app/pontos', '/app/subscricoes', '/app/forum', '/app/marketplace', '/app/equipa', '/app/definicoes/marca']:
            pg.goto(URL + url)
            pg.wait_for_selector('.casca main h1', timeout=15000)
            pg.wait_for_timeout(400)
            larg = pg.evaluate('document.documentElement.scrollWidth')
            passo('abrir ' + url, larg <= 390, '' if larg <= 390 else 'largura %d' % larg)
        # segurança: a sessão é um cookie __Host- HttpOnly
        ck = [c for c in ctx.cookies() if c['name'].startswith('__Host-wb')]
        passo('cookie __Host- seguro', bool(ck) and ck[0]['httpOnly'] and ck[0]['secure'] and ck[0]['sameSite'] == 'Lax', json.dumps(ck[0] if ck else {})[:160])
        # sem X-Wb o servidor recusa mudanças (CSRF)
        antes = len(erros)
        r = pg.evaluate("fetch('/api/clientes', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{\"nome\":\"x\"}'}).then(r => r.status)")
        pg.wait_for_timeout(300)
        erros[antes:] = [x for x in erros[antes:] if '403' not in x]  # o 403 deste teste é o esperado
        passo('pedido sem X-Wb recusado', r == 403, str(r))
    except Exception as e:
        passo('fluxo da app', False, str(e)[:300])
        pg.screenshot(path=OUT + '/erro.png')
    finally:
        # apagar a conta de teste (sempre)
        r = pg.evaluate("""(d) => fetch('/api/conta/apagar', {method:'POST', headers:{'Content-Type':'application/json','X-Wb':'1'},
                           body: JSON.stringify({senha: d.s, confirmacao: 'Teste ao vivo'})}).then(r => r.status)""", {'s': SENHA})
        passo('apagar a conta de teste', r == 200, str(r))
    ctx.close()
    b.close()

print('\n'.join(passos))
print('erros de JavaScript/consola:', json.dumps(erros, ensure_ascii=False)[:2000])
sys.exit(0 if all(x.startswith('ok') for x in passos) and not erros else 1)
