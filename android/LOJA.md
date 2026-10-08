# PAROU na Google Play — textos e respostas

Tudo o que a Play Console pede, pronto a copiar.

## Ficheiros

- App (para enviar à Play Store): **PAROU-1.0.0.aab** — https://github.com/solobxy/parou-dados/releases/tag/android
- App para instalar já num Android e testar: **PAROU-1.0.0.apk** (mesma página)
- Imagens (ícone, destaque e capturas): https://github.com/solobxy/parou-dados/releases/tag/loja

## Ficha da loja

**Nome da app** (máx. 30): `PAROU: Transportes em direto`

**Descrição curta** (máx. 80):
`Autocarros, metro e comboios perto de ti, horários, greves e alertas. Grátis.`

**Descrição completa:**

```
A PAROU mostra-te, num só sítio, o que passa perto de ti: autocarros, metro, comboios e barcos, com quanto tempo falta para chegarem.

PERTO DE TI
• Abre a app e vê logo as paragens à tua volta e os próximos transportes
• Tempo real onde os operadores o disponibilizam (Carris Metropolitana, STCP e outros); onde não há, a hora do horário oficial
• Toca numa paragem para ver todas as partidas e o sentido de cada linha

HORÁRIOS DE TODAS AS LINHAS
• Metro, comboios (CP, Fertagus), autocarros e barcos de todo o país
• Pesquisa por número de linha ou destino
• Guarda as tuas linhas e paragens favoritas

ALERTAS
• Greves e perturbações anunciadas pelos operadores
• Avisos de mau tempo do IPMA e previsão do tempo
• Incêndios ativos e ocorrências da Proteção Civil perto de ti
• Feriados e notícias que mexem com as tuas viagens
• Tudo atualizado automaticamente; o que já passou desaparece sozinho
• Notificações de greves, avisos de mau tempo e perturbações graves no teu distrito, mesmo com a app fechada

MAPA
• Vê no mapa o que está a acontecer agora em Portugal

GRATUITA E SEM FINS LUCRATIVOS
Sem publicidade, sem subscrições e sem venda de dados. Feita para os cidadãos.

Fontes: operadores de transportes (horários GTFS), IMT, IPMA, Open-Meteo, Fogos.pt/ANEPC e OpenStreetMap.
```

**Categoria:** Mapas e navegação
**Email de contacto:** diniscash@gmail.com
**Site:** https://parou.pt
**Política de privacidade:** https://parou.pt/privacidade

## Conteúdo da app (Play Console › Política › Conteúdo da app)

- **Anúncios:** Não, a app não contém anúncios.
- **Acesso à app:** Toda a funcionalidade está disponível sem restrições (não é preciso conta).
- **Público-alvo:** 13 anos ou mais (não é dirigida a crianças).
- **Classificação de conteúdo (questionário):** categoria "Referência, notícias ou educação"; sem violência, sem conteúdo sexual, sem linguagem imprópria, sem drogas, sem jogos de azar. *Interação entre utilizadores:* Sim (as pessoas podem publicar ocorrências e comentários públicos). *Partilha a localização do utilizador com outras pessoas:* Não. *Compras digitais:* Não.
- **App de notícias:** Não.
- **Apps governamentais:** Não.
- **Funcionalidades financeiras / saúde:** Não.

### Segurança dos dados

- **Recolhe ou partilha dados?** Sim, recolhe.
- **Os dados são encriptados em trânsito?** Sim.
- **As pessoas podem pedir para apagar os dados?** Sim — na app (Perfil › Apagar conta) e em https://parou.pt/privacidade#apagar-conta

| Tipo de dados | Recolhido | Partilhado | Opcional? | Para quê |
|---|---|---|---|---|
| Localização aproximada | Sim | Não | Sim (pode escolher um local à mão) | Funcionalidade da app |
| Localização precisa | Sim | Não | Sim | Funcionalidade da app |
| Nome | Sim | Não | Sim (só com conta) | Gestão de conta, funcionalidade |
| Endereço de email | Sim | Não | Sim (só com conta) | Gestão de conta |
| Outro conteúdo gerado pelo utilizador (ocorrências, comentários) | Sim | Não | Sim | Funcionalidade da app |
| IDs do dispositivo ou outros (identificador aleatório para a cópia dos favoritos; endereço de entrega das notificações, se ligadas) | Sim | Não | Não | Funcionalidade da app |

Nota: a localização é tratada de forma efémera (só para calcular as paragens perto; não é guardada no servidor).

**URL para apagar a conta:** https://parou.pt/privacidade#apagar-conta

## Teste fechado (obrigatório para contas pessoais novas)

1. Play Console › Testar e lançar › Testes › **Teste fechado** › Criar faixa.
2. Carregar o **PAROU-1.0.0.aab**. Aceitar a **Assinatura de apps da Google Play** (recomendado).
3. Testadores: criar uma lista de emails (pelo menos 12 contas Gmail) ou um Grupo Google.
4. Enviar o **link de participação** aos testadores (por WhatsApp): cada um toca em "Tornar-me testador" e instala a app pela Play Store.
5. Ao fim de **14 dias seguidos** com 12 ou mais testadores inscritos, pedir o **acesso à produção** (Painel › Candidatar-se a produção).

Depois do primeiro envio: Play Console › Configuração › **Integridade da app** › Assinatura de apps › copiar a **impressão digital SHA-256** da chave de assinatura da app e mandá-la ao Claude (não é segredo). Vai para o ficheiro `https://parou.pt/.well-known/assetlinks.json`, para a app abrir sem a barra do browser.

## Atualizar a app

GitHub › solobxy/parou-dados › Actions › **App Android (Google Play)** › Run workflow, com a versão seguinte (ex.: 1.0.1) e o número seguinte (ex.: 2). A app abre o parou.pt, por isso quase todas as melhorias chegam sem atualizar a app na loja.
