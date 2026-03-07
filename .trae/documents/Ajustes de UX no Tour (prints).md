## O que os prints mostram (problemas)
- **Overlay escurecendo demais**: parece que está “duas camadas” de escurecimento (fundo preto + máscara via shadow), deixando o conteúdo atrás quase invisível.
- **Tooltip longe do alvo**: em alguns passos a caixinha fica num canto e o destaque está em outra região; falta “ancorar” a tooltip ao elemento destacado.
- **Destaques muito grandes**: alguns highlights estão pegando um container inteiro (barra enorme / área grande), o que tira precisão e não ajuda o usuário a entender “onde clicar”.
- **Passo sem contexto visual**: tem print em que o destaque aparece numa área vazia/escura (provavelmente o alvo não está visível ainda, ou não existe naquele estado/role). Falta um mecanismo de “esperar aparecer”/fallback.

## Melhorias recomendadas (prioridade)
### 1) Corrigir o escurecimento (legibilidade)
- Usar **apenas 1 mecanismo** de máscara:
  - ou manter o overlay `bg-black/…` e remover o `shadow-[0_0_0_9999px…]`,
  - ou remover o overlay e manter só a máscara do highlight.
- Ajustar opacidade para permitir ler a UI por trás (ex.: 45–55%).

### 2) Tooltip ancorada ao elemento
- Calcular posição com base no `targetRect`:
  - preferir **abaixo** do alvo, se não couber, usar **acima**;
  - alinhar com o centro do alvo e clamped nas bordas.
- Adicionar uma “setinha” (arrow) opcional para reforçar o vínculo com o alvo.

### 3) Refinar seletores dos passos
- Trocar seletores que pegam containers grandes por alvos mais precisos:
  - “Abas do dashboard” → highlight na própria barra de tabs, mas com altura mínima (evitar pegar wrapper externo).
  - “Mapa muscular” → highlight no header do card ou no SVG, não no card inteiro.
  - “Começar treino” → selecionar a primeira ocorrência visível (ex.: `[data-tour="workout-start"]:first-of-type`).

### 4) Robustez: quando o alvo não existe/está fora da tela
- Implementar lógica de **waitForTarget** (ex.: esperar até X ms o elemento existir).
- Se não existir:
  - ocultar highlight (sem retângulo)
  - mostrar tooltip com instrução alternativa (“Abra o menu para ver…”) e botão “Próximo”.
- Evitar loop infinito de recalcular retângulo com `requestAnimationFrame`; substituir por:
  - recalcular no **step change**, e
  - listeners de `scroll/resize` (throttle),
  - `MutationObserver` leve para quando o DOM muda.

### 5) Acessibilidade/controle
- Garantir foco no modal do tour e navegação por teclado (Esc/←/→ já ok).
- Botões: deixar “Pular” menos dominante que “Próximo” e “Concluir”.

## O que eu vou mudar no código (arquivos)
- Ajustar overlay/posicionamento/lógica de tracking em [GuidedTour.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/onboarding/GuidedTour.js)
- Refinar passos/seletores em [tourSteps.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/tourSteps.js)
- Ajustar alvos `data-tour` em:
  - [StudentDashboard3.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/dashboard/StudentDashboard3.tsx)
  - [MuscleMapCard.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/dashboard/MuscleMapCard.tsx)
  - [HeaderActionsMenu.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/HeaderActionsMenu.js)

## Validação
- Testar em desktop e mobile:
  - highlights pequenos e precisos
  - tooltip sempre perto do alvo
  - overlay não “mata” a UI
  - passos que dependem de conteúdo (ex.: sem treinos) não ficam “perdidos”
- Rodar `npm run lint` e `npm run build`.
