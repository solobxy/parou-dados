"""DupliCasa: as páginas de arrendamento em inglês, espanhol e francês (para quem vem viver para Portugal).

Há procura real nestas línguas (sugestões do Google e do Bing em Portugal, 11/11/2026): «rent apartment lisbon»,
«apartment for rent porto», «room for rent lisbon», «rent in portugal long term», «alquiler piso lisboa», «alquiler piso
oporto», «location appartement lisbonne», «location appartement porto». Só para as cidades com anúncios suficientes;
cada página tem os números reais da cidade, os anúncios mais baratos e a ligação (hreflang) às outras línguas.
A aplicação continua em português: as páginas dizem-no com clareza.
"""
import datetime
from urllib.parse import quote

import paginas as P

MIN_CIDADE = 15        # anúncios para haver página da cidade nas outras línguas
MAX_CIDADES = 40

# Nomes das cidades como se pesquisam em cada língua (as outras ficam iguais)
NOMES = {
    'en': {'Lisboa': 'Lisbon', 'Vila Nova de Gaia': 'Gaia'},
    'es': {'Porto': 'Oporto', 'Vila Nova de Gaia': 'Gaia'},
    'fr': {'Lisboa': 'Lisbonne', 'Vila Nova de Gaia': 'Gaia'},
}
SLUG_NOME = {'en': {'Lisboa': 'lisbon'}, 'es': {'Porto': 'oporto'}, 'fr': {'Lisboa': 'lisbonne'}}
BASE = {'en': '/en/rent/', 'es': '/es/alquiler/', 'fr': '/fr/location/'}
SUB = {'en': {'Quarto': 'rooms', 'Apartamento': 'apartments', 'precos': 'prices'},
       'es': {'Quarto': 'habitaciones', 'Apartamento': 'pisos', 'precos': 'precios'},
       'fr': {'Quarto': 'chambres', 'Apartamento': 'appartements', 'precos': 'prix'}}
SUB_PT = {'Quarto': 'quartos', 'Apartamento': 'apartamentos'}
MESES = {'en': ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
         'es': ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
         'fr': ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']}


def data(iso, L):
    try:
        d = datetime.datetime.strptime(iso[:10], '%Y-%m-%d')
    except Exception:
        return {'en': 'today', 'es': 'hoy', 'fr': "aujourd'hui"}[L]
    m = MESES[L][d.month - 1]
    return {'en': f'{d.day} {m} {d.year}', 'es': f'{d.day} de {m} de {d.year}', 'fr': f'{d.day} {m} {d.year}'}[L]


def nome(c, L):
    return NOMES[L].get(c, c)


def caminho(L, cidade=None, tipo=None):
    if cidade is None:
        return BASE[L] + (SUB[L]['precos'] + '/' if tipo == 'precos' else '')
    s = SLUG_NOME[L].get(cidade) or P.slug(nome(cidade, L))
    return BASE[L] + s + '/' + (SUB[L][tipo] + '/' if tipo else '')


def caminho_pt(cidade=None, tipo=None):
    if cidade is None:
        return '/arrendar/' + ('precos/' if tipo == 'precos' else '')
    return f'/arrendar/{P.slug(cidade)}/' + (SUB_PT[tipo] + '/' if tipo else '')


def numl(n, L):
    return P.num(n) if L != 'en' else P.num(n).replace('.', ',')


def eur(n, L):
    return numl(n, L) + '\u00a0€'


# Textos de cada língua. {c} = cidade, {n} = n.º de anúncios, {d} = data, {v} = valor
T = {
    'en': {
        'cidade_titulo': 'Apartments & rooms for rent in {c}{desde} | DupliCasa', 'desde': ' from {v}',
        'cidade_h1': 'Apartments and rooms for rent in {c}',
        'cidade_desc': '{n} apartments, houses and rooms for rent in {c}, cheapest first, from several Portuguese sites, with alerts for new listings.',
        'f_total': 'There are {n} apartments, houses and rooms for rent in {c} on DupliCasa, gathered from several Portuguese rental sites and updated on {d}.',
        'f_t1': 'A 1-bedroom flat (T1) asks a median of {v} a month.', 'f_quarto': 'A room costs around {v}.', 'f_min': 'The lowest rent right now is {v}.',
        'tipo_titulo': {'Quarto': 'Rooms for rent in {c} from {v} | DupliCasa', 'Apartamento': 'Apartments for rent in {c} from {v} | DupliCasa'},
        'tipo_h1': {'Quarto': 'Rooms for rent in {c}', 'Apartamento': 'Apartments for rent in {c}'},
        'tipo_desc': {'Quarto': 'Rooms for rent in {c}, cheapest first, from {v} a month. Shared flats for students and workers, with alerts for new rooms.',
                      'Apartamento': 'Apartments for rent in {c}, cheapest first, from {v} a month. Long-term rentals from several sites, with alerts for new listings.'},
        'tipo_intro': {'Quarto': '{n} rooms for rent in {c}, cheapest first. From {v} a month{med}. Updated on {d}.',
                       'Apartamento': '{n} apartments for rent in {c}, cheapest first. From {v} a month{med}. Updated on {d}.'},
        'med': ', median {v}',
        'q_t1': 'How much does it cost to rent a 1-bedroom flat (T1) in {c}?', 'r_t1': 'The median asking rent for a T1 in {c} is {v} a month in the DupliCasa listings on {d}.',
        'q_quarto': 'How much is a room in {c}?', 'r_quarto': 'A room for rent in {c} costs around {v} a month (median of the listings on {d}).',
        'q_m2': 'What is the rent per square metre in {c}?', 'r_m2': 'In the apartments and houses listed in {c}, the median rent is {v} per m² a month.',
        'q_lingua': 'Is DupliCasa in English?',
        'r_lingua': 'These pages are. The listings come from Portuguese websites and the DupliCasa app is in Portuguese for now, but prices, photos and the map are easy to follow, and your browser can translate the rest.',
        'q_tipo': {'Quarto': 'How much is a room in {c}?', 'Apartamento': 'How much does an apartment cost in {c}?'},
        'r_tipo': 'From {v} a month{med} (DupliCasa listings on {d}).',
        'por_tipo': 'By type', 'tipos': {'Quarto': 'Rooms in {c}', 'Apartamento': 'Apartments in {c}'}, 'todas': 'All homes in {c}',
        'perto': 'Other cities', 'outras_linguas': 'Other languages',
        'hub_titulo': 'Rent in Portugal: apartments and rooms by city | DupliCasa', 'hub_h1': 'Apartments and rooms for rent in Portugal',
        'hub_desc': '{n} apartments, houses and rooms for rent in Portugal, from several rental sites in one place. Rent prices by city and alerts for new listings.',
        'hub_intro': '{n} apartments, houses and rooms for rent in Portugal, from several Portuguese rental sites in one place. Choose a city. Updated on {d}.',
        'cidades': 'Cities', 'precos_link': 'Rent prices by city',
        'p_titulo': 'Rent prices in Portugal by city ({m}) | DupliCasa', 'p_h1': 'Rent prices in Portugal, by city',
        'p_desc': 'How much it costs to rent in Lisbon, Porto, Braga, Coimbra and other Portuguese cities: median rent for rooms, studios, 1 and 2-bedroom flats and price per m².',
        'p_intro': 'How much it costs to rent in Portugal, city by city, on {d}.', 'p_lx': ' In Lisbon, a 1-bedroom flat asks a median of {v} a month', 'p_pt': '; in Porto, {v}.',
        'p_nota': 'Median asking rent in the active listings on DupliCasa on {d}. It is the asking price, not the final contract price. Cities with at least 10 listings.',
        'cab': ['City', 'Listings', 'Room', 'Studio (T0)', '1-bed (T1)', '2-bed (T2)', '€/m²'],
        'q_fonte': 'Where do these numbers come from?', 'r_fonte': 'From the median asking rent in the active listings on DupliCasa, which gathers several Portuguese rental sites. Updated every 30 minutes.',
        'inicio': 'DupliCasa', 'rent': 'Rent in Portugal', 'precos': 'Rent prices',
    },
    'es': {
        'cidade_titulo': 'Alquiler de pisos y habitaciones en {c}{desde} | DupliCasa', 'desde': ' desde {v}',
        'cidade_h1': 'Pisos y habitaciones en alquiler en {c}',
        'cidade_desc': '{n} pisos, casas y habitaciones en alquiler en {c}, de más baratos a más caros, de varios portales portugueses, con alertas.',
        'f_total': 'Hay {n} pisos, casas y habitaciones en alquiler en {c} en DupliCasa, reunidos de varios portales portugueses y actualizados el {d}.',
        'f_t1': 'Un piso de 1 dormitorio (T1) pide, en la mediana, {v} al mes.', 'f_quarto': 'Una habitación ronda los {v}.', 'f_min': 'El alquiler más bajo ahora es de {v}.',
        'tipo_titulo': {'Quarto': 'Habitaciones en alquiler en {c} desde {v} | DupliCasa', 'Apartamento': 'Pisos en alquiler en {c} desde {v} | DupliCasa'},
        'tipo_h1': {'Quarto': 'Habitaciones en alquiler en {c}', 'Apartamento': 'Pisos en alquiler en {c}'},
        'tipo_desc': {'Quarto': 'Habitaciones en alquiler en {c}, de más baratas a más caras, desde {v} al mes. Para estudiantes y trabajadores, con alertas.',
                      'Apartamento': 'Pisos en alquiler en {c}, de más baratos a más caros, desde {v} al mes. Alquiler de larga duración de varios portales, con alertas.'},
        'tipo_intro': {'Quarto': '{n} habitaciones en alquiler en {c}, de más baratas a más caras. Desde {v} al mes{med}. Actualizado el {d}.',
                       'Apartamento': '{n} pisos en alquiler en {c}, de más baratos a más caros. Desde {v} al mes{med}. Actualizado el {d}.'},
        'med': '; mediana, {v}',
        'q_t1': '¿Cuánto cuesta alquilar un piso de 1 dormitorio (T1) en {c}?', 'r_t1': 'La mediana del alquiler pedido por un T1 en {c} es de {v} al mes en los anuncios de DupliCasa del {d}.',
        'q_quarto': '¿Cuánto cuesta una habitación en {c}?', 'r_quarto': 'Una habitación en alquiler en {c} ronda los {v} al mes (mediana de los anuncios del {d}).',
        'q_m2': '¿Cuál es el precio del alquiler por m² en {c}?', 'r_m2': 'En los pisos y casas anunciados en {c}, la mediana es de {v} por m² al mes.',
        'q_lingua': '¿DupliCasa está en español?',
        'r_lingua': 'Estas páginas sí. Los anuncios vienen de portales portugueses y la aplicación de DupliCasa está en portugués por ahora, pero los precios, las fotos y el mapa se entienden bien y tu navegador puede traducir el resto.',
        'q_tipo': {'Quarto': '¿Cuánto cuesta una habitación en {c}?', 'Apartamento': '¿Cuánto cuesta un piso en {c}?'},
        'r_tipo': 'Desde {v} al mes{med} (anuncios de DupliCasa del {d}).',
        'por_tipo': 'Por tipo', 'tipos': {'Quarto': 'Habitaciones en {c}', 'Apartamento': 'Pisos en {c}'}, 'todas': 'Todo en {c}',
        'perto': 'Otras ciudades', 'outras_linguas': 'Otros idiomas',
        'hub_titulo': 'Alquiler en Portugal: pisos y habitaciones por ciudad | DupliCasa', 'hub_h1': 'Pisos y habitaciones en alquiler en Portugal',
        'hub_desc': '{n} pisos, casas y habitaciones en alquiler en Portugal, de varios portales en un solo lugar. Precio del alquiler por ciudad y alertas.',
        'hub_intro': '{n} pisos, casas y habitaciones en alquiler en Portugal, de varios portales portugueses en un solo lugar. Elige la ciudad. Actualizado el {d}.',
        'cidades': 'Ciudades', 'precos_link': 'Precio del alquiler por ciudad',
        'p_titulo': 'Precio del alquiler en Portugal por ciudad ({m}) | DupliCasa', 'p_h1': 'Precio del alquiler en Portugal, por ciudad',
        'p_desc': 'Cuánto cuesta alquilar en Lisboa, Oporto, Braga, Coímbra y otras ciudades portuguesas: mediana de habitaciones, estudios, T1 y T2 y precio por m².',
        'p_intro': 'Cuánto cuesta alquilar en Portugal, ciudad por ciudad, el {d}.', 'p_lx': ' En Lisboa, un T1 pide en la mediana {v} al mes', 'p_pt': '; en Oporto, {v}.',
        'p_nota': 'Mediana del alquiler pedido en los anuncios activos de DupliCasa el {d}. Es el precio pedido, no el del contrato. Ciudades con al menos 10 anuncios.',
        'cab': ['Ciudad', 'Anuncios', 'Habitación', 'Estudio (T0)', 'T1', 'T2', '€/m²'],
        'q_fonte': '¿De dónde salen estos números?', 'r_fonte': 'De la mediana del alquiler pedido en los anuncios activos de DupliCasa, que reúne varios portales portugueses. Se actualiza cada 30 minutos.',
        'inicio': 'DupliCasa', 'rent': 'Alquiler en Portugal', 'precos': 'Precio del alquiler',
    },
    'fr': {
        'cidade_titulo': 'Location appartement et chambre à {c}{desde} | DupliCasa', 'desde': ' dès {v}',
        'cidade_h1': 'Appartements et chambres à louer à {c}',
        'cidade_desc': '{n} appartements, maisons et chambres à louer à {c}, du moins cher au plus cher, de plusieurs sites portugais, avec alertes.',
        'f_total': 'Il y a {n} appartements, maisons et chambres à louer à {c} sur DupliCasa, venant de plusieurs sites portugais et mis à jour le {d}.',
        'f_t1': 'Un T1 (une chambre) demande un loyer médian de {v} par mois.', 'f_quarto': 'Une chambre coûte environ {v}.', 'f_min': 'Le loyer le plus bas en ce moment est de {v}.',
        'tipo_titulo': {'Quarto': 'Chambres à louer à {c} dès {v} | DupliCasa', 'Apartamento': 'Appartements à louer à {c} dès {v} | DupliCasa'},
        'tipo_h1': {'Quarto': 'Chambres à louer à {c}', 'Apartamento': 'Appartements à louer à {c}'},
        'tipo_desc': {'Quarto': 'Chambres à louer à {c}, de la moins chère à la plus chère, dès {v} par mois. Pour étudiants et actifs, avec alertes.',
                      'Apartamento': 'Appartements à louer à {c}, du moins cher au plus cher, dès {v} par mois. Location longue durée de plusieurs sites, avec alertes.'},
        'tipo_intro': {'Quarto': '{n} chambres à louer à {c}, de la moins chère à la plus chère. Dès {v} par mois{med}. Mis à jour le {d}.',
                       'Apartamento': '{n} appartements à louer à {c}, du moins cher au plus cher. Dès {v} par mois{med}. Mis à jour le {d}.'},
        'med': ', médiane {v}',
        'q_t1': 'Combien coûte la location d’un T1 (une chambre) à {c} ?', 'r_t1': 'Le loyer médian demandé pour un T1 à {c} est de {v} par mois dans les annonces DupliCasa du {d}.',
        'q_quarto': 'Combien coûte une chambre à {c} ?', 'r_quarto': 'Une chambre à louer à {c} coûte environ {v} par mois (médiane des annonces du {d}).',
        'q_m2': 'Quel est le loyer au m² à {c} ?', 'r_m2': 'Dans les appartements et maisons annoncés à {c}, le loyer médian est de {v} par m² et par mois.',
        'q_lingua': 'DupliCasa est-il en français ?',
        'r_lingua': 'Ces pages, oui. Les annonces viennent de sites portugais et l’application DupliCasa est en portugais pour le moment, mais les prix, les photos et la carte se comprennent facilement et votre navigateur peut traduire le reste.',
        'q_tipo': {'Quarto': 'Combien coûte une chambre à {c} ?', 'Apartamento': 'Combien coûte un appartement à {c} ?'},
        'r_tipo': 'Dès {v} par mois{med} (annonces DupliCasa du {d}).',
        'por_tipo': 'Par type', 'tipos': {'Quarto': 'Chambres à {c}', 'Apartamento': 'Appartements à {c}'}, 'todas': 'Tout à {c}',
        'perto': 'Autres villes', 'outras_linguas': 'Autres langues',
        'hub_titulo': 'Location au Portugal : appartements et chambres par ville | DupliCasa', 'hub_h1': 'Appartements et chambres à louer au Portugal',
        'hub_desc': '{n} appartements, maisons et chambres à louer au Portugal, de plusieurs sites en un seul endroit. Prix des loyers par ville et alertes.',
        'hub_intro': '{n} appartements, maisons et chambres à louer au Portugal, de plusieurs sites portugais en un seul endroit. Choisissez la ville. Mis à jour le {d}.',
        'cidades': 'Villes', 'precos_link': 'Prix des loyers par ville',
        'p_titulo': 'Prix des loyers au Portugal par ville ({m}) | DupliCasa', 'p_h1': 'Prix des loyers au Portugal, par ville',
        'p_desc': 'Combien coûte une location à Lisbonne, Porto, Braga, Coimbra et ailleurs au Portugal : loyer médian des chambres, studios, T1 et T2 et prix au m².',
        'p_intro': 'Combien coûte une location au Portugal, ville par ville, le {d}.', 'p_lx': ' À Lisbonne, un T1 demande un loyer médian de {v} par mois', 'p_pt': ' ; à Porto, {v}.',
        'p_nota': 'Loyer médian demandé dans les annonces actives de DupliCasa le {d}. C’est le prix demandé, pas celui du contrat. Villes avec au moins 10 annonces.',
        'cab': ['Ville', 'Annonces', 'Chambre', 'Studio (T0)', 'T1', 'T2', '€/m²'],
        'q_fonte': 'D’où viennent ces chiffres ?', 'r_fonte': 'De la médiane des loyers demandés dans les annonces actives de DupliCasa, qui réunit plusieurs sites portugais. Mis à jour toutes les 30 minutes.',
        'inicio': 'DupliCasa', 'rent': 'Location au Portugal', 'precos': 'Prix des loyers',
    },
}


def gerar(anuncios, atualizado, resumo):
    """Devolve ({caminho: html}, {caminho_pt: {língua: caminho}}) para as três línguas."""
    paginas, alternos = {}, {}
    por_cidade = {}
    for a in anuncios:
        c = (a.get('cidade') or '').strip()
        if c:
            por_cidade.setdefault(c, []).append(a)
    # só cidades cuja página em português vai para o Google (o hreflang não pode apontar para uma página sem índice)
    cidades = sorted([(c, l) for c, l in por_cidade.items() if len(l) >= MIN_CIDADE and caminho_pt(c) in P.INDEXAVEIS], key=lambda x: -len(x[1]))[:MAX_CIDADES]
    if not cidades:
        return paginas, alternos

    def junta(pt, por_lingua):
        grupo = {'pt': pt, **por_lingua}
        alternos[pt] = grupo
        for c in por_lingua.values():
            alternos[c] = grupo

    for cidade, lista in cidades:
        plaus = sorted([a for a in lista if P.plausivel(a)], key=lambda a: a['renda'])
        boas = [a for a in plaus if a.get('fotos')]
        meds = {tt: P.mediana([a['renda'] for a in plaus if P.tipo_ok(a, tt)]) for tt in ('Quarto', 'Apartamento', 'T1')}
        m2 = P.mediana([a['renda'] / a['area'] for a in plaus if P.area_ok(a) and a.get('tipo') != 'Quarto'])
        tipos = [tt for tt in ('Quarto', 'Apartamento') if caminho_pt(cidade, tt) in P.INDEXAVEIS
                 and any(P.tipo_ok(a, tt) and a.get('fotos') for a in plaus)]
        grupo_cidade = {L: caminho(L, cidade) for L in T}
        grupo_tipos = {tt: {L: caminho(L, cidade, tt) for L in T} for tt in tipos}
        for L, t in T.items():
            c = nome(cidade, L)
            d = data(atualizado, L)
            fr = [t['f_total'].format(n=numl(len(lista), L), c=c, d=d)]
            if meds['T1']:
                fr.append(t['f_t1'].format(v=eur(meds['T1'], L)))
            if meds['Quarto']:
                fr.append(t['f_quarto'].format(v=eur(meds['Quarto'], L)))
            if boas:
                fr.append(t['f_min'].format(v=eur(boas[0]['renda'], L)))
            faq = []
            if meds['T1']:
                faq.append((t['q_t1'].format(c=c), t['r_t1'].format(c=c, v=eur(meds['T1'], L), d=d)))
            if meds['Quarto']:
                faq.append((t['q_quarto'].format(c=c), t['r_quarto'].format(c=c, v=eur(meds['Quarto'], L), d=d)))
            if m2:
                x = str(round(m2, 1))
                faq.append((t['q_m2'].format(c=c), t['r_m2'].format(c=c, v=(x if L == 'en' else x.replace('.', ',')) + ' €')))
            faq.append((t['q_lingua'], t['r_lingua']))
            links = ''
            if tipos:
                links += f'<h2>{P.e(t["por_tipo"])}</h2><ul class="ch">' + ''.join(
                    f'<li><a href="{grupo_tipos[tt][L]}">{P.e(t["tipos"][tt].format(c=c))}</a></li>' for tt in tipos) + '</ul>'
            outras = [x for x, _ in cidades if x != cidade][:16]
            links += f'<h2>{P.e(t["perto"])}</h2><ul class="ch">' + ''.join(
                f'<li><a href="{caminho(L, x)}">{P.e(nome(x, L))}</a></li>' for x in outras) + f'<li><a href="{caminho(L, None, "precos")}">{P.e(t["precos_link"])}</a></li></ul>'
            cam = grupo_cidade[L]
            desde = t['desde'].format(v=eur(boas[0]['renda'], L)) if boas else ''
            paginas[cam] = P.pagina(
                cam, t['cidade_titulo'].format(c=c, desde=desde), t['cidade_desc'].format(n=numl(len(lista), L), c=c),
                t['cidade_h1'].format(c=c), ' '.join(P.e(x) for x in fr),
                [(t['inicio'], '/'), (t['rent'], BASE[L]), (c, cam)],
                boas[:P.MAX_CARTOES], links, '/#pesquisa?cidade=' + quote(cidade), d, faq=faq, lang=L)
            for tt in tipos:
                sub = [a for a in plaus if P.tipo_ok(a, tt) and a.get('fotos')]
                n_t = sum(1 for a in lista if P.tipo_ok(a, tt))
                md = meds.get(tt)
                med = t['med'].format(v=eur(md, L)) if md else ''
                camt = grupo_tipos[tt][L]
                outros = (f'<h2>{P.e(t["por_tipo"])}</h2><ul class="ch">' + ''.join(
                    f'<li><a href="{grupo_tipos[x][L]}">{P.e(t["tipos"][x].format(c=c))}</a></li>' for x in tipos if x != tt)
                    + f'<li><a href="{cam}">{P.e(t["todas"].format(c=c))}</a></li></ul>')
                paginas[camt] = P.pagina(
                    camt, t['tipo_titulo'][tt].format(c=c, v=eur(sub[0]['renda'], L)), t['tipo_desc'][tt].format(c=c, v=eur(sub[0]['renda'], L)),
                    t['tipo_h1'][tt].format(c=c), P.e(t['tipo_intro'][tt].format(n=numl(n_t, L), c=c, v=eur(sub[0]['renda'], L), med=med, d=d)),
                    [(t['inicio'], '/'), (t['rent'], BASE[L]), (c, cam), (t['tipo_h1'][tt].format(c=c), camt)],
                    sub[:P.MAX_CARTOES], outros, '/#pesquisa?cidade=' + quote(cidade) + ('&amp;tips=Quarto' if tt == 'Quarto' else ''), d,
                    faq=[(t['q_tipo'][tt].format(c=c), t['r_tipo'].format(v=eur(sub[0]['renda'], L), med=med, d=d)), (t['q_lingua'], t['r_lingua'])], lang=L)
        junta(caminho_pt(cidade), grupo_cidade)
        for tt in tipos:
            junta(caminho_pt(cidade, tt), grupo_tipos[tt])

    # páginas gerais: todas as cidades e preço das rendas
    linhas = sorted([r for r in resumo if r['n'] >= 10], key=lambda r: -r['n'])
    lx = next((r for r in linhas if r['cidade'] == 'Lisboa'), None)
    pt = next((r for r in linhas if r['cidade'] == 'Porto'), None)
    baratas = sorted([a for a in anuncios if P.plausivel(a) and a.get('fotos') and P.tip(a) in ('T0', 'T1', 'Quarto')], key=lambda a: a['renda'])[:12]
    for L, t in T.items():
        d = data(atualizado, L)
        lista_c = f'<h2>{P.e(t["cidades"])}</h2><ul class="ch">' + ''.join(
            f'<li><a href="{caminho(L, c)}">{P.e(nome(c, L))} ({numl(len(l), L)})</a></li>' for c, l in cidades) + '</ul>' \
            + f'<p><a href="{caminho(L, None, "precos")}">{P.e(t["precos_link"])}</a></p>'
        paginas[BASE[L]] = P.pagina(
            BASE[L], t['hub_titulo'], t['hub_desc'].format(n=numl(len(anuncios), L)), t['hub_h1'], P.e(t['hub_intro'].format(n=numl(len(anuncios), L), d=d)),
            [(t['inicio'], '/'), (t['rent'], BASE[L])], baratas, lista_c, '/#pesquisa', d, lang=L)
        f = lambda v: eur(v, L) if v else '—'
        cab = t['cab']
        com_pagina = dict(cidades)

        def celula_cidade(r):
            n = P.e(nome(r['cidade'], L))
            return f'<a href="{caminho(L, r["cidade"])}">{n}</a>' if r['cidade'] in com_pagina else n

        def m2txt(v):
            if not v:
                return '—'
            x = str(round(v, 1))
            return (x if L == 'en' else x.replace('.', ',')) + ' €'
        tabela = (f'<h2>{P.e(t["p_h1"])}</h2><div class="rolar"><table class="tab"><thead><tr><th>{cab[0]}</th>'
                  + ''.join(f'<th class="n">{x}</th>' for x in cab[1:]) + '</tr></thead><tbody>'
                  + ''.join(f'<tr><td>{celula_cidade(r)}</td><td class="n">{numl(r["n"], L)}</td><td class="n">{f(r["quarto"])}</td>'
                            f'<td class="n">{f(r["T0"])}</td><td class="n">{f(r["T1"])}</td><td class="n">{f(r["T2"])}</td>'
                            f'<td class="n">{m2txt(r["m2"])}</td></tr>' for r in linhas)
                  + f'</tbody></table></div><p class="intro" style="font-size:15px;margin-top:12px">{P.e(t["p_nota"].format(d=d))}</p>')
        intro = t['p_intro'].format(d=d)
        if lx and lx['T1']:
            intro += t['p_lx'].format(v=eur(lx['T1'], L)) + (t['p_pt'].format(v=eur(pt['T1'], L)) if pt and pt['T1'] else '.')
        hoje = datetime.date.today()
        camp = caminho(L, None, 'precos')
        paginas[camp] = P.pagina(
            camp, t['p_titulo'].format(m=f'{MESES[L][hoje.month - 1]} {hoje.year}'), t['p_desc'], t['p_h1'], P.e(intro),
            [(t['inicio'], '/'), (t['rent'], BASE[L]), (t['precos'], camp)], [], '', '/#pesquisa', d,
            faq=[(t['q_fonte'], t['r_fonte'])], tabela=tabela, lang=L)
    junta('/arrendar/', {L: BASE[L] for L in T})
    junta('/arrendar/precos/', {L: caminho(L, None, 'precos') for L in T})
    return paginas, alternos
