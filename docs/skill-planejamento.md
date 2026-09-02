# `/planejamento` — plano com Opus no máximo, execução com Sonnet

Protocolo do comando `/planejamento`. Mora aqui, e não em `.claude/commands/`,
porque `.claude/` está no `.gitignore` deste repo: lá o conteúdo sumiria em
outro clone e nunca passaria por revisão de PR. O comando é um ponteiro para
este arquivo.

**Uso:** `/planejamento <descrição da funcionalidade ou ferramenta nova>`

**Por que existe:** planejar — arquitetura, decidir onde algo quebra, traçar
fronteiras entre arquivos — é o trabalho em que a profundidade do Opus rende.
Executar um plano já concreto é mecânico, e Sonnet faz igual por uma fração do
custo. Este comando força a divisão sem depender de ninguém lembrar de trocar
de modelo no meio do caminho.

Se a descrição vier vazia, pergunte o que planejar. Não invente o escopo.

---

## FASE 1 — Plano (Opus forçado, não importa o modelo da sessão)

Chame o **Agent tool** com `subagent_type: "Plan"` e `model: "opus"`. O
parâmetro `model` sobrescreve o modelo da sessão só para aquela chamada, então
funciona mesmo se você for Sonnet. Rode em foreground (`run_in_background:
false`) — a fase seguinte depende do resultado.

O prompt do agente de planejamento leva, sempre:

1. A descrição da funcionalidade e a ordem de **ler o `CLAUDE.md` e os arquivos
   reais antes de propor** — plano sem contexto do código é chute.
2. **Arquivos exatos** a criar/editar, com caminho completo. Nada de "a área de
   nutrição".
3. **Sequência de passos**, com a razão da ordem.
4. **Fronteiras negativas explícitas** — o que NÃO tocar.
5. **Riscos e casos de borda.**
6. **Critério de pronto** — quais comandos e testes provam que terminou, e
   qual guard trava cada correção contra reincidência.
7. Uma lista separada de **decisões que só o dono pode tomar**, como perguntas
   objetivas com opções. O planejador LISTA; nunca resolve por chute.

⚠️ **Dê ao planejador as suspeitas que você tem, mesmo as não confirmadas** — e
mande confirmar na fonte antes de tratar como bug. Na primeira execução real
deste comando (02/09/2026, nutrição), foi assim que apareceu o defeito mais
grave da tarefa: o dono relatou dois problemas, e a suspeita solta de que os
macros do arroz na tela pareciam impossíveis levou o planejador a descobrir que
a tabela TACO publicava a primeira palavra do nome como apelido — `arroz`
pertencia a 7 linhas, `carne` a 60, e vencia a última gravada, sem `ORDER BY`.
O significado das palavras dependia da ordem física da tabela no banco.

O agente `Plan` não tem Edit/Write — ele só devolve texto. É proposital: nesta
fase ninguém escreve código.

---

## FASE 2 — Registrar e aprovar

1. Salve o plano em `docs/plans/<slug>.md` (versionado, pelo mesmo motivo deste
   arquivo estar aqui). Ele sobrevive ao `/clear` e é o insumo que os agentes de
   execução leem — sem isso, cada um re-deriva o contexto e diverge.
2. Se a Fase 1 devolveu decisões pendentes, **pergunte agora** (`AskUserQuestion`),
   antes de mostrar o plano como pronto.
3. **Escreva as respostas no próprio arquivo do plano**, numa seção que declare
   que ela substitui as recomendações anteriores. Os executores leem o arquivo,
   não a conversa.
4. Apresente um resumo (não o dump inteiro) e peça confirmação explícita.

⚠️ **Respostas do dono podem interagir entre si.** Na primeira execução, ele
escolheu "usar a média da base" para um valor e, em outra pergunta, "corrigir a
base contra a tabela oficial" — juntas, as duas mudavam o número da primeira.
Releia as respostas como conjunto antes de gravá-las, e diga ao dono o que a
combinação produziu.

---

## FASE 3 — Execução (Sonnet)

Diga qual modelo está ativo. Se for Opus, avise que a execução custa Opus a
menos que o usuário troque com `/model claude-sonnet-5` — este comando não
troca o modelo da conversa, só o usuário pode. A alternativa que garante Sonnet
sem trocar nada é delegar a `Agent(subagent_type: "general-purpose",
model: "sonnet")`.

### Dividindo o trabalho entre subagentes

- **Paralelize só o que tem escopo de arquivo DISJUNTO**, e declare a lista de
  arquivos permitidos no prompt de cada um. Dois agentes editando o mesmo
  arquivo no mesmo working tree estragam o trabalho um do outro.
- **Sequencie quando houver dependência de conteúdo** — quem adiciona chaves a
  uma base de dados vem antes de quem muda a regra que lê essa base.
- Diga a cada agente **que existem outros rodando agora** e quais arquivos são
  deles. Sem isso, um agente "conserta" o arquivo do outro achando que ajuda.

### O que todo prompt de execução precisa dizer

- **NÃO use git** — nada de `add`, `commit`, `checkout`, `stash`, `reset`. O
  orquestrador revisa e commita. (`npm run mutar` restaura sozinho, da cópia em
  memória; pode usar.)
- **NÃO afrouxe teste existente para ficar verde.** Se um teste antigo reprovar,
  **pare e reporte** — não edite a expectativa. Essa instrução é o que faz o
  subagente devolver a decisão em vez de esconder a regressão, e funcionou.
- As fronteiras negativas do plano, nominalmente.
- O critério de pronto do repo: `tsc`, o comando ESLint exato, as suítes, e as
  mutações que provam cada guard.

---

## FASE 4 — Conferir o que voltou (esta fase não é opcional)

Relatório de subagente é insumo, não verdade. **Rode você mesmo** `tsc`, ESLint,
a suíte e leia o diff.

⚠️ **Não aceite a classificação do subagente sobre teste vermelho.** Na primeira
execução, um agente entregou quatro testes reprovando e explicou que eram
"premissas velhas" invalidadas pela correção. **Três das quatro eram regressões
reais.** A verificação levou dez minutos e evitou subir a produção um defeito
pior que o original.

⚠️ **Suíte verde não é prova suficiente para mudança que altera resultado.**
Meça com entradas reais. Foi assim que apareceu o efeito colateral daquela
sessão: curar palavras genéricas fez uma chave curta sequestrar frases
compostas, e `100g leite condensado` passou a devolver 61 kcal em vez dos ~321
reais. Nenhum teste existente cobria essa frase; um script de dez linhas com
quinze frases comuns mostrou o problema em segundos.

⚠️ **Uma decisão do dono pode colidir com uma decisão de arquitetura antiga
registrada em teste.** Quando isso acontecer, não escolha sozinho entre as duas:
meça o impacto, e leve ao dono a colisão com uma recomendação. Às vezes a
terceira saída — implementar a decisão dele sem o efeito colateral — existe e
ninguém tinha visto.

Só depois disso: commit, PR, e merge por `npm run pr:merge <n>`.

---

## Ao final

Diga em uma frase o que cada fase custou (ex.: "plano em Opus, ~40k tokens;
execução em três subagentes Sonnet, ~1,2M") — é a composição desenhada para
economizar o plano Max, e vale confirmar que ela de fato aconteceu.
