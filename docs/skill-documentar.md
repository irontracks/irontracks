# /documentar — destila a sessão no CLAUDE.md antes do /clear

Ao fim de uma tarefa, o que sobrevive ao `/clear` é o que estiver escrito no
`CLAUDE.md`. A conversa some inteira. Este comando existe para que o achado caro
desta sessão não seja redescoberto daqui a três semanas por outro agente — que
vai gastar de novo as mesmas horas, no mesmo banco, contra o mesmo bug.

**O alvo não é registrar o que foi feito.** Isso o `git log` já faz, melhor e de
graça. O alvo é registrar **o que custou caro para descobrir** e **o que faria
alguém errar de novo**.

---

## O filtro: uma pergunta só

Para cada candidato a nota, pergunte:

> **Se isto estivesse escrito quando eu comecei, eu teria economizado tempo?**

Se a resposta é não, não escreva. O `CLAUDE.md` inteiro é lido em TODA sessão
futura — cada linha inútil custa tokens para sempre, e afoga as que importam.

### Merece entrar

| Tipo | Exemplo real deste repo |
|---|---|
| **Causa-raiz medida** | "o prompt mandava *some tudo e retorne um único objeto*" — 75 refeições de 1 item contra 131 de 2+ |
| **Fronteira negativa** | "`com` NÃO é separador: reintroduz o ingrediente ganhando do prato (39 kcal vs 224)" |
| **Armadilha de verificação** | "o teclado do simulador corrige para o inglês: *peixe grelhado* → *Price grew Haro*" |
| **Decisão do dono + o porquê** | "finalizar treino na conta de teste é liberado desde 11/08 — a trava escondia relatório, PDF e story" |
| **Mapa de dado caro** | "as sessões ficam em `workouts.notes`, não em `workout_session_logs`" |
| **Hipótese DESCARTADA** | "`tsconfig` incluindo testes não é a causa do OOM — medido: 1552 MB contra 1537 MB" |

### NÃO merece

- Changelog de PR ("criei o componente X, ajustei o Y"). O git guarda isso.
- O que o código já diz sozinho. Se a explicação cabe num comentário **junto do
  código**, o lugar dela é lá — não aqui.
- Elogio ao próprio trabalho.
- Suspeita não confirmada apresentada como fato (ver Fase 4).

---

## Protocolo

### Fase 1 — Levantar o que a sessão produziu

```bash
git log --oneline -15
gh pr list --state merged --limit 5
```

Liste também o que **não** virou commit: medições, consultas ao banco,
hipóteses testadas e derrubadas, o que quebrou no meio do caminho.

### Fase 2 — Filtrar pela pergunta única

Separe em duas pilhas: **entra** e **não entra**. Se a pilha "entra" ficou com
mais de ~6 itens, você provavelmente está escrevendo changelog. Reveja.

**Zero é um resultado legítimo e comum.** Ajuste de texto, renomear variável,
corrigir um teste que você mesmo escreveu errado: não vira nota. Dizer "nada
desta tarefa merece o `CLAUDE.md`" é resposta certa — inventar nota para
justificar o comando é como o arquivo engorda sem ficar melhor.

### Fase 3 — Caçar o que a tarefa deixou OBSOLETO

**Esta fase é a mais importante e a mais esquecida.** A regra do próprio
`CLAUDE.md`: *nota que descreve o que NÃO temos é a que apodrece primeiro* —
ninguém volta para apagá-la quando a lacuna é preenchida, e o próximo agente
acredita nela e propõe trabalho já feito.

```bash
grep -n "<termo da área que você mexeu>" CLAUDE.md
```

Para cada trecho encontrado, pergunte: **isto continua verdade depois da minha
tarefa?** Corrija o que ficou falso **na mesma tarefa**. Exemplos que já
aconteceram aqui: "as outras rotas de IA usam o padrão antigo" (não usavam mais,
e a linha sobreviveu uma semana à própria correção); "o parser já quebra a
refeição em alimentos" (era verdade só do resolvedor local).

### Fase 3½ — A armadilha dá para ELIMINAR?

Antes de escrever qualquer nota do tipo "cuidado com X", pare e pergunte:

> **Dá para fazer X deixar de acontecer?**

Se dá, **elimine** — e a nota vira o registro de uma solução, não de um perigo.
Documentação é o consolo de quando não dá; usada no lugar do conserto, ela só
transfere o custo para a próxima pessoa, que vai ler, concordar e tropeçar
assim mesmo. **Armadilha documentada que continua acontecendo vira folclore.**

Aconteceu nesta própria sessão, em 25/08/2026: escrevi com todo cuidado que
"`gh pr merge --delete-branch` devolve para a `main` local atrasada, confira o
`git log` antes de acreditar no script" — e o dono respondeu *"tem que arrumar
então, não?"*. Estava certo: virou `npm run pr:merge`, que sincroniza sozinho.
A nota boa não era o aviso; era o comando.

Quando REALMENTE não dá para eliminar (limite de ferramenta, de plataforma, de
terceiro), a nota precisa dizer **por que não dá** — senão o próximo agente
gasta a tarde tentando. Exemplos legítimos deste repo: o VoiceOver não existe no
Simulador; o cronômetro do WebView congela quando a janela perde o foco; o
teclado do simulador corrige para o inglês.

### Fase 4 — Escrever, com fonte para cada afirmação

Regras de redação, todas com histórico de terem sido violadas aqui:

1. **Número medido, nunca impressão.** "2.544 kcal contra 970" vale mais que
   "os dias incompletos puxam a média para baixo". Se você não mediu, ou mede
   agora, ou não escreve.
2. **Diga o PORQUÊ, não só a regra.** "Use `weekRangeBrt`" é esquecível;
   "a Fran fez 6 treinos e o push disse 5 porque o domingo caía na semana
   anterior" gruda.
3. **Rotule o que não foi confirmado.** "Suspeita, não reproduzi" numa lista
   separada dos achados verificados. Misturar as duas corrói a confiança em
   ambas.
4. **Date as afirmações voláteis** (estado de conta, versão, flag ligada).
   Trate as datadas como pista, não como fato eterno.
5. **Escreva a armadilha, não só a solução** — depois que a Fase 3½ decidiu que
   ela não dá para eliminar, ou junto do conserto. "Guard que varre só os
   arquivos que eu já conhecia não é guard de classe" ensina mais que o guard.
6. **Sem eufemismo.** Se você quebrou algo, escreva que quebrou e o que provou.

### Fase 5 — Onde colocar

- **Seção existente que trata do assunto** → funda ali. Duas seções sobre o
  mesmo tema divergem em silêncio.
- **Assunto novo** → seção nova, com título que diga o assunto e a data.
- **Detalhe que só faz sentido junto do código** → comentário no arquivo, e no
  `CLAUDE.md` só o ponteiro.
- **Conteúdo extenso** (mapa de dados, tabela, protocolo) → `docs/<assunto>.md`
  + ponteiro. Ver Fase 5½.
- **Regra de COMPORTAMENTO do agente** (como trabalhar, o que perguntar, quando
  subir) → `~/.claude/CLAUDE.md`, o global. O `CLAUDE.md` do projeto é sobre
  ESTE repo: arquitetura, dado, armadilha, decisão do dono. Misturar os dois faz
  a regra de conduta sumir quando o projeto muda, e a regra do projeto viajar
  para repositórios onde ela é falsa.

Antes de acrescentar, procure duplicata:

```bash
grep -in "<palavra-chave da nota>" CLAUDE.md | head
```

### Fase 5½ — O orçamento do arquivo

O `CLAUDE.md` é lido INTEIRO em toda sessão de toda tarefa. Em 25/08/2026 ele
estava em 2.505 linhas; em **05/09/2026, 3.721** — **+49% em onze dias**, ordem
de 68 mil tokens de custo fixo antes de qualquer trabalho começar. Ou seja: a
Fase 5½ existe há semanas e **não está segurando nada**. Toda execução acrescenta
e nenhuma poda de verdade.

Se você está lendo isto numa execução do comando, trate a poda como parte do
trabalho, não como bônus: entre no arquivo procurando o que a sua tarefa tornou
redundante ANTES de escrever o que ela acrescenta.

Duas regras concretas:

1. **Nota longa não mora aqui.** Passou de ~40 linhas (mapa de dados, tabela
   grande, protocolo)? Vai para `docs/<assunto>.md` e o `CLAUDE.md` fica com um
   ponteiro de 2–3 linhas dizendo **quando** abrir aquele arquivo. É o que já
   acontece com `docs/DATA_MAP_workout_history.md`, `docs/USER_DATA_MAP.md` e
   `docs/DESIGN_HIERARCHY.md`.
2. **Procure o que a nota nova tornou redundante e apague.** Toda execução deve
   ao menos TENTAR podar. Reporte o delta no PR (`grep -c '' CLAUDE.md` antes e
   depois): crescer é normal, crescer sempre não é.

### Fase 6 — Conferir o que você escreveu

- Toda afirmação tem fonte (medição, consulta, execução)?
- Alguma linha virou changelog? Corte.
- **Releia a SEÇÃO INTEIRA onde você inseriu, não só o que escreveu.** A
  contradição quase sempre está três parágrafos acima, escrita por você mesmo
  numa tarefa anterior. Aconteceu em 25/08/2026: a Fase 3½ ("elimine a
  armadilha") nasceu contradizendo a regra 5 da Fase 4 ("escreva a armadilha"),
  e as duas eram minhas.
- A seção nova contradiz outra parte do arquivo? Resolva as duas.
- O arquivo cresceu muito? Se a nota nova torna outra redundante, **apague a
  antiga** — este arquivo deve encolher tanto quanto cresce.

### Fase 7 — Subir

Documentação não toca `middleware.ts`, auth, migration nem pagamento: vale a
autorização durável do dono.

```bash
git checkout -b docs/<assunto> origin/main
git add CLAUDE.md && git commit -m "docs: <assunto>"
gh pr create ...
# mergear com squash SÓ com o quality-check verde
```

Só depois disso diga ao dono que pode dar `/clear`.

---

## Checklist final

- [ ] Cada nota passa na pergunta "teria me poupado tempo?"
- [ ] Nenhuma afirmação sem fonte; suspeitas rotuladas como suspeitas
- [ ] Notas que a tarefa tornou falsas foram **corrigidas**, não deixadas para depois
- [ ] Sem changelog, sem duplicata, sem elogio
- [ ] Armadilhas de verificação registradas (é o que mais economiza tempo depois)
- [ ] Cada armadilha ou aponta a SOLUÇÃO, ou diz por que não dá para eliminar
- [ ] PR mergeado com CI verde

---

## Por que este arquivo está em `docs/`

O comando vive em `.claude/commands/documentar.md`, que está no `.gitignore`
deste repo — some em outro clone e não passa por revisão. O conteúdo, que é o
que importa, mora aqui e é versionado; lá ficou só o ponteiro.

Isso é a Fase 3½ aplicada a este próprio arquivo: a versão anterior **avisava**
que a skill era local e sugeria versionar "se um dia incomodar". Avisar era o
consolo; versionar era o conserto.
