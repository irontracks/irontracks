## O que está “feio” no print (diagnóstico)
- Hierarquia confusa: informações e ações competem (muitos elementos com o mesmo peso visual).
- Densidade alta: pouco respiro entre blocos; sensação de “apertado” e menos premium.
- Contraste irregular: textos cinza ficam apagados no fundo escuro (principalmente metadados).
- Botões competindo: “Enviar vídeo ao professor”, “Linkar pesos” e “Concluir” aparecem juntos e geram indecisão.
- Microcomponentes quebrados: a pill/label “CLUSTER” aparece cortada (parece bug visual).
- Tap targets: ícones e ações pequenas para mobile (risco de toque errado).
- Barra inferior pesada: “Cancelar” e “Finalizar” ocupam muito, tirando foco do exercício atual.

## Objetivo
- Deixar a tela com cara de app premium, com fluxo claro (o que fazer agora) e sem ruído visual.

## Mudanças propostas (sem mudar regra de negócio)
- Reforçar hierarquia tipográfica: título do exercício mais forte; metadados mais legíveis.
- Reorganizar CTAs: manter 1 primário por momento (ex.: “Concluir série” ou “Finalizar treino”) e mover ações secundárias para menu/accordion.
- Ajustar layout do bloco de séries:
  - Alinhar colunas; aumentar espaçamento vertical.
  - Corrigir a pill “CLUSTER” para não cortar texto.
  - Melhorar estados (ativo/concluído/desabilitado) com contraste consistente.
- Melhorar tap targets: garantir 44×44 para botões/ícones e tornar linha inteira clicável quando fizer sentido.
- Refinar barra inferior: reduzir altura/peso, ou transformar em “sticky” mais discreto com prioridade clara.

## Implementação (arquivos)
- Localizar o componente da tela (provável [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js)) e o(s) subcomponentes de botões/pills.
- Ajustar classes Tailwind (spacing, typography, border/opacity, flex/grid) e estados visuais.

## Validação
- Capturar screenshots antes/depois em viewport mobile.
- Verificar acessibilidade básica (contraste e áreas clicáveis).
- Smoke test: iniciar treino, marcar série, abrir/fechar modais (cluster/drop/rest-pause) e finalizar treino sem regressão.