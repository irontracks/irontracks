# IronTracks — instruções para agentes (Codex e outros)

> ⚠️ **Este arquivo NÃO é a fonte de verdade. Leia [`CLAUDE.md`](./CLAUDE.md).**
>
> Ele foi uma CÓPIA e, como toda cópia, divergiu: parou em **23/08/2026** e ficou
> mentindo sobre o release iOS ("todos os 6 build configs" — são **10**), sem
> saber da armadilha da `MARKETING_VERSION` que já custou **dois ciclos de
> release perdidos**, sem a armadilha do worktree que quebra o archive, e sem as
> **duas contas** do simulador, cuja confusão já produziu dois bugs graves que
> não existiam.
>
> Manter duas fontes é o defeito nº 1 que este repo combate. Hoje isto é um
> PONTEIRO — o conteúdo tem um lugar só.

## O que fazer antes de tocar em qualquer coisa

1. **Leia `CLAUDE.md`** (raiz do repo). É longo de propósito: cada seção é uma
   armadilha que já custou uma investigação.
2. Consulte os protocolos versionados em `docs/`:

| comando | quando | protocolo |
|---|---|---|
| `/irmaos` | antes de mexer em algo com superfície irmã | `docs/skill-irmaos.md` |
| `/guard` | ao travar um invariante (exige `npm run mutar` vermelho) | `docs/skill-guard.md` |
| `/tela` | conferência visual no simulador iOS | `docs/skill-tela.md` |
| `/auditoria` | varredura de código morto | `docs/skill-auditoria.md` |
| `/design` | revisão de design | `docs/skill-design.md` |
| `/documentar` | destilar a sessão antes do `/clear` | `docs/skill-documentar.md` |
| `/enxugar` | podar o `CLAUDE.md` | `docs/skill-enxugar.md` |
| `/planejamento` | Opus planeja, Sonnet executa | `docs/skill-planejamento.md` |

## O mínimo que vale mesmo sem ler mais nada

Estas cinco não podem depender de você seguir um link:

- **Produção com usuários reais e Apple IAP.** Nada destrutivo sem confirmação
  explícita do dono.
- **Checklist antes de declarar concluído:** `npx tsc --noEmit` (zero erros) ·
  ESLint com `--max-warnings 0` · `npm run test:unit` se tocou lógica.
- **Bug corrigido exige guard provado por mutação** (`npm run mutar`), travando a
  CLASSE do problema — não a instância. Guard que passa verde com o bug reposto
  é guard falso; corrija o TESTE, nunca afrouxe.
- **Nunca** commitar `.env`/`.env.local`, nunca push direto na `main`, nunca
  migration sem confirmar com o dono.
- **O app nativo carrega o front do servidor remoto.** Mudança web/JS entra em
  produção para todos os aparelhos pelo deploy da Vercel; **só código nativo**
  (Swift/plugin em `ios/`) exige build nova no TestFlight. Classifique toda
  tarefa por esse eixo antes de estimar qualquer coisa.
