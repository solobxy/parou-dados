"""Textos do site da Dayla em português (pt) e inglês (en). Lidos por dayla/construir.py.

Chaves que acabam em _h podem ter HTML simples (<strong>, <a>, <br>). As outras são escapadas.
A voz é a da Dayla, na primeira pessoa: direta, calma, com um pouco de humor. PT-PT no português.
"""

T = {
    # ---------- página ----------
    'html_lang': {'pt': 'pt-PT', 'en': 'en'},
    'titulo': {'pt': 'Dayla Araújo Body Piercing · Piercing no Porto', 'en': 'Dayla Araújo Body Piercing · Piercing in Porto'},
    'og_alt': {'pt': 'Logótipo da Dayla e uma orelha com um piercing flat e quatro no lóbulo.', 'en': 'Dayla logo and an ear with a flat piercing and four lobe piercings.'},
    'descricao': {'pt': 'Piercing e visagismo no Porto com a Dayla: preços, cuidados e pedido de marcação. Atendo em português e em inglês.',
                  'en': 'Piercing and curation in Porto with Dayla: prices, aftercare and booking requests. Appointments in English or Portuguese.'},
    'saltar': {'pt': 'Saltar para o conteúdo', 'en': 'Skip to content'},
    'outra_lingua': {'pt': 'EN', 'en': 'PT'},
    'outra_lingua_nome': {'pt': 'English version', 'en': 'Versão em português'},
    'menu_trab': {'pt': 'Trabalhos', 'en': 'Work'},
    'menu_precos': {'pt': 'Preços', 'en': 'Prices'},
    'menu_projeto': {'pt': 'Visagismo', 'en': 'Curation'},
    'menu_como': {'pt': 'Como funciona', 'en': 'How it works'},
    'menu_cuidados': {'pt': 'Cuidados', 'en': 'Aftercare'},
    'btn_marcar': {'pt': 'Pedir marcação', 'en': 'Request a booking'},
    'btn_marcar_curto': {'pt': 'Marcar', 'en': 'Book'},

    # ---------- herói ----------
    'h1': {'pt': 'Piercing no Porto, sem dúvidas.', 'en': 'Piercing in Porto, no guesswork.'},
    'apoio': {'pt': 'Sou a Dayla, body piercer. Faço perfurações à tua medida e projetos de vários piercings, por marcação, em português ou inglês.',
              'en': "I’m Dayla, a body piercer. Single piercings and multi-piercing projects made to suit you, by appointment, in English or Portuguese."},
    'btn_precos': {'pt': 'Ver preços', 'en': 'See prices'},
    'factos_h': {'pt': 'Porto <span aria-hidden="true">·</span> por marcação <span aria-hidden="true">·</span> PT / EN',
                 'en': 'Porto <span aria-hidden="true">·</span> by appointment <span aria-hidden="true">·</span> EN / PT'},
    'heroi_foto_alt': {'pt': 'A Dayla no estúdio', 'en': 'Dayla in the studio'},

    # ---------- trabalhos ----------
    'trab_h2': {'pt': 'Trabalhos recentes', 'en': 'Recent work'},
    'trab_mais': {'pt': 'Ver mais no Instagram', 'en': 'More on Instagram'},

    # ---------- preços ----------
    'precos_h2': {'pt': 'Preços', 'en': 'Prices'},
    'precos_lead': {'pt': 'Toca no + dos que te interessam. Ficam juntos no teu pedido, com o valor somado.',
                    'en': 'Tap + on the ones you like. They go into your request with the total added up.'},
    'cat_orelha': {'pt': 'Orelha', 'en': 'Ear'},
    'cat_rosto': {'pt': 'Rosto', 'en': 'Face'},
    'cat_corpo': {'pt': 'Corpo', 'en': 'Body'},
    'cat_servicos': {'pt': 'Serviços', 'en': 'Services'},
    'cicatriza': {'pt': 'cicatriza em', 'en': 'heals in'},

    # ---------- projeto / visagismo ----------
    'proj_h2': {'pt': 'Mais do que um? Fazemos um projeto.', 'en': 'More than one? Let’s plan a project.'},
    'proj_p': {'pt': 'No visagismo olho para a tua cara, para a forma da tua orelha e para o teu estilo, e decidimos juntos onde cada piercing fica melhor. Podes fazer tudo no mesmo dia ou por fases, para cicatrizar com calma.',
               'en': 'In a curation session I look at your face, the shape of your ear and your style, and we decide together where each piercing sits best. You can do it all in one day or in stages, so it heals calmly.'},
    'proj_1': {'pt': 'Traz fotos de inspiração: Pinterest, Instagram, o que for.', 'en': 'Bring inspiration photos: Pinterest, Instagram, anything.'},
    'proj_2': {'pt': 'Digo-te o que dá para fazer já e o que fica melhor para depois.', 'en': 'I’ll tell you what we can do now and what is better left for later.'},
    'proj_3': {'pt': 'Sais com o plano, mesmo que nesse dia não faças nenhum.', 'en': 'You leave with a plan, even if you don’t get pierced that day.'},
    'proj_btn': {'pt': 'Quero um visagismo', 'en': 'I want a curation'},
    'proj_exemplo': {'pt': 'Exemplo de projeto de orelha', 'en': 'Example ear project'},
    'proj_svg_desc': {'pt': 'Desenho de uma orelha com cinco piercings marcados a rosa: hélix, flat, conch e dois no lóbulo.',
                      'en': 'Drawing of an ear with five piercings marked in pink: helix, flat, conch and two on the lobe.'},

    # ---------- como funciona ----------
    'como_h2': {'pt': 'Tu dizes quando dá. Eu digo onde.', 'en': 'You pick when. I’ll tell you where.'},
    'como_lead': {'pt': 'Não tenho um estúdio fixo: atendo por marcação no estúdio onde estiver nesse dia, sempre no Porto.',
                  'en': 'I don’t work from one fixed studio: I see clients by appointment at the studio I’m at that day, always in Porto.'},
    'passo1_t': {'pt': 'Pedes', 'en': 'You ask'},
    'passo1_p': {'pt': 'Escolhes os piercings e dizes os dias e as horas que te dão jeito.', 'en': 'Pick your piercings and tell me which days and times work for you.'},
    'passo2_t': {'pt': 'Eu respondo', 'en': 'I reply'},
    'passo2_p': {'pt': 'Respondo-te por WhatsApp com o dia, a hora e a morada do estúdio.', 'en': 'I reply on WhatsApp with the day, the time and the studio address.'},
    'passo3_t': {'pt': 'No dia', 'en': 'On the day'},
    'passo3_p': {'pt': 'Vem com o estômago composto e com um documento de identificação. Tiramos as dúvidas antes de começar.',
                 'en': 'Have something to eat beforehand and bring an ID. We go through any questions before we start.'},
    'passo4_t': {'pt': 'Depois', 'en': 'After'},
    'passo4_p': {'pt': 'Levas os cuidados explicados e falas comigo sempre que alguma coisa te preocupar.', 'en': 'You leave knowing the aftercare, and you can message me whenever something worries you.'},
    'dias_h3': {'pt': 'Próximos dias em que atendo', 'en': 'Next days I’m working'},
    'dias_livres': {'pt': 'horas livres', 'en': 'free slots'},
    'dias_cheio': {'pt': 'cheio', 'en': 'full'},

    # ---------- sobre ----------
    'sobre_h2': {'pt': 'Quem te vai furar', 'en': 'Who’ll be piercing you'},
    'sobre_p1': {'pt': 'Sou a Dayla. Gosto de conversar, de explicar tudo com calma e de rir um bocado pelo meio, porque fazer um piercing deve ser uma coisa boa.',
                 'en': 'I’m Dayla. I like to talk, to explain everything calmly and to have a laugh along the way, because getting pierced should feel good.'},
    'sobre_p2': {'pt': 'Levo a higiene muito a sério. Antes de começar, explico-te tudo e só avançamos quando estiveres à vontade.',
                 'en': 'I take hygiene very seriously. Before we start I explain everything, and we only go ahead when you feel ready.'},
    'sobre_p3': {'pt': 'Fora isso, sou viciada em Vans e passo a vida a criar conteúdo. Se quiseres ver trabalhos e bastidores, está tudo no Instagram.',
                 'en': 'Apart from that, I’m addicted to Vans and I’m always making content. If you want to see work and behind the scenes, it’s all on Instagram.'},

    # ---------- avaliações ----------
    'aval_h2': {'pt': 'O que dizem', 'en': 'What clients say'},
    'aval_media': {'pt': 'de média em', 'en': 'average from'},
    'aval_n1': {'pt': 'avaliação', 'en': 'review'},
    'aval_nn': {'pt': 'avaliações', 'en': 'reviews'},

    # ---------- joias ----------
    'joias_h2': {'pt': 'Joias', 'en': 'Jewellery'},
    'joias_lead': {'pt': 'Joias que tenho para venda. Pergunta-me pela tua no pedido.', 'en': 'Jewellery I have for sale. Ask me about yours in your request.'},

    # ---------- cuidados ----------
    'cuid_h2': {'pt': 'Depois do piercing', 'en': 'Aftercare'},
    'cuid_lead': {'pt': 'O que fazes nas primeiras semanas conta muito para cicatrizar bem.', 'en': 'What you do in the first weeks makes a big difference to how it heals.'},
    'cuid_faz': {'pt': 'Faz', 'en': 'Do'},
    'cuid_f1': {'pt': 'Lava as mãos antes de tocar no piercing.', 'en': 'Wash your hands before touching the piercing.'},
    'cuid_f2': {'pt': 'Limpa duas vezes por dia com soro fisiológico e seca com papel limpo.', 'en': 'Clean it twice a day with saline and dry it with clean paper.'},
    'cuid_f3': {'pt': 'Dorme para o outro lado, sobretudo na cartilagem.', 'en': 'Sleep on the other side, especially with cartilage piercings.'},
    'cuid_f4': {'pt': 'Mantém a joia inicial até cicatrizar. A troca para uma barra mais curta faz-se comigo.', 'en': 'Keep the first jewellery in until it heals. Switching to a shorter bar is done with me.'},
    'cuid_evita': {'pt': 'Evita', 'en': 'Avoid'},
    'cuid_e1': {'pt': 'Rodar ou mexer na joia.', 'en': 'Twisting or playing with the jewellery.'},
    'cuid_e2': {'pt': 'Piscina, mar e banheira nas primeiras semanas.', 'en': 'Pools, the sea and baths in the first weeks.'},
    'cuid_e3': {'pt': 'Álcool, água oxigenada e pomadas que eu não te tenha indicado.', 'en': 'Alcohol, hydrogen peroxide and ointments I haven’t recommended.'},
    'cuid_e4': {'pt': 'Maquilhagem, perfume ou cremes em cima do furo.', 'en': 'Make-up, perfume or creams on the piercing.'},
    'cuid_alerta': {'pt': 'Se ficar muito inchado, quente ou com pus amarelo ou verde, fala comigo e procura um médico.',
                    'en': 'If it gets very swollen, hot or shows yellow or green pus, message me and see a doctor.'},
    'cic_h3': {'pt': 'Quanto tempo demora a cicatrizar', 'en': 'How long it takes to heal'},
    'cic_nota': {'pt': 'Valores habituais. Cada corpo tem o seu tempo.', 'en': 'Typical ranges. Every body heals at its own pace.'},

    # ---------- perguntas ----------
    'perg_h2': {'pt': 'Perguntas que me fazem muito', 'en': 'Questions I get a lot'},
    'q1': {'pt': 'Dói?', 'en': 'Does it hurt?'},
    'r1': {'pt': 'Um bocadinho e passa depressa: é uma picada de segundos. Vou explicando cada passo e só avançamos quando disseres que sim.',
           'en': 'A little, and it’s over fast: a sting that lasts seconds. I explain every step and we only go ahead when you say so.'},
    'q2': {'pt': 'Posso fazer vários no mesmo dia?', 'en': 'Can I get several in one day?'},
    'r2': {'pt': 'Podes. Se forem muitos, começamos por um visagismo e decidimos juntos se vale a pena fazer por fases.',
           'en': 'Yes. If it’s a lot, we start with a curation and decide together whether it’s better to do it in stages.'},
    'q3': {'pt': 'Onde é o estúdio?', 'en': 'Where is the studio?'},
    'r3': {'pt': 'Depende do dia: atendo em estúdios no Porto. A morada certa vai na mensagem em que confirmo a tua marcação.',
           'en': 'It depends on the day: I work in studios around Porto. The exact address comes in the message where I confirm your booking.'},
    'q4': {'pt': 'Sou menor de idade. Posso?', 'en': 'I’m under 18. Can I?'},
    'r4': {'pt': 'Com menos de 18 anos, só com a presença de um dos pais e com os documentos dos dois.',
           'en': 'Under 18, only with a parent present and ID for both of you.'},
    'q5': {'pt': 'Falas inglês?', 'en': 'Do you speak Portuguese?'},
    'r5': {'pt': 'Falo. Podes marcar e fazer tudo em inglês, e o site também está em inglês.',
           'en': 'I do, but we can do everything in English: booking, the session and the aftercare.'},
    'q6': {'pt': 'E se precisar de desmarcar?', 'en': 'What if I need to cancel?'},
    'r6': {'pt': 'Avisa-me o mais cedo que puderes pelo WhatsApp, para eu dar a hora a outra pessoa. Também podes cancelar o pedido aqui no site.',
           'en': 'Let me know on WhatsApp as early as you can, so I can give the slot to someone else. You can also cancel your request here on the site.'},

    # ---------- pedido ----------
    'ped_h2': {'pt': 'Pedir marcação', 'en': 'Request a booking'},
    'ped_lead': {'pt': 'Mandas o pedido aqui e eu respondo-te por WhatsApp com o dia, a hora e o estúdio. Ainda não fica nada pago.',
                 'en': 'Send your request here and I’ll reply on WhatsApp with the day, the time and the studio. Nothing is paid yet.'},
    'bilhete_t': {'pt': 'O teu pedido', 'en': 'Your request'},
    'bilhete_vazio': {'pt': 'Ainda não escolheste nada. Toca no + na lista de preços, ou escreve em baixo o que queres.',
                      'en': 'Nothing picked yet. Tap + in the price list, or write below what you’d like.'},
    'bilhete_total': {'pt': 'Total', 'en': 'Total'},
    'bilhete_ver': {'pt': 'Ver lista de preços', 'en': 'See the price list'},
    'quando_t': {'pt': 'Quando te dá jeito?', 'en': 'When suits you?'},
    'quando_dias': {'pt': 'Escolhe uma hora livre', 'en': 'Pick a free slot'},
    'quando_outro': {'pt': 'Nenhum destes dias dá', 'en': 'None of these days work'},
    'pref_dias': {'pt': 'Dias da semana que preferes', 'en': 'Days of the week you prefer'},
    'pref_per': {'pt': 'Altura do dia', 'en': 'Time of day'},
    'per_manha': {'pt': 'Manhã', 'en': 'Morning'},
    'per_tarde': {'pt': 'Tarde', 'en': 'Afternoon'},
    'per_noite': {'pt': 'Fim do dia', 'en': 'Evening'},
    'pref_txt': {'pt': 'Ou escreve (opcional)', 'en': 'Or write it (optional)'},
    'pref_txt_ph': {'pt': 'Ex.: a partir de dia 20, depois das 18h', 'en': 'E.g. from the 20th, after 6 pm'},
    'f_nome': {'pt': 'Nome', 'en': 'Name'},
    'f_tel': {'pt': 'WhatsApp', 'en': 'WhatsApp'},
    'f_tel_ajuda': {'pt': 'É por aqui que te respondo. Se não for português, põe o indicativo.', 'en': 'This is where I’ll reply. Include your country code.'},
    'f_email': {'pt': 'Email', 'en': 'Email'},
    'f_opcional': {'pt': 'opcional', 'en': 'optional'},
    'f_notas': {'pt': 'Ideias ou dúvidas', 'en': 'Ideas or questions'},
    'f_notas_ph': {'pt': 'Conta-me o que imaginas. As fotos de inspiração mandas-me depois no WhatsApp.', 'en': 'Tell me what you have in mind. Send inspiration photos on WhatsApp afterwards.'},
    'f_idade': {'pt': 'Tenho 18 anos ou mais, ou venho com um dos pais.', 'en': 'I’m 18 or over, or I’ll come with a parent.'},
    'f_privacidade_h': {'pt': 'Uso estes dados só para a tua marcação. <button type="button" class="lnk" data-abre="privacidade">Como trato os dados</button>',
                        'en': 'I use these details only for your booking. <button type="button" class="lnk" data-abre="privacidade">How I handle your data</button>'},
    'f_enviar': {'pt': 'Enviar pedido', 'en': 'Send request'},
    'f_a_enviar': {'pt': 'A enviar…', 'en': 'Sending…'},
    'ok_t': {'pt': 'Pedido enviado!', 'en': 'Request sent!'},
    'ok_p': {'pt': 'Respondo-te por WhatsApp assim que puder. Para eu ver mais depressa, manda-me já a mensagem pronta.',
             'en': 'I’ll reply on WhatsApp as soon as I can. To make sure I see it quickly, send me the ready-made message now.'},
    'ok_wa': {'pt': 'Avisar a Dayla no WhatsApp', 'en': 'Let Dayla know on WhatsApp'},

    # ---------- contacto ----------
    'cont_h2': {'pt': 'Fala comigo', 'en': 'Get in touch'},
    'cont_p': {'pt': 'Atendo no Porto, por marcação. Dúvidas rápidas? Manda mensagem.', 'en': 'Appointments in Porto. Quick question? Send me a message.'},
    'cont_wa': {'pt': 'WhatsApp', 'en': 'WhatsApp'},
    'cont_ig': {'pt': 'Instagram', 'en': 'Instagram'},

    # ---------- rodapé ----------
    'rod_priv': {'pt': 'Privacidade', 'en': 'Privacy'},
    'rod_livro': {'pt': 'Livro de Reclamações', 'en': 'Complaints Book'},
    'feito_por': {'pt': 'feito por', 'en': 'made by'},
    'fechar': {'pt': 'Fechar', 'en': 'Close'},
    'priv_h2': {'pt': 'Como trato os teus dados', 'en': 'How I handle your data'},
    'priv_h': {
        'pt': '<p>Quem trata os dados é a Dayla Araújo (Dayla Araújo Body Piercing), contactável pelo WhatsApp indicado no site.</p>'
              '<p><strong>Que dados:</strong> o nome, o número de WhatsApp, o email (se o puseres), os piercings escolhidos, as preferências de dia e as notas do pedido.</p>'
              '<p><strong>Para quê:</strong> só para responder ao teu pedido e gerir a marcação. Não uso para publicidade nem passo a ninguém.</p>'
              '<p><strong>Quanto tempo:</strong> os pedidos apagam-se sozinhos 12 meses depois da data da marcação (ou do pedido, se não chegar a ser marcado).</p>'
              '<p><strong>Os teus direitos:</strong> podes pedir para ver, corrigir ou apagar os teus dados a qualquer momento pelo WhatsApp. Também podes apresentar queixa à CNPD (cnpd.pt).</p>'
              '<p><strong>Estatísticas:</strong> o site conta visitas sem cookies e sem guardar o teu endereço IP.</p>'
              '<p><strong>WhatsApp:</strong> as conversas no WhatsApp seguem as regras de privacidade do WhatsApp (Meta).</p>',
        'en': '<p>Your data is handled by Dayla Araújo (Dayla Araújo Body Piercing), who you can reach on the WhatsApp number on this site.</p>'
              '<p><strong>What data:</strong> your name, WhatsApp number, email (if you give it), the piercings you picked, your preferred days and your notes.</p>'
              '<p><strong>What for:</strong> only to answer your request and manage your booking. It’s never used for advertising or shared.</p>'
              '<p><strong>How long:</strong> requests are deleted automatically 12 months after the booking date (or the request date, if it never gets booked).</p>'
              '<p><strong>Your rights:</strong> you can ask to see, correct or delete your data at any time on WhatsApp. You can also complain to the Portuguese data authority, CNPD (cnpd.pt).</p>'
              '<p><strong>Statistics:</strong> the site counts visits without cookies and without storing your IP address.</p>'
              '<p><strong>WhatsApp:</strong> WhatsApp conversations follow WhatsApp’s (Meta’s) privacy rules.</p>'},
    # ---------- novos (desenho escuro) ----------
    'trab_lead': {'pt': 'Fotos de clientes, tiradas no estúdio depois de furar.', 'en': 'Client photos, taken in the studio right after piercing.'},
    'anterior': {'pt': 'Foto anterior', 'en': 'Previous photo'},
    'seguinte': {'pt': 'Foto seguinte', 'en': 'Next photo'},
    'proj_ex1': {'pt': 'Flat e quatro no lóbulo', 'en': 'Flat and four on the lobe'},
    'proj_ex2': {'pt': 'Flat e dois no lóbulo', 'en': 'Flat and two on the lobe'},
    'proj_real': {'pt': 'Projetos feitos pela Dayla', 'en': 'Projects by Dayla'},
    'proj_juntar': {'pt': 'Juntar ao pedido', 'en': 'Add to request'},
    'p_flat': {'pt': 'Flat', 'en': 'Flat'},
    'p_lobulo4': {'pt': 'Lóbulo ×4', 'en': 'Lobe ×4'},
    'p_lobulo2': {'pt': 'Lóbulo ×2', 'en': 'Lobe ×2'},
    'sobre_foto_alt': {'pt': 'As mãos da Dayla, de luvas pretas, a preparar um piercing', 'en': 'Dayla’s hands, in black gloves, preparing a piercing'},
    'higiene_t': {'pt': 'Higiene', 'en': 'Hygiene'},
    'hig1': {'pt': 'Agulha nova, de uso único', 'en': 'A new, single-use needle'},
    'hig2': {'pt': 'Espaço preparado para cada pessoa', 'en': 'The space set up for each person'},
    'hig3': {'pt': 'Todas as normas de higiene, sempre', 'en': 'Every hygiene standard, every time'},
    'precos_ir': {'pt': 'Ir para', 'en': 'Jump to'},
}

# Textos usados pelo JavaScript (vão para a página como JSON).
JS = {
    'pt': {
        'a_confirmar': 'a confirmar', 'desde': 'desde', 'adicionar': 'Juntar ao pedido', 'tirar': 'Tirar do pedido',
        'escolhidos1': 'escolhido', 'escolhidosN': 'escolhidos', 'continuar': 'Continuar',
        'dias_sem': ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'],
        'dias_semana_l': ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'],
        'erro_rede': 'Não deu para enviar. Verifica a ligação e tenta outra vez, ou manda-me mensagem no WhatsApp.',
        'erro_campos': 'Falta corrigir o que está assinalado.',
        'erro_ja': 'Já tens um pedido ativo com este número. Se quiseres mudar alguma coisa, fala comigo no WhatsApp.',
        'erro_ocupada': 'Essa hora acabou de ser escolhida por outra pessoa. Escolhe outra.',
        'erro_limite': 'Foram muitos pedidos seguidos. Tenta daqui a uns minutos ou fala comigo no WhatsApp.',
        'erro_cheio': 'Tenho muitos pedidos por responder. Fala comigo diretamente no WhatsApp.',
        'estado_pendente': 'O teu pedido está à espera de resposta.', 'estado_confirmada': 'A tua marcação está confirmada:',
        'estado_cancelada': 'O teu pedido foi cancelado.', 'estado_recusada': 'Desta vez não deu para marcar.',
        'estado_concluida': 'Obrigada pela visita!', 'estado_faltou': 'A marcação já passou.',
        'cancelar': 'Cancelar pedido', 'cancelar_conf': 'Tens a certeza? O pedido é cancelado.', 'ver_mapa': 'Ver no mapa', 'novo': 'Fazer outro pedido',
        'wa_ola': 'Olá Dayla! Acabei de fazer um pedido de marcação no site', 'wa_piercings': 'Piercings', 'wa_quando': 'Quando', 'wa_codigo': 'Pedido',
        'wa_duvida': 'Olá Dayla! Tenho uma dúvida sobre piercings:',
        'mais_n': 'outras', 'pref_resumo': 'Prefiro', 'sem_horas': 'Sem horas livres neste dia.',
        'esgotada': 'Esgotada', 'poucas': 'Últimas', 'estrelas': 'estrelas', 'escolher_hora': 'Escolhe uma hora ou diz-me os dias que preferes.',
    },
    'en': {
        'a_confirmar': 'to confirm', 'desde': 'from', 'adicionar': 'Add to request', 'tirar': 'Remove from request',
        'escolhidos1': 'picked', 'escolhidosN': 'picked', 'continuar': 'Continue',
        'dias_sem': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        'dias_semana_l': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        'erro_rede': 'Couldn’t send it. Check your connection and try again, or message me on WhatsApp.',
        'erro_campos': 'Please fix the highlighted fields.',
        'erro_ja': 'You already have an active request with this number. To change anything, message me on WhatsApp.',
        'erro_ocupada': 'Someone just took that slot. Please pick another.',
        'erro_limite': 'Too many requests in a row. Try again in a few minutes or message me on WhatsApp.',
        'erro_cheio': 'I have a lot of requests waiting. Please message me directly on WhatsApp.',
        'estado_pendente': 'Your request is waiting for a reply.', 'estado_confirmada': 'Your booking is confirmed:',
        'estado_cancelada': 'Your request was cancelled.', 'estado_recusada': 'This time it wasn’t possible to book.',
        'estado_concluida': 'Thanks for coming!', 'estado_faltou': 'The booking has passed.',
        'cancelar': 'Cancel request', 'cancelar_conf': 'Are you sure? The request will be cancelled.', 'ver_mapa': 'View on map', 'novo': 'Make another request',
        'wa_ola': 'Hi Dayla! I just sent a booking request on your website', 'wa_piercings': 'Piercings', 'wa_quando': 'When', 'wa_codigo': 'Request',
        'wa_duvida': 'Hi Dayla! I have a question about piercings:',
        'mais_n': 'more', 'pref_resumo': 'I prefer', 'sem_horas': 'No free slots on this day.',
        'esgotada': 'Sold out', 'poucas': 'Last ones', 'estrelas': 'stars', 'escolher_hora': 'Pick a slot or tell me which days you prefer.',
    },
}