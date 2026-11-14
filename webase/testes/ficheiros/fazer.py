"""Gera os ficheiros de teste da importação (como as pessoas os têm de verdade). Precisa de openpyxl e LibreOffice.
Os ficheiros gerados ficam no repositório; os testes não precisam destas ferramentas."""
import base64
import os
import subprocess
from datetime import date, datetime

import openpyxl
from openpyxl.styles import Font

AQUI = os.path.dirname(os.path.abspath(__file__))
FOTO = base64.b64encode(os.urandom(3000)).decode()

# 1) Excel feito à mão: título por cima, telefones como números, datas a sério, linha vazia, duas folhas
wb = openpyxl.Workbook()
ins = wb.active
ins.title = 'Instruções'
ins['A1'] = 'Lista atualizada pela Joana'
fl = wb.create_sheet('Clientes')
fl['A1'] = 'CLIENTES DA BARBEARIA 2025'
fl['A1'].font = Font(bold=True, size=16)
fl.merge_cells('A1:F1')
fl.append([])
fl.append(['Nome', 'Telemóvel', 'E-mail', 'Data de nascimento', 'Nº Contribuinte', 'Localidade', 'Observações'])
linhas = [
    ['João Gonçalves', 912345678, 'joao@exemplo.pt', date(1988, 3, 15), 123456789, 'Braga', 'Corte à tesoura ✂️'],
    ['  Maria  Inês Sá ', '+351 913 000 111', 'MARIA@EXEMPLO.PT ', datetime(1990, 12, 1), None, 'Porto', None],
    ['Rui Lopes', 351914222333, None, '29/02/1992', None, 'Lisboa', 'Prefere SMS'],
    [None, None, None, None, None, None, None],
    ['Ana Pereira', '912 345 679 / 222 111 000', 'ana@exemplo.pt; ana.trabalho@exemplo.pt', 32874, None, 'Guimarães', None],
    ['Sem Contacto', None, None, None, None, None, None],
    ['Telefone Estranho', 'ver no caderno', None, None, None, None, None],
]
for l in linhas:
    fl.append(l)
for r in range(4, 4 + len(linhas)):
    if isinstance(fl.cell(r, 4).value, (date, datetime)):
        fl.cell(r, 4).number_format = 'dd/mm/yyyy'
wb.active = 1
wb.save(os.path.join(AQUI, 'excel-a-mao.xlsx'))

# 2) CSV do Excel português: ; e Windows-1252, com BOM não (o Excel PT não põe)
with open(os.path.join(AQUI, 'excel-pt.csv'), 'w', encoding='cp1252', newline='') as f:
    f.write('Nome;Telefone;Email;Morada;Código Postal;Localidade;NIF\r\n')
    f.write('José Conceição;912 000 001;jose@exemplo.pt;Rua da Liberdade, 12;4700-123;Braga;123456789\r\n')
    f.write('"Lúcia; a do café";00351 912 000 002;;"Av. Central, 5";4700-001;Braga;\r\n')
    f.write('Antônio Brás;912000003;antonio@exemplo;;;;999999999\r\n')

# 3) Google Contactos (CSV), com «:::» e nome em partes
with open(os.path.join(AQUI, 'google.csv'), 'w', encoding='utf-8', newline='') as f:
    f.write('First Name,Middle Name,Last Name,Phonetic First Name,Nickname,Birthday,Notes,Labels,E-mail 1 - Label,E-mail 1 - Value,'
            'Phone 1 - Label,Phone 1 - Value,Organization Name,Address 1 - City\r\n')
    f.write('Carla,,Mendes,,,1985-07-21,Cliente desde 2019,* myContacts ::: Clientes,* Home,carla@exemplo.pt,Mobile,'
            '+351 915 111 222 ::: 253 111 222,,Braga\r\n')
    f.write('Pedro,Miguel,Alves,,,,,* myContacts,,,Mobile,916 333 444,Oficina Alves,Porto\r\n')
    f.write(',,,,,,,* myContacts,,,Mobile,917 555 666,,\r\n')

# 4) Outlook em português (CSV com vírgulas, Windows-1252)
with open(os.path.join(AQUI, 'outlook-pt.csv'), 'w', encoding='cp1252', newline='') as f:
    f.write('"Nome próprio","Nome do meio","Apelido","Empresa","Telemóvel","Endereço de correio eletrónico","Aniversário"\r\n')
    f.write('"Sofia","","Ramos","Café Central","918 777 888","sofia@exemplo.pt","3/4/1979"\r\n')

# 5) Android (vCard 2.1, quoted-printable, foto)
with open(os.path.join(AQUI, 'android.vcf'), 'w', encoding='utf-8', newline='') as f:
    f.write('BEGIN:VCARD\r\nVERSION:2.1\r\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Gon=C3=A7alves;Jo=C3=A3o;;;\r\n'
            'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jo=C3=A3o Gon=C3=A7alves\r\nTEL;HOME:253 000 111\r\nTEL;CELL:+351 912 345 678\r\n'
            'EMAIL;HOME:joao@exemplo.pt\r\nPHOTO;ENCODING=BASE64;JPEG:' + FOTO[:76] + '\r\n')
    for i in range(76, len(FOTO), 76):
        f.write(' ' + FOTO[i:i + 76] + '\r\n')
    f.write('\r\nEND:VCARD\r\n')
    f.write('BEGIN:VCARD\r\nVERSION:2.1\r\nN:;Canalizador;;;\r\nFN:Canalizador\r\nTEL;CELL:919 999 000\r\n'
            'NOTE;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Liga s=C3=B3 de manh=C3=A3, depois das 9h. Trabalha bem e =\r\n'
            '=C3=A9 barato.\r\nEND:VCARD\r\n')

# 6) iPhone (vCard 3.0, item1.TEL, linhas dobradas, foto, aniversário, morada)
with open(os.path.join(AQUI, 'iphone.vcf'), 'w', encoding='utf-8', newline='') as f:
    f.write('BEGIN:VCARD\r\nVERSION:3.0\r\nPRODID:-//Apple Inc.//iPhone OS 17.0//EN\r\nN:Ferreira;Marta;;;\r\nFN:Marta Ferreira\r\n'
            'ORG:Florista Marta;\r\nitem1.TEL;type=pref:+351 926 111 222\r\nitem1.X-ABLabel:_$!<Mobile>!$_\r\n'
            'EMAIL;type=INTERNET;type=HOME;type=pref:marta@exemplo.pt\r\n'
            'item2.ADR;type=HOME;type=pref:;;Rua de Santa Catarina\\, 200;Porto;;4000-447;Portugal\r\nBDAY;value=date:1991-05-09\r\n'
            'NOTE:Gosta de rosas brancas\\nCompra no Dia da Mãe\r\nPHOTO;ENCODING=b;TYPE=JPEG:' + FOTO[:70] + '\r\n')
    for i in range(70, len(FOTO), 74):
        f.write(' ' + FOTO[i:i + 74] + '\r\n')
    f.write('END:VCARD\r\n')
    f.write('BEGIN:VCARD\r\nVERSION:3.0\r\nN:;;;;\r\nFN:Empresa de Limpezas Lda\r\nORG:Empresa de Limpezas Lda;\r\n'
            'TEL;type=WORK;type=VOICE:220 000 333\r\nEND:VCARD\r\n')

# 7) LibreOffice (Calc): converte o CSV do Google para .xlsx e um .xls antigo
for nome, alvo in (('excel-pt.csv', 'xlsx'), ('excel-pt.csv', 'xls')):
    subprocess.run(['soffice', '--headless', '--infilter=CSV:59,34,1,1', '--convert-to', alvo, '--outdir', AQUI,
                    os.path.join(AQUI, nome)], check=True, capture_output=True, timeout=120)
os.replace(os.path.join(AQUI, 'excel-pt.xlsx'), os.path.join(AQUI, 'libreoffice.xlsx'))
os.replace(os.path.join(AQUI, 'excel-pt.xls'), os.path.join(AQUI, 'antigo.xls'))
print(sorted(os.listdir(AQUI)))
