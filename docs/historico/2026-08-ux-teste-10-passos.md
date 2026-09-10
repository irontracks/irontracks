<!-- Movido do CLAUDE.md em 10/09/2026 pelo /enxugar.
     Motivo: era changelog. As regras VIVAS ficaram no CLAUDE.md; aqui está o registro completo. -->

## As 4 correções de UX do teste de 10 passos (16/08/2026)

O teste manual gerou quatro frentes. **Três delas mudaram de diagnóstico ao ler
o código** — vale mais como método do que como changelog.

### Sessão esquecida: o defeito NÃO era o tempo inflar

Meu diagnóstico inicial ("o treino contou 616:03 e ninguém perguntou nada")
estava errado na causa. O tempo já tinha DUAS defesas —
`computeRecoveryPauseMs` no mount e o listener de `visibilitychange`, ambos
descontando gap acima de `LONG_GAP_MS` (20 min), escritos por causa de um "bug
do treino de 4h" anterior. **Não reimplementar isso.**

A lacuna real era outra e mais séria: **o `localStorage` não expirava NADA**,
enquanto o IndexedDB — a outra metade do mesmo snapshot — expira em 24 h
(`MAX_SESSION_AGE_MS`). E é o `localStorage` quem manda o app abrir no treino:
`useLocalPersistence` decide a view, `useSessionSync` hidrata. Resultado: treino
aberto na segunda reabre o app dentro dele na quarta, em silêncio; finalizar
dali grava a sessão de segunda com a data de hoje, e a **duração alimenta a
estimativa de calorias** (`getEpocFactor`), então o número falso chega ao
relatório, ao PDF e à Nutrição.

Hoje toda restauração passa por `lib/workout/restoreSessionGate.ts`, usado pelos
DOIS hooks — com a regra escrita só num deles, o outro discordaria e a view
abriria num treino que o estado recusou hidratar. Faixas: `fresh` (< 4 h),
`stale` (4–24 h, avisa), `expired` (> 24 h, descarta). A idade é da **última
atividade**, não da duração: quem treina 3 h com atividade recente segue fresh.
Na dúvida (sem carimbo, relógio para trás, `savedAt` corrompido) o veredito é
`fresh` — perder série registrada é irreversível, retomar sessão velha é só
incômodo. Um guard cobra que os dois armazenamentos expirem no MESMO prazo,
que é exatamente a divergência que causou o bug.

**Polaridade de diálogo destrutivo:** o `confirm` resolve `false` ao fechar por
fora, então DESCARTAR é o `confirmText` (destrutivo) e continuar é o caminho do
`false`. Invertido, um toque fora do modal apagaria as séries de um treino em
andamento. Mesma lição já aprendida no rodapé do treino.

### Autocorreção: o app tinha ZERO proteção, e a lista manual estava incompleta

O teclado do iOS renomeia o que você digita — "Drop teste" virou "Frio teste",
"Bi A" virou "Vi A" — porque nome de exercício não é palavra de dicionário. O
app inteiro tinha **zero `autoCorrect`** e dois `spellCheck` soltos.

Fonte única em `utils/ui/textFieldProps.ts` (nome próprio · código ·
identificador sem forma de palavra), hoje em 49 campos. **A fronteira é
IDENTIFICADOR × TEXTO LIVRE**: em notas, chat e descrição a autocorreção AJUDA,
e o guard cobra os dois sentidos — identificador sem proteção reprova, e texto
livre COM proteção também.

Duas lições de método aqui:
1. **Um subagente varreu e devolveu 38 campos; o guard achou 16 que ele
   perdeu** — e um dos 38 estava errado (casou com uma mensagem de erro, não
   com um input). Resultado de subagente é insumo, não verdade.
2. **Componente genérico não recebe a decisão.** O `EditField` do
   `VoiceWorkoutModal` serve o nome do exercício E o campo Notas; aplicar nele
   desligaria o corretor justamente onde ele ajuda. A marca foi para a CHAMADA.

### Descanso sem teto e conferência de carga

O contador de "além do planejado" chegava a **"+286:32"** em verde, ocupando o
rodapé (e empurrando o `WorkoutFooter` por `--it-rest-bar-h`). Agora desiste aos
15 min de extra, pelo `onFinish` — que encerra SEM avançar série. **Cardio e
prancha ficam de fora**: são timers de EXERCÍCIO, e encerrar uma corrida de
40 min apagaria uma medição em andamento.

A conferência de carga (`lib/workout/weightOutlier.ts`) entra no resumo que a
finalização já mostra, **de propósito**: cobre os 14 métodos de série sem tocar
em nenhum renderer. Fator 4×, folgado — progressão real anda em 2,5–10% e o
autoload trava em +10%, enquanto erro de digitação dá fator 5 a 10. Limiar
apertado vira ruído, e aviso que aparece à toa é ignorado inclusive quando está
certo.

**A referência é MEDIANA, e isso é o ponto do módulo.** Com o ÚLTIMO valor, um
200 digitado errado na sessão passada faria o 200 de hoje parecer normal — o
detector ficaria cego logo após o primeiro erro. A média sofre do mesmo mal, e o
teste mede: 200 ÷ média 80,5 = 2,48, abaixo do limiar, o erro passaria.

### ⚠️ O cronômetro do simulador CONGELA quando a janela perde o foco

Custou 25 minutos de espera inútil e quase virou um "o teto não funciona".

Ao tentar provar o teto de 15 min do descanso no aparelho, o contador andou
**25 segundos em 8 minutos reais** — o ticker do WebView é estrangulado quando a
janela do Simulator não está em foco no macOS. Nesse ritmo, esperar os 15 min do
produto levaria mais de meia hora de relógio de parede.

**Consequência prática:** qualquer invariante que dependa de TEMPO PASSAR
(timeout, teto, expiração, auto-avanço) é impraticável de verificar por espera no
simulador. Prove por teste + mutação e diga que a prova foi de código, não de
tela — e não conclua "não funcionou" a partir de um contador que parece parado.

O que É verificável no simulador continua sendo o de sempre: o que reage a TOQUE
e a DIGITAÇÃO. A autocorreção, por exemplo, se prova em 30 segundos — digitar
"Bi A Drop teste" num campo de nome e ler o que ficou lá.

⚠️ **Animação não se PROVA no simulador — se prova no navegador.** O
`screenshot` leva 2–3 s de ida-e-volta, então qualquer coisa mais curta que isso
já terminou quando a foto sai. Em 05/09/2026 a celebração de fim de treino nunca
apareceu em captura nenhuma — não por estar quebrada, e sim por latência.

O que de fato funcionou, quatro vezes na mesma noite (centralização, perfil de
crescimento e a entrada do véu duas vezes): **reproduzir os keyframes num HTML
solto e AMOSTRAR o computed style** ao longo do tempo. Devolve número, não
impressão, e responde em segundos.

```js
const escala = () => new DOMMatrixReadOnly(getComputedStyle(el).transform).a
// amostre em marcos (0, 500, 900, 1500…) e leia a curva que sai
```

Foi assim que saíram "0,04 → 0,757 na metade → 1 sem passar de 1" e "véu em 0
enquanto o relatório está sozinho na tela". Um caso de teste não pega isso:
jsdom não computa animação.

⚠️ **`recordVideo` NÃO substitui isso** — ele MOSTRA, não prova, porque o agente
não assiste a vídeo. Serve para o dono ver, e só quando ele pedir (**print
continua proibido** — regra de 15/08/2026):

```bash
xcrun simctl io <UDID> recordVideo --codec=h264 saida.mp4   # Ctrl-C encerra
```

Medido: 92 KB para 4 s.

### O que ficou provado ONDE (não misturar as duas coisas)

| correção | prova |
|---|---|
| autocorreção do teclado | **no aparelho** (texto digitado ficou intacto; no dia anterior virava "Vi A"/"Frio teste") + render + guard de classe |
| sessão esquecida | teste + mutação (3 mutações, todas vermelhas) |
| teto do descanso | teste + mutação — **prova de tela não fechada**, ver o congelamento acima |
| conferência de carga | teste + mutação |

### Mutação INVÁLIDA não prova guard fraco

Ao provar o teste de render dos atributos de teclado, a primeira mutação
(`autoCorrect` → `autocorrect`) **não derrubou o teste — e estava certo**: o
React 19 normaliza os dois spellings para o mesmo atributo HTML, então não havia
bug a introduzir. A mutação válida é REMOVER o atributo (derruba 3 de 4 casos).

Antes de afrouxar um guard que "não pegou a mutação", confira se a mutação
representa um defeito real. Guard que não falha com bug presente é guard falso;
guard que não falha com uma mudança inócua está apenas correto.

### Três erros meus que o ferramental pegou

Registrados porque vão se repetir:

1. **Hook depois de early return.** O efeito do teto entrou abaixo de
   `if (!targetTime || dismissed) return null` — o ESLint travou, e um teste de
   cardio já estava vermelho por isso. Componente grande esconde onde termina a
   região dos hooks.
2. **Guard fatiado a partir do IMPORT.** `indexOf('shouldAbandonRest')` casa
   primeiro com a linha de import e arrasta o arquivo inteiro para dentro do
   bloco medido — o guard passou a medir o `handleStart`, que legitimamente usa
   `onStartRef`. Fatie pela CHAMADA (`/nome\s*\(\s*\{/`), nunca pelo nome solto.
3. **Busca por `find` da primeira ocorrência.** Aplicar props procurando o
   placeholder pegou uma string de mensagem de erro em vez do input. Ao editar
   em massa, confira CADA ponto pelo que ele é, não pela primeira coincidência —
   e feche com `next build`, que é o que de fato prova JSX íntegro.
