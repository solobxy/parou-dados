#!/usr/bin/env python3
"""Testes da API da webase: contas, segurança (CSRF, IDOR, permissões, âmbito), módulos e regras de negócio.

Uso: python3 testes/teste_api.py   (arranca a API numa pasta temporária, na porta 3169)
"""
import base64
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zlib

AQUI = os.path.dirname(os.path.abspath(__file__))
API = os.path.join(AQUI, '..', 'api.py')
PORTA = 3169
URL = 'http://127.0.0.1:%d' % PORTA
falhas = []
n_ok = 0


def ok(cond, nome):
    global n_ok
    if cond:
        n_ok += 1
    else:
        falhas.append(nome)
        print('  FALHOU:', nome)


class Sessao:
    def __init__(self):
        self.cookie = ''

    def pedir(self, metodo, caminho, dados=None, cab=None, cru=False):
        h = {'X-Wb': '1', 'Origin': URL}
        if cab is not None:
            h = cab
        corpo = None
        if dados is not None:
            corpo = json.dumps(dados).encode()
            h['Content-Type'] = 'application/json'
        if self.cookie:
            h['Cookie'] = self.cookie
        req = urllib.request.Request(URL + caminho, data=corpo, headers=h, method=metodo)
        try:
            r = urllib.request.urlopen(req, timeout=20)
            estado, txt, hdr = r.status, r.read(), r.headers
        except urllib.error.HTTPError as e:
            estado, txt, hdr = e.code, e.read(), e.headers
        for ck in hdr.get_all('Set-Cookie') or []:
            par = ck.split(';')[0]
            if par.startswith('wb='):
                self.cookie = '' if par == 'wb=' else par
        if cru:
            return estado, txt, hdr
        try:
            return estado, json.loads(txt)
        except ValueError:
            return estado, {}

    def get(self, c):
        return self.pedir('GET', c)

    def post(self, c, d=None):
        return self.pedir('POST', c, d if d is not None else {})


def png(larg=32, alt=32, extra=b''):
    linha = b'\x00' + b'\x2b\x3f\xd6\xff' * larg
    dados = zlib.compress(linha * alt)

    def bloco(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + bloco(b'IHDR', struct.pack('>IIBBBBB', larg, alt, 8, 6, 0, 0, 0)) + extra +
            bloco(b'IDAT', dados) + bloco(b'IEND', b''))


def criar_conta(email, negocio='Barbearia Teste', setor='barbearia'):
    s = Sessao()
    e, r = s.post('/api/conta/criar', {'nome': 'Ana Silva', 'negocio': negocio, 'email': email, 'senha': 'cavalo-azul-correto-77',
                                       'setor': setor, 'aceito': True})
    assert e == 201, (e, r)
    return s, r


def main():
    dados = tempfile.mkdtemp(prefix='wbtest')
    env = dict(os.environ, WB_DADOS=dados, WB_DEV='1', WB_PORTA=str(PORTA), ORIGENS=URL, ADMINS='admin@webase.test',
               WB_PAGAMENTOS='teste', WB_FUNDADORES='2')
    proc = subprocess.Popen([sys.executable, API], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(URL + '/api/publico/estado', timeout=1)
                break
            except Exception:
                time.sleep(0.1)
        correr()
    finally:
        proc.terminate()
        saida = proc.communicate(timeout=5)[0].decode(errors='replace')
        shutil.rmtree(dados, ignore_errors=True)
    erros500 = [l for l in saida.splitlines() if 'Traceback' in l]
    ok(not erros500, 'sem erros 500 no servidor')
    if erros500:
        print(saida[-3000:])
    print('\n%d verificações ok, %d falharam' % (n_ok, len(falhas)))
    sys.exit(1 if falhas else 0)


def correr():
    print('— contas')
    s = Sessao()
    e, r = s.post('/api/conta/criar', {'nome': 'A', 'negocio': 'B', 'email': 'x@y.pt', 'senha': '123', 'aceito': True})
    ok(e == 400 and r.get('campo') == 'senha', 'palavra-passe curta recusada')
    e, r = s.post('/api/conta/criar', {'nome': 'A', 'negocio': 'B', 'email': 'x@y.pt', 'senha': 'cavalo-azul-correto-77'})
    ok(e == 400 and r.get('campo') == 'aceito', 'tem de aceitar os termos')
    e, r = s.post('/api/conta/criar', {'nome': 'A', 'negocio': 'B', 'email': 'x@y.pt', 'senha': 'cavalo-azul-correto-77', 'aceito': True,
                                       'site': 'http://spam'})
    ok(e == 400, 'campo isco bloqueia robôs')
    a, ra = criar_conta('ana@barbearia.test')
    ok(ra['conta']['fundador'] and ra['dono'], 'primeira conta é fundadora e dona')
    ok('pontos' in ra['conta']['modulos'] and 'leads' not in ra['conta']['modulos'], 'módulos sugeridos pelo setor')
    b, rb = criar_conta('rui@telecom.test', 'Telecom Norte', 'telecom')
    c3, rc = criar_conta('zé@cafe.test', 'Café Central', 'restauracao')
    ok(not rc['conta']['fundador'], 'lugares de fundador acabam (limite 2)')
    e, r = Sessao().post('/api/conta/criar', {'nome': 'X', 'negocio': 'Y', 'email': 'ana@barbearia.test',
                                              'senha': 'cavalo-azul-correto-77', 'aceito': True})
    ok(e == 409, 'e-mail repetido recusado')
    e, r = Sessao().post('/api/conta/entrar', {'email': 'ana@barbearia.test', 'senha': 'errada-errada'})
    ok(e == 401 and 'errados' in r['erro'], 'palavra-passe errada recusada sem dizer qual campo')
    s = Sessao()
    e, r = s.post('/api/conta/entrar', {'email': 'ANA@barbearia.test', 'senha': 'cavalo-azul-correto-77'})
    ok(e == 200 and r['email'] == 'ana@barbearia.test', 'entrar (e-mail sem diferença de maiúsculas)')

    print('— CSRF e pedidos')
    e, r = a.pedir('POST', '/api/clientes', {'nome': 'X'}, cab={'Origin': URL})
    ok(e == 403, 'sem cabeçalho X-Wb é recusado')
    e, r = a.pedir('POST', '/api/clientes', {'nome': 'X'}, cab={'X-Wb': '1', 'Origin': 'https://mau.example'})
    ok(e == 403, 'origem estranha é recusada')
    e, r = a.pedir('POST', '/api/clientes', {'nome': 'X'}, cab={'X-Wb': '1', 'Origin': URL, 'Sec-Fetch-Site': 'cross-site'})
    ok(e == 403, 'pedido cross-site recusado')
    e, r = Sessao().get('/api/clientes')
    ok(e == 401, 'sem sessão não há dados')
    e, txt, hdr = a.pedir('GET', '/api/eu', cru=True)
    ok(hdr.get('Cache-Control') == 'no-store' and hdr.get('X-Content-Type-Options') == 'nosniff', 'cabeçalhos da API')

    print('— clientes')
    e, r = a.post('/api/clientes', {'nome': 'João Gonçalves', 'telefone': '912 345 678', 'email': 'JOAO@mail.pt', 'etiquetas': 'vip, fade',
                                    'nascimento': '1990-05-20', 'consentimento': True, 'consentimento_como': 'Balcão'})
    ok(e == 201 and r['cliente']['telefone'] == '912345678' and r['cliente']['email'] == 'joao@mail.pt', 'criar cliente normaliza contactos')
    joao = r['cliente']['id']
    ok(r['cliente']['consentimento_quando'], 'consentimento fica com data')
    e, r = a.post('/api/clientes', {'nome': 'Outro', 'telefone': '912345678'})
    ok(e == 409 and r['duplicado']['id'] == joao, 'deteta cliente repetido pelo telefone')
    e, r = a.post('/api/clientes', {'nome': 'Outro', 'telefone': '912345678', 'forcar': True})
    ok(e == 201, 'pode criar mesmo assim')
    e, r = a.post('/api/clientes', {'nome': 'Empresa X', 'nif': '123456788'})
    ok(e == 400 and r.get('campo') == 'nif', 'NIF com dígito de controlo errado recusado')
    e, r = a.post('/api/clientes', {'nome': 'Empresa X', 'nif': '501964843', 'tipo': 'empresa'})
    ok(e == 201, 'NIF válido aceite')
    e, r = a.post('/api/clientes', {'nome': '<script>alert(1)</script>'})
    ok(e == 201 and r['cliente']['nome'] == '<script>alert(1)</script>', 'texto guardado tal como é (o site escapa ao mostrar)')
    e, r = a.get('/api/clientes?q=joao')
    ok(e == 200 and any(x['id'] == joao for x in r['itens']), 'pesquisa sem acentos encontra «João»')
    e, r = a.get('/api/clientes?etiqueta=vip')
    ok(e == 200 and r['total'] == 1 and 'vip' in r['etiquetas'], 'filtro por etiqueta')
    e, r = a.post('/api/clientes/' + joao + '/nota', {'texto': 'Gosta de café sem açúcar.\nVem às sextas.'})
    ok(e == 201, 'nota na ficha')
    e, r = a.get('/api/clientes/' + joao)
    ok(e == 200 and any(x['tipo'] == 'nota' for x in r['atividade']), 'ficha com cronologia')
    ok('pontos' in r and 'chamadas' not in r, 'ficha só traz módulos ligados')
    e, r = b.get('/api/clientes/' + joao)
    ok(e == 404, 'IDOR: outra conta não vê o cliente')
    e, r = b.post('/api/clientes/' + joao, {'nome': 'Roubado'})
    ok(e == 404, 'IDOR: outra conta não muda o cliente')
    e, r = b.post('/api/clientes/' + joao + '/apagar')
    ok(e == 404, 'IDOR: outra conta não apaga o cliente')

    print('— campos personalizados, fases, marca')
    e, r = a.post('/api/conta/campos', {'campos': [{'nome': 'Corte preferido', 'tipo': 'escolha', 'opcoes': ['Fade', 'Clássico']},
                                                   {'nome': 'Alergias', 'tipo': 'texto'}]})
    ok(e == 200 and len(r['conta']['campos']) == 2, 'campos personalizados')
    cid = r['conta']['campos'][0]['id']
    e, r = a.post('/api/clientes/' + joao, {'extra': {cid: 'Fade'}})
    ok(e == 200 and r['cliente']['extra'][cid] == 'Fade', 'valor de campo personalizado')
    e, r = a.post('/api/clientes/' + joao, {'extra': {cid: 'Moicano'}})
    ok(e == 400, 'opção inexistente recusada')
    e, r = a.post('/api/conta/marca', {'cor': '#FFFF00'})
    ok(e == 400, 'cor sem contraste recusada')
    e, r = a.post('/api/conta/marca', {'cor': '#0f766e'})
    ok(e == 200 and r['conta']['cor'] == '#0F766E', 'cor da marca')
    e, r = a.post('/api/conta/logo', {'png': base64.b64encode(png(64, 64, extra=b'\x00\x00\x00\x04tEXt' + b'abcd' + b'\x00\x00\x00\x00')).decode()})
    ok(e == 400, 'PNG com bloco danificado recusado')
    e, r = a.post('/api/conta/logo', {'png': 'data:image/png;base64,' + base64.b64encode(png(64, 64)).decode()})
    ok(e == 200 and r['conta']['logo'], 'logótipo PNG aceite')
    e, txt, hdr = a.pedir('GET', r['conta']['logo'], cru=True)
    ok(e == 200 and txt[:8] == b'\x89PNG\r\n\x1a\n' and hdr['Content-Type'] == 'image/png', 'logótipo servido')
    e, r = a.post('/api/conta/logo', {'png': base64.b64encode(b'<svg onload=alert(1)>').decode()})
    ok(e == 400, 'logótipo que não é PNG recusado')

    print('— módulos desligados')
    e, r = a.get('/api/leads')
    ok(e == 403 and r.get('modulo') == 'leads', 'módulo desligado responde 403 com o nome')
    e, r = a.post('/api/conta/configurar', {'setor': 'barbearia', 'modulos': ['clientes', 'pontos', 'adesoes', 'leads', 'chamadas',
                                                                              'contratos', 'marketplace', 'forum']})
    ok(e == 200 and 'leads' in r['conta']['modulos'] and r['conta']['configurada'], 'ligar módulos')

    print('— equipa e permissões')
    e, r = a.post('/api/equipa/criar', {'nome': 'Marta Balcão', 'email': 'marta@barbearia.test', 'papel': 'balcao'})
    ok(e == 201 and r['senha_temporaria'], 'criar pessoa da equipa com senha temporária')
    marta_id, temp = r['utilizador']['id'], r['senha_temporaria']
    m = Sessao()
    e, r = m.post('/api/conta/entrar', {'email': 'marta@barbearia.test', 'senha': temp})
    ok(e == 200 and r['trocar_senha'], 'entra e tem de trocar a senha')
    e, r = m.get('/api/clientes')
    ok(e == 403 and r.get('trocar_senha'), 'bloqueada até trocar a senha')
    e, r = m.post('/api/eu/senha', {'atual': temp, 'nova': 'tesoura-verde-sabado-9'})
    ok(e == 200, 'troca a senha')
    e, r = m.get('/api/clientes')
    ok(e == 200 and r['total'] >= 3, 'balcão vê todos os clientes')
    e, r = m.post('/api/clientes/' + joao + '/apagar')
    ok(e == 403, 'balcão não pode apagar clientes')
    e, r = m.get('/api/leads')
    ok(e == 403, 'balcão não vê leads')
    e, r = m.post('/api/equipa/criar', {'nome': 'X', 'email': 'x@x.test', 'papel': 'administrador'})
    ok(e == 403, 'balcão não gere a equipa')
    e, r = m.get('/api/exportar/clientes.csv')
    ok(e == 403, 'balcão não exporta')
    e, r = m.get('/api/equipa')
    ok(e == 200 and 'email' not in r['equipa'][0], 'quem não gere não vê e-mails da equipa')

    e, r = a.post('/api/equipa/criar', {'nome': 'Paulo Comercial', 'email': 'paulo@barbearia.test', 'papel': 'comercial'})
    paulo_id = r['utilizador']['id']
    p = Sessao()
    p.post('/api/conta/entrar', {'email': 'paulo@barbearia.test', 'senha': r['senha_temporaria']})
    p.post('/api/eu/senha', {'atual': r['senha_temporaria'], 'nova': 'mesa-redonda-laranja-4'})
    e, r = p.get('/api/clientes')
    ok(e == 200 and r['total'] == 0, 'âmbito «só os meus»: não vê clientes dos outros')
    e, r = p.get('/api/clientes/' + joao)
    ok(e == 404, 'âmbito: não abre a ficha de outro responsável')
    e, r = p.post('/api/clientes', {'nome': 'Cliente do Paulo', 'responsavel': 1})
    ok(e == 201 and r['cliente']['responsavel'] == paulo_id, 'âmbito: fica sempre responsável do que cria')
    cli_paulo = r['cliente']['id']
    e, r = a.get('/api/clientes/' + cli_paulo)
    ok(e == 200, 'a dona vê o cliente do comercial')

    e, r = a.post('/api/equipa/%d' % marta_id, {'papel': 'personalizado', 'perm': {'m': {'clientes': 'ea'}, 'ambito': 'todos', 'x': []}})
    ok(e == 200 and r['utilizador']['perm']['m']['clientes'] == 'vea', 'quem edita ou apaga passa a ver')
    e, r = a.post('/api/equipa/%d' % marta_id, {'ativo': False})
    ok(e == 200, 'desativar pessoa')
    e, r = m.get('/api/eu')
    ok(e == 401, 'pessoa desativada perde a sessão')
    e, r = b.post('/api/equipa/%d' % marta_id, {'ativo': True})
    ok(e == 404, 'IDOR: outra conta não mexe na equipa')

    # gestor (sem «equipa») não pode dar-se mais permissões
    e, r = a.post('/api/equipa/criar', {'nome': 'Admin Dois', 'email': 'adm2@barbearia.test', 'papel': 'administrador'})
    adm = Sessao()
    adm.post('/api/conta/entrar', {'email': 'adm2@barbearia.test', 'senha': r['senha_temporaria']})
    adm.post('/api/eu/senha', {'atual': r['senha_temporaria'], 'nova': 'janela-alta-norte-33'})
    e, r = adm.post('/api/equipa/criar', {'nome': 'Sub', 'email': 'sub@barbearia.test', 'papel': 'personalizado',
                                          'perm': {'m': {'clientes': 'vcea'}, 'ambito': 'todos', 'x': ['equipa', 'exportar']}})
    ok(e == 201, 'administrador cria pessoas')
    e, r = adm.post('/api/equipa/1', {'ativo': False})
    ok(e == 403, 'ninguém mexe na dona da conta')

    print('— importar e exportar')
    csvtxt = 'Nome;Telemóvel;E-mail;Cidade;Tags\nMaria Lopes;913 000 001;maria@x.pt;Porto;importados\n' \
             'Pedro;913000002;pedro@x;Gondomar;\n;;;;\nJoão G;912345678;;Porto;\n=CMD();910000003;;Lisboa;'
    e, r = a.post('/api/clientes/importar', {'csv': csvtxt, 'previa': True})
    ok(e == 200 and r['total'] == 4 and set(r['mapa'].values()) >= {'nome', 'telefone', 'email', 'localidade', 'etiquetas'},
       'pré-visualização reconhece colunas portuguesas')
    e, r = a.post('/api/clientes/importar', {'csv': csvtxt})
    ok(e == 200 and r['criados'] == 3 and r['repetidos'] == 1 and r['com_avisos'] == 1, 'importar: cria, salta repetidos e avisa e-mails maus')
    e, txt, hdr = a.pedir('GET', '/api/exportar/clientes.csv', cru=True)
    t = txt.decode('utf-8')
    ok(e == 200 and t.startswith('﻿Nome;') and "'=CMD()" in t and 'attachment' in hdr['Content-Disposition'],
       'exportar CSV para Excel sem fórmulas')
    e, txt, hdr = p.pedir('GET', '/api/exportar/clientes.csv', cru=True)
    ok(e == 403, 'comercial não exporta')

    print('— leads e fases')
    e, r = a.post('/api/conta/fases', {'fases': [{'nome': 'Novo'}, {'nome': 'Proposta enviada'}, {'nome': 'Fechado', 'tipo': 'ganho'},
                                                 {'nome': 'Perdido', 'tipo': 'perdido'}]})
    ok(e == 200 and r['conta']['fases'][1]['id'] == 'proposta-enviada', 'fases personalizadas')
    e, r = a.post('/api/conta/fases', {'fases': [{'nome': 'Só uma'}]})
    ok(e == 400, 'fases sem ganho/perdido recusadas')
    e, r = a.post('/api/leads', {'titulo': 'Pacote noivos', 'valor': '350,50', 'cliente': joao})
    ok(e == 201 and r['lead']['valor'] == 35050 and r['lead']['fase'] == 'novo', 'criar lead (valor em euros PT)')
    lid = r['lead']['id']
    e, r = a.post('/api/leads/%s/fase' % lid, {'fase': 'fechado'})
    ok(e == 200 and r['tipo'] == 'ganho' and r['lead']['fechado'], 'ganhar lead')
    e, r = a.get('/api/clientes/' + joao)
    ok(any(x['tipo'] == 'ganho' for x in r['atividade']), 'ganho aparece na ficha')
    e, r = a.post('/api/leads', {'titulo': 'Empresa nova', 'contacto': 'Carla', 'telefone': '220000000'})
    e, r = a.post('/api/leads/%s/cliente' % r['lead']['id'])
    ok(e == 200 and r['cliente'], 'lead passa a ficha de cliente')
    e, r = b.post('/api/leads/%s/fase' % lid, {'fase': 'ganho'})
    ok(e in (403, 404), 'IDOR: outra conta não mexe na lead')

    print('— chamadas')
    e, r = a.post('/api/chamadas', {'direcao': 'entrada', 'resultado': 'atendida', 'numero': '+351 912 345 678', 'duracao': 125})
    ok(e == 201 and r['chamada']['cliente'] is None, 'chamada com indicativo não confunde')
    e, r = a.post('/api/chamadas', {'direcao': 'saida', 'resultado': 'ligar_depois', 'numero': '912345678',
                                    'seguimento': time.strftime('%Y-%m-%dT%H:%M')})
    ok(e == 201 and r['chamada']['cliente'] == joao and r['chamada']['nome'] == 'João Gonçalves', 'chamada liga-se ao cliente pelo número')
    e, r = a.get('/api/chamadas?vista=seguimentos')
    ok(e == 200 and r['total'] == 1 and r['hoje']['saida'] == 1, 'lista de seguimentos e totais de hoje')
    e, r = a.post('/api/chamadas', {'direcao': 'saida', 'resultado': 'atendida', 'numero': '1', 'quando': '2099-01-01T10:00'})
    ok(e == 400, 'chamada no futuro recusada')

    print('— contratos')
    e, r = a.post('/api/contratos', {'cliente': joao, 'titulo': 'Avença mensal', 'valor': 30, 'periodicidade': 'mensal',
                                     'inicio': '2026-01-01', 'fim': '2025-01-01'})
    ok(e == 400 and r.get('campo') == 'fim', 'fim antes do início recusado')
    e, r = a.post('/api/contratos', {'cliente': joao, 'titulo': 'Avença mensal', 'valor': 30, 'periodicidade': 'mensal',
                                     'inicio': '2026-01-01', 'renovacao': True})
    ok(e == 201, 'criar contrato')
    e, r = a.get('/api/contratos')
    ok(e == 200 and r['resumo']['mensal'] == 3000, 'receita mensal dos contratos')

    print('— pontos')
    e, r = a.post('/api/pontos/movimento', {'cliente': joao, 'tipo': 'compra', 'valor': '12,50'})
    ok(e == 200 and r['delta'] == 12, 'compra dá pontos (1 por euro)')
    e, r = a.post('/api/recompensas', {'nome': 'Corte grátis', 'custo': 100})
    rec = r['id']
    e, r = a.post('/api/pontos/movimento', {'cliente': joao, 'tipo': 'resgate', 'recompensa': rec})
    ok(e == 400 and 'Faltam' in r['erro'], 'não troca sem pontos suficientes')
    e, r = a.post('/api/pontos/movimento', {'cliente': joao, 'tipo': 'ajuste', 'pontos': 100, 'descricao': 'Oferta de aniversário'})
    e, r = a.post('/api/pontos/movimento', {'cliente': joao, 'tipo': 'resgate', 'recompensa': rec})
    ok(e == 200 and r['pontos'] == 12, 'troca por recompensa')
    e, r = a.post('/api/pontos/movimento', {'cliente': joao, 'tipo': 'ajuste', 'pontos': -50, 'descricao': 'x'})
    ok(e == 400, 'saldo nunca fica negativo')

    print('— subscrições e pacotes')
    e, r = a.post('/api/produtos', {'nome': '10 cortes', 'tipo': 'pacote', 'preco': 90, 'usos': 2})
    ok(e == 201, 'criar pacote')
    pac = r['produto']['id']
    e, r = a.post('/api/produtos', {'nome': 'Clube mensal', 'tipo': 'subscricao', 'preco': '25', 'periodo': 'mensal'})
    sub = r['produto']['id']
    e, r = a.post('/api/adesoes', {'cliente': joao, 'produto': pac})
    ok(e == 201 and r['adesao']['usos'] == 2, 'vender pacote')
    ad = r['adesao']['id']
    a.post('/api/adesoes/%s/usar' % ad)
    e, r = a.post('/api/adesoes/%s/usar' % ad)
    ok(e == 200 and r['adesao']['estado'] == 'esgotado', 'pacote esgota')
    e, r = a.post('/api/adesoes/%s/usar' % ad)
    ok(e == 400, 'não usa pacote esgotado')
    e, r = a.post('/api/adesoes', {'cliente': joao, 'produto': sub, 'inicio': '2026-01-31'})
    ok(e == 201 and r['adesao']['proxima'], 'subscrição com próxima cobrança')
    e, r = a.get('/api/clientes/' + joao)
    ok(r['cliente']['pontos'] > 12 and r['cliente']['gasto'] >= 12750, 'pagamentos somam gasto e pontos')

    print('— painel')
    e, r = a.get('/api/painel')
    ok(e == 200 and r['clientes']['total'] >= 5 and 'leads' in r and len(r['clientes']['semanas']) == 12, 'painel')
    e, r = p.get('/api/painel')
    ok(e == 200 and r['clientes']['total'] == 1, 'painel respeita o âmbito')

    print('— marketplace e partilhas')
    e, r = b.post('/api/clientes', {'nome': 'Loja A', 'tipo': 'empresa', 'empresa': 'Loja A Lda', 'email': 'loja@a.pt', 'telefone': '220000001'})
    b.post('/api/clientes', {'nome': 'Loja B', 'tipo': 'empresa', 'empresa': 'Loja B Lda', 'telefone': '220000002'})
    e, r = b.post('/api/mk', {'titulo': 'Lojas do Porto', 'tipo_dados': 'empresas', 'campos': ['nome', 'empresa', 'telefone', 'email'],
                              'preco': 0, 'setor': 'loja', 'regiao': 'Porto'})
    ok(e == 400 and r.get('campo') == 'declaracao', 'publicar exige a declaração')
    e, r = b.post('/api/mk', {'titulo': 'Lojas do Porto', 'tipo_dados': 'empresas', 'campos': ['nome', 'empresa', 'telefone', 'email'],
                              'preco': 0, 'setor': 'loja', 'regiao': 'Porto', 'declaracao': True})
    ok(e == 201 and r['anuncio']['n'] == 2 and r['anuncio']['amostra'][0]['telefone'].startswith('22'), 'publicar com amostra mascarada')
    ok('***' in r['anuncio']['amostra'][0]['nome'], 'amostra esconde os nomes')
    anun = r['anuncio']['id']
    e, r = a.get('/api/mk')
    ok(e == 200 and any(x['id'] == anun for x in r['itens']), 'outra conta vê o anúncio')
    e, r = a.post('/api/mk/%s/comprar' % anun)
    ok(e == 200 and r['criados'] == 2, 'receber base gratuita copia os contactos')
    e, r = a.post('/api/mk/%s/comprar' % anun)
    ok(e == 409, 'não recebe a mesma base duas vezes')
    e, r = a.get('/api/clientes?etiqueta=' + urllib.request.quote('mk lojas do porto'))
    ok(e == 200 and r['total'] == 2, 'contactos comprados ficam com etiqueta')
    e, r = b.post('/api/mk', {'titulo': 'Base paga', 'tipo_dados': 'empresas', 'campos': ['nome', 'telefone'], 'preco': '49,90',
                              'declaracao': True})
    paga = r['anuncio']['id']
    e, r = a.post('/api/mk/%s/comprar' % paga)
    ok(e == 200 and r.get('reservada'), 'base paga fica reservada enquanto os pagamentos não abrem')
    e, r = b.get('/api/avisos')
    ok(any('quer comprar' in x['texto'] for x in r['avisos']), 'vendedor é avisado')
    e, r = a.post('/api/mk/%s' % anun, {'estado': 'removido'})
    ok(e == 404, 'IDOR: não muda anúncio de outra conta')
    e, r = m.get('/api/mk')
    ok(e == 401, 'pessoa desativada continua sem acesso')
    e, r = b.post('/api/partilhas', {'codigo': ra['conta']['codigo'], 'titulo': 'Contactos para ti', 'campos': ['nome', 'telefone']})
    ok(e == 201 and r['n'] == 2, 'partilhar com outra conta pelo código')
    pid = r['id']
    c3.post('/api/conta/configurar', {'setor': 'restauracao', 'modulos': ['clientes', 'marketplace']})
    e, r = c3.post('/api/partilhas/%s/aceitar' % pid)
    ok(e == 404, 'IDOR: só o destino aceita')
    e, r = a.post('/api/partilhas/%s/aceitar' % pid)
    ok(e == 200 and r['repetidos'] == 2, 'aceitar partilha (repetidos não duplicam)')

    print('— fórum')
    e, r = a.post('/api/forum', {'categoria': 'novidades', 'titulo': 'Novidade falsa', 'texto': 'Isto não devia passar.'})
    ok(e == 403, 'só a equipa publica novidades')
    e, r = a.post('/api/forum', {'categoria': 'perguntas', 'titulo': 'Como fazem com faltas?', 'texto': 'Clientes que marcam e não vêm...'})
    ok(e == 201, 'abrir tópico')
    tid = r['topico']['id']
    e, r = b.get('/api/forum')
    ok(e == 200 and any(x['id'] == tid for x in r['itens']), 'outras contas veem o tópico')
    ok(r['itens'][0]['autor']['nome'] == 'Ana S.', 'autor mostrado com o apelido abreviado')
    e, r = b.post('/api/forum/%s/responder' % tid, {'texto': 'Pedimos sinal de 5 € na marcação.'})
    ok(e == 201, 'responder')
    e, r = b.post('/api/forum/%s/gosto' % tid)
    ok(e == 200 and r['gostos'] == 1 and r['gostei'], 'gostar')
    e, r = b.post('/api/forum/%s/apagar' % tid)
    ok(e == 403, 'não apaga tópicos dos outros')
    e, r = a.get('/api/avisos')
    ok(any('Nova resposta' in x['texto'] for x in r['avisos']), 'autor é avisado da resposta')
    e, r = a.post('/api/forum/denunciar', {'alvo': tid, 'motivo': 'teste'})
    ok(e == 200, 'denunciar')

    print('— sessões e conta')
    e, r = a.get('/api/eu/sessoes')
    ok(e == 200 and sum(x['esta'] for x in r['sessoes']) == 1 and len(r['sessoes']) == 2, 'lista de sessões (a atual marcada)')
    e, r = a.post('/api/conta/apagar', {'senha': 'cavalo-azul-correto-77', 'confirmacao': 'nome errado'})
    ok(e == 400, 'apagar conta exige o nome exato')
    e, r = c3.post('/api/conta/apagar', {'senha': 'cavalo-azul-correto-77', 'confirmacao': 'Café Central'})
    ok(e == 200, 'apagar conta')
    e, r = c3.get('/api/eu')
    ok(e == 401, 'depois de apagar não há sessão')
    e, r = Sessao().post('/api/conta/entrar', {'email': 'zé@cafe.test', 'senha': 'cavalo-azul-correto-77'})
    ok(e == 401, 'conta apagada não entra')


if __name__ == '__main__':
    main()
