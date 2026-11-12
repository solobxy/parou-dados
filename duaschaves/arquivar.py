#!/usr/bin/env python3
"""DupliCasa - histórico dos anúncios (corre depois de cada recolha; não mexe no site).

O anuncios.json só tem os anúncios ativos: quando um sai, perdia-se para sempre. Este script guarda numa base
SQLite (<pasta>/historico.db), por anúncio, quando apareceu e quando foi visto pela última vez, os dados leves
(tipo, tipologia, área, local, particular, site) e cada renda diferente que teve. Dá para medir, só com dados
nossos: rendas por concelho ao longo do tempo, dias até sair do mercado, descidas de preço, oferta por tipologia.
Uso: arquivar.py <pasta> (a pasta do anuncios.json)
"""
import json, os, sqlite3, sys
from datetime import datetime
from zoneinfo import ZoneInfo

PASTA = sys.argv[1] if len(sys.argv) > 1 else '/var/lib/duaschaves-dados'
CAMPOS = ('fonte', 'tipo', 'tip', 'area', 'bairro', 'cidade', 'distrito', 'particular', 'data')


def main():
    dados = json.load(open(os.path.join(PASTA, 'anuncios.json'), encoding='utf-8'))
    hoje = datetime.now(ZoneInfo('Europe/Lisbon')).date().isoformat()
    db = sqlite3.connect(os.path.join(PASTA, 'historico.db'), timeout=30)
    db.executescript('''
      create table if not exists anuncios(id text primary key, primeiro_dia text, ultimo_dia text, fonte text, tipo text,
        tip text, area real, bairro text, cidade text, distrito text, particular integer, data_anuncio text);
      create table if not exists rendas(id text, dia text, renda integer, primary key(id, dia));
      create table if not exists dias(dia text primary key, ativos integer, novos integer, com_renda integer);
      create index if not exists anuncios_cidade on anuncios(cidade, ultimo_dia);''')
    novos = 0
    with db:
        for a in dados.get('anuncios') or []:
            i = a.get('id')
            if not i:
                continue
            v = [a.get(k) for k in CAMPOS]
            v[7] = 1 if v[7] else 0
            cur = db.execute('update anuncios set ultimo_dia=?, fonte=?, tipo=?, tip=?, area=?, bairro=?, cidade=?, distrito=?, '
                             'particular=?, data_anuncio=? where id=?', (hoje, *v, i))
            if cur.rowcount == 0:
                db.execute('insert into anuncios values (?,?,?,?,?,?,?,?,?,?,?,?)', (i, hoje, hoje, *v))
                novos += 1
            r = a.get('renda')
            if r is not None:
                ult = db.execute('select renda from rendas where id=? order by dia desc limit 1', (i,)).fetchone()
                if ult is None or ult[0] != r:   # só guarda quando a renda muda (e a primeira)
                    db.execute('insert or replace into rendas values (?,?,?)', (i, hoje, r))
        ativos = len(dados.get('anuncios') or [])
        com = sum(1 for a in dados.get('anuncios') or [] if a.get('renda') is not None)
        ant = db.execute('select novos from dias where dia=?', (hoje,)).fetchone()
        db.execute('insert or replace into dias values (?,?,?,?)', (hoje, ativos, novos + (ant[0] if ant else 0), com))
    print(f'histórico: {ativos} ativos, {novos} novos hoje; total no histórico: '
          f'{db.execute("select count(*) from anuncios").fetchone()[0]}')


if __name__ == '__main__':
    main()
