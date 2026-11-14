#!/usr/bin/env python3
"""Testes da agenda da Dayla: arranca uma agenda numa base de dados temporária e faz os pedidos a sério.

Uso: python3 dayla/test_agenda.py   (termina com «OK» e código 0 se tudo passar)
"""
import datetime as dt, json, os, re, socket, subprocess, sys, tempfile, time, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
ORIGEM = 'https://teste.dayla'


def porta_livre():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Cliente:
    def __init__(self, base):
        self.base, self.cookie, self.ip = base, '', '10.0.0.%d' % (int(time.time() * 1000) % 200 + 1)

    def pedido(self, metodo, caminho, corpo=None, tipo='application/json', extra=None):
        dados = None
        h = {'Origin': ORIGEM, 'X-Forwarded-For': self.ip}
        if corpo is not None:
            dados = corpo if isinstance(corpo, bytes) else json.dumps(corpo).encode()
            h['Content-Type'] = tipo
        if self.cookie:
            h['Cookie'] = self.cookie
        h.update(extra or {})
        rq = urllib.request.Request(self.base + caminho, data=dados, method=metodo, headers=h)
        try:
            r = urllib.request.urlopen(rq, timeout=20)
        except urllib.error.HTTPError as e:
            r = e
        ck = r.headers.get('Set-Cookie')
        if ck:
            self.cookie = ck.split(';')[0] if 'Max-Age=0' not in ck else ''
        txt = r.read()
        try:
            return r.status, json.loads(txt)
        except ValueError:
            return r.status, txt


def main():
    tmp = tempfile.mkdtemp()
    porta = porta_livre()
    sys.path.insert(0, AQUI)
    import agenda
    env = dict(os.environ, AG_DB=os.path.join(tmp, 'agenda.db'), AG_PORTA=str(porta), ORIGENS=ORIGEM,
               DAYLA_SENHA_HASH=agenda.hash_senha('senha-de-teste-1'), TZ='Europe/Lisbon')
    proc = subprocess.Popen([sys.executable, os.path.join(AQUI, 'agenda.py')], env=env)
    falhas = []

    def ok(cond, msg):
        if not cond:
            falhas.append(msg)
            print('FALHOU:', msg)

    try:
        base = 'http://127.0.0.1:%d' % porta
        for _ in range(50):
            try:
                urllib.request.urlopen(base + '/api/saude', timeout=1)
                break
            except Exception:
                time.sleep(0.1)
        pub, adm = Cliente(base), Cliente(base)
        s, j = pub.pedido('GET', '/api/site')
        ok(s == 200 and len(j['servicos']) >= 20 and all(x['preco'] is None for x in j['servicos']), 'site com serviços sem preço')
        ok(j['dias'] == [] and j['avaliacoes']['n'] == 0, 'site sem dias nem avaliações')

        # painel fechado
        s, _ = pub.pedido('GET', '/api/admin/pedidos')
        ok(s == 401, 'painel sem sessão dá 401')
        s, _ = adm.pedido('POST', '/api/admin/entrar', {'senha': 'errada'})
        ok(s == 401, 'password errada')
        s, _ = adm.pedido('POST', '/api/admin/entrar', {'senha': 'senha-de-teste-1'})
        ok(s == 200 and adm.cookie.startswith('__Host-dayla_admin='), 'entrar')
        s, _ = Cliente(base).pedido('POST', '/api/admin/entrar', {'senha': 'senha-de-teste-1'}, extra={'Origin': 'https://outro.pt'})
        ok(s == 403, 'origem estranha recusada')

        # estúdio, dias e preços
        s, e = adm.pedido('POST', '/api/admin/estudios', {'nome': 'Estúdio Teste', 'zona': 'Bonfim', 'rua': 'Rua do Teste, 10', 'cp': '4000-123', 'cidade': 'Porto'})
        ok(s == 200 and e['id'] and 'maps' in e['mapa'], 'criar estúdio')
        s, x = adm.pedido('POST', '/api/admin/estudios', {'nome': 'X', 'cp': '4000'})
        ok(s == 422, 'estúdio com dados maus')
        amanha = (dt.date.today() + dt.timedelta(days=2)).isoformat()
        depois = (dt.date.today() + dt.timedelta(days=9)).isoformat()
        s, d = adm.pedido('POST', '/api/admin/dias', {'datas': [amanha, depois], 'abre': '11:00', 'fecha': '15:00', 'estudio': e['id']})
        ok(s == 200 and len(d['dias']) == 2 and len(d['dias'][0]['horas']) == 4, 'juntar dias (4 horas de 1 hora)')
        s, _ = adm.pedido('POST', '/api/admin/dias', {'datas': ['2020-01-01'], 'abre': '11:00', 'fecha': '15:00'})
        ok(s == 422, 'dia no passado recusado')
        s, c = adm.pedido('GET', '/api/admin/config')
        servs = c['servicos']
        for x in servs:
            if x['id'] == 'helix':
                x['preco'] = 30
            if x['id'] == 'narina':
                x['preco'] = 25
                x['desde'] = True
            if x['id'] == 'lingua':
                x['visivel'] = False
        servs.append({'cat': 'rosto', 'pt': 'Bridge', 'en': 'Bridge', 'preco': 40})
        s, r = adm.pedido('POST', '/api/admin/servicos', {'servicos': servs})
        ok(s == 200 and any(x['pt'] == 'Bridge' and re.match(r'bridge-[0-9a-f]{4}', x['id']) for x in r['servicos']), 'guardar preços e serviço novo')
        s, r = adm.pedido('POST', '/api/admin/servicos', {'servicos': [{'pt': 'Lóbulo', 'preco': 1500}]})
        ok(s == 422, 'preço fora do limite')
        s, j = pub.pedido('GET', '/api/site')
        hx = [x for x in j['servicos'] if x['id'] == 'helix'][0]
        ok(hx['preco'] == 30 and not any(x['id'] == 'lingua' for x in j['servicos']), 'site mostra preço e esconde o escondido')
        ok(j['dias'][0]['estudio']['nome'] == 'Estúdio Teste' and 'rua' not in j['dias'][0]['estudio'], 'site mostra o estúdio sem a morada')

        # pedido com hora escolhida
        base_p = {'servicos': ['helix', 'narina'], 'nome': 'Ana Silva', 'tel': '912 345 678', 'idade': True, 'idioma': 'pt', 'ms': 5000}
        s, r = pub.pedido('POST', '/api/pedidos', dict(base_p, ms=500, data=amanha, hora='11:00'))
        ok(s == 400, 'formulário rápido demais recusado')
        s, r = pub.pedido('POST', '/api/pedidos', dict(base_p, data=amanha, hora='11:30'))
        ok(s == 422 and 'quando' in r['campos'], 'hora que não existe recusada')
        s, r = pub.pedido('POST', '/api/pedidos', dict(base_p, data=amanha, hora='11:00'))
        ok(s == 201 and r['estado'] == 'pendente' and r['total'] == 55 and r['desde'], 'pedido com hora (total desde 55)')
        cod_ana = r.get('codigo')
        s, r = pub.pedido('POST', '/api/pedidos', dict(base_p, data=amanha, hora='12:00'))
        ok(s == 409 and r['erro'] == 'ja_tens_pedido', 'um pedido ativo por telemóvel')
        outro = Cliente(base)
        s, r = outro.pedido('POST', '/api/pedidos', dict(base_p, nome='Bia', tel='+44 7700 900123', data=amanha, hora='11:00', idioma='en'))
        ok(s == 422 and 'quando' in r['campos'], 'hora já ocupada')
        # pedido só com preferências, em inglês, número estrangeiro
        s, r = outro.pedido('POST', '/api/pedidos', dict(base_p, nome='Bia Jones', tel='+44 7700 900123', idioma='en',
                                                            preferencias={'dias': [5, 6], 'periodos': ['tarde'], 'texto': 'after the 20th'}))
        ok(s == 201 and r['idioma'] == 'en' and r['servicos'] == ['Helix', 'Nostril'], 'pedido em inglês com preferências')
        s, r = Cliente(base).pedido('POST', '/api/pedidos', dict(base_p, nome='Carla', tel='961111111'))
        ok(s == 422 and 'quando' in r['campos'], 'sem hora nem preferências recusado')
        s, r = Cliente(base).pedido('POST', '/api/pedidos', dict(base_p, nome='C4rla', tel='12', idade=False, servicos=['nao-existe'],
                                                                 preferencias={'dias': [1]}))
        ok(s == 422 and {'nome', 'tel', 'idade', 'servicos'} <= set(r['campos']), 'erros por campo')
        s, r = Cliente(base).pedido('POST', '/api/pedidos', dict(base_p, nome='Dora', tel='963333333', servicos=[], notas='',
                                                                 preferencias={'dias': [1]}))
        ok(s == 422 and 'servicos' in r['campos'], 'pedido vazio recusado')
        s, r = Cliente(base).pedido('POST', '/api/pedidos', dict(base_p, nome='Dora', tel='963333333', servicos=[], notas='Quero um projeto na orelha',
                                                                 preferencias={'periodos': ['manha']}, empresa='robo'))
        ok(s == 400, 'campo-isco')
        s, r = pub.pedido('GET', '/api/pedidos/' + cod_ana)
        ok(s == 200 and r['estado'] == 'pendente' and 'estudio' not in r, 'estado do pedido sem morada antes de confirmar')

        # painel: confirmar, mudar, concluir, avaliação
        s, j = adm.pedido('GET', '/api/admin/pedidos')
        ok(s == 200 and len(j['pedidos']) == 2, 'painel vê os 2 pedidos')
        bia = [p for p in j['pedidos'] if p['nome'] == 'Bia Jones'][0]
        ana = [p for p in j['pedidos'] if p['nome'] == 'Ana Silva'][0]
        ok(bia['tel'] == '447700900123' and bia['preferencias']['dias'] == [5, 6], 'telemóvel com indicativo e preferências guardadas')
        s, r = adm.pedido('POST', '/api/admin/pedidos/%d/acao' % bia['id'], {'acao': 'confirmar', 'data': amanha, 'hora': '11:00', 'estudio': e['id']})
        ok(s == 422, 'confirmar numa hora ocupada recusado')
        s, r = adm.pedido('POST', '/api/admin/pedidos/%d/acao' % bia['id'], {'acao': 'confirmar', 'data': depois, 'hora': '13:00'})
        ok(s == 422 and 'estudio' in r['campos'], 'confirmar sem estúdio recusado')
        s, r = adm.pedido('POST', '/api/admin/pedidos/%d/acao' % bia['id'], {'acao': 'confirmar', 'data': depois, 'hora': '13:00', 'estudio': e['id']})
        ok(s == 200 and r['estado'] == 'confirmada' and r['estudio'] == e['id'], 'confirmar com dia, hora e estúdio')
        s, r = adm.pedido('POST', '/api/admin/pedidos/%d/acao' % bia['id'], {'acao': 'confirmar', 'data': depois, 'hora': '18:30', 'estudio': e['id']})
        ok(s == 200 and r['hora'] == '18:30', 'mudar para uma hora fora dos dias (a Dayla pode)')
        s, r = outro.pedido('GET', '/api/pedidos/' + [p for p in adm.pedido('GET', '/api/admin/pedidos')[1]['pedidos'] if p['id'] == bia['id']][0]['codigo'])
        ok(s == 200 and r['estudio']['rua'] == 'Rua do Teste, 10' and r['idioma'] == 'en', 'cliente vê a morada depois de confirmado')
        s, r = adm.pedido('POST', '/api/admin/pedidos/%d/acao' % ana['id'], {'acao': 'confirmar', 'estudio': e['id']})
        ok(s == 200 and r['data'] == amanha and r['hora'] == '11:00', 'confirmar mantendo a hora escolhida pelo cliente')
        s, r = adm.pedido('POST', '/api/admin/pedidos/%d/acao' % ana['id'], {'acao': 'concluir'})
        ok(s == 200 and r['estado'] == 'concluida', 'concluir')
        s, cv = adm.pedido('POST', '/api/admin/convites', {'pedido': ana['id']})
        ok(s == 201 and cv['nome'] == 'Ana' and 'Hélix' in cv['piercing'], 'link de avaliação a partir do pedido')
        s, r = pub.pedido('POST', '/api/convite', {'token': cv['token']})
        ok(s == 200 and r['idioma'] == 'pt', 'abrir o link')
        s, r = pub.pedido('POST', '/api/avaliacoes', {'token': cv['token'], 'estrelas': 5, 'texto': 'Super calma, adorei!', 'nome': 'Ana'})
        ok(s == 201, 'avaliar')
        s, r = pub.pedido('POST', '/api/avaliacoes', {'token': cv['token'], 'estrelas': 1})
        ok(s == 410, 'link só dá uma vez')
        s, j = pub.pedido('GET', '/api/site')
        ok(j['avaliacoes']['n'] == 1 and j['avaliacoes']['media'] == 5.0, 'avaliação aparece no site')

        # cliente cancela
        s, r = outro.pedido('POST', '/api/pedidos/%s/cancelar' % [p for p in adm.pedido('GET', '/api/admin/pedidos')[1]['pedidos'] if p['id'] == bia['id']][0]['codigo'], {})
        ok(s == 200 and r['estado'] == 'cancelada', 'cliente cancela no site')

        # marcação feita pela Dayla
        s, r = adm.pedido('POST', '/api/admin/pedidos', {'nome': 'Eva', 'tel': '934444444', 'servicos': ['helix'], 'data': depois, 'hora': '12:00', 'estudio': e['id']})
        ok(s == 201 and r['estado'] == 'confirmada', 'marcação feita no painel')

        # fotos
        webp = b'RIFF\x24\x00\x00\x00WEBPVP8 ' + b'\x00' * 40
        s, r = adm.pedido('POST', '/api/admin/fotos/perfil', webp, tipo='image/webp', extra={'X-Largura': '800', 'X-Altura': '1000'})
        ok(s == 200 and r['fotos']['perfil']['src'].startswith('/api/fotos/perfil-'), 'foto de perfil')
        s, r = adm.pedido('POST', '/api/admin/fotos/galeria', b'GIF89a' + b'\x00' * 20, tipo='image/gif')
        ok(s == 415, 'formato estranho recusado')
        s, r = adm.pedido('POST', '/api/admin/fotos/galeria', webp, tipo='image/webp')
        s, r = adm.pedido('POST', '/api/admin/fotos/galeria', webp, tipo='image/webp')
        ok(s == 200 and len(r['fotos']['galeria']) == 2, 'duas fotos na galeria')
        s, r = adm.pedido('POST', '/api/admin/fotos/galeria/1/mover', {'para': 0})
        ok(s == 200, 'mudar a ordem')
        src = r['fotos']['galeria'][0]['src']
        s, img = pub.pedido('GET', src)
        ok(s == 200 and img[:4] == b'RIFF', 'foto servida')
        s, r = adm.pedido('POST', '/api/admin/fotos/galeria/0/apagar', {})
        ok(s == 200 and len(r['fotos']['galeria']) == 1, 'tirar foto')

        # joias, contactos, números, password
        s, jo = adm.pedido('POST', '/api/admin/joias', {'nome': 'Argola lisa', 'material': 'Titânio', 'preco': 20, 'quantidade': 1})
        ok(s == 200 and jo['id'], 'criar joia')
        s, j = pub.pedido('GET', '/api/site')
        ok(j['joias'][0]['estado'] == 'poucas', 'joia com poucas unidades')
        s, r = adm.pedido('POST', '/api/admin/contactos', {'whatsapp': '+351 930 514 346', 'instagram': '@sendodaylabpiercing', 'email': ''})
        ok(s == 200 and r['contactos']['whatsapp'] == '351930514346' and r['contactos']['instagram'] == 'sendodaylabpiercing', 'contactos')
        s, r = adm.pedido('GET', '/api/admin/numeros?dias=30')
        ok(s == 200 and r['negocio']['pedidos'] >= 3 and r['negocio']['em_ingles'] == 1, 'números do negócio')
        s, r = adm.pedido('POST', '/api/admin/senha', {'atual': 'errada', 'nova': 'nova-senha-123'})
        ok(s == 422, 'mudar password com a atual errada')
        s, r = adm.pedido('POST', '/api/admin/senha', {'atual': 'senha-de-teste-1', 'nova': 'nova-senha-123'})
        ok(s == 200, 'mudar password')
        s, _ = Cliente(base).pedido('POST', '/api/admin/entrar', {'senha': 'nova-senha-123'})
        ok(s == 200, 'entrar com a password nova')
        s, _ = adm.pedido('GET', '/api/admin/estado')
        ok(s == 200, 'esta sessão continua')
        s, _ = adm.pedido('POST', '/api/admin/sair', {})
        s, _ = adm.pedido('GET', '/api/admin/estado')
        ok(s == 401, 'sair fecha a sessão')
    finally:
        proc.terminate()
        proc.wait(5)
    if falhas:
        print('%d testes falharam' % len(falhas))
        sys.exit(1)
    print('OK')


if __name__ == '__main__':
    main()
