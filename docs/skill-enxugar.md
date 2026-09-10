# `/enxugar` — podar o CLAUDE.md, que é reenviado a CADA turno

## O custo, medido em 09/09/2026

| arquivo | tamanho | por turno |
|---|---|---|
| `CLAUDE.md` do projeto | 3.922 linhas · 274.530 chars | **≈ 68.600 tokens** |
| `~/.claude/CLAUDE.md` global | 16.785 chars | ≈ 4.200 tokens |
| **soma** | | **≈ 72.800 tokens, em TODA mensagem** |

Numa sessão de 60 turnos são ~4,4 milhões de tokens só de instrução, antes de
qualquer trabalho. É o maior custo fixo que existe aqui — maior que qualquer
screenshot.

⚠️ **Esta skill é o OPOSTO do `/documentar`.** Aquele ADICIONA o que a sessão
descobriu; este PODA o que virou peso morto. Rodar só `/documentar` faz o arquivo
crescer para sempre — e ele já cresceu.

## A regra que decide

> **Fica o que MUDA UMA DECISÃO futura. Sai o que só conta o que aconteceu.**

| fica | sai |
|---|---|
| armadilha que ainda morde (`Number('')` é 0) | "Auditoria X — fechada, 8 PRs" |
| invariante e onde está o guard | lista de PRs e o que cada um fez |
| medição que custou caro (pinos da máquina, 36/633 sessões em UTC) | narrativa de como a sessão correu |
| decisão do dono e o motivo | "verificado no simulador em 13/08" |
| mapa de dados (onde mora o quê) | changelog — o `git log` já guarda |

## Protocolo

### Fase 1 — medir antes
```bash
wc -lc CLAUDE.md
grep -n "^## " CLAUDE.md | wc -l
```
Anote os números. Sem eles não há como dizer se a poda valeu.

### Fase 2 — as três perguntas, seção por seção

Para cada `## `:

1. **Isto muda o que eu faria amanhã?** Não → candidata.
2. **Isto está no `git log`/PR?** Sim, e só isso → candidata.
3. **Isto ainda é VERDADE?** Confira. ⚠️ Há 9 marcas de "estava errada / obsoleta
   / pista datada" no arquivo — nota falsa é pior que nota ausente, porque o
   próximo agente age sobre ela. Encontrou uma? **Corrija na mesma tarefa**, não
   apenas apague.

### Fase 3 — para onde vai o que sai

**Não apagar: MOVER.** Changelog vai para `docs/historico/<ano-mes>-<assunto>.md`,
com um link de uma linha no `CLAUDE.md` quando o assunto ainda for consultável.

Apagar de vez só o que é comprovadamente falso ou já não existe no código.

### Fase 4 — o que NÃO cortar, nunca

- **Aviso com ⚠️** — cada um custou uma investigação. Só sai se o código provar
  que a armadilha não existe mais.
- **Números medidos** — "0,04 → 0,757", "36 de 633", "IoU 0,35–0,66". Reconstituir
  custa mais que guardar.
- **Decisão do dono e o porquê** — sem isso alguém "corrige" a decisão.
- **A lista dos oito guards falsos** — é o que impede guard de mentira.

### Fase 5 — reportar
```
CLAUDE.md: 3.922 → N linhas (−X%), ≈68,6k → ≈Yk tokens/turno
Movidas para docs/historico/: <lista>
Notas FALSAS corrigidas: <lista>   ← o achado mais valioso da poda
```

## Fronteira

**Não rode isto no meio de outra tarefa.** Podar exige ler o arquivo inteiro com
atenção, e uma poda apressada apaga a armadilha que ia te salvar semana que vem.
É tarefa própria, com PR próprio, e o diff **precisa ser lido pelo dono** — ele é
quem sabe quais decisões ainda valem.
