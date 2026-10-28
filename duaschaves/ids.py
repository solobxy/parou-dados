"""Número do anúncio no endereço do site (#casa-N), igual a idNum() em sites/duaschaves/index.html."""
import re


def id_num(i):
    i = str(i)
    m = re.fullmatch(r'imo-(\d+)', i)
    if m:
        return int(m.group(1))
    m = re.fullmatch(r'rent-([a-z0-9]{3,10})', i)
    if m:
        return 5 * 10**15 + int(m.group(1), 36)
    m = re.fullmatch(r'iad-(\d+)', i)
    if m:
        return 6 * 10**15 + int(m.group(1))
    m = re.fullmatch(r'super-(\d+)', i)
    if m:
        return 7 * 10**15 + int(m.group(1))
    m = re.match(r'sapo-([0-9a-f]{8})-?([0-9a-f]{4})', i, re.I)
    if m:
        return 8 * 10**15 + int(m.group(1) + m.group(2), 16) % 10**15
    d = re.sub(r'\D', '', i)[-15:]
    return int(d) if d else 0
