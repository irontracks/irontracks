<!-- Movido do CLAUDE.md em 10/09/2026 pelo /enxugar.
     Motivo: era changelog. As regras VIVAS ficaram no CLAUDE.md; aqui está o registro completo. -->

## Sessão de design 13–14/08/2026 — 21 PRs, e as 5 lições que custaram caro

Sequência completa: #783 → #803. O menu inteiro, o Painel de Controle, as cinco
abas, e uma reversão. **Leia as lições antes de mexer em qualquer coisa visual.**

### ⚠️ FUNDO: já quebrei isto uma vez. Não repita.

O shell do dashboard usa **`bg-depth-2` (#151514)**, e o valor foi escolhido por
medição, não por gosto:

| fundo | chão p/ card 3% | salto ao sair da aba |
|---|---|---|
| `#171717` (era) | 1,075 | 1,104 |
| **`#151514` (é)** | **1,072** | **1,083** |
| `#0a0a0a` | 1,051 | 1,000 |

O PR #798 levou o shell para `#0a0a0a` "por consistência com o body" e o dono
reportou: **"ficou todo preto"**. Revertido no #801. O erro não foi de medição —
foi de LEITURA: comparei 1,048 contra 1,063, li "praticamente igual" e ignorei
que **1,048 é quase nenhuma separação**. O fundo mais claro era o CHÃO que
sustentava os cards, e eu tirei o chão achando que tirava uma inconsistência.

**Antes de mexer em fundo: olhe o número absoluto, não a diferença entre dois.**
E mostre no aparelho ANTES de mergear.

### A Nutrição NÃO vive dentro do shell

`NutritionOverlay` é `fixed … z-[25]` POR CIMA do shell, com fundo próprio. Por
isso o #802 (que arrumou o shell) não a alcançou, e ela ficou sendo a única aba
preta até o #803. **Corrigir o contêiner não corrige quem está por cima dele** —
ao mexer no fundo das abas, a Nutrição é um segundo lugar a tocar.

### Pendência ≠ métrica: "isso some quando alguém trabalha?"

O bloco **PRECISA DE VOCÊ** (#794) abre o Painel com o que exige decisão. Pus
"25 alunos sem professor" ali e o dono viu no print: são **26 de 55 (47%)**, 7
deles há mais de 90 dias. Não é fila — é a característica de quem treina sozinho.
Como alerta ficaria aceso para sempre, e bloco que sempre tem item deixa de ser
lido (#795). Virou métrica, colada ao total que divide (#796).

**O teste, que não dá para automatizar:** aluno em risco some quando o coach age;
solicitação some quando você aprova; "sem professor" não some nunca.

### Revert de PR misto leva junto o que não tinha nada a ver

O #798 continha a mudança de fundo E uma correção do guard de paleta (ignorar hex
em comentário). O #801 reverteu tudo — e o guard voltou a acusar o `#171717`
citado no comentário que documenta a medição. Reaplicado no #802. **PR de uma
coisa só.**

### E-mail alheio: corrigir uma tela não é corrigir a classe

O #791 aplicou `publicDisplayName` só na lista de Conversas. A pergunta do dono
("isso está no app todo?") revelou que o mesmo `display_name` — que em **9 dos 58
perfis É o e-mail** — chegava cru no RANKING, na comunidade, no chat, no story e
no `alt` do avatar (#793). Ratchet em `nomeAlheioNasSociais.test.ts` cobre as 5
superfícies sociais. **Telas administrativas ficam FORA de propósito**: professor
e admin precisam ver o e-mail do aluno.

### O que mais entrou (resumo)

- **Notificações por FUNÇÃO** (#792): 23 tipos em 5 funções (ação · conquista ·
  aviso · lembrete · social). `tipo(icone, rótulo, função)` não deixa escolher
  matiz. Guard limita "ação" a 6 RÓTULOS distintos (subiu de 4 em 27/08, quando
  os pedidos de acesso/cadastro entraram) — **se tudo vira ação, nada é ação**.
- **Degustação** (#797): o histórico diz o que está VALENDO, não o que foi dado.
  Calcular por `created_at + days` seria inventar fato — um usuário tem 3
  entitlements simultâneos. A verdade é `user_entitlements.valid_until`, e quem
  resolve é a ROTA.
- **Scroll lateral do Painel** (#800): `-mx-4` dos chips + contêiner sem
  `overflow-x-hidden` = a página inteira deslizava. **Quem sangra precisa de
  alguém que segure.** Só 1 dos 11 contêineres similares tem sangria — não saí
  travando os outros.
- **Feed repetia o nome** (#803): título + `${nome} bateu PR:` na mensagem. Não dá
  para tirar na origem (a string alimenta o push); o corte é de exibição e
  condicional.

### Estado ao fim da sessão

- `djmkbrasil` está com **`role = admin`** (pedido do dono, permanente). Valor
  anterior: `teacher`.
- **22 guards** de design/a11y. 5326 testes.
- Débito que ficou congelado, não resolvido: **677 pontos de peso 900 em texto
  miúdo**, 54 corpos de 9px, 29 gradientes inline de CTA.
- Tentei atacar o peso 900 por script e a regex **colapsou JSX em 73 arquivos**
  (revertido antes do commit). Não sai por varredura: cada ponto é a pergunta
  "qual é o elemento primário deste bloco?".
