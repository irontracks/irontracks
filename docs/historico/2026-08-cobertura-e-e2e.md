<!-- Movido do CLAUDE.md em 10/09/2026 pelo /enxugar.
     Motivo: era changelog. As regras VIVAS ficaram no CLAUDE.md; aqui está o registro completo. -->

## Cobertura de teste: o que roda no CI hoje (15/08/2026)

O teste manual de 10 passos passou por cima de **5.476 testes verdes** (hoje
5.582) e ainda
achou três defeitos — porque nenhum deles ANDAVA pelo app. Estado atual, para
ninguém remedir:

| camada | roda no CI? | o que cobre |
|---|---|---|
| Vitest unit/integração (5,6k) | **sim** | lógica, contratos, guards de classe |
| Vitest de jornada (jsdom) | **sim** | contrato entre componentes (ex.: `jornadaDescansoRodape` — o descanso publica `--it-rest-bar-h`, o rodapé consome, some ao desmontar) |
| Playwright público (29 testes) | **sim, desde 15/08** | páginas públicas carregam, protegidas redirecionam sem 500, árvore de acessibilidade íntegra |
| Playwright autenticado (jornada, 4 testes) | **sim, desde 16/08** | percorre treino real em viewport mobile contra o preview da Vercel, sem expor chaves privadas de servidor |
| `visual-regression` | **não, de propósito** | screenshot entre máquinas diferentes é flake por construção |

**A jornada logada de UI já tem spec** (`e2e/authenticated-workout-journey.spec.ts`,
15/08/2026): concluir série com o FINALIZAR alcançável durante o descanso,
renomear no editor completo sem perder o foco, campo numérico substituindo, e
sair/voltar preservando a sessão. O job do CI aponta para o **preview da Vercel
do PR**, porque ali o dashboard já tem as variáveis privadas de servidor sem
expor `SUPABASE_SERVICE_ROLE_KEY` ao repositório público. O gate exige as
credenciais da conta de teste e `VERCEL_AUTOMATION_BYPASS_SECRET`. Os cinco
secrets necessários estão configurados no GitHub. A primeira execução limpa foi
o run `31926932133`: preview encontrado, **4/4 testes em 26,1 s**, sem retry nem
flake. Continua fora: sanear `admin-protection` e `critical-api`, que falham por
ambiente.

### Escrever E2E de UI: cinco jeitos de passar VERDE com o bug presente

Todos medidos ao escrever aquele spec — cada um passou verde com o defeito
reposto antes de o teste ser corrigido:

1. **Viewport errada.** A barra do descanso é centralizada (`max-w-md`); em
   tela larga ela não cobre o FINALIZAR e o caso passa. O app é mobile —
   `test.use({ viewport: { width: 390, height: 844 } })`.
2. **Superfície errada.** O bug do teclado era no EDITOR COMPLETO e só em
   exercício ADICIONADO na hora: exercício salvo tem `id` e a key já é estável;
   no modal rápido de exercício o defeito nunca existiu.
3. **Asserção que o framework conserta.** Conferir o VALOR digitado não pega
   remount: o Playwright re-resolve o locator a cada tecla e o estado do React
   repõe o texto. O que não sobrevive é a IDENTIDADE do nó
   (`elementHandle` + `isConnected`).
4. **`hover` no lugar de `click({ trial: true })`.** Hover move o mouse sem
   exigir que o alvo receba o ponteiro — passa com outro elemento por cima.
   O trial click roda todas as checagens de actionability sem clicar.
5. **Estado que o teste mesmo criou.** Clicar num campo que já está focado não
   dispara `focusin`; o caso do select-on-focus media um cenário inexistente
   até o teste tirar o foco antes.

### ⚠️ A sessão de treino ativa é SINCRONIZADA PELO SERVIDOR — e o E2E divide a conta

Custou um CI vermelho num PR que só mexia em `.md`, e o diagnóstico começou
errado duas vezes.

`active_workout_sessions` (tabela, com `state` jsonb) guarda a sessão em
andamento **no servidor**, para o treino continuar de outro aparelho. Ou seja:
ela **sobrevive entre execuções do CI** e é compartilhada por TODOS os clientes
logados na conta de teste — inclusive um simulador esquecido aberto.

Foi o que houve em 16/08/2026: deixei o app aberto no simulador com
`djmkbrasil`, ele seguiu reescrevendo essa linha por horas, e cada escrita
voltava por **realtime** para o navegador do CI. O `fill('42')` do Playwright
era desfeito pelo estado remoto (o teste esperava `42` e encontrava `40`, o
peso da minha tela) e o re-render constante impedia o botão "Voltar" de ficar
`stable` — o caso morria em `locator.click: Test timeout`.

**Nada disso era bug do app**: é o sync multi-dispositivo funcionando como
projetado. Era contaminação de ambiente.

Duas hipóteses minhas que a verificação derrubou, nesta ordem — as duas
plausíveis, as duas erradas:
1. "É a documentação" — não, o step que falhou foi o E2E logado.
2. "A sessão do simulador vive só no armazenamento local, não alcança o CI" —
   **falso**, e é justamente o ponto: ela vai para o banco.

Só a consulta ao `active_workout_sessions` (com `state->'logs'`) fechou o caso:
o log `0-1` com peso 84 era, literalmente, o que estava na minha tela.

**O que fica:**
- **Isso é AUTOMÁTICO desde 25/08/2026** (pedido do dono): `npm run sim:close`
  (`scripts/sim-close-workout.mjs`) encerra o app em todo simulador ligado e
  apaga a sessão ativa da conta de TESTE. Ele roda sozinho como hook `Stop`
  — ou seja, ao fim de cada resposta —, configurado em `.claude/settings.json`.
  ⚠️ **O `.claude/` está no `.gitignore`**, então o hook é local desta máquina:
  em outro clone existe o script mas não o gatilho. O `user_id` é literal e a
  conta oficial (`djmkapple`) é conferida e recusada; nada mais no banco é
  tocado (medido: apagou 1 linha da conta de teste e preservou as 4 de
  usuários reais).

  ⚠️ **Ele NUNCA tinha limpado o banco rodando de um worktree** — corrigido em
  27/08/2026. O script lia `.env.local` ao lado de si mesmo, e worktree não tem
  esse arquivo (está no `.gitignore`, não é copiado): `lerEnv` voltava vazio e a
  função saía com `return null` **em silêncio**. Como este repo trabalha em
  worktrees, o hook rodava a cada resposta sem fazer nada. Só apareceu quando
  uma órfã de 33 min derrubou o E2E de um PR que só mexia em `.md`. Hoje ele
  procura também na raiz do checkout principal (`git rev-parse
  --git-common-dir`) e AVISA quando não acha credencial, em vez de sair mudo.

  Duas portas para mexer no banco: **simulador ligado** (encerra o app e limpa)
  ou **sessão da conta de teste parada há mais de 30 min**, mesmo sem simulador
  — porque desligar o simulador depois de abrir um treino deixava a órfã para
  sempre. A segunda porta é segura porque olha só a conta de TESTE e exige tempo
  parado: treino real com pausa longa acontece na conta OFICIAL, que o script
  recusa.
- Ao terminar de mexer no simulador com a conta de teste, **encerre o app** —
  app aberto continua escrevendo. E confira a tabela:
  ```sql
  select started_at, updated_at, (state->'logs'->'0-0'->>'weight') as peso_s1
  from active_workout_sessions
  where user_id = '6cb619ba-1484-41f2-b60c-b67aaea06307';
  ```
- O spec da jornada agora **DESCARTA** a sessão preexistente em vez de
  reaproveitá-la. Reaproveitar herda logs que o teste não escreveu — o caso
  deixa de medir o que diz medir.
- Regra geral: **teste E2E que divide conta com gente de verdade precisa partir
  de estado que ele mesmo criou.** Estado herdado é flake com cara de bug.
- **O sintoma nem sempre aparece dentro do treino.** Em 22/08/2026 a jornada
  morreu no `INICIAR TREINO` do DASHBOARD, com `element is not stable` — o
  botão não parava de se mover, porque o estado remoto seguia chegando e
  re-renderizando. Parecia regressão do PR (que mexia em renderers de série) e
  não era: o clique nem chegava perto do código alterado. **Antes de investigar
  o diff, re-rode o job**; passou de primeira no rerun, sem tocar em nada.
- **O CONCORRENTE nem sempre é humano — pode ser o outro run do seu próprio PR
  (24/08/2026, PR #910).** O #909 falhou com "a lista de treinos precisa ter ao
  menos um card" e o rerun passou. Não era flake sem causa: **nenhum workflow
  do repo declarava `concurrency`**, então dois commits da MESMA branch com 2
  minutos de diferença geravam dois runs vivos ao mesmo tempo. Medido com
  precisão de segundos — o E2E do run que passou ocupou 16:37:42→16:38:11 e o
  do que falhou 16:37:54→16:40:13, **17 s de sobreposição**, com a sessão ativa
  nascendo às 16:37:58, dentro deles. Um run chamava `descartarSessao()` na
  sessão que o outro tinha acabado de abrir.

  Hoje o `ci.yml` tem `concurrency` + `cancel-in-progress: true` (o run
  obsoleto morre) e o describe da jornada tem `mode: 'default'` — sem ele,
  `fullyParallel: true` com `workers: 2` punha dois dos quatro casos em voo na
  mesma conta. **`'default'` e não `'serial'`**: os dois rodam em ordem num
  worker só, mas o `serial` PULA os casos seguintes quando um falha, e
  esconderia um segundo defeito atrás do primeiro. Guard de classe em
  `src/__tests__/e2eContaCompartilhada.test.ts` — spec NOVO que abra sessão de
  treino reprova até declarar o modo.

  **A correção foi provada no mundo real, não só por guard:** dois pushes na
  mesma branch com 28 s de diferença, e o run anterior apareceu `cancelled`.

- **A sessão órfã é a causa MAIS COMUM de "a lista de treinos precisa ter ao
  menos um card" — e ela não é do PR (26/08/2026).** Aconteceu três vezes num
  dia (#937 duas vezes, #940 uma), e nas três a investigação começou pelo diff
  do PR, que não tinha nada a ver. Um deles chegou a ser DIVIDIDO em dois para
  bisseccionar um culpado que não existia — e a metade separada passou.

  O mecanismo: a limpeza (`descartarSessao`) é feita pela UI, e é justamente
  quando um caso FALHA que a página fica no estado que o derrubou (modal
  aberto, hidratação pela metade, botão que não estabiliza). O descarte tem
  menos chance de funcionar exatamente quando é mais necessário, a linha de
  `active_workout_sessions` fica no servidor, e o PRÓXIMO run abre o app DENTRO
  de um treino — sem card nenhum no dashboard.

  **Antes de olhar o diff, consulte a tabela.** Se houver linha parada há mais
  de alguns minutos, é resíduo: apague e re-rode.

  ```sql
  select started_at, updated_at, now() from active_workout_sessions
  where user_id = '6cb619ba-1484-41f2-b60c-b67aaea06307';
  ```

  Hoje o spec **avisa** quando não conseguiu descartar (o `.catch(() => {})` que
  embrulhava isso tornava a órfã invisível) e tenta uma última vez no
  `afterAll`, com PÁGINA NOVA — fora do estado que derrubou o caso. Guard em
  `src/__tests__/e2eLimpaSessaoAtiva.test.ts`. O que ele trava não é "a limpeza
  funciona" (depende da UI, e o teste não garante), e sim que ela **não falha
  em silêncio**.

  ⚠️ **Fica um risco residual conhecido:** `concurrency` agrupa por `ref`, então
  dois PRs DIFERENTES rodando ao mesmo tempo ainda dividem a conta. Não foi
  tratado porque exigiria extrair o E2E logado para um job próprio com grupo
  global — e o histórico deste repo é de PRs sequenciais. Se voltar a falhar com
  dois PRs abertos em paralelo, é essa a correção, e o diagnóstico é o mesmo:
  compare as janelas dos steps de E2E com
  `gh api repos/.../actions/runs/<id>/attempts/1/jobs`.

### ⚠️ E2E pendurado é MUDO — e nada no CI pode herdar as 6 h (31/08/2026)

Segunda ocorrência da mesma classe: em 18/08 o step do E2E logado ficou 46 min
sem imprimir nada (causa: `fetch` sem timeout, corrigida) e em 31/08 ficou
**6 horas** — o teto padrão do GitHub —, queimando o runner e travando TODO o
repositório, porque enquanto o step pendura nenhum PR fecha. O rerun do mesmo
commit passou em 9,3 min: é intermitente.

**Silêncio total NÃO significa "travou logo no começo" por acaso — ele
LOCALIZA o defeito.** Com `--reporter=github` o reporter do GitHub não escreve
em stdio (`printsToStdio() → false`); o "Running N tests" que aparece no CI vem
do reporter `dot` que o Playwright acrescenta quando nenhum outro imprime, e
ele fala no `onBegin`. A ordem das tasks do runner é **globalSetup → load →
onBegin**. Zero output ⇒ não passou do globalSetup.

⚠️ **O `actionTimeout` do Playwright é `0` — sem limite.** Dentro de um teste
quem segura isso é o `timeout` do teste; o **globalSetup não tem teste nenhum**,
então `page.fill`/`page.click` esperavam para sempre (um botão de submit que
nunca fica acionável basta). `chromium.launch()` **não** era o problema: já tem
30 s de default. E `browser.close()` não aceita `timeout`, só `reason`.

Hoje há três defesas, e a ORDEM é o que dá diagnóstico: `globalTimeout`
(8 min, playwright.config — o ÚNICO teto que alcança o globalSetup, porque o
deadline do run é calculado antes da primeira task) **<** `timeout-minutes` do
step (10) **<** do job (30). Quem dispara primeiro é o único que explica o
motivo; o teto do GitHub só mata. Guard em `__tests__/e2eTetoDeTempo.test.ts`,
que cobra job/step sem teto e a ordem entre os três.

### Armadilhas de ambiente (custaram mais que o spec)

- **A porta 3000 pode ter OUTRO projeto.** Com `reuseExistingServer`, o
  Playwright testa o app errado em silêncio — a suíte rodou inteira contra a
  tela de login de outro produto. Use `PLAYWRIGHT_PORT`.
- **`globalSetup` roda junto com a subida do servidor**: sem esperar o app
  responder, o login falha, o storage state não é criado e TODOS os testes
  autenticados morrem com `Error reading storage state`, que não diz a causa.
- **`secrets` NÃO existe em `if:` de step.** Usar ali derruba o workflow
  INTEIRO antes de rodar qualquer passo ("workflow file issue", run
  31918472665) — inclusive typecheck e testes. Leia para `env` no nível do job.
  Guard varre isso em `ciE2ePublicoLigado.test.ts`.
- **`npm run dev` não aguenta a suíte**: o app chega a mostrar "Não foi
  possível carregar o app" depois de algumas execuções. Rode contra o build
  (`CI=1 PLAYWRIGHT_CI_SERVER=1`), que é o que o CI faz.

**jsdom não tem `ResizeObserver`** — usar direto derrubou 3 testes de cardio e,
no aparelho, seria a tela inteira do descanso caindo. API de browser moderna em
componente sempre com `typeof X !== 'undefined'`.
