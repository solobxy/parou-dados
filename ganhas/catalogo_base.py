#!/usr/bin/env python3
"""ganhas.pt: lista de profissões, distritos e empresas usada no formulário, na API e nas páginas.

As profissões usam a Classificação Portuguesa das Profissões (CPP 2010, igual à ISCO-08 até aos 4 dígitos).
Os dados oficiais do INE/GEP vêm por subgrupo (2 dígitos): cada profissão é comparada com o seu subgrupo.
Escreve catalogo.json (lido pela API e pelo gerador). Os valores oficiais são acrescentados por processar.py.
"""
import json, os, re, unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))

# Subgrupos (2 dígitos) da CPP 2010
SUBGRUPOS = {
    '01': 'Oficiais das Forças Armadas', '02': 'Sargentos das Forças Armadas', '03': 'Outro pessoal das Forças Armadas',
    '11': 'Dirigentes superiores e diretores executivos', '12': 'Diretores de serviços administrativos e comerciais',
    '13': 'Diretores de produção e de serviços especializados', '14': 'Diretores de hotelaria, restauração, comércio e outros serviços',
    '21': 'Especialistas das ciências físicas, matemáticas e engenharias', '22': 'Profissionais de saúde', '23': 'Professores',
    '24': 'Especialistas em finanças, contabilidade, organização e comércio', '25': 'Especialistas em tecnologias de informação e comunicação',
    '26': 'Especialistas em assuntos jurídicos, sociais, artísticos e culturais',
    '31': 'Técnicos das ciências e engenharia, de nível intermédio', '32': 'Técnicos de nível intermédio da saúde',
    '33': 'Técnicos de nível intermédio das áreas financeira, administrativa e dos negócios',
    '34': 'Técnicos de nível intermédio dos serviços jurídicos, sociais, desportivos e culturais',
    '35': 'Técnicos das tecnologias de informação e comunicação',
    '41': 'Empregados de escritório e secretários', '42': 'Pessoal de apoio direto a clientes',
    '43': 'Operadores de dados, contabilidade, estatística e registo', '44': 'Outro pessoal de apoio administrativo',
    '51': 'Trabalhadores dos serviços pessoais', '52': 'Vendedores', '53': 'Trabalhadores dos cuidados pessoais',
    '54': 'Pessoal dos serviços de proteção e segurança',
    '61': 'Agricultores e trabalhadores qualificados da agricultura', '62': 'Trabalhadores qualificados da floresta, pesca e caça',
    '71': 'Trabalhadores qualificados da construção', '72': 'Trabalhadores qualificados da metalurgia e metalomecânica',
    '73': 'Trabalhadores qualificados da impressão, precisão e artesanato', '74': 'Trabalhadores qualificados em eletricidade e eletrónica',
    '75': 'Trabalhadores da transformação de alimentos, madeira e vestuário',
    '81': 'Operadores de instalações fixas e máquinas', '82': 'Trabalhadores da montagem', '83': 'Condutores de veículos e operadores de equipamentos móveis',
    '91': 'Trabalhadores de limpeza', '92': 'Trabalhadores não qualificados da agricultura, pesca e floresta',
    '93': 'Trabalhadores não qualificados da indústria, construção e transportes', '94': 'Assistentes na preparação de refeições',
    '96': 'Trabalhadores dos resíduos e de outros serviços elementares',
}

# (código CPP de 4 dígitos, nome no masculino/neutro, nome no feminino ou None, outros nomes para a pesquisa)
PROFISSOES = [
    ('1120', 'Diretor-geral', 'Diretora-geral', 'ceo administrador gerente de empresa'),
    ('1211', 'Diretor financeiro', 'Diretora financeira', 'cfo'),
    ('1212', 'Diretor de recursos humanos', 'Diretora de recursos humanos', 'rh people'),
    ('1221', 'Diretor comercial e de marketing', 'Diretora comercial e de marketing', 'vendas head of sales cmo'),
    ('1324', 'Diretor de logística', 'Diretora de logística', 'supply chain cadeia de abastecimento'),
    ('1330', 'Diretor de informática', 'Diretora de informática', 'cto cio head of engineering'),
    ('1411', 'Diretor de hotel', 'Diretora de hotel', 'hotelaria'),
    ('1412', 'Gerente de restaurante', None, 'restauração'),
    ('1420', 'Gerente de loja', None, 'store manager retalho'),
    ('2120', 'Estatístico ou atuário', 'Estatística ou atuária', 'matemático'),
    ('2131', 'Biólogo', 'Bióloga', 'biologia'),
    ('2141', 'Engenheiro industrial', 'Engenheira industrial', 'produção qualidade'),
    ('2142', 'Engenheiro civil', 'Engenheira civil', 'obras construção'),
    ('2144', 'Engenheiro mecânico', 'Engenheira mecânica', 'mecânica'),
    ('2145', 'Engenheiro químico', 'Engenheira química', 'química'),
    ('2151', 'Engenheiro eletrotécnico', 'Engenheira eletrotécnica', 'eletrotecnia energia'),
    ('2153', 'Engenheiro de telecomunicações', 'Engenheira de telecomunicações', 'redes telecom'),
    ('2161', 'Arquiteto', 'Arquiteta', 'arquitetura'),
    ('2166', 'Designer gráfico', None, 'design ui ux multimédia web designer'),
    ('2211', 'Médico de medicina geral', 'Médica de medicina geral', 'médico de família clínico geral'),
    ('2212', 'Médico especialista', 'Médica especialista', 'cirurgião anestesista pediatra'),
    ('2221', 'Enfermeiro', 'Enfermeira', 'enfermagem'),
    ('2250', 'Médico veterinário', 'Médica veterinária', 'veterinário'),
    ('2261', 'Médico dentista', 'Médica dentista', 'dentista estomatologista'),
    ('2262', 'Farmacêutico', 'Farmacêutica', 'farmácia'),
    ('2264', 'Fisioterapeuta', None, 'fisioterapia'),
    ('2265', 'Nutricionista', None, 'dietista'),
    ('2310', 'Professor do ensino superior', 'Professora do ensino superior', 'universidade politécnico docente'),
    ('2330', 'Professor do 3.º ciclo e secundário', 'Professora do 3.º ciclo e secundário', 'professor liceu docente'),
    ('2341', 'Professor do 1.º ciclo', 'Professora do 1.º ciclo', 'primária docente'),
    ('2342', 'Educador de infância', 'Educadora de infância', 'jardim de infância pré-escolar'),
    ('2411', 'Contabilista certificado', 'Contabilista certificada', 'toc contabilidade'),
    ('2412', 'Consultor financeiro', 'Consultora financeira', 'banca investimento'),
    ('2413', 'Analista financeiro', 'Analista financeira', 'controller fp&a'),
    ('2421', 'Consultor de gestão', 'Consultora de gestão', 'consultoria business analyst'),
    ('2423', 'Técnico superior de recursos humanos', 'Técnica superior de recursos humanos', 'recrutador rh talent'),
    ('2424', 'Formador', 'Formadora', 'formação'),
    ('2431', 'Especialista de marketing', None, 'marketing digital publicidade growth'),
    ('2432', 'Especialista de comunicação', None, 'relações públicas comunicação'),
    ('2511', 'Analista de sistemas ou de dados', None, 'data analyst data scientist cientista de dados bi'),
    ('2512', 'Programador', 'Programadora', 'engenheiro de software developer backend frontend full stack'),
    ('2513', 'Programador web', 'Programadora web', 'web developer frontend'),
    ('2514', 'Programador de aplicações', 'Programadora de aplicações', 'mobile android ios'),
    ('2519', 'Técnico de testes de software', 'Técnica de testes de software', 'qa tester qualidade software'),
    ('2522', 'Administrador de sistemas', 'Administradora de sistemas', 'sysadmin devops cloud'),
    ('2529', 'Especialista em cibersegurança', None, 'segurança informática security'),
    ('2611', 'Advogado', 'Advogada', 'jurista direito'),
    ('2631', 'Economista', None, 'economia'),
    ('2634', 'Psicólogo', 'Psicóloga', 'psicologia'),
    ('2635', 'Assistente social', None, 'serviço social'),
    ('2642', 'Jornalista', None, 'jornalismo redator'),
    ('2643', 'Tradutor', 'Tradutora', 'intérprete tradução'),
    ('3112', 'Técnico de engenharia civil', 'Técnica de engenharia civil', 'medidor orçamentista'),
    ('3113', 'Técnico de eletrotecnia', 'Técnica de eletrotecnia', 'eletrotécnico'),
    ('3115', 'Técnico de mecânica', 'Técnica de mecânica', 'manutenção industrial'),
    ('3118', 'Desenhador técnico', 'Desenhadora técnica', 'autocad projetista'),
    ('3122', 'Encarregado de produção', 'Encarregada de produção', 'chefe de turno supervisor de fábrica'),
    ('3123', 'Encarregado de obra', 'Encarregada de obra', 'construção'),
    ('3211', 'Técnico de radiologia', 'Técnica de radiologia', 'imagiologia'),
    ('3212', 'Técnico de análises clínicas', 'Técnica de análises clínicas', 'laboratório'),
    ('3213', 'Técnico de farmácia', 'Técnica de farmácia', 'farmácia'),
    ('3258', 'Técnico de emergência médica', 'Técnica de emergência médica', 'tae inem ambulância'),
    ('3313', 'Técnico de contabilidade', 'Técnica de contabilidade', 'contabilidade'),
    ('3322', 'Comercial', None, 'delegado comercial vendedor externo representante account manager'),
    ('3334', 'Consultor imobiliário', 'Consultora imobiliária', 'agente imobiliário'),
    ('3341', 'Supervisor de escritório', 'Supervisora de escritório', 'coordenador administrativo'),
    ('3343', 'Assistente administrativo', 'Assistente administrativa', 'secretariado de direção assistente executivo'),
    ('3412', 'Técnico de serviço social', 'Técnica de serviço social', 'animador sociocultural'),
    ('3423', 'Personal trainer', None, 'instrutor de fitness ginásio'),
    ('3434', 'Chefe de cozinha', None, 'chef'),
    ('3512', 'Técnico de apoio informático', 'Técnica de apoio informático', 'helpdesk suporte it service desk'),
    ('3513', 'Técnico de redes', 'Técnica de redes', 'redes'),
    ('4110', 'Empregado de escritório', 'Empregada de escritório', 'administrativo'),
    ('4211', 'Caixa de banco', None, 'bancário balcão'),
    ('4221', 'Agente de viagens', None, 'turismo'),
    ('4222', 'Operador de call center', 'Operadora de call center', 'apoio ao cliente assistente de contact center linha'),
    ('4224', 'Rececionista de hotel', None, 'front office'),
    ('4226', 'Rececionista', None, 'receção'),
    ('4311', 'Administrativo de contabilidade', 'Administrativa de contabilidade', 'faturação'),
    ('4313', 'Técnico de processamento salarial', 'Técnica de processamento salarial', 'payroll'),
    ('4321', 'Fiel de armazém', None, 'armazém stock'),
    ('4323', 'Técnico de logística', 'Técnica de logística', 'planeamento transportes'),
    ('4412', 'Carteiro', None, 'correios distribuição postal'),
    ('5111', 'Assistente de bordo', None, 'tripulante de cabine hospedeira'),
    ('5120', 'Cozinheiro', 'Cozinheira', 'cozinha'),
    ('5131', 'Empregado de mesa', 'Empregada de mesa', 'restauração'),
    ('5132', 'Barman', None, 'barista bar'),
    ('5141', 'Cabeleireiro', 'Cabeleireira', 'barbeiro'),
    ('5142', 'Esteticista', None, 'estética'),
    ('5221', 'Lojista', None, 'dono de loja'),
    ('5222', 'Supervisor de loja', 'Supervisora de loja', 'chefe de secção'),
    ('5223', 'Operador de loja', 'Operadora de loja', 'vendedor de loja assistente de loja repositor'),
    ('5230', 'Operador de caixa', 'Operadora de caixa', 'caixa de supermercado'),
    ('5244', 'Comercial de call center', None, 'televendas linha comercial outbound'),
    ('5311', 'Auxiliar de creche', None, 'ama ajudante de ação educativa'),
    ('5312', 'Assistente operacional escolar', None, 'auxiliar de ação educativa'),
    ('5321', 'Auxiliar de saúde', None, 'auxiliar de ação médica'),
    ('5322', 'Ajudante familiar', None, 'cuidador geriatria lar apoio domiciliário'),
    ('5411', 'Bombeiro', 'Bombeira', 'bombeiros'),
    ('5412', 'Agente de polícia', None, 'psp gnr polícia municipal'),
    ('5413', 'Guarda prisional', None, 'prisões'),
    ('5414', 'Vigilante', None, 'segurança privada'),
    ('6111', 'Agricultor', 'Agricultora', 'agricultura'),
    ('7112', 'Pedreiro', None, 'construção civil trolha'),
    ('7115', 'Carpinteiro', None, 'carpintaria'),
    ('7126', 'Canalizador', None, 'picheleiro'),
    ('7127', 'Técnico de climatização', 'Técnica de climatização', 'avac frio ar condicionado'),
    ('7131', 'Pintor de construção', None, 'pintura'),
    ('7212', 'Soldador', None, 'serralheiro'),
    ('7223', 'Operador de máquinas CNC', 'Operadora de máquinas CNC', 'torneiro fresador'),
    ('7231', 'Mecânico de automóveis', None, 'oficina'),
    ('7411', 'Eletricista', None, 'eletricidade'),
    ('7421', 'Técnico de eletrónica', 'Técnica de eletrónica', 'reparação'),
    ('7422', 'Técnico instalador de telecomunicações', 'Técnica instaladora de telecomunicações', 'fibra instalador'),
    ('7512', 'Padeiro ou pasteleiro', 'Padeira ou pasteleira', 'padaria pastelaria'),
    ('7533', 'Costureiro', 'Costureira', 'confeção têxtil'),
    ('8160', 'Operador de máquinas de alimentação', 'Operadora de máquinas de alimentação', 'indústria alimentar'),
    ('8212', 'Montador de componentes eletrónicos', 'Montadora de componentes eletrónicos', 'montagem'),
    ('8311', 'Maquinista de comboios', None, 'ferrovia cp metro'),
    ('8322', 'Motorista de TVDE ou táxi', None, 'uber bolt táxi'),
    ('8331', 'Motorista de autocarro', None, 'transportes públicos'),
    ('8332', 'Motorista de pesados', None, 'camionista tir'),
    ('8344', 'Operador de empilhador', 'Operadora de empilhador', 'logística armazém'),
    ('9111', 'Empregado doméstico', 'Empregada doméstica', 'limpezas domésticas'),
    ('9112', 'Trabalhador de limpeza', 'Trabalhadora de limpeza', 'limpezas escritórios hotéis'),
    ('9313', 'Servente de construção', None, 'servente'),
    ('9321', 'Embalador', 'Embaladora', 'embalagem'),
    ('9329', 'Operário fabril', 'Operária fabril', 'operador de produção fábrica'),
    ('9333', 'Operador de armazém', 'Operadora de armazém', 'picking cargas e descargas'),
    ('9412', 'Ajudante de cozinha', None, 'copa'),
    ('9621', 'Estafeta', None, 'entregas glovo uber eats'),
    ('0110', 'Oficial das Forças Armadas', None, 'militar oficial'),
    ('0210', 'Sargento das Forças Armadas', None, 'militar sargento'),
    ('0310', 'Praça das Forças Armadas', None, 'militar soldado'),
]

DISTRITOS = [
    # id, nome, região NUTS II (2024) a que pertence a maior parte da população do distrito
    ('aveiro', 'Aveiro', 'Centro'), ('beja', 'Beja', 'Alentejo'), ('braga', 'Braga', 'Norte'),
    ('braganca', 'Bragança', 'Norte'), ('castelo-branco', 'Castelo Branco', 'Centro'), ('coimbra', 'Coimbra', 'Centro'),
    ('evora', 'Évora', 'Alentejo'), ('faro', 'Faro', 'Algarve'), ('guarda', 'Guarda', 'Centro'),
    ('leiria', 'Leiria', 'Centro'), ('lisboa', 'Lisboa', 'Grande Lisboa'), ('portalegre', 'Portalegre', 'Alentejo'),
    ('porto', 'Porto', 'Norte'), ('santarem', 'Santarém', 'Oeste e Vale do Tejo'), ('setubal', 'Setúbal', 'Península de Setúbal'),
    ('viana-do-castelo', 'Viana do Castelo', 'Norte'), ('vila-real', 'Vila Real', 'Norte'), ('viseu', 'Viseu', 'Centro'),
    ('acores', 'Região Autónoma dos Açores', 'Região Autónoma dos Açores'),
    ('madeira', 'Região Autónoma da Madeira', 'Região Autónoma da Madeira'),
]

# Empresas com muitos trabalhadores em Portugal (nomes públicos, para a sugestão automática)
EMPRESAS = [
    ('nos', 'NOS', ['nos-comunicacoes']), ('meo', 'MEO (Altice)', ['altice', 'altice-portugal', 'meo-altice']),
    ('vodafone', 'Vodafone', []), ('digi', 'DIGI', []),
    ('teleperformance', 'Teleperformance', ['tp']), ('concentrix', 'Concentrix', ['webhelp']), ('foundever', 'Foundever', ['sitel']),
    ('intelcia', 'Intelcia', []), ('randstad', 'Randstad', []), ('adecco', 'Adecco', []), ('manpower', 'ManpowerGroup', ['manpower-group']),
    ('continente', 'Continente (MC Sonae)', ['mc', 'modelo-continente', 'sonae-mc']), ('pingo-doce', 'Pingo Doce', ['jeronimo-martins']),
    ('lidl', 'Lidl', []), ('aldi', 'Aldi', []), ('auchan', 'Auchan', []), ('intermarche', 'Intermarché', ['os-mosqueteiros']),
    ('mercadona', 'Mercadona', []), ('worten', 'Worten', []), ('fnac', 'Fnac', []), ('ikea', 'IKEA', []),
    ('leroy-merlin', 'Leroy Merlin', []), ('decathlon', 'Decathlon', []), ('primark', 'Primark', []),
    ('inditex', 'Inditex (Zara)', ['zara']), ('hm', 'H&M', ['h-m']), ('mcdonalds', "McDonald's", ['mc-donalds']),
    ('burger-king', 'Burger King', []), ('galp', 'Galp', []), ('edp', 'EDP', []), ('ctt', 'CTT', ['correios']),
    ('cp', 'CP Comboios de Portugal', ['comboios-de-portugal']), ('metro-do-porto', 'Metro do Porto', []),
    ('metropolitano-de-lisboa', 'Metropolitano de Lisboa', ['metro-de-lisboa']), ('carris', 'Carris', []), ('stcp', 'STCP', []),
    ('tap', 'TAP Air Portugal', ['tap-air-portugal']), ('ana', 'ANA Aeroportos', ['ana-aeroportos', 'vinci']),
    ('menzies', 'Menzies', ['groundforce']), ('cgd', 'Caixa Geral de Depósitos', ['caixa-geral-de-depositos', 'caixa']),
    ('millennium-bcp', 'Millennium bcp', ['bcp', 'millennium']), ('santander', 'Santander', []), ('novobanco', 'novobanco', ['novo-banco']),
    ('bpi', 'BPI', ['banco-bpi']), ('deloitte', 'Deloitte', []), ('pwc', 'PwC', []), ('ey', 'EY', ['ernst-young']),
    ('kpmg', 'KPMG', []), ('accenture', 'Accenture', []), ('capgemini', 'Capgemini', []), ('critical-software', 'Critical Software', []),
    ('farfetch', 'Farfetch', []), ('outsystems', 'OutSystems', []), ('talkdesk', 'Talkdesk', []), ('feedzai', 'Feedzai', []),
    ('sonae', 'Sonae', []), ('mota-engil', 'Mota-Engil', []), ('bosch', 'Bosch', []), ('continental', 'Continental', ['continental-mabor']),
    ('autoeuropa', 'Volkswagen Autoeuropa', ['volkswagen', 'vw-autoeuropa']), ('stellantis', 'Stellantis', ['psa']),
    ('navigator', 'The Navigator Company', ['the-navigator-company']), ('luz-saude', 'Luz Saúde', ['hospital-da-luz']),
    ('cuf', 'CUF', []), ('lusiadas', 'Lusíadas Saúde', ['lusiadas-saude']), ('sns', 'SNS (hospital público)', ['servico-nacional-de-saude']),
    ('glovo', 'Glovo', []), ('uber', 'Uber', []), ('bolt', 'Bolt', []), ('amazon', 'Amazon', []), ('cgi', 'CGI', []),
    ('ntt-data', 'NTT DATA', []), ('altran', 'Capgemini Engineering', []), ('siemens', 'Siemens', []), ('celfocus', 'Celfocus', []),
    ('natixis', 'Natixis', []), ('bnp-paribas', 'BNP Paribas', ['bnp']), ('euronext', 'Euronext', []), ('mercedes-benz-io', 'Mercedes-Benz.io', []),
]


def slug(s):
    s = ''.join(ch for ch in unicodedata.normalize('NFKD', s) if not unicodedata.combining(ch)).lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def construir(salario_minimo=920):
    # ganho médio oficial do grande grupo (INE/GEP), usado para marcar partilhas fora do normal
    try:
        with open(os.path.join(AQUI, 'dados', 'oficial.json'), encoding='utf-8') as f:
            grupos = json.load(f).get('grupos', {})
    except FileNotFoundError:
        grupos = {}
    profs, vistos = [], set()
    for cpp, nome, fem, outros in PROFISSOES:
        ident = slug(nome)
        assert ident not in vistos, ident
        vistos.add(ident)
        sub = cpp[:2]
        assert sub in SUBGRUPOS, (cpp, nome)
        g = grupos.get(cpp[0]) or {}
        profs.append({'id': ident, 'cpp': cpp, 'subgrupo': sub, 'grupo': cpp[0], 'nome': nome, 'feminino': fem,
                      'pesquisa': ' '.join(filter(None, [nome, fem or '', outros])).lower(),
                      **({'ganho_grupo': g['ganho']} if g.get('ganho') else {})})
    return {
        'salario_minimo': salario_minimo,
        'subgrupos': SUBGRUPOS,
        'profissoes': profs,
        'distritos': [{'id': i, 'nome': n, 'nuts2': r} for i, n, r in DISTRITOS],
        'empresas': [{'id': i, 'nome': n, 'outros': o} for i, n, o in EMPRESAS],
    }


if __name__ == '__main__':
    cat = construir()
    with open(os.path.join(AQUI, 'catalogo.json'), 'w', encoding='utf-8') as f:
        json.dump(cat, f, ensure_ascii=False, indent=1)
    print(len(cat['profissoes']), 'profissões,', len(cat['distritos']), 'distritos,', len(cat['empresas']), 'empresas')
