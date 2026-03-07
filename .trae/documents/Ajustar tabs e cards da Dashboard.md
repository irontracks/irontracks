## Objetivos
- Deixar o botão **Comunidade** com o mesmo “look & feel” dos demais tabs (mesma caixa/borda/altura), mantendo destaque de aba ativa.
- Transformar **Novos Recordes** em um card **compacto e clicável**, exibindo só o resumo “NOVOS RECORDES — No treino: …” (sem lista de PRs no estado colapsado).
- Reduzir o peso visual das **Conquistas** (Badges) para ficar proporcional e leve.

## 1) Tab “Comunidade” com design coerente
- Ajustar o estilo base dos 3 botões para sempre terem a mesma estrutura visual (mesmo background/borda/rounded), e só variar cores quando ativo.
- Implementação em [StudentDashboard.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/StudentDashboard.tsx):
  - Criar uma “base class” única.
  - `active`: borda amarela + texto amarelo.
  - `inactive`: borda neutra + texto neutro, com hover leve.

## 2) Card “Novos Recordes” como resumo clicável
- Alterar [RecentAchievements.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/RecentAchievements.tsx) para:
  - Renderizar apenas o cabeçalho “Novos Recordes” + “No treino: {workoutTitle}”.
  - Tornar o card clicável (`button`/`div role=button`) com feedback (hover/active).
  - Ao clicar, abrir uma visão expandida **dentro do próprio card** (accordion) com a lista atual de PRs (assim fica leve por padrão, mas ainda acessível).
  - Manter o botão de fechar (X) para ocultar.

## 3) Conquistas menores (mais leve)
- Refatorar [BadgesGallery.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/BadgesGallery.tsx):
  - Remover `aspect-square` e reduzir ícones (24 → 16/18).
  - Trocar o grid “cards grandes” por **chips compactos** (linha/grade) com: ícone pequeno + label, padding menor.
  - Ajustar o “Level Card” para ser mais baixo (menos padding, crown menor/opacidade) e manter progress bar.

## Validação
- Recarregar a dashboard e conferir:
  - Os 3 tabs ficam com visual consistente.
  - “Novos Recordes” mostra só o resumo e é clicável (expande/colapsa a lista de PRs).
  - Conquistas ficam visualmente menores e proporcionais.
- Rodar lint para garantir zero regressões.

## Sugestão de modelo alternativo (se quiser ainda mais leve)
- Em vez de mostrar várias conquistas na tela, renderizar só “Top 3 Conquistas” + um botão “Ver todas”, abrindo modal. (Posso aplicar se você preferir depois.)