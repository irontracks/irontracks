# IronTracks — Análise de lacunas de produto
**Data:** 22/07/2026 · **Ótica:** usuário que treina 4–6x por semana, há meses, sério com o resultado.

---

## Método

1. Inventário completo do que existe hoje no código (treino, nutrição, saúde, social, professor, VIP).
2. Dados reais de produção (Supabase `enbueukmvgodngydkpzm`) — comportamento, não opinião.
3. Cruzamento: onde o produto investiu × onde o usuário realmente vive.
4. **Auditoria cruzada:** uma segunda análise independente (leitura de código, sem dados de uso) foi confrontada com esta. Os achados exclusivos dela foram verificados um a um no repo e no banco antes de entrarem aqui — estão marcados com ⊕. Onde as duas convergiram, o furo é tratado como certeza.

---

## Os números que definem o diagnóstico

| Métrica | Valor |
|---|---|
| Cadastros | 52 |
| Já concluíram ≥1 treino | 22 (42%) |
| Cadastrados que nunca treinaram | 6 |
| Núcleo real (≥20 treinos) | **5 usuários** |
| Ativos últimos 7 dias | **4** |
| Ativos últimos 30 dias | 7 |
| Treinos concluídos (histórico) | 518 |
| Sessões iniciadas e nunca concluídas | **91 (15% de abandono)** |
| Usuários que já registraram nutrição | **3** |
| Usuários com avaliação física | **2** |
| Usuários com foto de progresso | **0** |
| Check-ins de academia (geofence/QR) | **0** |
| Stories publicados | 105 |

**Usuários ativos por mês:** dez/25→jul/26 = 2, 5, 5, 8, 8, 6, 5, 6. **Reta.** Oito meses sem crescer.

### Comportamento dos 5 power users (os que treinam 4–4,8x/semana há 6–7 meses)

| Treinos | Treinos/sem | Check-ins | Dias de nutrição | Avaliações | Stories | Fotos | Msgs IA |
|---|---|---|---|---|---|---|---|
| 124 | 4,15 | 137 | **0** | **0** | 2 | 0 | **0** |
| 124 | 4,34 | 134 | 4 | 1 | 8 | 0 | 1 |
| 117 | 4,29 | 446 | 45 | 5 | 92 | 0 | 11 |
| 73 | 4,82 | 81 | **0** | **0** | 0 | 0 | **0** |
| 30 | 2,66 | 75 | **0** | **0** | 0 | 0 | **0** |

O terceiro é o dono do app. **Os outros quatro usam exatamente uma coisa: registrar treino.** Nutrição, IA, avaliação, foto, exame laboratorial, periodização VIP, marketplace de professor, check-in de academia — adoção zero entre quem mais treina.

### E o resultado do treino deles (últimos 120 dias, e1RM por exercício)

| Usuário | Exercícios rastreados | Progrediram | Estagnados | Regrediram | **Abaixo do próprio pico** |
|---|---|---|---|---|---|
| b9953db7 | 32 | 11 | 11 | 10 | **21 (66%)** |
| 8dd0cd46 | 28 | 14 | 5 | 9 | **18 (64%)** |
| d04bfcef | 28 | 15 | 4 | 9 | **20 (71%)** |
| 559c844f | 26 | 12 | 6 | 8 | **18 (69%)** |

**~50% dos exercícios de cada usuário estão parados ou piores do que estavam há 4 meses. ~2/3 estão abaixo do próprio recorde. O app tem esse dado e não fala nada.**

---

## A tese

> **O IronTracks é um caderno de treino excepcional. Não é um treinador.**

Ele grava com uma fidelidade que quase nenhum concorrente tem: 15 métodos avançados (drop-set, rest-pause, cluster, wave, FST-7, 21s, ponto zero…), 3 tipos de série (aquecimento/reconhecimento/valendo), RPE por série, nota por série, unilateral com descanso de lado, isometria, cardio dentro do treino, timer de descanso com wake lock e push agendado.

E depois de registrar tudo isso com precisão cirúrgica, ele **não usa nada disso para dizer ao usuário o que fazer**.

A dor do cara que treina todo dia não é "não tenho onde anotar". Ele já anota. A dor dele é:

1. **"Estou evoluindo ou estou girando em falso?"** — o app tem a resposta no banco e não dá.
2. **"Quanto peso eu ponho hoje?"** — o app mostra o que ele fez da última vez e devolve a decisão pra ele.
3. **"O que eu treino hoje?"** — o app abre uma lista e manda ele escolher.

Essas três perguntas são o produto. Tudo o mais é acessório — e o app investiu quase todo o esforço no acessório.

---

# OS FUROS

## 1. Não existe prescrição de carga — o furo nº 1

**O que existe:** quando o usuário chega numa série, o input vem pré-preenchido com o peso/reps da última vez (`useWorkoutDeload.ts:382`). É um *watermark*, uma memória passiva.

**O furo:** o app nunca diz **"hoje faz 82,5kg"**. Ele diz "da última vez você fez 80". A decisão — a parte difícil, a parte que exige conhecimento — continua 100% com o usuário. Isso é o inverso do que um treinador faz.

**O agravante:** o motor matemático de progressão **já está escrito e funcionando** em `src/app/api/ai/suggest-load/route.ts` — tendência up/stable/down, incremento de 1/2/2,5kg, double progression quando reps ≥12. **Nenhum arquivo do cliente chama esse endpoint.** Código órfão. A feature mais valiosa do produto está pronta no servidor e desconectada da tela.

**Consequência medida:** 50% de estagnação/regressão nos power users.

**⊕ E o único caminho que existe hoje para "aplicar progressão no próximo treino" está furado em dois lugares** (`src/app/api/ai/apply-progression-next/route.ts:63-135`):

1. Ele busca os templates com `.order('name', { ascending: true })` — **alfabético** — e pega `templates[curIdx + 1]`. A lista que o usuário vê no dashboard é ordenada por `sortWorkoutsByOrder` (ordem custom). **As duas ordens não são a mesma: a progressão pode ser gravada no treino errado.**
2. O que ele grava é `advanced_config.ai_suggestion = { recommendation: "<texto>", reason: "<texto>" }` na **primeira série** do exercício. **Não altera `weight` nem `reps`.** É um post-it pendurado numa série, não uma prescrição. O usuário precisa ler o texto e digitar a carga ele mesmo — de novo.

**O que falta:**
- Peso-alvo prescrito por série, visível antes de executar (escrito em `weight`/`reps`, não em texto).
- Auto-regulação: o RPE é coletado série a série e **não realimenta nada**. RPE 6 em 3 séries seguidas deveria subir a carga sozinho; RPE 10 deveria segurar.
- Progressão dupla explícita ("você bateu 12 reps nas 3 séries → sobe 2,5kg").
- Meta de série visível ("faltam 2 reps pro seu recorde neste exercício").
- Corrigir o alvo do `apply-progression-next` para usar a mesma ordenação da UI.

---

## 2. Não existe alerta de estagnação

**O que existe:** um motor de deload (`deloadHelpers.ts` + `useWorkoutDeload.ts`, 41KB) que classifica overtraining/estagnação/estável comparando janelas de volume e peso médio. Funciona.

**O furo:** ele só roda **quando o usuário aperta um botão** dentro do card do exercício (`ExerciseCard.tsx:461`). Ninguém aperta. E o histórico do deload é gravado em **localStorage**, não no banco — some quando o usuário troca de aparelho.

O app sabe que o supino do usuário está parado há 4 meses. Nunca abre a boca sobre isso.

**O que falta:**
- Varredura automática pós-treino: "Puxada travou em 60kg há 6 sessões. Sugestão: 3 semanas de reps altas ou deload de 15%."
- Notificação de estagnação — sabendo que `pr_close` tem **82% de leitura** e `streak_at_risk` **85%** (contra 1,6% de "seus amigos treinaram hoje"), o usuário lê o que é sobre a performance *dele*.
- Estado de deload persistido no banco, não em localStorage.

---

## 3. PRs não existem como entidade

**O furo:** não há tabela `personal_records`. O PR é **recalculado em runtime** dentro de `useReportData.ts:460-518` toda vez que o relatório de uma sessão abre. Fora daquele card, o PR não existe:

- Sem histórico de PRs ("meus recordes de 2026").
- Sem PR de reps ou de volume — só e1RM estimado por Epley.
- Sem notificação de PR pra si mesmo (existe `friend_pr` para os *seguidores*, mas nada dedicado pro autor).
- Sem "faltam 5kg pro seu recorde de agachamento" na hora da série.

Para quem treina todo dia, o PR **é** o placar. O produto trata como um detalhe de uma tela de relatório.

---

## 4. "O que eu treino hoje?" não tem resposta

**O que existe:** o dashboard lista os templates. `nextWorkout` é literalmente `workouts[index + 1]` (`IronTracksAppClientImpl.tsx:861`) — o próximo item do array. No Apple Watch é `list[0]`, o primeiro da lista.

**⊕ E não existe campo estruturado de agendamento — o dia do treino é extraído do texto do título.** `src/utils/workout/workoutDay.ts` faz parse do prefixo (`"SEG · LOWER B"` → segunda-feira). O próprio comentário do arquivo declara: *"não existe campo estruturado de agendamento em DashboardWorkout"*. Consequências:

- Renomear o treino quebra o agendamento.
- Um treino sem prefixo de dia **nunca** é "hoje" (`isWorkoutToday` retorna `false`).
- Quando nada bate com hoje, `pickEmphasizedWorkoutIndex` destaca o **índice 0** — o primeiro da lista, arbitrariamente.
- O `WorkoutCalendarModal` consulta treinos **já realizados**: é um retrovisor, não um planejador.

**O furo:** zero inteligência de rodízio. O app não sabe que:
- Hoje é terça e você fez peito ontem.
- Você não treina perna há 11 dias.
- Você treinou 6 dias seguidos e devia descansar.

**Não existe agenda de treino para o aluno.** A tela `schedule/` é a **agenda do professor** (CRUD de `appointments`). Não há calendário semanal onde o usuário coloca "Segunda = A, Terça = B". Não existe `workout_reminder` sendo disparado — o tipo existe como label em `NotificationCenter.tsx:122` e **nada no sistema o insere**.

Um app de treino que não lembra a hora do treino está deixando a retenção na mesa. `rest_day_intents` até pergunta "vai treinar hoje?" — mas só para **ajustar as calorias**, não para lembrar ou planejar.

---

## 5. 15% das sessões são abandonadas e ninguém investiga

91 treinos iniciados e nunca concluídos, contra 518 concluídos. Existe `WorkoutRecoveryBanner` para recuperar, mas:

- Não há telemetria de **onde** o usuário parou (2º exercício? metade?).
- Não há follow-up ("você deixou o treino de ontem aberto — concluir ou descartar?").
- 4 sessões órfãs em `active_workout_sessions` agora.

Cada abandono é um dado de fricção sendo jogado fora.

---

## 6. O corpo do usuário é invisível

Zero fotos de progresso entre TODOS os usuários. 2 avaliações físicas em 52 cadastros. E existe: dobras Jackson & Pollock 7 pontos com bilateralidade, bioimpedância com extração de PDF por IA, laudo por IA, avaliação de composição corporal por foto com Gemini Vision, exames laboratoriais com protocolo de suplementação por IA.

**Um arsenal clínico com adoção ~0%.**

O furo não é falta de feature — é que **nada disso está no caminho do usuário**. Tudo mora atrás de menus, exige ritual (7 dobras com adipômetro, 3 poses de foto), e não devolve nada imediato.

O que o cara que treina todo dia quer é ridiculamente mais simples:
- **Peso corporal de hoje, em 2 toques.** Hoje o peso só entra de carona no check-in pré-treino ou numa avaliação completa. Não existe tela de "registrar peso".
- Média móvel de 7 dias (peso oscila; tendência é o que importa).
- Uma foto por semana, mesmo ângulo, virando timeline automática.
- "Você ganhou 2kg e seu volume subiu 18% — está indo pro lado certo."

---

## 7. Nutrição: motor de Ferrari, adoção de 3 usuários

O que existe é sério: parser de linguagem natural com unidades caseiras ("2 colheres", "1 concha"), ajuste por preparo, cascata de 6 fontes (base curada → alimentos do usuário → memo de IA → TACO → Open Food Facts → Gemini), scanner de código de barras, leitura de rótulo por Vision, chat com aritmética em TS, ajuste calórico em dia de descanso.

**3 usuários registraram comida. Um deles é o dono.**

Furos concretos:
- **`nutrition_favorite_meals` existe no banco e nenhum componente lê ou escreve.** Feature morta. Quem come frango-arroz-batata todo dia precisa de 1 toque, não de digitar toda vez.
- Meta calórica **não é persistida** — é recalculada a cada render (`goals.ts`). Não versiona, não tem histórico, não recalibra pelo peso real.
- Sem gráfico de kcal/macros ao longo do tempo, sem % de aderência, sem streak de dieta. Existe nota do dia (0–100) mas ela não acumula em lugar nenhum.
- Sem foto do prato com IA (a Vision só lê rótulo) — é a forma de registro com menos fricção que existe e não está lá.
- Meta de água hardcoded em 2500ml (`WaterTracker.tsx`), não deriva do peso nem do treino.
- Sem ciclo de carbo, refeed, diet break, fases de cutting/bulking com duração e taxa-alvo.
- **⊕ Lembrete de refeição é código morto.** O usuário configura o horário em `SettingsSections.tsx:881`, a tabela `nutrition_meal_reminders` existe e o endpoint `/api/nutrition/reminders/trigger` está pronto — mas **não há entrada para ele nos 15 crons do `vercel.json`**. Nada dispara. Confirmado no banco: `meal_reminder` = **0 notificações na história do app**. O usuário liga um interruptor que não está ligado a nada.
- **Sem coaching longitudinal:** a meta não se recalibra pela tendência de peso × ingestão real × aderência. É esse ajuste semanal automático que sustenta o MacroFactor — e é justamente o que transforma registro em resultado.

---

## 8. HealthKit lê tudo e não guarda nada

Lê passos, FC, FC de repouso, HRV, calorias ativas e **sono**. Calcula um RecoveryScore (60% HRV + 40% FC repouso). E:

- **Nada disso é persistido no banco.** É estado React efêmero. Fecha o app, acabou.
- **O RecoveryScore não influencia absolutamente nada.** Nenhuma sugestão de carga, volume ou descanso lê aquele número.
- **⊕ E a fórmula usa faixas universais**, não o baseline do próprio usuário (`RecoveryScore.tsx:40`): HRV e FC de repouso comparados contra valores de referência genéricos, com defaults quando falta leitura. HRV é uma métrica em que o valor absoluto quase não significa nada — só o desvio da *sua própria* média móvel significa. É assim que WHOOP e Oura funcionam. **Ordem de correção importa: persistir e conectar primeiro, personalizar a fórmula depois** — refinar um número que nenhum código consome é otimizar o irrelevante.
- Peso do Health não é lido.
- Sono é lido e não aparece em nenhum gráfico nem se correlaciona com performance.
- **Zero suporte a Android/Google Fit/Health Connect** — metade da base não tem nada disso.

Existe um app de Apple Watch nativo real (targets Swift, complications, ponte bidirecional) — para uma base onde ninguém usa nem check-in de academia.

---

## 9. Social: a única coisa que engaja, e está pela metade

105 stories. É a feature com maior densidade de uso relativa depois do registro de treino. Um usuário sozinho publicou 92.

Mas o "feed" é uma consulta na tabela `notifications` filtrada por quem você segue (`/api/social/feed`) — não é um feed de conteúdo. E:

- **Não dá pra comentar nem curtir um treino.** Só story (que expira).
- Não há comparação lado a lado com um amigo ("meu supino × o dele").
- Ranking só entre quem você segue — com 11 follows aceitos na base inteira, o ranking está vazio para quase todo mundo.
- Desafios são apenas `workouts_count` e `streak`, armazenados como linhas de `notifications`, sem tabela própria. Nada notifica quando o desafio está acabando.

**⊕ E os desafios estão funcionalmente quebrados.** `creatorProgress` e `opponentProgress` são gravados como `0` na criação (`src/app/api/social/challenges/route.ts:176-177`) e **nenhum arquivo do repo os atualiza depois** — verificado por varredura global dos dois identificadores. O `ChallengesPanel.tsx:307` lê esses campos e desenha uma barra de progresso que **nunca sai de 0%**. O tipo `challenge_completed` é lido no GET e nunca inserido por ninguém: nenhum desafio pode ser concluído.

Ressalva de prioridade: no banco há **zero desafios criados na história do app** (nenhum `challenge_created`). É um bug real numa feature que nunca foi usada — o conserto certo é junto com uma redução de fricção da descoberta social, não isolado.

**⊕ A gamificação pune o descanso.** O streak exige dias **consecutivos** (`useWorkoutStreak.ts`) e o cron `streak-at-risk` avisa quando o usuário não treinou naquele dia. Para hipertrofia e força, isso empurra na direção contrária da recuperação — o app fabrica culpa por um dia de descanso que era o correto a fazer. A métrica certa é **aderência ao plano semanal** ("4 de 4 treinos"), que permite descanso planejado sem quebrar nada. Detalhe que dói: `streak_at_risk` tem **85% de leitura** — é uma das notificações mais eficazes do app, e está empurrando o comportamento errado.
- Sem grupos/turmas — nada que sirva a uma academia, a um time, a um grupo de amigos.
- **Treino em dupla foi removido** (migration `20260715153440`) — era o diferencial social mais forte do produto.

E o teste A/B involuntário já foi feito: notificação sobre **você** = 82–85% de leitura. Notificação sobre **os outros** = 1,6%. O produto dispara muito mais do segundo tipo.

---

## 10. Onboarding não leva a lugar nenhum

O onboarding formal (`/onboarding`) coleta **nome e senha**. Só. Objetivo, nível, frequência, equipamento disponível, restrições — tudo isso fica para o usuário descobrir depois, escondido em Settings.

Existe um `workout-wizard` com IA (e fallback determinístico completo, 515 linhas, que funciona sem IA nenhuma) — **e ele não está no fluxo de primeiro uso**.

**6 de 52 cadastrados nunca concluíram um treino.** O caminho "instalei → estou treinando" exige que a pessoa monte o treino sozinha, exercício por exercício, série por série. É o pior gargalo de ativação possível.

O que falta: 5 perguntas → primeiro treino gerado e pronto para começar em menos de 2 minutos.

---

## 11. Biblioteca de exercícios sem instruções

`exercise_library` tem `display_name_pt`, músculos, equipamento, dificuldade e `video_url` (que pode ser nula). **Não tem coluna de instrução, dica de execução ou erro comum.**

Para quem treina sozinho — que é a maioria — "como faço isso direito?" é uma pergunta diária. O app tem um pipeline de vídeos com IA para admin e nenhum texto técnico. E não há navegação da biblioteca: o usuário só encontra um exercício buscando pelo nome, ou seja, só encontra o que já conhece.

---

## 12. Sem loop de fechamento: o RPE e a dor entram e não saem

O usuário informa, série a série: RPE, dor, energia, humor, satisfação (`workout_checkins` tem 446 registros de um único usuário). Esses dados alimentam:

- `pain_suggestions` da IA pós-treino, se ele abrir o relatório e clicar.
- Uma tela do professor, se ele tiver professor.

**E só.** Ninguém pede esse dado sem devolver nada. É exatamente o tipo de coisa que faz o usuário parar de preencher.

**⊕ E a dor não vira regra persistente.** O check-in pré-treino aceita "cansado" e nota livre (`DashboardModals.tsx:661`); o pós-treino grava uma nota **global** de dor (`Modals.tsx:207`). Não existe:

- Mapa corporal para apontar *onde* dói.
- Histórico por articulação ("ombro direito reclamou 5 vezes nos últimos 2 meses").
- Vínculo dor → exercício causador.
- Restrição permanente ("nunca me prescreva desenvolvimento por trás").
- Regra automática de substituição quando a região está sensível.

Quem treina todo dia convive com dor e limitação — é a condição normal, não a exceção. O app coleta o sintoma como texto solto e esquece. Existe um `AIExerciseSwap` que troca exercício sob demanda, mas ele não sabe nada do seu histórico de dor.

---

## 13. Periodização trancada atrás do VIP

Existe um motor de periodização real (`src/utils/vip/periodization.ts`): linear/ondulatório, blocos de 4/6/8 semanas, fases de adaptação/progressão/pico/deload/teste, % do 1RM estimado a partir do histórico real do usuário.

Furos:
- É exclusivo VIP/professor — o usuário comum não tem nenhuma noção de ciclo.
- **O programa é gerado uma vez e nunca se adapta ao desempenho real.** Se na semana 3 o usuário está falhando as cargas, a semana 4 não muda.
- A "semana de teste" é só um rótulo de fase — não existe AMRAP nem protocolo de teste de 1RM instrumentado.

---

## 14. Offline pela metade

A fila IndexedDB cobre `finish_workout` e nutrição. **Não cobre:** criar/editar treino, check-ins e salvar cardio. Academia com sinal ruim é a regra, não a exceção — e offline completo é gate de VIP Pro.

---

## 15. Aparato de professor/monetização desproporcional

Existe: convite de aluno, controle remoto do treino ao vivo, revisão de vídeo de execução, prescrição de dieta, periodização, inbox/CRM, planos de serviço próprios, cobrança via Asaas, carteira, faturas, verificação de CREF, agenda, 5 tiers de plano (R$49 a R$249).

Não existe: **vitrine de professores no app**. Não há como um aluno *descobrir* um professor. O marketplace tem backend de pagamento e não tem loja.

E o referral gera código, conta indicações e **não entrega nenhuma recompensa** — o endpoint só conta.

---

## 16. ⊕ Faltam as conveniências que reduzem atrito na barra fixa

Furo pequeno de escopo, grande de uso — o usuário encosta nisso em **toda série**:

- **Calculadora de anilhas.** "82,5kg na barra" → quais discos de cada lado. Todo mundo faz essa conta de cabeça, errando.
- **Aquecimento percentual automático.** Série valendo de 100kg → 40/60/80% já montados como aquecimento.
- **Copiar a sessão anterior com 1 toque.** Hoje o watermark preenche os inputs, mas não há "repetir exatamente o que fiz".
- **Filtro da busca de exercício por equipamento disponível.**

O Hevy trata isso como básico. Não é visão de produto — é ergonomia, e é barato.

---

## 17. ⊕ Android roda um produto menor que o iOS

Já mapeado em [docs/android-parity-audit.md](docs/android-parity-audit.md): 42 achados, **corrigidos em 4 ondas (PRs #368–#371)** — permissões de câmera/áudio que estavam mortas, foreground service do rest timer, GPS de cardio em background, ícone de notificação. O grosso já foi.

O que permanece aberto no Android: **Health Connect** (logo, sem widget de saúde, sem RecoveryScore, sem FC, sem sono, sem gravar o treino na saúde), botões de ação nativos no push, indicação persistente de treino em andamento, voz nativa e geofence.

Dois itens do doc ainda esperam decisão sua e não são técnicos: **Play Billing** (risco de reprovação por vender bem digital fora do Play) e **keystore + senhas commitados no git**. Esse segundo é segurança, não paridade.

---

# Resumo dos furos estruturais (dívida, não visão)

| # | Furo | Arquivo |
|---|---|---|
| 1 | `/api/ai/suggest-load` implementado e **nunca chamado** pelo cliente | `src/app/api/ai/suggest-load/route.ts` |
| 2 | `nutrition_favorite_meals` no banco, **zero código** que use | migration `20260319120000` |
| 3 | PR não persistido — recalculado em runtime | `useReportData.ts:460` |
| 4 | Histórico de deload em **localStorage** | `useWorkoutDeload.ts` |
| 5 | Meta calórica não persistida (recalculada a cada render) | `src/lib/nutrition/goals.ts` |
| 6 | HealthKit/RecoveryScore/sono não persistidos e sem consumidor | `useHealthKit.ts` |
| 7 | `workout_reminder` existe como label, **nada dispara** | `NotificationCenter.tsx:122` |
| 8 | `nextWorkout` = próximo item do array | `IronTracksAppClientImpl.tsx:861` |
| 9 | Meta de água hardcoded 2500ml | `WaterTracker.tsx` |
| 10 | Fila offline não cobre check-in, cardio nem edição de treino | `src/lib/offline/` |
| 11 | ⊕ Progresso de desafio gravado como 0 e **nunca atualizado** por nada | `api/social/challenges/route.ts:176` |
| 12 | ⊕ Lembrete de refeição sem cron no `vercel.json` — nunca dispara | `SettingsSections.tsx:881` |
| 13 | ⊕ `apply-progression-next` ordena templates por `name` (alfabético) ≠ ordem da UI | `api/ai/apply-progression-next/route.ts:63` |
| 14 | ⊕ Progressão gravada como **texto** em `advanced_config`, sem tocar peso/reps | `api/ai/apply-progression-next/route.ts:115` |
| 15 | ⊕ Dia do treino via parse do **título**, sem campo estruturado | `utils/workout/workoutDay.ts` |
| 16 | ⊕ RecoveryScore com faixas universais, sem baseline pessoal | `RecoveryScore.tsx:40` |

---

# Priorização

Nada aqui propõe remover funcionalidade. A ordem abaixo é sobre **onde entra o próximo esforço** — o que já está construído continua vivo e mantido.

## P0 — o loop que falta (transforma caderno em treinador)
1. **Ligar o `suggest-load` na UI.** O motor existe. É plugar. Peso-alvo prescrito por série.
2. **Auto-regulação por RPE.** O dado já é coletado. RPE baixo consistente = sobe carga.
3. **Alerta automático de estagnação** pós-treino + push (o tipo de notificação com 82% de leitura).
4. **PR como entidade de primeira classe:** tabela, histórico, celebração, e "faltam X kg" durante a série.
5. **Cockpit do "hoje":** abrir o app e em 15 segundos saber o que fazer e por quê — antes de Iron Rank, mapa muscular, assinatura e equilíbrio muscular.

## P0.5 — correções baratas com efeito imediato
6. **Cron do lembrete de refeição** — uma linha no `vercel.json` destrava uma feature que o usuário já configurou e acha que está ligada.
7. **Ordenação do `apply-progression-next`** — usar `sortWorkoutsByOrder`, a mesma da UI, para parar de acertar o treino errado.
8. **Progressão escrita em `weight`/`reps`**, não como texto em `advanced_config`.

## P1 — ativação e ritmo
9. **Onboarding → primeiro treino em 2 min** (o gerador já existe, com fallback offline). Coletar equipamento, disponibilidade, dias preferidos, limitações e objetivo com prazo.
10. **Campo estruturado de dia da semana** (hoje é parse do título) + agenda do aluno + `workout_reminder` disparando de verdade.
11. **Aderência semanal ao lado do streak** ("4 de 4 nesta semana") para que descanso planejado não conte como falha.
12. **Rodízio inteligente:** "faz 11 dias que você não treina perna."
13. **Perfil persistente de dor e limitação:** mapa corporal, histórico por articulação, restrição permanente, substituição automática.
14. **Peso corporal em 2 toques** + média móvel de 7 dias.

## P2 — fricção e profundidade do que já existe
15. Refeições favoritas (tabela pronta, é só UI).
16. Calculadora de anilhas, aquecimento percentual, repetir sessão anterior, filtro por equipamento.
17. Foto do prato com IA.
18. Instruções de execução na biblioteca de exercícios.
19. Fila offline completa (check-in, cardio, edição).
20. Persistir HealthKit; **depois** trocar as faixas universais do RecoveryScore por baseline pessoal; **depois** deixar o score modular o treino do dia. Nessa ordem.
21. Ajuste nutricional semanal por tendência de peso × ingestão real × aderência.

## P3 — social que retém
22. Comentário/curtida em treino (não só em story efêmero).
23. Consertar o progresso dos desafios — junto com o trabalho de descoberta social, para não entregar de novo uma feature correta que ninguém encontra.
24. Grupos/turmas.
25. Rebalancear notificações: menos sobre terceiros (1,6% de leitura), mais sobre o próprio usuário (82–85%).

## P4 — plataforma e ecossistema
26. Health Connect no Android (destrava saúde, recuperação, sono e FC para metade da base potencial).
27. Cardio programado: zonas de FC, intervalados, splits por km.
28. Integrações externas (Garmin, Strava, Health Connect bidirecional), Wear OS.

## Duas decisões pendentes que não são de roadmap
Do `docs/android-parity-audit.md`, ainda esperando você: **Play Billing no Android** (risco de reprovação por bem digital vendido fora do Play) e **keystore + `key.properties` commitados no git**. O segundo é segurança e independe de qualquer priorização de produto.

---

## Nota sobre o que fica

Várias features caras têm adoção zero hoje: exames laboratoriais com protocolo de IA, avaliação de composição por foto, laudo de bioimpedância, marketplace de professor, app do Apple Watch, check-in por geofence/QR. **Não são erros** — são apostas que ainda não encontraram o usuário, e várias delas viram diferencial forte assim que a base crescer. O ponto é só que nenhuma delas resolve a dor de quem está no app hoje, e por isso não competem pelo próximo sprint.

Duas coisas ajudam a não desperdiçá-las: colocá-las no caminho do usuário em vez de atrás de menus (a avaliação por foto morre por não ser oferecida na hora certa, não por ser ruim), e instrumentar uso para saber quando alguma delas começar a pegar.

---

## Conclusão em uma frase

O IronTracks resolveu com excelência o problema de **registrar** o treino e não começou a resolver o problema de **conduzir** o treino — e é o segundo que faz alguém abrir um app de musculação 5 vezes por semana durante anos.
