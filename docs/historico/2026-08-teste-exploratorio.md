<!-- Movido do CLAUDE.md em 10/09/2026 pelo /enxugar.
     Motivo: era changelog. As regras VIVAS ficaram no CLAUDE.md; aqui está o registro completo. -->

## Percorrer o app inteiro acha o que a suíte verde não acha (15/08/2026)

Teste de 10 passos pedido pelo dono (abrir → treinar → editar no meio → sair →
voltar → deletar → adicionar → métodos avançados → respeitar TODOS os descansos
→ finalizar), rodado no simulador de ponta a ponta. A suíte estava 100% verde e
mesmo assim o passo 10 **travou**: com o descanso rolando, a barra do
`RestTimerOverlay` cobria o `WorkoutFooter` e o botão **Finalizar era
inalcançável** — para terminar o treino era preciso esperar ou pular o descanso.

**A lição que dói: eu tinha "corrigido" essa MESMA classe no dia anterior.** O
PR #833 portou os 19 overlays de modal para cima da barra, e escrevi um guard —
que varria só os três arquivos de modais. O rodapé principal, que sofre do
mesmo defeito pelo mesmo motivo, ficou de fora, e o guard passou verde com o bug
vivo. **Guard que varre a lista dos arquivos que eu já conhecia não é guard de
classe: é guard da instância com cara de classe.** A pergunta certa ao escrever
guard continua sendo "onde ele NÃO olha?".

**Sobreposição no rodapé não se resolve com z-index.** Modal versus barra: dá
para empilhar em z (o modal cobre a tela toda, a barra fica atrás). Duas BARRAS
de rodapé disputam o mesmo espaço físico — quem estiver por cima esconde a
outra, qualquer que seja o z. A saída é geométrica: o `RestTimerOverlay` publica
a altura real da sua barra em `--it-rest-bar-h` (medida por `ResizeObserver`,
porque ela muda com safe-area e com o botão AUTO) e o `WorkoutFooter` posiciona
`bottom` por essa variável, com fallback `0px`. Guard em
`__tests__/rodapeAcimaDoDescanso.test.ts`; **barra fixa NOVA no rodapé do treino
ativo reprova em `barrasDoRodapeTreino.test.ts` até declarar como convive com o
descanso.**

**jsdom não tem `ResizeObserver`** — usar direto derrubou 3 testes de cardio e,
no aparelho, seria a tela inteira do descanso caindo. API de browser moderna em
componente sempre com `typeof X !== 'undefined'`; a medição inicial já cobre o
caso comum e o observer é só para mudança em voo.

**Prove por mutação com `npm run mutar` — não à mão.**

```bash
npm run mutar -- src/lib/x.ts "a >= b" "a > b" -- npx vitest run src/lib/__tests__/x.test.ts
```

Ele aplica, roda, **restaura do conteúdo** e exige vermelho. As três armadilhas
do jeito manual somem por construção, e as três já morderam aqui:

1. **`git checkout` apaga trabalho não commitado.** Aconteceu em 15/08, de novo
   em 25/08 — com a regra escrita neste arquivo — e **três vezes em 27/08**. O
   sintoma engana: os testes seguintes passam VERDES (o import quebrado derruba
   outra coisa, ou a mutação nem chega a existir) e você conclui "provado" sobre
   um arquivo que voltou no tempo. O script restaura da CÓPIA em memória, então
   rascunho não commitado sobrevive.
2. **A mutação pode não ser aplicada.** Um `sed`/`replace` que não casa devolve
   o arquivo intacto, o teste passa, e "provado por mutação" vira mentira em
   silêncio — em 25/08 duas mutações morreram em erro de aspas e o "14 passed"
   parecia prova. O script confere a substituição ANTES de rodar e aborta.
3. **Verde com o bug reposto não gritava.** Agora é saída 1 com "GUARD FALSO: o
   teste passou COM a mutação aplicada" — e a regra que segue é a de sempre:
   corrija o TESTE, nunca o afrouxe.

Que ler não bastava, ficou provado: a nota anterior *avisava* sobre o `git
checkout` e a armadilha pegou o autor do aviso três vezes num dia. Decisões em
`decidirAplicar`/`interpretarResultado`, travadas em `src/__tests__/mutarDecide.test.ts`.

**Automação do simulador — o que custou toque errado:** as coordenadas são
PONTOS (440×956 no 17 Pro Max), não pixels do screenshot; um toque convertido de
px caiu no botão "Duplicar" e criou exercício fantasma no rascunho.
**O screenshot vem em ~920×1963 px, então o fator é ÷2,09** — ler a coordenada
na imagem e enviá-la crua é o erro natural, e ele é SILENCIOSO: um `x` acima de
440 está fora da tela e mesmo assim a ferramenta responde `Tapped at (460, 706)`
com sucesso. Em 27/08/2026 isso consumiu uma investigação inteira ("o WebView
parou de aceitar toque"), com o app, a janela do Simulator e o device
interrogados e inocentados nessa ordem, **com esta regra já escrita aqui**.
Diagnóstico em 5 segundos: toque aceito e tela idêntica ⇒ confira se `x < 440`
antes de suspeitar de qualquer outra coisa. O backspace
(`\b`) NÃO chega ao campo: para limpar, long-press no texto → o iOS seleciona →
digitar substitui. E a autocorreção do iOS renomeia o que você digita ("Drop
teste" virou "Frio teste", "Bi A" virou "Vi A") — nomes de teste devem ser
palavras que o corretor não toca, senão a conferência por nome falha.

**O que o app fez CERTO no teste** (não reinvestigar como se fosse bug):
recusou concluir Drop-set com uma etapa só ("defina pelo menos 2") e Cluster com
bloco vazio; preservou sessão, edição e cronômetro ao sair e voltar; perguntou
"só hoje / pra sempre" ao deletar exercício; e sobreviveu a uma pausa de horas
no meio do treino sem perder log nem tempo.

**Achado de UX que ficou aberto (não é bug):** nos campos numéricos do editor
(Sets/Reps/RPE), digitar INSERE no cursor em vez de substituir — "2" com "1"
digitado vira "12". Contorno: long-press → selecionar → digitar. A correção
seria selecionar o conteúdo ao focar.
