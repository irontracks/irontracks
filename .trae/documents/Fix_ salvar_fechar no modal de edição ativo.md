## Causa raiz
- Os botões do `ExerciseEditor` (Salvar e X) disparam `confirm/alert` do `GlobalDialog`.
- O `GlobalDialog` hoje renderiza com `z-[100]` ([GlobalDialog.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/GlobalDialog.js#L58-L60)).
- O modal de edição do treino ativo está acima disso (z muito alto), então os dialogs abrem “por trás” do modal. Resultado: parece que **não salvou** e que **travou** (na verdade o dialog está escondido).

## Correções
1) **Garantir que diálogos globais sempre fiquem por cima**
- Aumentar o `z-index` do `GlobalDialog` para ficar acima de qualquer modal/tela (ex.: `z-[5000]`).
- Isso faz o `confirm/alert/loading` aparecerem e serem clicáveis, inclusive durante edição do treino ativo.

2) **Trocar a ordem dos botões e garantir ação do X**
- No header do `ExerciseEditor`, inverter a posição: **Salvar à esquerda** e **X à direita**.
- Ajustar o X para fechar o modal **sem perguntar nada** (chamar `onCancel` direto), como você pediu.
- Manter o botão “Voltar” (lá embaixo) com confirmação, se quiser continuar protegendo cancelamento por ali.

## Verificação
- Abrir treino ativo → Editar → clicar **Salvar** (deve aparecer confirmação/alerta por cima e salvar de fato).
- Clicar no **X** (deve fechar imediatamente sem travar).
- Rodar `npm run build` para garantir que não quebrou nada.
