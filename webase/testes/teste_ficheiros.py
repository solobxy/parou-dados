#!/usr/bin/env python3
"""Testes da importação de contactos com ficheiros como os que as pessoas têm: Excel feito à mão, CSV do Excel
português, Google Contactos, Outlook, Android e iPhone, e ficheiros estragados ou maliciosos.

Uso: python3 testes/teste_ficheiros.py
"""
import base64
import io
import os
import sys
import tempfile
import zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
FICH = os.path.join(AQUI, 'ficheiros')
API = os.path.join(AQUI, '..', 'api')
if not os.path.exists(os.path.join(API, 'crm.py')):
    API = os.path.join(AQUI, '..')          # no repositório, os ficheiros da API estão um nível acima
sys.path.insert(0, API)
os.environ.setdefault('WB_DADOS', tempfile.mkdtemp(prefix='wbfich'))

import crm  # noqa: E402
import ficheiros as F  # noqa: E402
import nucleo as N  # noqa: E402

falhas = []
n_ok = 0


def ok(cond, nome):
    global n_ok
    if cond:
        n_ok += 1
    else:
        falhas.append(nome)
        print('  FALHOU:', nome)


def pacote(nome):
    b = open(os.path.join(FICH, nome), 'rb').read()
    if nome.endswith(('.xlsx', '.xls')):
        return {'xlsx': base64.b64encode(b).decode()}
    try:
        t = b.decode('utf-8')
    except UnicodeDecodeError:
        t = b.decode('cp1252')       # o que a app faz quando o ficheiro não é UTF-8
    return {'vcf': t} if nome.endswith('.vcf') else {'csv': t}


def importar(p):
    """O mesmo caminho que a rota /api/clientes/importar faz, sem a base de dados."""
    linhas = F.juntar_nomes(crm.sem_cabecalho(crm.achar_cabecalho(F.ler_pedido(p))), N.normalizar)
    mapa = crm.mapa_por_conteudo(linhas, crm.mapa_automatico(linhas[0]))
    out = []
    for l in linhas[1:]:
        c, av = crm.linha_para_cliente(l, mapa)
        out.append((c, av))
    return linhas, mapa, out


def por_nome(res):
    return {c['nome']: c for c, _ in res if c}


def erro(p):
    try:
        F.ler_pedido(p)
    except F.FicheiroInvalido as e:
        return str(e)
    return None


def zip_xlsx(partes):
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w', zipfile.ZIP_DEFLATED) as z:
        for n, d in partes.items():
            z.writestr(n, d)
    return {'xlsx': base64.b64encode(b.getvalue()).decode()}


def main():
    print('— Excel feito à mão (título por cima, folha de instruções antes, datas, números)')
    linhas, mapa, res = importar(pacote('excel-a-mao.xlsx'))
    c = por_nome(res)
    ok(linhas[0][0] == 'Nome', 'salta o título e a folha de instruções')
    ok(c['João Gonçalves']['telefone'] == '912345678' and c['João Gonçalves']['nif'] == '123456789', 'telefone e NIF guardados como números')
    ok(c['João Gonçalves']['nascimento'] == '1988-03-15', 'data do Excel')
    ok(c['Maria Inês Sá']['email'] == 'maria@exemplo.pt' and c['Maria Inês Sá']['telefone'] == '913000111', 'espaços e +351 limpos')
    ok(c['Rui Lopes']['telefone'] == '914222333', '351 sem + (o Excel come o +)')
    ok(c['Rui Lopes']['nascimento'] == '1992-02-29', 'data escrita à mão dd/mm/aaaa')
    ok(c['Ana Pereira']['nascimento'] == '1990-01-01', 'número de série do Excel numa coluna sem formato de data')
    ok(c['Ana Pereira']['telefone'] == '912345679' and '222 111 000' in c['Ana Pereira']['notas'], 'dois telefones na mesma célula')
    ok(c['Ana Pereira']['email'] == 'ana@exemplo.pt' and 'ana.trabalho@exemplo.pt' in c['Ana Pereira']['notas'], 'dois e-mails na mesma célula')
    ok('Sem Contacto' in c and len([x for x in res if x[0]]) == 6, 'linha vazia ignorada, contacto sem telefone fica')
    ok(c['Telefone Estranho']['telefone'] == '' and 'ver no caderno' in c['Telefone Estranho']['notas'], 'texto no telefone vai para as notas')
    ok(c['João Gonçalves']['notas'] == 'Corte à tesoura ✂️', 'emoji nas notas')

    print('— CSV do Excel português (; e Windows-1252)')
    _, _, res = importar(pacote('excel-pt.csv'))
    c = por_nome(res)
    ok(c['José Conceição']['codpostal'] == '4700-123' and c['José Conceição']['morada'] == 'Rua da Liberdade, 12', 'acentos e vírgulas na morada')
    ok('Lúcia; a do café' in c and c['Lúcia; a do café']['telefone'] == '912000002', 'aspas com ; dentro e 00351')
    ok(c['Antônio Brás']['email'] == '' and 'antonio@exemplo' in c['Antônio Brás']['notas'], 'e-mail inválido não se perde')
    ok(c['Antônio Brás']['nif'] == '' and '999999999' in c['Antônio Brás']['notas'], 'NIF inválido não se perde')

    print('— LibreOffice (.xlsx) e Excel antigo (.xls)')
    _, _, res2 = importar(pacote('libreoffice.xlsx'))
    ok(sorted(por_nome(res2)) == sorted(c), '.xlsx do LibreOffice dá o mesmo que o CSV')
    e = erro(pacote('antigo.xls'))
    ok(e and 'Guardar como' in e, '.xls antigo explica como guardar')

    print('— Google Contactos e Outlook')
    linhas, mapa, res = importar(pacote('google.csv'))
    c = por_nome(res)
    ok(c['Carla Mendes']['telefone'] == '915111222' and '253 111 222' in c['Carla Mendes']['notas'], 'nome em partes e telefones com :::')
    ok(c['Carla Mendes']['etiquetas'] == ['clientes'], 'etiquetas do Google sem «myContacts»')
    ok(c['Carla Mendes']['nascimento'] == '1985-07-21', 'aniversário do Google')
    ok(c['Pedro Miguel Alves']['empresa'] == 'Oficina Alves', 'nome do meio e empresa')
    _, _, res = importar(pacote('outlook-pt.csv'))
    c = por_nome(res)
    ok(c['Sofia Ramos']['email'] == 'sofia@exemplo.pt' and c['Sofia Ramos']['nascimento'] == '1979-04-03', 'Outlook em português')

    print('— telemóvel (.vcf)')
    _, _, res = importar(pacote('android.vcf'))
    c = por_nome(res)
    ok(c['João Gonçalves']['telefone'] == '912345678' and '253 000 111' in c['João Gonçalves']['notas'], 'Android: telemóvel primeiro, fixo nas notas')
    ok(c['Canalizador']['notas'].endswith('e é barato.'), 'Android: acentos em quoted-printable partido em duas linhas')
    _, _, res = importar(pacote('iphone.vcf'))
    c = por_nome(res)
    m = c['Marta Ferreira']
    ok(m['telefone'] == '926111222' and m['empresa'] == 'Florista Marta', 'iPhone: item1.TEL e empresa')
    ok(m['morada'] == 'Rua de Santa Catarina, 200' and m['localidade'] == 'Porto' and m['codpostal'] == '4000-447', 'iPhone: morada')
    ok(m['nascimento'] == '1991-05-09' and 'Dia da Mãe' in m['notas'], 'iPhone: aniversário e notas com quebra de linha')
    ok(c['Empresa de Limpezas Lda']['tipo'] == 'empresa', 'contacto que é uma empresa')
    ok(all('PHOTO' not in str(x) for x in res), 'fotografias ignoradas')

    print('— listas sem títulos')
    _, mapa, res = importar({'csv': '912 345 678\n913 333 444\n+351 914 555 666\n'})
    ok(len(res) == 3 and [x[0]['telefone'] for x in res] == ['912345678', '913333444', '914555666'], 'só números, sem títulos')
    _, mapa, res = importar({'csv': 'Contacto 1;Contacto 2;Contacto 3\nJoão Silva;912345678;joao@x.pt\nAna Rita Costa;913333444;ana@x.pt\n'})
    ok(sorted(mapa.values()) == ['email', 'nome', 'telefone'], 'títulos que não dizem nada: olha para o conteúdo')

    print('— ficheiros estragados ou maliciosos')
    ok(erro({'xlsx': base64.b64encode(os.urandom(2000)).decode()}) is not None, 'bytes ao calhas')
    ok(erro({'xlsx': '%%%não é base64'}) is not None, 'base64 inválido')
    ok(erro({'xlsx': base64.b64encode(b'PK\x03\x04' + os.urandom(500)).decode()}) is not None, 'zip estragado')
    bomba = zip_xlsx({'xl/worksheets/sheet1.xml': b'<a>' + b' ' * (90 * 1024 * 1024) + b'</a>'})
    ok(len(bomba['xlsx']) < 400000 and 'grande demais' in (erro(bomba) or ''), 'bomba zip recusada')
    risos = (b'<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]>'
             b'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row><c t="inlineStr"><is><t>&b;</t></is></c></row></sheetData></worksheet>')
    ok(erro(zip_xlsx({'xl/worksheets/sheet1.xml': risos})) is not None, 'entidades XML recusadas')
    ok(erro(zip_xlsx({'xl/worksheets/sheet1.xml': b'<worksheet/>'})) is not None, 'Excel sem contactos')
    ok(erro({'vcf': 'isto não é um vcard'}) is not None, '.vcf sem contactos')
    ok(erro({}) is not None, 'sem ficheiro')
    grande = 'Nome;Telefone\n' + ''.join('Pessoa %d;9%08d\n' % (i, i) for i in range(10500))
    ok(len(F.ler_pedido({'csv': grande})) == F.MAX_LINHAS, 'lê no máximo 10 000 contactos (para dizer que passou)')
    # o mesmo contacto não fica duplicado: e-mails e telefones iguais saem iguais dos vários formatos
    ok(N.telefone_ok('+351 912 345 678') == N.telefone_ok('351912345678') == N.telefone_ok('00351912345678') == '912345678', 'mesmo número em formatos diferentes')
    ok(N.telefone_ok('+44 20 7946 0958') == '+442079460958', 'números estrangeiros ficam com o indicativo')

    print('\n%d verificações ok, %d falharam' % (n_ok, len(falhas)))
    sys.exit(1 if falhas else 0)


if __name__ == '__main__':
    main()
