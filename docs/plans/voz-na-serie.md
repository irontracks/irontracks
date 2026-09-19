# Plano — lançar peso/reps/RPE por VOZ na série (treino ativo)

> Pedido do dono (19/09/2026): *"um botão por série; quando clica, fala: 100kg –
> 12 repetições – rpe 8"*. Plano escrito em Opus 5 conforme
> `docs/skill-planejamento.md`; execução prevista em Sonnet.
>
> **Status:** aguardando as decisões da seção final. Nada foi implementado.

## 0. O que já existe — e por que isso muda o tamanho da obra

A conta inicial ("fica muito caro") partia de escrever reconhecimento de voz.
Não é o caso: **a infraestrutura inteira já está em produção.**

| peça | arquivo | estado |
|---|---|---|
| ditado (iOS nativo + web, permissões, auto-parada por silêncio 3 s) | `src/hooks/useSpeechToText.ts` | pronto, reusado por 2 telas |
| ponte nativa `startSpeechRecognition` | `ios/App/App/IronTracksNativePlugin.swift:2154` | **já está no build instalado** |
| crash da voz (AVAudioSession antes do tap) | corrigido em 28/08/2026 | no ar |
| parser de fala livre pt-BR (precedente) | `api/ai/parse-exercise-voice` | padrão a copiar, **sem** reusar a rota |
| falar de volta, com desfecho medido | `src/lib/voz.ts` | pronto |
| número → texto falado | `lib/workout/vozDoCardio.ts` (`numeroFalado`) | pronto (o inverso do que precisamos) |

⚠️ **Consequência decisiva: esta feature é 100 % web.** Nenhuma linha de Swift
muda, então ela entra por deploy da Vercel e vale na hora para todos os apps
instalados — **sem TestFlight**. O que sobra de trabalho real é: um parser
determinístico, uma fronteira de escrita no log, e um botão que caiba na tela.

## 1. A restrição dura: o botão por série NÃO cabe na linha

A linha da série normal já tem seis colunas
(`normalSet.tsx:787`): `32px nº · 36px notas · 3fr peso · 2.5fr reps · 1.5fr RPE · 92px Concluir`.

Aritmética do grid (largura útil = viewport − padding da lista − `px-2.5` do
card; cada `fr` = livre × fr/7):

| viewport | hoje (peso / reps / RPE) | com um mic de 36 px |
|---|---|---|
| **390 pt** (iPhone comum) | 63,4 / 52,9 / **31,7 px** | 45,4 / 37,9 / **22,7 px** |
| 402 pt | 68,6 / 57,1 / 34,3 px | 50,6 / 42,1 / 25,3 px |
| 430 pt (Pro Max) | 80,6 / 67,1 / 40,3 px | 62,6 / 52,1 / 31,3 px |

**A faixa de campos perde 28 % no aparelho mais comum, e o RPE cai para ~23 px**
— não cabe "8,5" nem o placeholder. Some-se a isto que o alvo de toque mínimo do
app é 44 pt (`.tap-44`), e que `.tap-44` estende a área pelo `::after`: numa
linha densa, a área estendida do microfone invade os campos vizinhos e rouba o
toque — **exatamente o problema já medido nos dots do tour e na tira de
navegação do treino ativo**.

Por isso a posição do botão é a **primeira decisão do dono** (seção 8), com três
saídas desenhadas. O resto do plano vale para qualquer uma delas.

## 2. Arquivos

### Criar

| arquivo | responsabilidade |
|---|---|
| `src/lib/workout/falaDaSerie.ts` | **parser puro**: `"100kg 12 repetições rpe 8"` → `{ pesoKg?, reps?, rpe?, entendeu, bruto }`. Inclui conversão de número por extenso pt-BR (0–999 + "e meio"). Sem React, sem rede, sem IA. |
| `src/lib/workout/__tests__/falaDaSerie.test.ts` | guard do parser, com as frases REAIS medidas na Fase 0. |
| `src/components/workout/hooks/useDitadoDaSerie.ts` | **fronteira única de escrita**: fia `useSpeechToText` + `falaDaSerie` + `updateLog`, sempre com `weightSource: 'user'`. Gere também a trava de ditado único (§5). |
| `src/components/workout/set-renderers/VoiceSetButton.tsx` | o botão + os estados visíveis (ocioso / ouvindo / não entendi / permissão negada). Um componente só. |
| `src/components/workout/set-renderers/__tests__/vozDaSerie.test.tsx` | guards de fiação e de classe (§6). |

### Editar

| arquivo | mudança |
|---|---|
| `src/components/workout/set-renderers/normalSet.tsx` | monta o `VoiceSetButton` na posição escolhida. **Não tocar no `useInputField`** (§5). |
| `src/components/workout/set-renderers/groupMethodSet.tsx` | idem, se a decisão 4 incluir Bi-Set/Super-Set (campos inline). |
| `src/lib/workout/telemetriaTreino.ts` | evento novo no catálogo `EVENTOS_TREINO` — nome digitado à mão em `components/` reprova no guard existente. |

## 3. Sequência, e por que esta ordem

**Fase 0 — medir o transcript ANTES de escrever o parser.** (obrigatória)
Ninguém sabe o que o `SFSpeechRecognizer` devolve para "oitenta e dois e meio":
pode vir `"82,5"`, `"82.5"`, `"oitenta e dois e meio"` ou `"82 e meio"`. Escrever
o parser antes de saber é o mesmo erro que a suíte de 7.400 testes verdes não
pegou na nutrição — o que achou o defeito lá foi um script com quinze frases
reais. Entrega: uma tela/atalho descartável que grava o transcript CRU em
`user_activity_events`, o dono ditando ~15 frases na academia, e a lista do que
voltou. **Sem isso, o parser é chute.**

**1. Parser + testes** (`falaDaSerie.ts`) — função pura, testável sem device,
alimentada pelas frases da Fase 0.

**2. Fronteira de escrita** (`useDitadoDaSerie.ts`) — antes do botão, porque é
ela que carrega a regra que não pode falhar (`weightSource: 'user'`, §5).

**3. Botão + posição** (`VoiceSetButton.tsx` + `normalSet.tsx`) — depende da
decisão 1.

**4. Telemetria** — `resultado` do reconhecimento e `entendeu` do parser. O que
se quer medir é *"a fala vira número neste aparelho, nesta academia?"*.

**5. Conferência na TELA** (`/tela`), no simulador e no aparelho do dono. A
suíte verde não vê o que só existe na tela — e aqui metade da feature é
microfone, ruído e layout.

## 4. Fronteiras negativas (não tocar)

- **`useInputField`** (`normalSet.tsx:49`) — zona de corrida documentada, já
  jogou valor digitado fora duas vezes. A voz escreve pelo `updateLog`, como
  qualquer outro editor; **não** mexer no mecanismo de sincronização.
- **Motor de carga automática** (`utils/autoload/`, `useAutoloadWeight`) — a voz
  é um editor, não uma nova fonte de sugestão.
- **Os 11 renderers de modal** — o molde único (`AdvancedSetRow`) é o contrato;
  nada de linha desenhada à mão em renderer.
- **`RestTimerOverlay` / barra de descanso / Live Activity** — zona que já
  quebrou 12× em silêncio.
- **Nenhuma rota de IA nova.** O parser é determinístico. Mandar cada série ao
  Gemini custa dinheiro por série e adiciona latência no meio do treino.
- **Nenhuma dependência nova** sem perguntar (conversor de número por extenso é
  ~60 linhas próprias).
- **Nada de Swift / `pbxproj`** — o que exigisse build nova mata a premissa de
  "entra hoje para todo mundo".

## 5. Riscos e casos de borda (todos verificáveis)

1. ⚠️ **A janela de graça de 2 s pode ENGOLIR o valor falado.**
   `TYPED_VALUE_GRACE_MS = 2000` (`normalSet.tsx:38`): por 2 s após uma
   digitação, o campo ignora o valor externo. Quem digitar o peso e falar as
   reps em seguida pode ver a fala ser descartada **sem erro nenhum**. Precisa
   de caso de teste explícito (digitar → falar em <2 s → o valor falado
   sobrevive).
2. ⚠️ **`weightSource: 'user'` é obrigatório.** Sem a marca, o efeito do
   `useAutoloadWeight` re-sincroniza o campo com a sugestão do motor e **apaga o
   peso falado** — foi exatamente o bug "não deixa trocar o peso" de 22/08/2026.
   O guard de classe `pesoEditavelComAutoload.test.tsx` já varre os 14 renderers
   e reprova `updateLog` com `weight` sem `weightSource`: o código novo nasce
   sob ele.
3. ⚠️ **Dois ditados ao mesmo tempo disputam o microfone.** `useSpeechToText` é
   por instância; um botão por série significa N instâncias vivas no mesmo card.
   Precisa de **trava de ditado único** (só uma série ouvindo por vez), senão o
   segundo reconhecedor derruba o primeiro — e no iOS nativo os dois chamam
   `stopNativeSpeechRecognition` um do outro.
4. ⚠️ **Ditar pode cortar a música do usuário.** O plugin põe a `AVAudioSession`
   em categoria de gravação; o `AppDelegate` a devolve para `.playback`
   justamente para a música continuar (já houve o caso de roubar o foco do
   Spotify). Na academia, isso significaria a música parar **a cada série**.
   Precisa ser medido no aparelho, com Spotify tocando, antes de a feature ser
   considerada pronta.
5. **Ruído de academia** — a taxa de erro real só aparece no ambiente. Daí o
   estado "não entendi" ser parte do desenho, não um extra: o parser devolve
   `entendeu: false` e a linha **não** é preenchida com chute.
6. **Permissão negada** — `useSpeechToText` já expõe `permissaoNegada`; o botão
   precisa dizer o que fazer, não sumir em silêncio.
7. **Fala parcial** ("100 quilos" e nada mais) — decisão 2.
8. **`Number('')` é 0** — a armadilha que já mordeu o `numeroFalado`. Campo não
   dito ≠ campo zerado: o parser devolve `undefined`, nunca `0`.
9. **`jsdom` não tem `SpeechRecognition`** — o teste do botão mocka o hook; a
   API de browser sempre atrás de `typeof X !== 'undefined'`.

## 6. Guards (cada um provado por mutação — `npm run mutar`)

| guard | trava | mutação que precisa ficar VERMELHA |
|---|---|---|
| `falaDaSerie.test.ts` | as frases reais da Fase 0 viram os números certos | trocar a ordem peso/reps; aceitar frase ambígua |
| "voz escreve como USUÁRIO" | todo `updateLog` do caminho de voz leva `weightSource: 'user'` | remover a marca → o autoload reescreve |
| "não entendi não preenche" | `entendeu: false` não escreve nada no log | passar a gravar o palpite |
| "um ditado por vez" | duas séries não ouvem juntas | remover a trava |
| catálogo de telemetria (já existe) | nome de evento não digitado à mão | string literal em `components/` |
| alvo de toque (já existe) | o botão tem 44 pt reais | reduzir para 36 |
| nome acessível (já existe) | o botão tem `aria-label` | remover o rótulo |

## 7. Critério de pronto

1. `npx tsc --noEmit` — zero erros.
2. `node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs <arquivos> --max-warnings 0` — saída vazia.
3. `npm run test:unit` verde (hoje: 8.272 casos).
4. Cada guard da §6 provado por mutação (vermelho com o defeito, verde sem).
5. **Prova de campo, não só de suíte:** as 15 frases da Fase 0 passando pelo
   parser, e o ditado funcionando no aparelho do dono com música tocando
   (risco 4) e com o ruído da academia (risco 5).
6. `/tela` no simulador: a linha da série não perdeu legibilidade na viewport de
   390 pt.

## 8. Decisões que só o dono pode tomar

Respondidas em 19/09/2026 — ver a seção 9, **que substitui qualquer recomendação
anterior deste arquivo**.

## 9. Respostas do dono (19/09/2026) — valem sobre o resto do plano

| # | decisão | resposta |
|---|---|---|
| 1 | posição do botão | **Um por EXERCÍCIO**, no card — não por série |
| 2 | fala parcial | **Preenche o que entendeu**; campo não dito fica como está (nunca vira 0) |
| 3 | concluir automaticamente | **Não** — a voz só preenche; concluir continua sendo o toque |
| 4 | alcance | **Série normal + Bi-Set / Super-Set / Tri-Set** (os dois com campos inline) |

### O que a COMBINAÇÃO das respostas produziu (e que nenhuma delas dizia sozinha)

⚠️ **"Botão por exercício" (1) + "não conclui" (3) deixam o alvo parado.** Se o
botão preenchesse "a primeira série não concluída", ditar duas vezes seguidas
escreveria **sempre na mesma série** — porque, sem conclusão automática, ela
continua pendente. O usuário ditaria a série 2 e sobrescreveria a 1, em
silêncio, que é o pior tipo de defeito deste app.

**Regra derivada, que vira requisito:** a série alvo é a **primeira sem dado do
usuário** (sem `weight`/`reps` vindos de `weightSource: 'user'`) — não a primeira
sem `done`. Empate ou todas preenchidas: a primeira não concluída. E o botão
**diz na tela qual série vai receber** antes de ouvir ("Série 2"), porque alvo
implícito em tela de academia é alvo errado.

⚠️ **"Por exercício" (1) exige que o parser entenda "série N".** Sem isso, não há
como corrigir a série 1 depois de já ter ditado a 2 — o alvo automático só anda
para frente. `"série 2: 100kg 12 reps"` passa a ser gramática obrigatória do
parser, não um extra.

⚠️ **Bi-Set/Super-Set (4) não quebram a regra, mas mudam o ritmo.** Cada membro
do grupo é um exercício com card próprio, então "a série da vez deste card"
continua bem definida — mas o app **auto-alterna entre os membros** ao concluir
(`ExerciseList`), e o usuário vai ditar em cards alternados. A conferência na
tela precisa cobrir esse vai-e-vem, não só um exercício isolado.

### O que isso muda nos arquivos da seção 2

- `VoiceSetButton.tsx` passa a ser **`VoiceExerciseButton.tsx`** — mora no card do
  exercício, não na linha da série. A tabela de larguras da §1 deixa de ser
  restrição (o botão sai da grade), e o alvo de 44 pt fica trivial.
- `useDitadoDaSerie.ts` ganha a responsabilidade de **resolver a série alvo**
  (regra derivada acima) e de aceitar o índice explícito vindo da fala.
- `falaDaSerie.ts` ganha `serie?: number` no retorno.
- `normalSet.tsx` **não é mais editado para o botão** (o botão não entra na
  linha); segue intocado, o que também elimina o risco de mexer perto do
  `useInputField`. `groupMethodSet.tsx` idem.
- Entra em vez deles: o card do exercício (`ExerciseCard` e o overlay do
  parceiro — ⚠️ **o botão NÃO pode nascer no card do parceiro**, mesma fronteira
  do chat de IA por exercício: quem decide é a sessão ser própria).

### Guards que a combinação acrescenta à §6

| guard | mutação que precisa ficar VERMELHA |
|---|---|
| a série alvo é a primeira **sem dado do usuário** | trocar por "primeira sem `done`" → ditar 2× escreve na mesma série |
| ditar duas vezes seguidas preenche séries **diferentes** | idem acima, pelo comportamento |
| `"série 2: …"` vence o alvo automático | ignorar o índice falado |
| o botão não aparece no card do parceiro | remover a checagem de sessão própria |
