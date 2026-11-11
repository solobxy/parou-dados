"""ganhas.pt: textos das páginas legais e de método (HTML simples, PT-PT). Usado por gerar.py."""

RESPONSAVEL = 'Dinis Sousa'
MORADA = 'Avenida General Humberto Delgado, 875, 1.º Esq., 4420-155 Gondomar'
EMAIL = 'diniscash@gmail.com'
ATUALIZADO = '11 de novembro de 2026'


def privacidade():
    return f'''
<h1>Privacidade</h1>
<p class="lede">O ganhas.pt foi feito para comparar salários sem saber quem és. Não há contas, não pedimos nome nem e-mail
e não usamos cookies. Esta página explica, sem letra miudinha, o que é guardado, porquê e durante quanto tempo.</p>
<p class="fonte">Última atualização: {ATUALIZADO}.</p>

<h2>Quem é responsável</h2>
<p>{RESPONSAVEL}{(', ' + MORADA) if MORADA else ''}, Portugal. Contacto para tudo o que diga respeito a dados pessoais: <a href="mailto:{EMAIL}">{EMAIL}</a>.</p>

<h2>O que guardamos quando partilhas o teu salário</h2>
<p>Só o que escreves no formulário: profissão, distrito, salário bruto, horas por semana, tipo de contrato, anos de
experiência e, se quiseres, a empresa, o género e o subsídio de alimentação. Não pedimos nome, e-mail, telefone,
data de nascimento nem número de contribuinte.</p>
<p>Para não contar a mesma pessoa duas vezes, o teu navegador cria um código aleatório que fica guardado nele
(no armazenamento local, não num cookie). No servidor guardamos apenas uma versão cifrada desse código. Se partilhares
outra vez a mesma profissão e empresa, a resposta antiga é substituída.</p>

<h2>O que guardamos sobre o pedido</h2>
<p>O teu endereço IP nunca é guardado. Para travar robôs e envios em massa, o servidor calcula um código a partir do IP
com uma chave que muda todos os dias; esse código serve para limitar quantos envios podem vir do mesmo sítio e é apagado
ao fim de 48 horas. Na partilha fica só o código desse dia, que não permite seguir ninguém de um dia para o outro.</p>

<h2>Estatísticas de visitas</h2>
<p>Medimos o uso do site para o melhorar (páginas vistas, de onde vêm as visitas, tipo de aparelho, país estimado pelo
fuso horário, onde se toca, até onde se lê, velocidade e erros). Fazemo-lo sem cookies e sem guardar o IP: cada visitante
recebe um identificador que muda todos os dias. Estes dados são agregados e guardados num serviço na União Europeia
(Supabase, região de Paris).</p>

<h2>Porque é que o podemos fazer (fundamento legal)</h2>
<ul>
<li><strong>Partilha do salário:</strong> o teu consentimento, dado ao carregar em «Partilhar» depois de leres o aviso no formulário (artigo 6.º, n.º 1, alínea a) do RGPD). Podes retirá-lo a qualquer momento apagando a partilha.</li>
<li><strong>Segurança e estatísticas de visitas:</strong> interesse legítimo em manter o site a funcionar, sem fraude e com qualidade (artigo 6.º, n.º 1, alínea f), sempre sem cookies e sem identificar pessoas.</li>
</ul>

<h2>O que publicamos e o que nunca publicamos</h2>
<p>Publicamos números agregados: por exemplo, a mediana de uma profissão num distrito ou numa empresa. Só aparece um
número quando há pelo menos 5 pessoas diferentes, os valores são arredondados à dezena e cada partilha só entra nas
contas 24 horas depois, para não se perceber quem acabou de responder.</p>
<p>Nunca publicamos nem vendemos respostas individuais. Podemos usar e disponibilizar, também a empresas, estatísticas
agregadas que respeitem estas mesmas regras.</p>

<h2>Quem trata os dados por nós</h2>
<ul>
<li>Hetzner Online (Alemanha), onde está o servidor e a base de dados das partilhas.</li>
<li>Supabase (região de Paris, União Europeia), só para as estatísticas de visitas.</li>
</ul>
<p>Não há transferências de dados para fora do Espaço Económico Europeu. Não usamos Google Analytics, píxeis de redes
sociais nem publicidade. As letras do site estão alojadas no próprio servidor.</p>

<h2>Durante quanto tempo</h2>
<ul>
<li>Partilhas: até 3 anos (os salários envelhecem). Depois disso ficam só os totais anónimos.</li>
<li>Código diário do IP para limites de envio: 48 horas.</li>
<li>Estatísticas de visitas: até 25 meses.</li>
</ul>

<h2>Os teus direitos</h2>
<p>Tens direito a aceder, corrigir, apagar e opor-te ao tratamento dos teus dados. Como não sabemos quem és, a forma
mais simples é usar o botão «Apagar a minha partilha» na página <a href="/partilhar/">Partilhar</a>, no mesmo navegador
onde partilhaste. Se preferires, escreve para <a href="mailto:{EMAIL}">{EMAIL}</a>.</p>
<p>Podes também apresentar queixa à Comissão Nacional de Proteção de Dados (<a href="https://www.cnpd.pt">cnpd.pt</a>).</p>

<h2>Mudanças</h2>
<p>Se esta política mudar (por exemplo, se um dia houver publicidade), a mudança aparece aqui com a nova data e, se
for preciso o teu consentimento, ele é pedido antes de qualquer coisa nova ser ativada.</p>
'''


def cookies():
    return f'''
<h1>Cookies</h1>
<p class="lede">O ganhas.pt não usa cookies. Nem nossos, nem de terceiros. Por isso não vês aquele aviso a pedir para aceitar.</p>
<p class="fonte">Última atualização: {ATUALIZADO}.</p>
<h2>O que fica guardado no teu navegador</h2>
<p>Usamos o armazenamento local do navegador, que não é enviado em cada pedido como um cookie, para três coisas:</p>
<table class="tabela">
<thead><tr><th>Nome</th><th>Para quê</th><th>Duração</th></tr></thead>
<tbody>
<tr><td>ganhas.dispositivo</td><td>Código aleatório para não contar a mesma pessoa duas vezes e para poderes apagar a tua partilha</td><td>Até o apagares</td></tr>
<tr><td>ganhas.ultimo</td><td>O último salário que escreveste no comparador, para não teres de o escrever outra vez</td><td>Até o apagares</td></tr>
<tr><td>ganhas.partilhado</td><td>Saber que já partilhaste, para te mostrar o resultado e o botão de apagar</td><td>Até o apagares</td></tr>
</tbody></table>
<p>Podes apagar tudo nas definições do navegador (dados do site) a qualquer momento.</p>
<h2>Estatísticas sem cookies</h2>
<p>As estatísticas de visitas funcionam sem cookies e sem guardar o IP (ver <a href="/privacidade/">Privacidade</a>).</p>
<h2>Se um dia houver publicidade</h2>
<p>Antes de qualquer ferramenta de publicidade ou medição de terceiros ser ativada, vais ver um aviso onde recusar é tão
fácil como aceitar, e nada é carregado sem a tua escolha.</p>
'''


def termos():
    return f'''
<h1>Termos de utilização</h1>
<p class="lede">Regras simples para um site que vive das partilhas de quem o usa.</p>
<p class="fonte">Última atualização: {ATUALIZADO}.</p>

<h2>O que é o ganhas.pt</h2>
<p>Um site gratuito que junta números oficiais sobre salários em Portugal (INE, Gabinete de Estratégia e Planeamento
do Ministério do Trabalho, Autoridade Tributária, Direção-Geral da Administração e do Emprego Público, Eurostat) e
partilhas anónimas de quem trabalha. É mantido por {RESPONSAVEL}{(' (' + MORADA + ')') if MORADA else ''}.</p>

<h2>É informação, não aconselhamento</h2>
<p>Os números servem para te orientar. A calculadora de salário líquido usa as tabelas oficiais de retenção na fonte,
mas a retenção é um adiantamento: o IRS final só se sabe na declaração anual. Antes de decisões importantes (aceitar
uma proposta, negociar, mudar de contrato), confirma com quem te paga, com um contabilista ou com a Autoridade Tributária.</p>

<h2>Regras para partilhar</h2>
<ul>
<li>Partilha só o teu próprio salário e só valores verdadeiros.</li>
<li>No campo da empresa escreve apenas o nome da empresa. Nada de nomes de pessoas, comentários, ligações ou insultos.</li>
<li>Não tentes descobrir quem respondeu nem cruzar números para identificar alguém.</li>
<li>Podemos não publicar ou apagar partilhas que pareçam falsas, repetidas ou abusivas, sem aviso.</li>
</ul>

<h2>Uso dos dados do site</h2>
<p>Podes citar os números do ganhas.pt com uma ligação para a página de onde vieram. Os dados oficiais mantêm as condições
de reutilização de cada entidade e são sempre atribuídos à fonte.</p>
<p>Não é permitido recolher o site de forma automática (robôs, extração em massa), copiar as bases de dados ou revendê-las
sem autorização escrita. Para dados em volume, relatórios ou parcerias, fala connosco: <a href="mailto:{EMAIL}">{EMAIL}</a>.</p>

<h2>Responsabilidade</h2>
<p>Fazemos o possível para que tudo esteja certo e atualizado, com fonte e data em cada número, mas não garantimos que
não haja erros ou falhas de serviço. Se vires um erro, avisa-nos e corrigimos.</p>

<h2>Propriedade</h2>
<p>O desenho, o código e os textos do ganhas.pt pertencem a {RESPONSAVEL}. As marcas citadas pertencem aos seus donos e
aparecem só para identificar empresas.</p>

<h2>Lei aplicável</h2>
<p>Estes termos regem-se pela lei portuguesa. Os teus direitos como consumidor não são afetados.</p>
'''


def metodologia(fontes_html):
    return f'''
<h1>Método e fontes</h1>
<p class="lede">Cada número do ganhas.pt tem uma origem. Aqui está de onde vêm, como são tratados e o que não dizem.</p>

<h2>Números oficiais</h2>
{fontes_html}

<h2>Como comparamos o teu salário</h2>
<p>Comparamos sempre <strong>salários brutos mensais</strong> de quem trabalha <strong>a tempo completo</strong>.
Os dados oficiais (Quadros de Pessoal) usam o «ganho»: a remuneração base mais prémios, subsídios regulares e horas extra
de um mês de referência (outubro). Por isso o teu salário base pode parecer mais baixo do que o «ganho» oficial da tua
profissão mesmo quando está na média.</p>
<p>A posição «ganhas mais do que X %» é calculada por interpolação entre os decis oficiais da distribuição dos salários.
É uma estimativa: entre dois decis assumimos uma distribuição uniforme.</p>
<p>Os dados oficiais mais recentes são de anos anteriores. Mostramos sempre o ano a que se referem. Não os atualizamos
com estimativas próprias.</p>

<h2>Partilhas da comunidade</h2>
<ul>
<li>Só aparece um número quando há <strong>pelo menos 5 pessoas diferentes</strong> (contadas por dispositivo e por ligação).</li>
<li>Cada partilha só entra nas contas <strong>24 horas depois</strong>.</li>
<li>Os valores são <strong>arredondados à dezena</strong> e mostramos mediana e quartis, nunca valores individuais.</li>
<li>Salários abaixo de 75 % do salário mínimo a tempo completo, ou fora do plausível para a profissão, ficam de fora.</li>
<li>Para travar robôs, cada envio resolve um pequeno cálculo no teu aparelho (prova de trabalho) e há limites por ligação e por aparelho.</li>
<li>Salários de quem trabalha menos horas são convertidos para 40 horas semanais antes de comparar.</li>
</ul>
<p>As partilhas não são uma amostra estatística da população: vêm de quem quis responder. São úteis para ver o que se
paga numa empresa ou numa função concreta, não para substituir os números oficiais.</p>

<h2>Calculadora de salário líquido</h2>
<p>Usa as tabelas de retenção na fonte do IRS para 2026 no Continente, a contribuição de 11 % para a Segurança Social e
os limites de isenção do subsídio de alimentação. Explicamos cada passo na própria página.</p>
'''
