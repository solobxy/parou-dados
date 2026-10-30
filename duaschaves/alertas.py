#!/usr/bin/env python3
"""Duplicasa: envia os alertas por e-mail.

Corre depois de cada recolha (duaschaves-alertas.timer). Para cada alerta ativo procura casas novas
desde o último envio que cumprem o filtro:
  - quem tem acesso ativo recebe logo (alerta «no minuto», na prática a cada 30 min, que é a recolha);
  - os outros recebem um resumo por dia, depois das 19:00 (hora de Lisboa).
Sem RESEND_API_KEY não envia nada (fica tudo à espera). Cada e-mail tem um link para parar o alerta.
"""
import datetime, html, json, os, sys, time, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import api
from ids import id_num

ANUNCIOS = os.environ.get('DC_ANUNCIOS', '/var/lib/duaschaves-dados/anuncios.json')
HORA_RESUMO = 19
MAX_CASAS = 8
try:
    from zoneinfo import ZoneInfo
    LX = ZoneInfo('Europe/Lisbon')
except Exception:
    LX = datetime.timezone.utc


def norm(t):
    return ''.join(ch for ch in unicodedata.normalize('NFD', str(t or '')) if unicodedata.category(ch) != 'Mn').lower().strip()


def quando(a):
    try:
        return int(datetime.datetime.strptime(a['data'][:19], '%Y-%m-%dT%H:%M:%S').replace(tzinfo=datetime.timezone.utc).timestamp())
    except Exception:
        return 0


def cumpre(a, f):
    cid = norm(f.get('cidade'))
    if cid and not any(cid in norm(a.get(k)) for k in ('cidade', 'bairro', 'distrito')):
        return False
    r = a.get('renda')
    if f.get('precoMax') and (not r or r > f['precoMax']):
        return False
    if f.get('comPreco') and not r:
        return False
    if f.get('areaMin') and not ((a.get('area') or 0) >= f['areaMin']):
        return False
    if f.get('tipoImovel') and a.get('tipo') != f['tipoImovel']:
        return False
    if f.get('soPart') and not a.get('particular'):
        return False
    if f.get('soFotos') and not a.get('fotos'):
        return False
    if f.get('semCaucao') and a.get('caucao') and a.get('caucao') != 'Sem caução':   # sem informação também conta
        return False
    if f.get('soProt'):
        return False                        # as casas recolhidas não têm pagamento protegido
    tips = f.get('tips') or []
    if tips:
        t = 'Quarto' if a.get('tipo') == 'Quarto' else (a.get('tip') or '')
        if t.startswith('T') and t[1:].isdigit() and int(t[1:]) >= 3:
            t = 'T3+'
        if t not in tips:
            return False
    return True


def desc_filtro(f):
    p = [f.get('cidade') or 'Todo o país']
    if f.get('precoMax'):
        p.append('até %d €' % f['precoMax'])
    if f.get('tips'):
        p.append(', '.join(f['tips']))
    if f.get('tipoImovel'):
        p.append(f['tipoImovel'])
    return ' · '.join(p)


def email_casas(base, f, casas, parar):
    titulo = '%d %s em %s' % (len(casas), 'casa nova' if len(casas) == 1 else 'casas novas', f.get('cidade') or 'Portugal')
    linhas_txt, linhas_html = [], []
    for a in casas[:MAX_CASAS]:
        tip = 'Quarto' if a.get('tipo') == 'Quarto' else (a.get('tip') or a.get('tipo') or 'Casa')
        preco = ('%d €/mês' % a['renda']) if a.get('renda') else 'Preço sob consulta'
        local = a.get('bairro') or a.get('cidade') or ''
        link = '%s/#casa-%s' % (base, str(id_num(a['id'])))
        linhas_txt.append('- %s · %s · %s\n  %s' % (preco, tip, local, link))
        foto = (a.get('fotos') or [''])[0]
        linhas_html.append(
            '<tr><td style="padding:10px 0;border-bottom:1px solid #E3E8E6">' +
            ('<img src="%s" width="96" height="64" style="border-radius:8px;object-fit:cover;vertical-align:middle;margin-right:12px" alt="">' % html.escape(foto) if foto else '') +
            '<a href="%s" style="color:#0F1A17;text-decoration:none"><strong>%s</strong><br><span style="color:#56635e">%s · %s</span></a></td></tr>'
            % (html.escape(link), html.escape(preco), html.escape(tip), html.escape(local)))
    mais = len(casas) - MAX_CASAS
    texto = ('Casas novas para o teu alerta (%s):\n\n%s\n%s\nVer todas: %s/#pesquisa\n\nParar este alerta: %s\n'
             % (desc_filtro(f), '\n'.join(linhas_txt), ('\n+%d casas\n' % mais) if mais > 0 else '', base, parar))
    corpo = ('<div style="font-family:system-ui,sans-serif;font-size:16px;color:#0F1A17;max-width:520px">'
             '<p style="margin:0 0 4px;color:#0B6E4F;font-weight:700">Duplicasa</p>'
             '<h1 style="font-size:22px;margin:0 0 6px">%s</h1><p style="margin:0 0 12px;color:#56635e">%s</p>'
             '<table width="100%%" cellpadding="0" cellspacing="0">%s</table>%s'
             '<p><a href="%s/#pesquisa" style="display:inline-block;background:#0B6E4F;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px">Ver as casas</a></p>'
             '<p style="font-size:13px;color:#56635e">Recebes este e-mail porque criaste um alerta na Duplicasa. <a href="%s" style="color:#56635e">Parar este alerta</a>.</p></div>'
             % (html.escape(titulo), html.escape(desc_filtro(f)), ''.join(linhas_html),
                ('<p style="color:#56635e">E mais %d.</p>' % mais) if mais > 0 else '', base, html.escape(parar)))
    return titulo, texto, corpo


OFERTA_DIAS = 5          # oferta de 1 € a quem tem alertas grátis há 5 dias e aceitou receber ofertas


def email_oferta(base, n, sair):
    titulo = '%d casas para ti nos últimos dias' % n
    texto = ('Olá!\n\nDesde que criaste o teu alerta apareceram %d casas que encaixam no que procuras.\n'
             'Com o acesso da Duplicasa sabes delas no minuto em que aparecem, em vez de um resumo por dia.\n\n'
             'Experimenta 30 dias por 1 €: %s/#precos\n'
             'Depois são 9,99 € a cada 30 dias. Cancelas com um toque e avisamos 3 dias antes de cobrar.\n\n'
             'Não queres receber ofertas? %s\n' % (n, base, sair))
    corpo = ('<div style="font-family:system-ui,sans-serif;font-size:16px;color:#0F1A17;max-width:520px">'
             '<p style="margin:0 0 4px;color:#0B6E4F;font-weight:700">Duplicasa</p>'
             '<h1 style="font-size:22px;margin:0 0 10px">%d casas apareceram para o teu alerta</h1>'
             '<p>Com o acesso, sabes delas <strong>no minuto</strong> em que aparecem, em vez de um resumo por dia. Quem contacta primeiro, visita primeiro.</p>'
             '<p><a href="%s/#precos" style="display:inline-block;background:#0B6E4F;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px">Experimentar 30 dias por 1 €</a></p>'
             '<p style="color:#56635e;font-size:14px">Depois, 9,99 € a cada 30 dias. Cancelas com um toque e avisamos 3 dias antes de cobrar.</p>'
             '<p style="font-size:13px;color:#56635e">Recebes este e-mail porque aceitaste receber novidades da Duplicasa. <a href="%s" style="color:#56635e">Não quero receber ofertas</a>.</p></div>'
             % (n, base, html.escape(sair)))
    return titulo, texto, corpo


def ofertas(c, anuncios, base, agora):
    """Uma única oferta por pessoa: alerta grátis há OFERTA_DIAS dias, sem acesso, com consentimento de marketing."""
    lx = datetime.datetime.now(LX)
    if not (10 <= lx.hour < 20):
        return 0
    limite_t = agora - OFERTA_DIAS * 86400
    gente = c.execute('SELECT u.id, u.email, MIN(a.criado) criado FROM utilizadores u JOIN alertas a ON a.utilizador=u.id '
                      'WHERE u.apagado=0 AND u.marketing=1 AND a.ativo=1 AND (u.acesso_ate IS NULL OR u.acesso_ate<?) '
                      'GROUP BY u.id HAVING MIN(a.criado)<?', (agora, limite_t)).fetchall()
    n_env = 0
    for g in gente:
        if c.execute("SELECT 1 FROM envios WHERE email=? AND tipo='oferta_d5' AND estado='enviado'", (g['email'],)).fetchone():
            continue
        filtros = [json.loads(r['filtro']) for r in c.execute('SELECT filtro FROM alertas WHERE utilizador=? AND ativo=1', (g['id'],))]
        n = sum(1 for a in anuncios if a['_t'] > g['criado'] and any(cumpre(a, f) for f in filtros))
        if n < 3:
            continue
        sair = '%s/api/sem-mkt?u=%d&k=%s' % (base, g['id'], api.assinatura_mkt(c, g['id']))
        assunto, texto, corpo = email_oferta(base, n, sair)
        ok = api.enviar_email(g['email'], assunto, texto, corpo)
        c.execute('INSERT INTO envios(email, tipo, estado, quando) VALUES(?,?,?,?)', (g['email'], 'oferta_d5', 'enviado' if ok else 'falhou', agora))
        n_env += 1 if ok else 0
        time.sleep(0.6)
    return n_env


def main():
    if not api.RESEND:
        print('Envio de e-mails por ligar: nada a fazer.')
        return
    api.criar_tabelas()
    try:
        anuncios = json.load(open(ANUNCIOS, encoding='utf-8'))['anuncios']
    except (OSError, ValueError, KeyError):
        print('Sem anúncios.', file=sys.stderr)
        return
    for a in anuncios:
        a['_t'] = quando(a)
    agora = int(time.time())
    lx = datetime.datetime.now(LX)
    base = sorted(api.ORIGENS)[0]
    for o in api.ORIGENS:
        if o.endswith('://duplicasa.pt'):
            base = o
    enviados = 0
    with api.ligar() as c:
        linhas = c.execute('SELECT a.id, a.filtro, a.criado, a.ultimo_envio, u.email, u.acesso_ate FROM alertas a '
                           'JOIN utilizadores u ON u.id=a.utilizador WHERE a.ativo=1 AND u.apagado=0').fetchall()
        for r in linhas:
            com_acesso = (r['acesso_ate'] or 0) > agora
            desde = r['ultimo_envio'] or r['criado']
            if not com_acesso:
                if lx.hour < HORA_RESUMO:
                    continue
                if r['ultimo_envio'] and datetime.datetime.fromtimestamp(r['ultimo_envio'], LX).date() == lx.date():
                    continue
            f = json.loads(r['filtro'])
            casas = sorted((a for a in anuncios if a['_t'] > desde and cumpre(a, f)), key=lambda a: -a['_t'])
            if not casas:
                if not com_acesso:
                    c.execute('UPDATE alertas SET ultimo_envio=? WHERE id=?', (agora, r['id']))
                continue
            parar = '%s/api/parar?a=%d&k=%s' % (base, r['id'], api.assinatura(c, r['id']))
            assunto, texto, corpo = email_casas(base, f, casas, parar)
            ok = api.enviar_email(r['email'], assunto, texto, corpo)
            c.execute('INSERT INTO envios(email, tipo, estado, quando) VALUES(?,?,?,?)', (r['email'], 'alerta', 'enviado' if ok else 'falhou', agora))
            if ok:
                c.execute('UPDATE alertas SET ultimo_envio=? WHERE id=?', (agora, r['id']))
                enviados += 1
            time.sleep(0.6)   # limite do Resend: poucos pedidos por segundo
        of = ofertas(c, anuncios, base, agora)
    print('Alertas enviados: %d' % enviados)
    print('Ofertas enviadas: %d' % of)


if __name__ == '__main__':
    main()
