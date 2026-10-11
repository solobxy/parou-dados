# PAROU na Google Play — textos e respostas

Tudo o que a Play Console pede, pronto a copiar.

## Ficheiros

- App (para enviar à Play Store): **PAROU-1.0.0.aab** — https://github.com/solobxy/parou-dados/releases/tag/android
- App para instalar já num Android e testar: **PAROU-1.0.0.apk** (mesma página)
- Imagens (ícone, destaque e capturas): https://github.com/solobxy/parou-dados/releases/tag/loja

## Ficha da loja

**Nome da app** (máx. 30): `PAROU: Transportes em direto`

**Descrição curta** (máx. 80):
`Autocarros, metro e comboios perto de ti, em tempo real. Horários e alertas.`

**Descrição completa:**

```
A PAROU mostra-te, num só sítio, o que passa perto de ti: autocarros, metro, comboios e barcos, e quanto tempo falta para chegarem.

PERTO DE TI
• Abre a app e vê logo as paragens à tua volta e os próximos transportes
• Tempo real onde o operador o disponibiliza (por exemplo, STCP e Carris Metropolitana); onde não há, a hora do horário oficial, sempre identificada
• Toca numa partida para ver o percurso da linha e as paragens no mapa

HORÁRIOS DE TODAS AS LINHAS
• Metro, comboios, autocarros e barcos de todo o país
• Pesquisa por número de linha ou destino
• Guarda as tuas linhas e paragens favoritas

ALERTAS E MAPA
• Greves e perturbações anunciadas pelos operadores
• Avisos de mau tempo do IPMA e previsão do tempo
• Incêndios ativos e ocorrências da Proteção Civil
• Feriados e notícias que mexem com as tuas viagens
• Notificações opcionais de greves, mau tempo e perturbações graves no teu distrito

COMUNIDADE
• Faz perguntas e partilha avisos com quem usa os mesmos transportes
• Podes denunciar conteúdo e bloquear utilizadores

GRATUITA E SEM FINS LUCRATIVOS
Sem publicidade, sem subscrições e sem venda de dados. Feita para os cidadãos. Não precisas de conta para usar a app.

A PAROU é um projeto independente. Não é uma app oficial de nenhum operador de transportes nem de entidade pública. Os horários e o tempo real vêm dos operadores e podem ter atrasos ou erros.

Fontes: operadores de transportes (horários GTFS), IMT, IPMA, Open-Meteo, Fogos.pt/ANEPC, OpenStreetMap e órgãos de comunicação social.
```

**Categoria:** Mapas e navegação
**Email de contacto:** contacto@parou.pt
**Site:** https://parou.pt
**Política de privacidade:** https://parou.pt/privacidade

## Conteúdo da app (Play Console › Política › Conteúdo da app)

- **Anúncios:** Não, a app não contém anúncios. **ID de publicidade:** não usa.
- **Acesso à app:** «Parte da funcionalidade está restringida». Instruções (em inglês) no kit; a app é aberta sem conta, a conta só é precisa para publicar na Comunidade e reportar ocorrências. Criar conta é instantâneo (sem verificação de email). Dar também uma conta de teste.
- **Público-alvo:** 16–17 e 18+ (não é dirigida a crianças).
- **Classificação de conteúdo:** categoria «Utilitário, produtividade, comunicação ou outro»; sem violência, sexo, linguagem imprópria, drogas ou jogo. *Os utilizadores interagem ou trocam conteúdo:* Sim. *Partilha a localização com outras pessoas:* Sim (as ocorrências mostram o local no mapa). *Compras digitais:* Não.
- **App de notícias:** Não. **Governamental:** Não. **Financeira / saúde:** Não.

### Segurança dos dados

Recolhe dados; encriptados em trânsito; as pessoas podem pedir o apagamento. **Nada é partilhado** com terceiros.

| Tipo de dados | Opcional? | Para quê |
|---|---|---|
| Localização aproximada e precisa | Sim (pode escolher um local à mão) | Funcionalidade (tratada só em memória, não fica guardada) |
| Nome | Sim (só com conta) | Funcionalidade, gestão de contas |
| Endereço de email | Sim (só com conta) | Gestão de contas |
| IDs de utilizador | Sim (só com conta) | Funcionalidade, gestão de contas |
| Fotos | Sim (foto numa ocorrência) | Funcionalidade |
| Outro conteúdo gerado pelo utilizador | Sim (ocorrências, publicações, respostas) | Funcionalidade |
| Interações com a app | Sim (contagem anónima, desligável na Privacidade) | Análise |
| Registos de falhas | Não (automático) | Análise |
| Identificadores de dispositivo ou outros (código aleatório num cookie; endereço das notificações) | Não (automático) | Funcionalidade |

**URL para apagar a conta:** https://parou.pt/apagar-conta (dentro da app: Perfil › Apagar conta).

## Teste fechado (obrigatório para contas pessoais novas)

1. Play Console › Testar e lançar › Testes › **Teste fechado** › Criar faixa.
2. Carregar o **PAROU-1.0.0.aab**. Aceitar a **Assinatura de apps da Google Play** (recomendado).
3. Testadores: criar uma lista de emails (pelo menos 12 contas Gmail; pedir a 20) ou um Grupo Google.
4. Enviar o **link de participação** aos testadores (por WhatsApp): cada um toca em "Tornar-me testador" e instala a app pela Play Store.
5. Ao fim de **14 dias seguidos** com 12 ou mais testadores inscritos, pedir o **acesso à produção** (Painel › Candidatar-se a produção).

Depois do primeiro envio: Play Console › Testar e lançar › **Integridade da app** (ou Configuração › Assinatura de apps) › copiar o **SHA-256** do certificado da chave de assinatura da app (não é segredo). Entra no servidor na variável `ANDROID_SHA256_EXTRA` (separada por vírgulas) e passa a constar de `https://parou.pt/.well-known/assetlinks.json`, para a app abrir em ecrã inteiro, sem a barra do browser.

## Atualizar a app

GitHub › solobxy/parou-dados › Actions › **App Android (Google Play)** › Run workflow, com a versão seguinte (ex.: 1.0.1) e o número seguinte (ex.: 2). A app abre o parou.pt, por isso quase todas as melhorias chegam sem atualizar a app na loja.
