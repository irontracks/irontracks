# Migração para as regras do React Compiler (eslint-plugin-react-hooks 7.1+)

**Status:** não iniciada. O plugin está **pinado em 7.0.1** via `overrides` no
`package.json`. Medido em 09/08/2026.

## Por que existe o pin

O `npm update` da auditoria levou o `eslint-plugin-react-hooks` de 7.0.1 para
7.1.1 (minor, veio de carona no `eslint-config-next`). A 7.1 liga as regras do
React Compiler, e o CI foi de 0 para **192 erros em 82 arquivos**.

O pin **não é para silenciar aviso chato** — as regras apontam coisa real. É
para não misturar uma migração de comportamento com um bump de dependência.

## O tamanho real

| Regra | Ocorrências | O que acusa |
|---|---:|---|
| `react-hooks/set-state-in-effect` | 83 | `setState` síncrono no corpo de um efeito → renders em cascata |
| `react-hooks/refs` | 53 | leitura/escrita de ref durante o render |
| `react-hooks/preserve-manual-memoization` | 21 | `useMemo`/`useCallback` que o compilador não consegue preservar |
| `react-hooks/static-components` | 17 | componente declarado dentro de outro (remonta a cada render) |
| `react-hooks/purity` | 9 | função impura no render (`Date.now()`, `Math.random()`) |
| `react-hooks/immutability` | 6 | mutação de valor que deveria ser imutável |
| `react-hooks/exhaustive-deps` | 3 | dependência faltando |

## Por que NÃO foi feito de enfiada

A lista bate **exatamente** nas zonas que o `CLAUDE.md` marca como já quebradas
várias vezes:

- `useActiveWorkoutController.ts` — o estado do treino ativo;
- `set-renderers/normalSet.tsx` — o `useInputField`, a "zona de corrida" que já
  jogou fora valor digitado duas vezes;
- `hooks/useWorkoutAutoload.ts` e `useWorkoutDeload.ts` — o motor de carga;
- `RestTimerOverlay.tsx` — o alarme de descanso.

Cada correção de `set-state-in-effect` muda **quando** o estado sincroniza. Num
lugar desses, o erro não aparece como tela quebrada: aparece como carga sugerida
errada, ou um RPE que some, dias depois, no celular do usuário. É o tipo de
regressão que este repositório já pagou caro para aprender a evitar.

## Plano em lotes — do mais seguro ao mais arriscado

A ordem importa: começa por onde o erro é visível na hora e termina no que exige
teste em device.

1. **`static-components` (17)** — mecânico e de baixíssimo risco: mover a
   declaração do componente para fora. Ganho de performance real (hoje o filho
   remonta a cada render do pai).
2. **`purity` (9)** — trocar `Date.now()`/`Math.random()` do render por `useRef`
   inicializado ou valor vindo de prop. Poucos pontos, efeito claro.
3. **`exhaustive-deps` (3)** — caso a caso; alguns vão exigir `useEvent`-like.
4. **`immutability` (6)** e **`preserve-manual-memoization` (21)** — exigem ler
   o porquê de cada memo. Vários memos aqui existem por medida de performance
   documentada (lista de exercícios, feed), então **não remova sem medir**.
5. **`refs` (53)** — leitura de ref no render. Boa parte deve ser padrão
   legítimo mal expresso; tratar em blocos por arquivo.
6. **`set-state-in-effect` (83)** — por último, e **fora** das zonas críticas
   primeiro. Nos arquivos de treino/autoload/timer: um por vez, cada um com
   teste antes, e verificação no simulador.

Ao terminar cada lote, rode `npm run lint` com o pin removido para ver o placar
cair. Só remova o `overrides` do `package.json` quando chegar a zero — enquanto
houver erro, o CI fica vermelho para todo mundo.

## Lista de arquivos afetados

Para regenerar a lista a qualquer momento:

```bash
npm install eslint-plugin-react-hooks@7.1.1 --no-save
npm run lint 2>&1 | grep -oE "react-hooks/[a-z-]+" | sort | uniq -c | sort -rn
git checkout package.json && npm install   # volta ao pin
```
