"""Ler as listas de contactos que as pessoas já têm: CSV, Excel (.xlsx) e contactos do telemóvel (.vcf).

Tudo devolve uma tabela: a primeira linha são os títulos, as outras são contactos. Só biblioteca padrão.
Os limites existem para um ficheiro estranho (ou feito de propósito) não deitar o servidor abaixo.
"""
import base64
import binascii
import csv
import io
import quopri
import re
import threading
import zipfile
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta

MAX_LINHAS = 10002          # títulos + 10 000 contactos (+1 para se saber que passou)
MAX_COLUNAS = 40
MAX_XLSX = 3 * 1024 * 1024  # ficheiro .xlsx
MAX_XML = 24 * 1024 * 1024  # cada parte do .xlsx depois de descomprimida (10 000 contactos com 12 colunas: uns 8 MB)
MAX_DESCOMP = 48 * 1024 * 1024
_LER_XLSX = threading.BoundedSemaphore(2)   # no máximo dois Excel a ser lidos ao mesmo tempo (a API tem 400 MB)


class FicheiroInvalido(ValueError):
    pass


def _limpa(v):
    return re.sub(r'\s+', ' ', str(v or '').replace(' ', ' ')).strip()


# ------------------------------------------------------------------ CSV

def ler_csv(texto):
    texto = texto.lstrip('﻿')
    amostra = texto[:4096]
    try:
        sep = csv.Sniffer().sniff(amostra, delimiters=',;\t').delimiter
    except csv.Error:
        sep = max(';,\t', key=amostra.count) if any(x in amostra for x in ';,\t') else ','
    linhas = []
    for i, l in enumerate(csv.reader(io.StringIO(texto), delimiter=sep)):
        if i >= MAX_LINHAS:
            break
        if any(x.strip() for x in l):
            linhas.append([x.strip() for x in l][:MAX_COLUNAS])
    return linhas


# ------------------------------------------------------------------ Excel (.xlsx)

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
NS_R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
DATAS_FIXAS = set(range(14, 23)) | {27, 30, 36, 45, 46, 47, 50, 57}


def _xml(zf, nome):
    try:
        info = zf.getinfo(nome)
    except KeyError:
        return None
    if info.file_size > MAX_XML:
        raise FicheiroInvalido('O ficheiro Excel é grande demais. Divide-o em partes ou guarda como CSV.')
    dados = zf.read(nome)
    # um .xlsx verdadeiro nunca traz DOCTYPE; recusar evita entidades XML maliciosas
    if b'<!DOCTYPE' in dados[:2048].upper() or b'<!ENTITY' in dados.upper():
        raise FicheiroInvalido('Este ficheiro Excel tem um formato que não conseguimos ler.')
    return dados


def _col(ref):
    n = 0
    for ch in ref:
        if 'A' <= ch <= 'Z':
            n = n * 26 + ord(ch) - 64
        else:
            break
    return n - 1


def _numero(v):
    try:
        f = float(v)
    except ValueError:
        return v
    if f.is_integer() and abs(f) < 1e15:
        return str(int(f))
    return ('%.10f' % f).rstrip('0').rstrip('.')


def _data_excel(v, sistema_1904=False):
    try:
        f = float(v)
    except ValueError:
        return v
    if not (0 < f < 2958466):
        return _numero(v)
    base = datetime(1904, 1, 1) if sistema_1904 else datetime(1899, 12, 30)
    d = base + timedelta(days=f)
    return d.strftime('%Y-%m-%d') if d.hour == 0 and d.minute == 0 else d.strftime('%Y-%m-%d %H:%M')


def ler_xlsx(dados):
    if len(dados) > MAX_XLSX:
        raise FicheiroInvalido('O ficheiro tem mais de 3 MB. Divide-o em partes.')
    if dados[:4] != b'PK\x03\x04':
        if dados[:8] == b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':
            raise FicheiroInvalido('Este é um Excel antigo (.xls). No Excel, faz Ficheiro → Guardar como → Livro do Excel (.xlsx) ou CSV.')
        raise FicheiroInvalido('Este ficheiro não é um Excel (.xlsx) válido.')
    try:
        zf = zipfile.ZipFile(io.BytesIO(dados))
        infos = zf.infolist()
    except (zipfile.BadZipFile, ValueError):
        raise FicheiroInvalido('Este ficheiro Excel está danificado. Abre-o e guarda outra vez.')
    if len(infos) > 2000 or sum(i.file_size for i in infos) > MAX_DESCOMP:
        raise FicheiroInvalido('O ficheiro Excel é grande demais. Divide-o em partes ou guarda como CSV.')
    if not _LER_XLSX.acquire(timeout=20):
        raise FicheiroInvalido('Estamos a ler outros ficheiros neste momento. Tenta daqui a um minuto.')
    try:
        return _ler_xlsx(zf)
    except FicheiroInvalido:
        raise
    except (ET.ParseError, KeyError, ValueError, zipfile.BadZipFile, RuntimeError, NotImplementedError, EOFError, OSError):
        raise FicheiroInvalido('Não conseguimos ler este Excel. Experimenta guardá-lo como CSV.')
    finally:
        _LER_XLSX.release()


def _ler_xlsx(zf):
    # folhas pela ordem do livro (a primeira com contactos é a que conta)
    folhas = []
    sistema_1904 = False
    wb = _xml(zf, 'xl/workbook.xml')
    if wb:
        raiz = ET.fromstring(wb)
        pr = raiz.find(NS + 'workbookPr')
        sistema_1904 = pr is not None and pr.get('date1904') in ('1', 'true')
        rels = _xml(zf, 'xl/_rels/workbook.xml.rels')
        alvos = {}
        if rels:
            for r in ET.fromstring(rels):
                alvo = r.get('Target', '')
                alvo = alvo.lstrip('/') if alvo.startswith('/') else 'xl/' + alvo
                alvos[r.get('Id')] = alvo
        for sh in raiz.iter(NS + 'sheet'):
            if sh.get('state') in ('hidden', 'veryHidden'):
                continue
            a = alvos.get(sh.get(NS_R + 'id'))
            if a and a not in folhas:
                folhas.append(a)
    if not folhas:
        folhas = sorted(n for n in zf.namelist() if re.fullmatch(r'xl/worksheets/sheet\d+\.xml', n))
    # textos partilhados
    textos = []
    ss = _xml(zf, 'xl/sharedStrings.xml')
    if ss:
        for _, si in ET.iterparse(io.BytesIO(ss), events=('end',)):
            if si.tag != NS + 'si':
                continue
            # rPh = guia de leitura fonética (japonês); não faz parte do texto
            foneticos = {id(t) for rph in si.iter(NS + 'rPh') for t in rph.iter(NS + 't')}
            textos.append(''.join(t.text or '' for t in si.iter(NS + 't') if id(t) not in foneticos))
            si.clear()
        del ss
    # estilos que são datas
    estilo_data = []
    st = _xml(zf, 'xl/styles.xml')
    if st:
        raiz = ET.fromstring(st)
        formatos = {}
        for nf in raiz.iter(NS + 'numFmt'):
            cod = re.sub(r'"[^"]*"|\[[^\]]*\]|\\.', '', nf.get('formatCode', '')).lower()
            formatos[int(nf.get('numFmtId', 0))] = bool(re.search(r'[dmy]', cod)) and not re.search(r'[0#]', cod)
        xfs = raiz.find(NS + 'cellXfs')
        if xfs is not None:
            for xf in xfs.findall(NS + 'xf'):
                n = int(xf.get('numFmtId', 0))
                estilo_data.append(formatos.get(n, n in DATAS_FIXAS))
    for folha in folhas[:20]:
        dados = _xml(zf, folha)
        if dados is None:
            continue
        linhas = _ler_folha(dados, textos, estilo_data, sistema_1904)
        if len(linhas) >= 2:
            return linhas
    raise FicheiroInvalido('Este Excel não tem nenhuma folha com contactos.')


def _ler_folha(dados, textos, estilo_data, sistema_1904):
    linhas = []
    for _, el in ET.iterparse(io.BytesIO(dados), events=('end',)):
        if el.tag != NS + 'row':
            continue
        linha = {}
        prox = 0
        for cel in el.findall(NS + 'c'):
            ref = cel.get('r')
            i = _col(ref) if ref else prox
            prox = i + 1
            if i < 0 or i >= MAX_COLUNAS:
                continue
            t = cel.get('t', 'n')
            v = cel.find(NS + 'v')
            v = v.text if v is not None and v.text is not None else ''
            if t == 's':
                v = textos[int(v)] if v.isdigit() and int(v) < len(textos) else ''
            elif t == 'inlineStr':
                v = ''.join(x.text or '' for x in cel.iter(NS + 't'))
            elif t == 'b':
                v = 'sim' if v == '1' else 'não'
            elif t == 'e':
                v = ''
            elif t in ('n', 'd') and v:
                s = int(cel.get('s', 0) or 0)
                if t == 'd':
                    v = v[:10]
                elif s < len(estilo_data) and estilo_data[s]:
                    v = _data_excel(v, sistema_1904)
                else:
                    v = _numero(v)
            linha[i] = _limpa(v)
        el.clear()
        if any(linha.values()):
            n = max(linha) + 1
            linhas.append([linha.get(i, '') for i in range(n)])
            if len(linhas) >= MAX_LINHAS:
                break
    # todas as linhas com o mesmo número de colunas que os títulos
    if linhas:
        larg = max(len(l) for l in linhas)
        linhas = [l + [''] * (larg - len(l)) for l in linhas]
    return linhas


# ------------------------------------------------------------------ contactos do telemóvel (.vcf)

COLS_VCF = ['Nome', 'Telefone', 'E-mail', 'Empresa', 'Morada', 'Localidade', 'Código postal', 'Nascimento', 'Notas', 'Etiquetas']


def _desdobrar(texto):
    """Junta as linhas dobradas (continuação começa por espaço) e as quebras «soft» do quoted-printable."""
    out = []
    for l in texto.replace('\r\n', '\n').replace('\r', '\n').split('\n'):
        if l[:1] in (' ', '\t') and out:
            out[-1] += l[1:]
        elif out and out[-1].endswith('=') and 'QUOTED-PRINTABLE' in out[-1].split(':', 1)[0].upper():
            out[-1] = out[-1][:-1] + l
        else:
            out.append(l)
    return out


def _valor(params, v):
    p = params.upper()
    if 'QUOTED-PRINTABLE' in p:
        cs = re.search(r'CHARSET=([A-Za-z0-9_-]+)', params, re.I)
        try:
            v = quopri.decodestring(v.encode('latin-1', 'replace')).decode(cs.group(1) if cs else 'utf-8', 'replace')
        except LookupError:
            v = quopri.decodestring(v.encode('latin-1', 'replace')).decode('utf-8', 'replace')
    elif 'ENCODING=B' in p or 'BASE64' in p:
        return ''
    return v


def _partes(v):
    """Separa por ; respeitando \\; e tira os escapes do vCard."""
    out, atual, esc = [], '', False
    for ch in v:
        if esc:
            atual += {'n': ' ', 'N': ' '}.get(ch, ch)
            esc = False
        elif ch == '\\':
            esc = True
        elif ch == ';':
            out.append(atual)
            atual = ''
        else:
            atual += ch
    out.append(atual)
    return [_limpa(x) for x in out]


def _data_vcf(v):
    v = v.strip()
    m = re.match(r'^(\d{4})-?(\d{2})-?(\d{2})', v)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
        except ValueError:
            return ''
    return ''


def ler_vcf(texto):
    texto = texto.lstrip('﻿')
    if 'BEGIN:VCARD' not in texto.upper():
        raise FicheiroInvalido('Este ficheiro não tem contactos (.vcf). Exporta outra vez a partir dos Contactos do telemóvel.')
    linhas = [COLS_VCF]
    cartao = None
    for l in _desdobrar(texto):
        if not l.strip():
            continue
        chave, sep, v = l.partition(':')
        if not sep:
            continue
        nome_prop, _, params = chave.partition(';')
        prop = nome_prop.split('.')[-1].upper()   # «item1.TEL» (iPhone) → TEL
        if prop == 'BEGIN' and v.strip().upper() == 'VCARD':
            cartao = {'fn': '', 'n': '', 'tels': [], 'emails': [], 'org': '', 'adr': None, 'bday': '', 'notas': [], 'cat': []}
            continue
        if cartao is None:
            continue
        if prop == 'END' and v.strip().upper() == 'VCARD':
            linhas.append(_linha_vcf(cartao))
            cartao = None
            if len(linhas) >= MAX_LINHAS:
                break
            continue
        if prop == 'PHOTO' or prop == 'LOGO' or prop == 'SOUND' or prop == 'KEY':
            continue
        v = _valor(params, v)
        if prop == 'FN':
            cartao['fn'] = _limpa(' '.join(x for x in _partes(v) if x))
        elif prop == 'N':
            p = _partes(v) + [''] * 5
            # família; próprio; outros; prefixo; sufixo
            cartao['n'] = _limpa(' '.join(x for x in (p[3], p[1], p[2], p[0], p[4]) if x))
        elif prop == 'TEL':
            t = _limpa(v.replace('tel:', ''))
            if t and t not in [x for _, x in cartao['tels']]:
                cartao['tels'].append((0 if re.search(r'CELL|MOBILE|IPHONE', params, re.I) else 1, t))
        elif prop == 'EMAIL':
            e = _limpa(v)
            if e:
                cartao['emails'].append(e)
        elif prop == 'ORG':
            cartao['org'] = next((x for x in _partes(v) if x), '')
        elif prop == 'ADR' and cartao['adr'] is None:
            cartao['adr'] = _partes(v) + [''] * 7
        elif prop == 'BDAY':
            cartao['bday'] = _data_vcf(v)
        elif prop == 'NOTE':
            n = v.replace('\\n', '\n').replace('\\N', '\n').replace('\\,', ',').replace('\\;', ';').strip()
            if n:
                cartao['notas'].append(n)
        elif prop == 'CATEGORIES':
            for x in v.replace('\\,', '\x00').split(','):
                x = x.replace('\x00', ',').strip()
                if x and x.lower() not in ('mycontacts', 'starred') and x not in cartao['cat']:
                    cartao['cat'].append(x)
    return linhas


def _linha_vcf(k):
    nome = k['fn'] or k['n']
    adr = k['adr'] or [''] * 7
    # ADR: caixa postal; extra; rua; localidade; região; código postal; país
    morada = _limpa(' '.join(x for x in (adr[2], adr[1]) if x))
    notas = list(k['notas'])
    tels = [t for _, t in sorted(k['tels'], key=lambda x: x[0])]   # o telemóvel primeiro (é o que serve para SMS e WhatsApp)
    if len(tels) > 1:
        notas.append('Outros telefones: ' + ', '.join(tels[1:]))
    if len(k['emails']) > 1:
        notas.append('Outros e-mails: ' + ', '.join(k['emails'][1:]))
    return [nome, tels[0] if tels else '', k['emails'][0] if k['emails'] else '', k['org'], morada, adr[3], adr[5],
            k['bday'], '\n'.join(notas), ', '.join(k['cat'][:10])]


# ------------------------------------------------------------------ depois de ler

PROPRIO = ['first name', 'given name', 'nome proprio', 'primeiro nome', 'nome próprio']
MEIO = ['middle name', 'additional name', 'nome do meio', 'segundo nome']
APELIDO = ['last name', 'family name', 'apelido', 'sobrenome', 'ultimo nome', 'último nome', 'apelidos']


def juntar_nomes(linhas, normalizar):
    """Google Contacts e Outlook separam o nome em próprio + apelido; junta-os numa coluna «Nome»."""
    if not linhas:
        return linhas
    cab = [normalizar(x).strip() for x in linhas[0]]
    def achar(nomes):
        alvo = {normalizar(x) for x in nomes}
        return next((i for i, x in enumerate(cab) if x in alvo), None)
    ip, im, ia = achar(PROPRIO), achar(MEIO), achar(APELIDO)
    if ip is None and ia is None:
        return linhas
    ja = {normalizar(x) for x in ('nome', 'name', 'nome completo', 'full name', 'display name', 'cliente')}
    i_nome = next((i for i, x in enumerate(cab) if x in ja), None)
    if i_nome is not None and sum(1 for l in linhas[1:] if i_nome < len(l) and l[i_nome].strip()) >= (len(linhas) - 1) * 0.8:
        return linhas
    out = [list(linhas[0]) + ['Nome']]
    for l in linhas[1:]:
        partes = [l[i] for i in (ip, im, ia) if i is not None and i < len(l) and l[i].strip()]
        completo = _limpa(' '.join(partes)) or (l[i_nome] if i_nome is not None and i_nome < len(l) else '')
        out.append(list(l) + [completo])
    if i_nome is not None:
        # a coluna antiga deixa de ser o «nome» (era quase sempre vazia)
        out[0][i_nome] = out[0][i_nome] + ' (original)'
    return out


def ler_pedido(d):
    """Lê o ficheiro que veio da app: {csv: texto} | {vcf: texto} | {xlsx: base64}."""
    if isinstance(d.get('xlsx'), str) and d['xlsx']:
        try:
            dados = base64.b64decode(d['xlsx'], validate=True)
        except (binascii.Error, ValueError):
            raise FicheiroInvalido('Não conseguimos ler este ficheiro. Escolhe-o outra vez.')
        return ler_xlsx(dados)
    if isinstance(d.get('vcf'), str) and d['vcf'].strip():
        return ler_vcf(d['vcf'])
    texto = d.get('csv')
    if isinstance(texto, str) and texto.strip():
        if 'BEGIN:VCARD' in texto[:2000].upper():
            return ler_vcf(texto)
        return ler_csv(texto)
    raise FicheiroInvalido('Escolhe um ficheiro com os teus contactos (Excel, CSV ou contactos do telemóvel).')
