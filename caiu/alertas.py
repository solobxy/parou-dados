#!/usr/bin/env python3
"""caiu.pt — avisos depois de cada recolha (caiu-alertas.service, chamado no fim da caiu-recolha).

1. Envia as confirmações que ficaram por enviar (quando o e-mail ainda não estava ligado).
2. Quem segue produtos recebe um e-mail (ou notificação no telemóvel) quando o preço mais baixo desce pelo menos
   2 % e 5 cêntimos face ao preço de quando começou a seguir (ou do último aviso). Um aviso por recolha, no máximo.
3. À quinta, depois da recolha da manhã: os descontos a sério da semana a quem pediu o resumo semanal.
4. Avisa o administrador se uma loja falhar na recolha.
"""
import datetime, json, os, re, sys, time
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import comum as C

LX = ZoneInfo('Europe/Lisbon')
DESCIDA_PCT, DESCIDA_MIN = 0.02, 0.05
P = C.Produtos()


def qtd(t):
    t = re.sub(r'^emb\.\s*', '', t or '', flags=re.I)
    t = re.sub(r'^Quant\.\s*M[ií]nima\s*=\s*', 'mín. ', t, flags=re.I)
    t = re.sub(r'(\d)\.(\d)', r'\1,\2', t)
    t = re.sub(r'\bKg\b', 'kg', t)
    t = re.sub(r'\bgr\b', 'g', t)
    return re.sub(r'\blt\b', 'L', t, flags=re.I)


def ler(nome, padrao):
    try:
        with open(os.path.join(C.DADOS, nome), encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return padrao


def descidas(seguidos):
    """seguidos: linhas com produto, nome, ref -> [(linha, mínimo, loja, veredito)] dos que desceram."""
    out = []
    for s in seguidos:
        m = P.minimo(s['produto'])
        if not m:
            continue
        mn, loja, v = m
        if mn <= s['ref'] * (1 - DESCIDA_PCT) and s['ref'] - mn >= DESCIDA_MIN - 1e-9:
            out.append((s, mn, loja, v))
    return out


def linhas_email(base, ds):
    txt, html = [], []
    for s, mn, loja, v in ds[:12]:
        a = P.g.get(s['produto'])
        nome = a[1] if a else s['nome']
        q = qtd(a[3]) if a else ''
        serio = v == 'real'
        txt.append('- %s %s: %s no %s (antes %s)%s\n  %s/#p=%s' % (nome, q, C.eur(mn), C.LOJAS[loja], C.eur(s['ref']),
                                                                ' · mais barato do mês' if serio else '', base, s['produto']))
        html.append(
            '<tr><td style="padding:12px 0;border-top:2px solid #F2F2EC">'
            '<a href="%s/#p=%s" style="color:#141414;text-decoration:none;font-weight:700">%s</a>'
            '<div style="font-size:13px;color:#55554F">%s%s</div></td>'
            '<td align="right" style="padding:12px 0 12px 12px;border-top:2px solid #F2F2EC;white-space:nowrap">'
            '<div style="font-size:22px;font-weight:900">%s</div>'
            '<div style="font-size:13px;color:#55554F">no %s · <s>%s</s></div></td></tr>' % (
                base, s['produto'], C.esc(nome), C.esc(q),
                ' · <b style="color:#0B7A43">mais barato do mês</b>' if serio else '',
                C.eur(mn), C.LOJAS[loja], C.eur(s['ref'])))
    return '\n'.join(txt), '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + ''.join(html) + '</table>'


def rodape(base, token, n_seguidos):
    return ('Segues %d %s no caiu.pt. <a href="%s/#conta=%s" style="color:#141414">Gerir avisos</a> · '
            '<a href="%s/api/sair?t=%s" style="color:#141414">Deixar de receber</a>') % (
        n_seguidos, 'produto' if n_seguidos == 1 else 'produtos', base, token, base, token)


def avisos_email(c, base):
    enviados = 0
    for p in c.execute('SELECT * FROM pessoas WHERE confirmado>0 AND saiu=0').fetchall():
        seg = c.execute('SELECT * FROM seguidos WHERE pessoa=?', (p['id'],)).fetchall()
        ds = descidas(seg)
        if not ds:
            continue
        ds.sort(key=lambda d: (d[0]['ref'] - d[1]) / d[0]['ref'], reverse=True)
        s0, mn0, l0, _ = ds[0]
        a0 = P.g.get(s0['produto'])
        assunto = ('Baixou: %s (%s no %s)' % ((a0[1] if a0 else s0['nome'])[:60], C.eur(mn0), C.LOJAS[l0])) if len(ds) == 1 \
            else '%d produtos que segues baixaram de preço' % len(ds)
        txt, tabela = linhas_email(base, ds)
        corpo = ('<p style="margin:0 0 6px;font-size:22px;font-weight:800;line-height:1.2">%s</p>'
                 '<p style="margin:0 0 10px;color:#55554F">Preços de hoje nas lojas online. Na loja física podem variar.</p>%s'
                 '<p style="margin:22px 0 4px"><a href="%s/#seguidos" style="display:inline-block;background:#141414;color:#FFFFFF;'
                 'text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px">Ver no caiu.pt</a></p>') % (
            'Baixou de preço' if len(ds) == 1 else '%d produtos baixaram' % len(ds), tabela, base)
        r = C.enviar_email(p['email'], assunto, 'Preços que baixaram:\n\n' + txt + '\n\nGerir avisos: %s/#conta=%s\nDeixar de receber: %s/api/sair?t=%s'
                           % (base, p['token'], base, p['token']),
                           C.molde_email(assunto, corpo, rodape(base, p['token'], len(seg))), '%s/api/sair?t=%s' % (base, p['token']))
        c.execute('INSERT INTO envios VALUES(?,?,?)', (int(time.time()), 'aviso', {True: 'ok', False: 'falhou', None: 'sem_servico'}[r]))
        if r:
            agora = int(time.time())
            for s, mn, _, _ in ds:
                c.execute('UPDATE seguidos SET ref=?, avisado=? WHERE pessoa=? AND produto=?', (mn, agora, p['id'], s['produto']))
            enviados += 1
    return enviados


def semana_iso(d):
    a, s, _ = d.isocalendar()
    return '%d-%02d' % (a, s)


def resumo_semanal(c, base, agora):
    """À quinta, a partir das 7:00: os melhores descontos a sério e as promoções de fachada da semana."""
    if agora.weekday() != 3 or agora.hour < 7:
        return 0
    sem = semana_iso(agora)
    R = ler('resumo.json', {})
    if not R:
        return 0
    reais = R.get('reais') or []
    fach = R.get('fachada') or []
    cb = R.get('cabaz') or {}
    def bloco(titulo, gs, cor, fachada=False):
        if not gs:
            return ''
        linhas = []
        for g in gs[:6]:
            barato = min(g[7], key=lambda o: o[2])
            o = next((x for x in g[7] if x[8] == 'fachada'), barato) if fachada else barato
            extra = ('<div style="font-size:12px;font-weight:400;color:#55554F">no %s · no %s: %s</div>' % (C.LOJAS[o[0]], C.LOJAS[barato[0]], C.eur(barato[2]))
                     if fachada and barato is not o else '<div style="font-size:12px;font-weight:400;color:#55554F">no %s</div>' % C.LOJAS[o[0]])
            linhas.append('<tr><td style="padding:10px 0;border-top:2px solid #F2F2EC"><a href="%s/#p=%s" style="color:#141414;'
                          'text-decoration:none;font-weight:700">%s</a><div style="font-size:13px;color:#55554F">%s</div></td>'
                          '<td align="right" style="padding:10px 0 10px 12px;border-top:2px solid #F2F2EC;white-space:nowrap;'
                          'font-weight:900;font-size:19px">%s%s</td></tr>' % (
                              base, g[0], C.esc(g[1]), C.esc(qtd(g[3])), C.eur(o[2]), extra))
        return ('<p style="margin:22px 0 4px;font-size:18px;font-weight:800;color:%s">%s</p>'
                '<table role="presentation" width="100%%" cellpadding="0" cellspacing="0">%s</table>') % (cor, titulo, ''.join(linhas))
    totais = cb.get('totais') or {}
    cabaz = ''
    if totais:
        ordem = sorted(totais, key=lambda k: totais[k])
        cabaz = ('<p style="margin:22px 0 0">Os mesmos %d produtos custam hoje %s.%s</p>' % (
            cb.get('n', 0), ', '.join('%s no %s' % (C.eur(totais[k]), C.LOJAS[k]) for k in ordem),
            (' Dividindo a compra pelas lojas: <b>%s</b>.' % C.eur(cb['dividir'])) if cb.get('dividir') else ''))
    assunto = 'Os descontos a sério desta semana' + (' (%d)' % len(reais) if reais else '')
    corpo = ('<p style="margin:0 0 6px;font-size:22px;font-weight:800;line-height:1.2">Os descontos a sério desta semana</p>'
             '<p style="margin:0 0 6px;color:#55554F">Preços mais baixos do que em qualquer dia dos 30 anteriores, e as promoções '
             'que estão mais caras do que noutra loja.</p>%s%s%s'
             '<p style="margin:24px 0 4px"><a href="%s" style="display:inline-block;background:#141414;color:#FFFFFF;text-decoration:none;'
             'font-weight:700;padding:14px 22px;border-radius:999px">Ver tudo no caiu.pt</a></p>') % (
        bloco('Desceram a sério', reais, '#0B7A43'), bloco('Em promoção, mas mais caro ao lado', fach[:4], '#D0242C', True), cabaz, base)
    txt = 'Os descontos a sério desta semana: %s\n' % base
    n = 0
    for p in c.execute("SELECT * FROM pessoas WHERE confirmado>0 AND saiu=0 AND semanal=1 AND ultimo_semanal<>?", (sem,)).fetchall():
        nseg = c.execute('SELECT count(*) FROM seguidos WHERE pessoa=?', (p['id'],)).fetchone()[0]
        rod = ('Recebes isto porque pediste o resumo semanal no caiu.pt. <a href="%s/#conta=%s" style="color:#141414">Gerir avisos</a> · '
               '<a href="%s/api/sair?t=%s" style="color:#141414">Deixar de receber</a>') % (base, p['token'], base, p['token'])
        r = C.enviar_email(p['email'], assunto, txt + '\nDeixar de receber: %s/api/sair?t=%s' % (base, p['token']),
                           C.molde_email(assunto, corpo, rod), '%s/api/sair?t=%s' % (base, p['token']))
        c.execute('INSERT INTO envios VALUES(?,?,?)', (int(time.time()), 'semanal', {True: 'ok', False: 'falhou', None: 'sem_servico'}[r]))
        if r:
            c.execute('UPDATE pessoas SET ultimo_semanal=? WHERE id=?', (sem, p['id']))
            n += 1
    # notificações no telemóvel com o resumo da semana
    if reais:
        priv, pub = C.chaves_vapid()
        for s in c.execute("SELECT * FROM push WHERE semanal=1 AND ultimo_semanal<>?", (sem,)).fetchall():
            st = C.enviar_push(dict(s), {'title': 'Os descontos a sério desta semana',
                                         'body': '%d produtos estão mais baratos do que em todo o mês. O primeiro: %s.' % (len(reais), reais[0][1]),
                                         'url': '/#reais', 'tag': 'semanal'}, priv, pub)
            tratar_push(c, s, st, {'ultimo_semanal': sem})
    return n


def tratar_push(c, s, st, atualizar=None):
    if st in (200, 201, 202):
        for k, v in (atualizar or {}).items():
            c.execute('UPDATE push SET %s=?, falhas=0 WHERE id=?' % k, (v, s['id']))
        return True
    if st in (404, 410):              # o navegador deixou de aceitar: apagar
        c.execute('DELETE FROM push_seguidos WHERE push=?', (s['id'],))
        c.execute('DELETE FROM push WHERE id=?', (s['id'],))
    else:
        c.execute('UPDATE push SET falhas=falhas+1 WHERE id=?', (s['id'],))
        c.execute('DELETE FROM push WHERE falhas>=10')
    return False


def avisos_push(c):
    priv, pub = C.chaves_vapid()
    n = 0
    for s in c.execute('SELECT * FROM push').fetchall():
        seg = c.execute('SELECT * FROM push_seguidos WHERE push=?', (s['id'],)).fetchall()
        ds = descidas(seg)
        if not ds:
            continue
        ds.sort(key=lambda d: (d[0]['ref'] - d[1]) / d[0]['ref'], reverse=True)
        s0, mn0, l0, _ = ds[0]
        nome0 = (P.g.get(s0['produto']) or [0, s0['nome']])[1]
        if len(ds) == 1:
            msg = {'title': 'Baixou: %s' % nome0[:70], 'body': 'Agora %s no %s (antes %s).' % (C.eur(mn0), C.LOJAS[l0], C.eur(s0['ref'])),
                   'url': '/#p=%s' % s0['produto'], 'tag': 'p-' + s0['produto']}
        else:
            msg = {'title': '%d produtos que segues baixaram' % len(ds),
                   'body': '%s: %s no %s, e mais %d.' % (nome0[:50], C.eur(mn0), C.LOJAS[l0], len(ds) - 1), 'url': '/#seguidos', 'tag': 'seguidos'}
        if tratar_push(c, s, C.enviar_push(dict(s), msg, priv, pub)):
            agora = int(time.time())
            for d in ds:
                c.execute('UPDATE push_seguidos SET ref=?, avisado=? WHERE push=? AND produto=?', (d[1], agora, s['id'], d[0]['produto']))
            n += 1
    return n


def confirmacoes_pendentes(c, base):
    """Quem pediu avisos quando o e-mail ainda não estava ligado recebe agora a confirmação."""
    if not C.RESEND:
        return 0
    import api
    n = 0
    lim = int(time.time()) - 7 * 86400
    for p in c.execute('SELECT * FROM pessoas WHERE confirmado=0 AND saiu=0 AND conf_enviado=0 AND criado>?', (lim,)).fetchall():
        seg = [(s['produto'], s['ref'], s['nome']) for s in c.execute('SELECT * FROM seguidos WHERE pessoa=?', (p['id'],)).fetchall()]
        if api.email_confirmar(base, p, seg):
            c.execute('UPDATE pessoas SET conf_enviado=?, conf_vezes=1 WHERE id=?', (int(time.time()), p['id']))
            n += 1
    # pedidos nunca confirmados saem ao fim de 30 dias (só se guarda o necessário)
    velhos = [r['id'] for r in c.execute('SELECT id FROM pessoas WHERE confirmado=0 AND criado<?', (int(time.time()) - 30 * 86400,)).fetchall()]
    for i in velhos:
        c.execute('DELETE FROM seguidos WHERE pessoa=?', (i,))
        c.execute('DELETE FROM pessoas WHERE id=?', (i,))
    return n


def vigiar_recolha(agora):
    """E-mail ao administrador (uma vez por dia) se uma loja falhou ou trouxe muito menos produtos."""
    if not C.ADMIN:
        return
    est = ler('estado.json', {})
    problemas = []
    for loja, e in (est.get('lojas') or {}).items():
        ped, fal, prod = e.get('pedidos', 0), e.get('falhas', 0), e.get('produtos', 0)
        if ped and fal / ped > 0.3:
            problemas.append('%s: %d de %d pesquisas falharam (códigos %s)' % (loja, fal, ped, e.get('codigos')))
        elif prod < 1500:
            problemas.append('%s: só %d produtos' % (loja, prod))
    if not problemas:
        return
    f = os.path.join(C.ESTADO, 'aviso-admin.txt')
    hoje = agora.date().isoformat()
    try:
        if open(f).read().strip() == hoje:
            return
    except OSError:
        pass
    txt = 'A recolha de %s teve problemas:\n\n%s\n' % (est.get('inicio', '?'), '\n'.join(problemas))
    if C.enviar_email(C.ADMIN, 'caiu.pt: problema na recolha de preços', txt,
                      C.molde_email('Problema na recolha', '<pre style="white-space:pre-wrap;font-family:inherit">%s</pre>' % C.esc(txt), '')):
        with open(f, 'w') as fh:
            fh.write(hoje)


def termos_extra(c):
    """As pesquisas sem resultado dos últimos 14 dias (até 40) passam para a recolha seguinte."""
    lim = int(time.time()) - 14 * 86400
    c.execute('DELETE FROM sem_resultado WHERE ultimo<?', (lim,))
    termos = [r['termo'] for r in c.execute('SELECT termo FROM sem_resultado ORDER BY vezes DESC, ultimo DESC LIMIT 40')]
    f = os.path.join(C.ESTADO, 'termos-extra.txt')
    with open(f + '.tmp', 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(termos) + ('\n' if termos else ''))
    os.replace(f + '.tmp', f)
    return len(termos)


def main():
    P.atualizar()
    if not P.g:
        print('sem produtos', file=sys.stderr)
        return
    agora = datetime.datetime.now(LX)
    base = C.site_no_ar()
    with C.ligar() as c:
        n_conf = confirmacoes_pendentes(c, base)
        n_mail = avisos_email(c, base)
        n_push = avisos_push(c)
        n_sem = resumo_semanal(c, base, agora)
        c.execute('DELETE FROM envios WHERE ts<?', (int(time.time()) - 90 * 86400,))
        n_termos = termos_extra(c)
    vigiar_recolha(agora)
    estado = {'quando': agora.isoformat(timespec='seconds'), 'site': base, 'email_ligado': bool(C.RESEND),
              'confirmacoes': n_conf, 'avisos_email': n_mail, 'avisos_push': n_push, 'semanal': n_sem, 'termos_extra': n_termos}
    with open(os.path.join(C.ESTADO, 'alertas.json'), 'w') as f:
        json.dump(estado, f)
    print(json.dumps(estado, ensure_ascii=False))


if __name__ == '__main__':
    main()
