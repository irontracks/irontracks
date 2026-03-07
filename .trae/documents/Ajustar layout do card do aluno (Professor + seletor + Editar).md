## Objetivo
- Deixar o topo do card do aluno (Professor + seletor + botão Editar) **em uma única linha horizontal** em telas médias/grandes, para ficar alinhado e reduzir a altura do card.

## Diagnóstico (onde está hoje)
- O bloco do **Professor** fica dentro da coluna do aluno e quebra em múltiplas linhas (`mt-3 flex flex-col sm:flex-row...`), enquanto o **Editar** fica isolado à direita, causando sensação de desalinhamento e card “alto”.
- Trecho: [AdminPanelV2.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/AdminPanelV2.js#L2646-L2735)

## Mudanças de layout (o que vou implementar)
### 1) Header em 2 colunas responsivas
- Trocar o wrapper do topo do card para um layout `md:grid md:grid-cols-[1fr_auto] md:items-center`:
  - **Esquerda**: voltar + avatar + nome/status + email (com `min-w-0` e `truncate`).
  - **Direita**: ações em uma linha: **Professor + select + Editar**.

### 2) Ações alinhadas na mesma linha
- Mover o bloco do Professor (label + select) para a coluna da direita junto do botão Editar.
- Layout das ações:
  - `flex flex-col sm:flex-row md:flex-row items-stretch md:items-center gap-2`
  - Label “Professor” como microcopy (`text-[10px] uppercase tracking-widest...`) e opcionalmente `hidden lg:block` para não poluir no md.
  - Select com largura controlada para não inflar o card: `w-full sm:w-64 md:w-72`.
  - Botão Editar com `shrink-0` para não quebrar.

### 3) Card mais “fino” (densidade premium)
- Reduzir espaçamentos do topo:
  - `gap-4 -> gap-3`
  - remover `mt-3` do Professor (vira alinhamento horizontal)
  - opcional: `rounded-2xl p-4 md:p-5 -> rounded-xl p-3 md:p-4` (mantendo o visual, mas mais enxuto).

## Ideias extras (opcionais)
- Transformar “Editar” em botão menor no desktop (ou ícone + tooltip), mantendo full text no mobile.
- Fixar alturas em `h-10` no desktop para um look mais alinhado (e manter `min-h-[44px]` no mobile).

## Validação
- Conferir no desktop que “Professor + seletor + Editar” ficam na mesma linha sem quebrar.
- Conferir no mobile que as ações empilham de forma limpa (select 100%).
- Abrir a tela local e revisar visualmente o card.
