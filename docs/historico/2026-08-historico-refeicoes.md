<!-- Movido do CLAUDE.md em 10/09/2026 pelo /enxugar.
     Motivo: era changelog. As regras VIVAS ficaram no CLAUDE.md; aqui está o registro completo. -->

## Histórico de REFEIÇÕES — o irmão do de treinos (25/08/2026, PRs #919, #921–#924)

Cinco entregas no mesmo dia, puxadas por relatos do dono no iPhone. (O #920, da
mesma data, é outro assunto: o hook que fecha o treino ativo do simulador.)

O que vale guardar é o método. **Os SINTOMAS relatados estavam todos certos** —
"não aparece nada", "aparece numa linha só", "só abre a aba de nutrição". O que
não se sustentou foi uma HIPÓTESE de causa ("abre por baixo da aba de
nutrição"), e em dois casos quem decidiu o diagnóstico foi o BANCO, não a
leitura do código: o dado gravado dizia o que a tela não podia inventar.

### O molde tem dono — não copie o card do treino

`components/history/HistorySummaryShell.tsx` (chassi do card de resumo: véu
dourado, eyebrow, pílulas de janela, grade 2×4, linha de ações), `SummaryAction`
(o botão dessa linha) e `HistoryWeekDivider` ("Semana de dd/mm"). Treino e
nutrição consomem os três. Copiar o JSX era a saída barata e é a mesma deriva
que já produziu 86 tons de cinza e três cálculos de semana aqui.

Guard de CLASSE em `components/history/__tests__/historicoMesmoMolde.test.ts`:
quem redesenhar o chassi ou o divisor reprova, e **cada card só pode ter UM
`featured: true`** (`docs/DESIGN_HIERARCHY.md`).

⚠️ **O agrupamento semanal do histórico de TREINO contava a partir da SEGUNDA**
— contra a regra domingo→sábado de 24/08. O guard `semanaComecaNoDomingo` não
pegava porque o cálculo passava por uma variável intermediária (`dayOfWeek`) em
vez de chamar `getDay()` na mesma expressão: **guard de forma erra quando a
forma muda.** Corrigido nos dois; a fronteira agora sai de `weekRangeBrt`.

### O card do dia abre as refeições daquele dia

`lib/nutrition/dayMeals.ts` (puro) + `hooks/useNutritionDayMeals.ts` (busca sob
demanda, cache por dia). Duas regras que já quebraram este app em outras telas:

* **O dia é a coluna `date`, NUNCA derivado de `created_at`.** Uma refeição das
  23h30 em São Paulo tem carimbo no dia seguinte em UTC.
* **A hora sai de `created_at` com `timeZone` explícito.** Sem isso, o relatório
  impresso num servidor em UTC diz que o café da manhã foi às 11h.

⚠️ **O guard da hora precisa das DUAS metades.** O caso comportamental só
reprova onde o runner não está em BRT (o CI, em UTC): na máquina do dono ele
passa verde com o `timeZone` removido — medido. E **forçar `process.env.TZ` no
topo do arquivo de teste NÃO resolve**: o worker do Vitest já subiu e o Node
cacheia o fuso na primeira formatação (testado, sem efeito). Quem fecha o buraco
localmente é o source-guard que exige o `timeZone` na chamada.

**No PDF do período**, o detalhe por refeição tem teto de
`MAX_DIAS_DETALHE_REFEICOES` (31 dias) — acima disso ele sai e o relatório
**diz por quê**, no papel e na tela antes de exportar. Descobrir no arquivo que
faltam as refeições custa um PDF inteiro.

### "Clico no menu e não aparece nada" — não era z-index

`historyOpen` nascia de `useState(Boolean(openHistoryOnMount))`, e valor inicial
só vale na PRIMEIRA montagem. Com a aba de nutrição **já aberta** o
`NutritionMixer` não remonta: o item "Histórico de refeições" do menu do avatar
era um botão morto. O modal nunca chegava a ser pedido — a suspeita de "abre por
baixo do overlay" era razoável e falsa.

Hoje um efeito reage à prop **e o pedido é consumido** (`onHistoryOpened`): sem
isso a flag ficaria presa em `true` e o segundo clique morreria igual. Guard em
`__tests__/menuAbreHistorico.test.ts` — que **nasceu faltando**: a primeira
mutação passou verde e revelou que nenhum teste cobria o caso.

### A IA de lançamento passou a SEPARAR os alimentos

O lançamento por texto tenta primeiro o resolvedor local (`resolveFood`), que já
grava item a item com gramas; quando ele não reconhece a frase, cai em
`/api/ai/nutrition-estimate` — e o prompt mandava, **literalmente, "Some tudo e
retorne um único objeto"**. Resultado no histórico: "arroz branco cozido com
filé de tilápia grelhada" numa linha só, `grams: 0`. Medido na conta do dono
antes de mexer: **75 refeições com um item só contra 131 com dois ou mais**, e
as de um item são justamente as que passaram pela IA.

Hoje o prompt separa, estima a porção quando o usuário não diz, e o contrato vai
na chamada (`nutritionEstimateGenerationConfig`, padrão do repo). Medido contra
a API real: `180g Arroz branco cozido (234 kcal)` + `140g Filé de tilápia
grelhada (136 kcal)`.

**Duas fronteiras que não podem cair:**

1. **`itemsParaGravar` tem fallback.** Sem itens válidos (ou com um item só, que
   apenas repete a refeição e desalinha o total), grava o item único de sempre.
   Perder o lançamento porque o detalhe falhou é trocar incômodo por perda de
   dado. `items` fica FORA do `required` do responseSchema pelo mesmo motivo.
2. **Não desmontar preparo único.** A primeira medição devolveu "1 esfirra de
   frango com requeijão" como massa + frango + requeijão — o app desmontando o
   que o usuário lançou como UM item. A regra está no prompt e tem guard.

⚠️ **Refeição já gravada não muda.** O detalhe não existe no dado antigo, e
reprocessar com IA seria inventar sobre o passado.

### O parser DESCONFIA quando sobra comida na linha (25/08/2026, PR #926)

A frase acima ("o resolvedor local… quando ele não reconhece, cai na IA") estava
certa e incompleta: o problema é o resolvedor **achar que reconheceu**.

No chat da nutrição, `"140g de atum sólido ao natural mais 70g de proteína de
soja com 400ml de leite desnatado"` devolvia **162 kcal — o mesmo valor de comer
só o atum**. O match é pela CABEÇA do nome (`matchesAtHead`) e ignora o resto, o
que está certo para modo de preparo ("frango GRELHADO") e para prato composto
("esfirra de frango COM requeijão", que é UM item). O que ele não via era uma
**segunda porção escondida na mesma linha** — e, como não sobrava
`unknownLine`, a cascata do `resolveFood` (que só chama a IA quando sobra algo
não reconhecido) considerava sucesso e respondia com confiança. Falha silenciosa
com cara de acerto, oferecendo "Lançar no diário" com 1/3 das calorias.

Duas mudanças, e a segunda é a que pega a CLASSE:

1. **" mais " virou separador de item.** ⚠️ **" com " NÃO é, e não pode ser** —
   ele liga o prato ao ingrediente, e separar reintroduz exatamente o bug que o
   `matchesAtHead` existe para matar (39 kcal de requeijão no lugar de 224 da
   esfirra).
2. **Sobra com quantidade derruba o match** (`SOBRA_COM_QUANTIDADE`): casou a
   cabeça mas restou número + unidade **seguido de mais texto**? A linha vira
   `unknownLine` e a cascata segue. O parser não adivinha nada — admite que não
   é o dono daquela linha.

**O "seguido de mais texto" foi medido, não escolhido.** A primeira versão da
regra derrubou `1 fatia de pão integral 50g` (74 kcal → desconhecido): ali o
"50g" QUALIFICA a fatia, não abre comida nova. Comparação antes/depois em 12
frases: a única diferença é o caso do bug.

Verificado ponta a ponta contra Supabase e Gemini reais: a cascata desiste e a
IA devolve **535 kcal · P73,5** (140g atum 155 · 70g soja 235 · 400g leite 145).

**O aviso de peso é para o CHUTE, não para o dado.** O prompt do chat mandava,
em toda resposta, "cite o PESO ASSUMIDO… se parecer irreal, peça o peso certo".
A regra existe por um motivo real — o parser cai em 50g quando o alimento não
declara peso por unidade, e "uma pizza grande" virava 133 kcal —, mas disparava
também quando a pessoa tinha ESCRITO o peso: *"Comendo 140g de atum (que o app
assumiu como 140g)…"*. Hoje `ParsedMealItem.assumedWeight` marca só o que o app
converteu, e sem ele o prompt **proíbe** dizer que o app assumiu. Junto: proibido
dizer "exatamente" sobre valor de tabela — "use exatamente estes números" é
instrução de fidelidade e vazava como precisão de medição.

**Duas armadilhas de verificação desta tarefa:**

1. **Guard tautológico que a mutação pegou:** o `label` do item é a LINHA CRUA,
   então procurar `/ovos/` no texto do rótulo passava verde mesmo com o
   separador removido (um item só, rotulado com a frase inteira). O que prova
   separação é a CONTAGEM de itens.
2. **`gh pr merge --delete-branch` devolve para a `main` LOCAL, que fica atrás
   do merge.** Rodar um script de verificação logo depois executa o código
   ANTIGO — e o resultado parece regressão. Custou um "❌ o bug continua" que
   era falso.

   **Resolvido por construção: use `npm run pr:merge <n>`**
   (`scripts/pr-merge.mjs`). Ele recusa mergear com `quality-check` fora de
   "pass" (a regra que já foi violada em 10/08/2026, quando um `for … sleep;
   done; gh pr merge` mergeou no vermelho) e, depois do merge, alinha a `main`
   local com a origin. O `reset --hard` só acontece com a árvore limpa E o
   conteúdo idêntico ao da origin — depois de um squash os hashes diferem, mas
   a ÁRVORE é a mesma; havendo conteúdo local ausente na origin, ele para e
   devolve a decisão para o humano. A regra mora em `decidirSync`, função pura,
   travada em `src/__tests__/prMergeSync.test.ts`.

### "Abrir o dia para editar" — o botão que prometia e entregava metade

Trocar a data não bastava: a aba abre no TOPO e a lista de LANÇAMENTOS (única
superfície onde se edita ou apaga uma refeição) fica no fim da página. Com o dia
de HOJE, que é o caso comum, a tela não mudava nada.

Hoje o botão troca a data, **rola até a âncora** (`entriesAnchorRef`) e **abre o
editor**. As setas do `DateNavigator` continuam sem rolar, de propósito — ali o
usuário passeia pelos dias olhando o resumo do topo, e arrastar a tela a cada
toque sequestraria o gesto dele. Há guard para os dois lados.

**O editor não pode abrir no instante do toque:** `handleDateChange` esvazia a
lista, e ali os lançamentos ainda são os do dia anterior. O pedido fica pendente
(`editarAoCarregar`) e é atendido quando `entries` chega — e some sozinho se a
refeição não estiver mais lá, em vez de travar a tela. `abrirEditorDaEntry`
expande o card **e** semeia o rascunho: sem expandir, o editor abriria dentro de
um card fechado; sem rascunho, abriria vazio e salvar apagaria a refeição.

Tocar numa REFEIÇÃO do card do histórico edita AQUELA (o id viaja no
`onPickDate`); o botão do dia, sem id, abre a **mais recente**.

### Três armadilhas de verificação que custaram tempo nesta sessão

1. **O teclado do simulador está com dicionário em INGLÊS.** "peixe grelhado com
   batata doce" virou "Price grew Haro com Batista doce"; "cozido" virou
   "cozies". Digitar português no simulador não prova nada sobre texto livre —
   para conferir TELA, injete o dado na conta de teste por SQL; para conferir
   MODELO, chame a API direto.
2. **Teste que mede estado transitório passa por sorte.** `findByRole` + assert
   imediato num botão que nasce desabilitado quebrou no CI (mais lento) com o
   código CORRETO. O que se espera é a TRANSIÇÃO: quem espera é `waitFor`.
3. **Componente grande demais para montar pede source-guard.** `NutritionMixer`
   exige Supabase, imports dinâmicos e ~20 props — um teste de render ali mede o
   harness, não o app. O comportamento se prova no aparelho e o guard trava a
   CAUSA (a forma do código) voltar. Diga isso no arquivo de teste.
