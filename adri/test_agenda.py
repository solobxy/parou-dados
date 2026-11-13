#!/usr/bin/env python3
"""Testes da agenda e do painel do AdriBodyPiercing (adri/agenda.py), com uma base temporária.

Uso: python3 adri/test_agenda.py
Arranca o servidor numa porta livre e testa: marcações, preços, horário e local dinâmicos, /api/site,
fotos (envio, recusa de ficheiros falsos, troca e reposição), avaliações com link de uso único e números.
"""
import datetime as dt, json, os, socket, subprocess, sys, tempfile, time, urllib.error, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
falhas = 0


def ok(nome, cond, extra=''):
    global falhas
    if not cond:
        falhas += 1
    print(('OK      ' if cond else 'FALHOU  ') + nome + (('  ' + str(extra)[:300]) if extra and not cond else ''))


def porta_livre():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


tmp = tempfile.mkdtemp()
PORTA = porta_livre()
BASE = 'http://127.0.0.1:%d' % PORTA
ORIGEM = 'https://adribodypiercing.pt'
sys.path.insert(0, AQUI)
import agenda  # noqa: E402  (só para gerar o hash da password de teste)

env = dict(os.environ, AG_DB=os.path.join(tmp, 'agenda.db'), AG_PORTA=str(PORTA), ORIGENS=ORIGEM,
           ADRI_SENHA_HASH=agenda.hash_senha('senha-de-teste'), TZ='Europe/Lisbon')
srv = subprocess.Popen([sys.executable, os.path.join(AQUI, 'agenda.py')], env=env)
cookie = {'v': ''}


def pedir(metodo, url, corpo=None, raw=None, tipo=None, origem=ORIGEM, com_cookie=True):
    cab = {}
    dados = None
    if corpo is not None:
        dados = json.dumps(corpo).encode()
        cab['Content-Type'] = 'application/json'
    if raw is not None:
        dados = raw
        cab['Content-Type'] = tipo or 'application/octet-stream'
    if origem and metodo == 'POST':
        cab['Origin'] = origem
    if com_cookie and cookie['v']:
        cab['Cookie'] = cookie['v']
    req = urllib.request.Request(BASE + url, data=dados, method=metodo, headers=cab)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            sc = r.headers.get('Set-Cookie')
            if sc and sc.startswith('__Host-adri_admin=') and 'Max-Age=0' not in sc:
                cookie['v'] = sc.split(';')[0]
            corpo_r = r.read()
            return r.status, (json.loads(corpo_r) if r.headers.get('Content-Type', '').startswith('application/json') else corpo_r), r.headers
    except urllib.error.HTTPError as e:
        b = e.read()
        try:
            return e.code, json.loads(b), e.headers
        except ValueError:
            return e.code, b, e.headers


try:
    for _ in range(50):
        try:
            if pedir('GET', '/api/saude')[0] == 200:
                break
        except Exception:
            time.sleep(0.1)
    ok('[arranque] servidor responde', pedir('GET', '/api/saude')[0] == 200)

    # ---------- /api/site com os valores de origem ----------
    st, site, cab = pedir('GET', '/api/site')
    ok('[site] 200 e sem cache guardada', st == 200 and cab.get('Cache-Control') == 'no-cache', (st, cab.get('Cache-Control')))
    ok('[site] preços de origem (narina 30, umbigo 50, hélix 35)', site['precos']['narina'] == 30 and site['precos']['umbigo'] == 50 and site['precos']['helix'] == 35)
    ok('[site] horário de origem: «Sábados, 10h00–17h30» e «aos sábados»', site['horario']['texto'] == 'Sábados, 10h00–17h30' and site['horario']['dias_txt'] == 'aos sábados', site['horario'])
    ok('[site] local de origem com ligação para o mapa', site['local']['nome'] == 'Kaos Tattoo' and site['local']['mapa'].startswith('https://www.google.com/maps/search/?api=1&query=Kaos%20Tattoo'), site['local'])
    ok('[site] sem avaliações nem fotos trocadas', site['avaliacoes'] == {'n': 0, 'media': None, 'lista': []} and site['fotos'] == {})

    # ---------- disponibilidade segue o horário ----------
    hoje = dt.date.today()
    st, disp, _ = pedir('GET', '/api/disponibilidade?dias=31')
    dias_sem = {dt.date.fromisoformat(d).weekday() for d in disp['dias']}
    ok('[horário] por omissão só há sábados', dias_sem == {5}, dias_sem)
    um_sab = sorted(disp['dias'])[-1]
    ok('[horário] sábado com 10h…16h', list(disp['dias'][um_sab].keys()) == ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'], disp['dias'][um_sab])

    # ---------- entrar ----------
    ok('[painel] sem sessão não entra', pedir('GET', '/api/admin/config')[0] == 401)
    ok('[painel] password errada recusada', pedir('POST', '/api/admin/entrar', {'senha': 'errada'})[0] == 401)
    ok('[painel] password certa', pedir('POST', '/api/admin/entrar', {'senha': 'senha-de-teste'})[0] == 200 and cookie['v'])
    st, cfg, _ = pedir('GET', '/api/admin/config')
    ok('[painel] configuração com serviços, preços de origem e lugares das fotos', st == 200 and cfg['servicos']['narina'] == 'Narina' and cfg['padrao']['narina'] == 30 and 'cara' in cfg['slots'], st)

    # ---------- preços ----------
    ok('[preços] recusa preço negativo', pedir('POST', '/api/admin/config/precos', {'precos': {'narina': -1}})[0] == 422)
    ok('[preços] recusa texto', pedir('POST', '/api/admin/config/precos', {'precos': {'narina': '30'}})[0] == 422)
    ok('[preços] recusa serviço que não existe', pedir('POST', '/api/admin/config/precos', {'precos': {'nariz': 30}})[0] == 422)
    ok('[preços] recusa sem origem do site', pedir('POST', '/api/admin/config/precos', {'precos': {'narina': 32}}, origem='https://mau.example')[0] == 403)
    st, s2, _ = pedir('POST', '/api/admin/config/precos', {'precos': {'narina': 32, 'helix': 40}})
    ok('[preços] guarda narina 32 e hélix 40', st == 200 and s2['precos']['narina'] == 32 and s2['precos']['helix'] == 40 and s2['precos']['umbigo'] == 50, s2.get('precos') if isinstance(s2, dict) else s2)
    ok('[preços] o site vê logo o preço novo', pedir('GET', '/api/site')[1]['precos']['narina'] == 32)

    # ---------- marcação usa o preço novo ----------
    sab = next(hoje + dt.timedelta(days=i) for i in range(2, 16) if (hoje + dt.timedelta(days=i)).weekday() == 5)
    st, m, _ = pedir('POST', '/api/marcacoes', {'servicos': ['narina', 'helix'], 'data': sab.isoformat(), 'hora': '10:00', 'nome': 'Rita Sousa',
                                                'tel': '912345678', 'idade': True, 'ms': 5000, 'notas': ''}, com_cookie=False)
    ok('[marcação] pedido pelo site aceite', st == 201, m)
    ok('[marcação] total com os preços novos (32 + 40)', st == 201 and m['total'] == 72, m)

    # ---------- horário e local ----------
    ok('[horário] recusa fecho antes da abertura', pedir('POST', '/api/admin/config/horario', {'dias': {'5': {'abre': '17:00', 'fecha': '10:00'}}, 'duracao': 60})[0] == 422)
    ok('[horário] recusa duração estranha', pedir('POST', '/api/admin/config/horario', {'dias': {'5': {'abre': '10:00', 'fecha': '17:30'}}, 'duracao': 50})[0] == 422)
    ok('[horário] recusa dia 7', pedir('POST', '/api/admin/config/horario', {'dias': {'7': {'abre': '10:00', 'fecha': '17:30'}}, 'duracao': 60})[0] == 422)
    st, s3, _ = pedir('POST', '/api/admin/config/horario', {'dias': {'4': {'abre': '14:00', 'fecha': '19:00'}, '5': {'abre': '10:00', 'fecha': '17:30'}}, 'duracao': 60})
    ok('[horário] sextas e sábados guardados', st == 200 and s3['horario']['texto'] == 'Sextas, 14h00–19h00; sábados, 10h00–17h30' and s3['horario']['dias_txt'] == 'às sextas e aos sábados', s3.get('horario') if isinstance(s3, dict) else s3)
    st, disp, _ = pedir('GET', '/api/disponibilidade?dias=31')
    sex = [d for d in disp['dias'] if dt.date.fromisoformat(d).weekday() == 4]
    ok('[horário] a sexta aparece na disponibilidade com 14h…18h', sex and list(disp['dias'][sex[-1]].keys()) == ['14:00', '15:00', '16:00', '17:00', '18:00'], disp['dias'].get(sex[-1]) if sex else 'sem sextas')
    st, s4, _ = pedir('POST', '/api/admin/config/horario', {'dias': {'4': {'abre': '14:00', 'fecha': '19:00'}, '5': {'abre': '14:00', 'fecha': '19:00'}}, 'duracao': 30})
    ok('[horário] dias seguidos com as mesmas horas juntam-se', st == 200 and s4['horario']['texto'] == 'Sextas e sábados, 14h00–19h00', s4.get('horario') if isinstance(s4, dict) else s4)
    st, disp, _ = pedir('GET', '/api/disponibilidade?dias=31')
    ok('[horário] marcações de 30 em 30 minutos', list(disp['dias'][sex[-1]].keys())[:3] == ['14:00', '14:30', '15:00'] and list(disp['dias'][sex[-1]].keys())[-1] == '18:30')
    pedir('POST', '/api/admin/config/horario', {'dias': {'5': {'abre': '10:00', 'fecha': '17:30'}}, 'duracao': 60})
    ok('[local] recusa código postal errado', pedir('POST', '/api/admin/config/local', {'nome': 'Estúdio X', 'rua': 'Rua A, 1', 'cp': '4000', 'cidade': 'Porto'})[0] == 422)
    st, s5, _ = pedir('POST', '/api/admin/config/local', {'nome': 'Estúdio Novo', 'rua': 'Rua de Cedofeita, 100', 'cp': '4050-180', 'cidade': 'Porto'})
    ok('[local] guarda morada nova e o mapa segue-a', st == 200 and s5['local']['nome'] == 'Estúdio Novo' and 'Cedofeita' in s5['local']['mapa'] and '<' not in s5['local']['mapa'], s5.get('local') if isinstance(s5, dict) else s5)
    ok('[google] recusa link sem https', pedir('POST', '/api/admin/config/google', {'url': 'javascript:alert(1)'})[0] == 422)
    ok('[google] guarda link de avaliação', pedir('POST', '/api/admin/config/google', {'url': 'https://g.page/r/abc/review'})[1]['google'] == 'https://g.page/r/abc/review')

    # ---------- fotos ----------
    webp = b'RIFF' + (20).to_bytes(4, 'little') + b'WEBPVP8 ' + b'\x00' * 12
    jpg = b'\xff\xd8\xff\xe0' + b'\x00' * 40
    ok('[fotos] sem sessão recusa', pedir('POST', '/api/admin/fotos/nariz', raw=webp, tipo='image/webp', com_cookie=False)[0] == 401)
    ok('[fotos] recusa ficheiro que diz ser webp e não é', pedir('POST', '/api/admin/fotos/nariz', raw=b'<svg onload=alert(1)>', tipo='image/webp')[0] == 415)
    ok('[fotos] recusa svg', pedir('POST', '/api/admin/fotos/nariz', raw=b'<svg/>', tipo='image/svg+xml')[0] == 415)
    ok('[fotos] recusa lugar que não existe', pedir('POST', '/api/admin/fotos/hack', raw=webp, tipo='image/webp')[0] == 404)
    ok('[fotos] recusa sem origem do site', pedir('POST', '/api/admin/fotos/nariz', raw=webp, tipo='image/webp', origem='https://mau.example')[0] == 403)
    st, f1, _ = pedir('POST', '/api/admin/fotos/nariz', raw=webp, tipo='image/webp')
    ok('[fotos] aceita webp', st == 200 and f1['fotos']['nariz']['src'].startswith('/api/fotos/nariz-'), f1)
    src1 = f1['fotos']['nariz']['src']
    st, b, cab = pedir('GET', src1)
    ok('[fotos] a foto serve-se com tipo certo e cache longa', st == 200 and b == webp and cab.get('Content-Type') == 'image/webp' and 'immutable' in cab.get('Cache-Control', ''), (st, cab.get('Content-Type')))
    st, f2, _ = pedir('POST', '/api/admin/fotos/nariz', raw=jpg, tipo='image/jpeg')
    ok('[fotos] troca por jpg com nome novo', st == 200 and f2['fotos']['nariz']['src'].endswith('.jpg') and f2['fotos']['nariz']['src'] != src1)
    ok('[fotos] a foto antiga foi apagada', pedir('GET', src1)[0] == 404)
    st, f3, _ = pedir('POST', '/api/admin/fotos/nariz/texto', {'alt': 'Narina com ponto de titânio', 'legenda': 'Narina, 30 €. <b>x</b>'})
    ok('[fotos] guarda descrição e legenda', st == 200 and f3['fotos']['nariz']['alt'] == 'Narina com ponto de titânio' and f3['fotos']['nariz']['src'] == f2['fotos']['nariz']['src'])
    ok('[fotos] caminhos estranhos não servem ficheiros', pedir('GET', '/api/fotos/../agenda.db')[0] == 404 and pedir('GET', '/api/fotos/nariz-..%2Fagenda.db')[0] == 404)
    st, f4, _ = pedir('POST', '/api/admin/fotos/nariz/repor', {})
    ok('[fotos] repor volta à foto original e apaga o ficheiro', st == 200 and 'nariz' not in f4['fotos'] and pedir('GET', f2['fotos']['nariz']['src'])[0] == 404)
    grande = b'RIFF' + b'\x00' * 4 + b'WEBP' + b'\x00' * (3 * 1024 * 1024)
    try:
        st_g = pedir('POST', '/api/admin/fotos/umbigo', raw=grande, tipo='image/webp')[0]
    except urllib.error.URLError:
        st_g = 'ligação fechada'  # o servidor responde 413 sem ler o resto e fecha a ligação
    ok('[fotos] recusa mais de 3 MB', st_g in (413, 'ligação fechada'), st_g)
    ok('[fotos] continua a responder depois', pedir('GET', '/api/saude')[0] == 200 and 'umbigo' not in pedir('GET', '/api/site')[1]['fotos'])

    # ---------- avaliações ----------
    st, lista, _ = pedir('GET', '/api/admin/marcacoes')
    mid = lista['marcacoes'][0]['id']
    st, cv, _ = pedir('POST', '/api/admin/convites', {'marcacao': mid})
    ok('[avaliações] cria link ligado à marcação (nome e piercings)', st == 201 and cv['nome'] == 'Rita' and cv['piercing'] == 'Narina, Hélix' and len(cv['token']) >= 20, cv)
    tok = cv['token']
    st, v, _ = pedir('POST', '/api/convite', {'token': tok}, com_cookie=False)
    ok('[avaliações] o link abre com o nome', st == 200 and v['nome'] == 'Rita', v)
    ok('[avaliações] token inventado não serve', pedir('POST', '/api/convite', {'token': 'x' * 24}, com_cookie=False)[0] == 404)
    ok('[avaliações] recusa 6 estrelas', pedir('POST', '/api/avaliacoes', {'token': tok, 'estrelas': 6, 'texto': 'ok'}, com_cookie=False)[0] == 422)
    ok('[avaliações] recusa estrelas em texto', pedir('POST', '/api/avaliacoes', {'token': tok, 'estrelas': '5', 'texto': 'ok'}, com_cookie=False)[0] == 422)
    st, r1, _ = pedir('POST', '/api/avaliacoes', {'token': tok, 'estrelas': 5, 'texto': 'Super calmo <script>alert(1)</script> e explicou tudo.', 'nome': 'Rita'}, com_cookie=False)
    ok('[avaliações] avaliação aceite e devolve o link do Google', st == 201 and r1['google'] == 'https://g.page/r/abc/review', r1)
    ok('[avaliações] o link não serve uma segunda vez', pedir('POST', '/api/avaliacoes', {'token': tok, 'estrelas': 1, 'texto': 'outra'}, com_cookie=False)[0] == 410)
    ok('[avaliações] e já não abre', pedir('POST', '/api/convite', {'token': tok}, com_cookie=False)[0] == 410)
    st, site, _ = pedir('GET', '/api/site')
    av = site['avaliacoes']
    ok('[avaliações] aparece logo no site, com média e piercing', av['n'] == 1 and av['media'] == 5 and av['lista'][0]['piercing'] == 'Narina, Hélix' and av['lista'][0]['nome'] == 'Rita', av)
    st, cv2, _ = pedir('POST', '/api/admin/convites', {'nome': 'João'})
    pedir('POST', '/api/avaliacoes', {'token': cv2['token'], 'estrelas': 3}, com_cookie=False)
    ok('[avaliações] média de 5 e 3 = 4', pedir('GET', '/api/site')[1]['avaliacoes']['media'] == 4.0)
    st, adm, _ = pedir('GET', '/api/admin/avaliacoes')
    aid = [a for a in adm['avaliacoes'] if a['estrelas'] == 3][0]['id']
    ok('[avaliações] esconder', pedir('POST', '/api/admin/avaliacoes/%d/visivel' % aid, {'visivel': False})[0] == 200 and pedir('GET', '/api/site')[1]['avaliacoes']['n'] == 1)
    ok('[avaliações] mostrar outra vez', pedir('POST', '/api/admin/avaliacoes/%d/visivel' % aid, {'visivel': True})[0] == 200 and pedir('GET', '/api/site')[1]['avaliacoes']['n'] == 2)
    st, cv3, _ = pedir('POST', '/api/admin/convites', {})
    ok('[avaliações] apagar um link por usar', pedir('POST', '/api/admin/convites/%d/apagar' % cv3['id'], {})[0] == 200 and pedir('POST', '/api/convite', {'token': cv3['token']}, com_cookie=False)[0] == 404)
    ok('[mensagens] modelo «avaliacao» aceite no histórico', pedir('POST', '/api/admin/marcacoes/%d/acao' % mid, {'acao': 'mensagem', 'tipo': 'avaliacao', 'canal': 'whatsapp'})[0] == 200)

    # ---------- números ----------
    st, num, _ = pedir('GET', '/api/admin/numeros?dias=30')
    neg = num['negocio']
    ok('[números] negócio com estados, pedidos do site, ocupação e avaliações', st == 200 and neg['pedidos_site'] == 1 and neg['avaliacoes']['n'] == 2 and neg['proximos']['marcadas'] == 1 and neg['proximos']['horas'] > 0 and len(neg['semanas']) == 8, neg)
    ok('[números] visitas devolvem dados ou um erro claro (sem rede aqui)', isinstance(num['site'], (dict, list)), num['site'])
    ok('[números] dias fora do intervalo ficam entre 7 e 365', pedir('GET', '/api/admin/numeros?dias=9999')[1]['dias'] == 365)
finally:
    srv.terminate()
    srv.wait(5)

print('%d FALHOU' % falhas if falhas else 'tudo OK')
sys.exit(1 if falhas else 0)
