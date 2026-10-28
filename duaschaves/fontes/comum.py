"""Funções partilhadas pelos recolhedores."""
import html, re, unicodedata

MAX_DESC = 700
MAX_FOTOS = 8
PRECO_MIN, PRECO_MAX = 100, 20000


def txt(t):
    t = re.sub(r'<br\s*/?>|</p>|</li>|</div>', '\n', t or '', flags=re.I)
    t = html.unescape(re.sub(r'<[^>]+>', '', t))
    t = re.sub(r'[ \t\xa0]+', ' ', t)
    return re.sub(r'\n\s*\n+', '\n\n', t).strip()


def curto(t):
    t = txt(t)
    return t if len(t) <= MAX_DESC else t[:MAX_DESC].rsplit(' ', 1)[0] + '…'


def preco(t):
    """'6.200 €' -> 6200; fora de [PRECO_MIN, PRECO_MAX] -> None (preço claramente falso ou sob consulta)."""
    m = re.search(r'(\d{1,3}(?:[.\s\xa0]\d{3})+|\d+)(?:,\d+)?\s*(?:€|&#x20AC;|&euro;|EUR)', t or '')
    if not m:
        return None
    v = int(re.sub(r'\D', '', m.group(1)))
    return v if PRECO_MIN <= v <= PRECO_MAX else None


def area(t):
    m = re.search(r'(\d{1,5}(?:[.,]\d+)?)\s*m(?:²|2|&#xB2;|&sup2;)', t or '')
    if not m:
        return None
    v = float(m.group(1).replace(',', '.'))
    return int(round(v)) if 5 <= v <= 5000 else None


def tipologia(t):
    m = re.search(r'\bT\s?(\d{1,2})\b', t or '', re.I)
    return 'T' + m.group(1) if m else ''


def tipo_de(t):
    n = norm(t)
    if 'quarto' in n and not re.search(r'\bt\d', n):
        return 'Quarto'
    if 'moradia' in n or 'vivenda' in n or 'casa ' in n + ' ' and 'apartamento' not in n:
        return 'Moradia'
    return 'Apartamento'


def norm(t):
    return unicodedata.normalize('NFD', (t or '').lower()).encode('ascii', 'ignore').decode()


def attr(bloco, nome):
    m = re.search(r'\b' + nome + r'="([^"]*)"', bloco)
    return html.unescape(m.group(1)) if m else ''


def classe(bloco, nome):
    """Texto do primeiro elemento com esta classe (sem tags)."""
    m = re.search(r'class="[^"]*\b' + re.escape(nome) + r'\b[^"]*"[^>]*>(.*?)</(?:div|span|p|a|h\d)>', bloco, re.S)
    return txt(m.group(1)) if m else ''
