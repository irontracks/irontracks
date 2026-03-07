Na sua print, você está certo: no cabeçalho de cada exercício aparecem só **2 ícones** (play “Vídeo” e a setinha). O botão **“Enviar”** realmente não está sendo renderizado.

## Hipóteses mais prováveis
1) O navegador/Next ainda está servindo **bundle antigo** (cache de chunk/hot reload não aplicou).
2) O Treino Ativo está carregando, mas o componente novo não está entrando (ex.: build não recompilou aquele arquivo).
3) O botão até existe, mas está “invisível” por CSS/layout (menos provável, porque ele tem borda e ícone amarelo).

## Plano passo a passo (o que eu vou fazer)
1) **Conferir o que o navegador está recebendo**
   - Abrir a página do Treino Ativo e procurar no código carregado (DevTools/Sources) pelo texto `Enviar` e por `ExecutionVideoCapture`.
   - Isso mata a dúvida: se não existir no bundle, é cache/build; se existir, é render/CSS.
2) **Forçar uma evidência visual no UI (sem depender de env)**
   - Ajustar o botão para ficar “impossível de passar batido” (ex.: largura maior + label) e adicionar um `data-testid` para eu localizar automaticamente.
3) **Garantir recompilação real**
   - Limpar `.next`, reiniciar o dev server e validar novamente.
4) **Validação automatizada**
   - Tirar um screenshot automatizado da tela do Treino Ativo para confirmar que o botão está aparecendo.
5) **Se ainda assim não aparecer**
   - Aí o problema não é flag: vou rastrear se existe alguma condição de renderização do card de exercício (ex.: outro `renderExercise`, branch, ou CSS) e corrigir no ponto exato.

Se você confirmar, eu executo esses passos agora e te devolvo com o botão aparecendo e um print de validação.