O erro acontece porque o arquivo **não existe** no projeto no caminho que o import aponta.

**O que confirmei no repositório (agora):**
- `IronTracksAppClient.js` importa `@/components/HeaderActionsMenu` (linha 45).
- Não existe nenhum arquivo `src/components/HeaderActionsMenu.*` (glob não encontrou), então o Next falha com “Module not found”.

## Plano
1) **Recriar o componente faltante**
- Criar `src/components/HeaderActionsMenu.tsx` (ou `.js`) com `export default`.
- Incluir `use client` e a UI do menu (avatar + dropdown), mantendo callbacks já usados: `onOpenAdmin`, `onOpenChatList`, `onOpenGlobalChat`, `onOpenHistory`, `onOpenNotifications`, `onOpenSchedule`, `onOpenSettings`, `onLogout`, `onOpenCommunity`.

2) **Garantir compatibilidade com os imports atuais**
- Verificar `IronTracksAppClient.js` e `IronTracksAppClient 2.js` para garantir que o import continua `@/components/HeaderActionsMenu` e resolve sem ajuste de casing.

3) **Limpar cache e validar**
- Limpar `.next` e reiniciar `npm run dev`.
- Abrir `/dashboard` e confirmar que o build não quebra e que o menu abre.

Se você confirmar, eu aplico o patch e testo o carregamento no navegador.