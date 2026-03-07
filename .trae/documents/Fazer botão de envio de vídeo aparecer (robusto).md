## Por que não está aparecendo
- O componente [ExecutionVideoCapture.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ExecutionVideoCapture.js) faz `if (!enabled()) return null;`.
- Mesmo com as flags no `.env.local`, o `enabled()` pode estar voltando `false` no bundle do navegador (cache/hard reload, env não propagou, ou `process` não está resolvendo como esperado no client).

## Evidência no código
- O botão está inserido no Treino Ativo aqui: [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js#L1158-L1168)
- As flags existem no `.env.local`: [env local](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/.env.local#L29-L31)

## Plano (passo a passo)
1) **Garantir que não é cache do navegador**
   - Fazer hard refresh (Ctrl+Shift+R) e abrir em aba anônima.
2) **Garantir que não é cache do Next**
   - Parar o dev server, apagar `.next/` e subir de novo em `localhost:3000`.
3) **Tornar o feature-flag “à prova de env no client” (mudança no código)**
   - Alterar a regra do client para:
     - **mostrar o botão por padrão**, e **só esconder** quando `NEXT_PUBLIC_ENABLE_EXECUTION_VIDEO` estiver explicitamente `"false"`.
   - Assim, mesmo se a env não estiver sendo injetada corretamente, o botão aparece e você consegue testar.
4) **Manter a remoção simples (como você pediu)**
   - Para remover: basta definir `NEXT_PUBLIC_ENABLE_EXECUTION_VIDEO=false` e `ENABLE_EXECUTION_VIDEO=false` (UI some e APIs retornam disabled).

Se você confirmar, eu aplico a mudança no `enabled()` do [ExecutionVideoCapture.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ExecutionVideoCapture.js) (e o mesmo padrão no `executionVideoEnabled` do [AdminPanelV2.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/AdminPanelV2.js)).