## Diagnóstico
- Hoje o “modal” de deletar é o `window.confirm`, que é nativo do browser e fica com cara de “amador” (como no print).
- O projeto já tem um sistema de modal global bem bonito e consistente via `DialogContext` + `GlobalDialog`.

## Objetivo
- Substituir o `window.confirm('Deletar este story?')` por um **modal padrão do app**, com:
  - título e mensagem melhores
  - botão de ação destrutiva (“Deletar”) em destaque
  - estado de carregando enquanto deleta
  - feedback de erro em modal (alert)

## Mudanças planejadas
### 1) Trocar window.confirm por DialogContext
- Em [StoriesBar.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/StoriesBar.tsx):
  - importar `useDialog`
  - no botão de lixeira, chamar:
    - `await confirm('Tem certeza que deseja deletar este story?\nEssa ação não pode ser desfeita.', 'Deletar story', { confirmText: 'Deletar', cancelText: 'Cancelar' })`
  - se cancelar, não faz nada

### 2) UX durante deleção
- Enquanto `deleting === true`:
  - desabilitar botões de navegação/próximo/anterior
  - trocar o ícone da lixeira por um loader (ou reduzir opacidade) e impedir clique duplo

### 3) Erro com cara profissional
- Se a API falhar:
  - usar `alert('Não foi possível deletar agora. Tente novamente.', 'Erro')`
  - remover/evitar aquele `deleteError` aparecendo no header (fica poluído)

## Validação
- Abrir um story seu → clicar na lixeira → confirmar → story some e viewer fecha.
- Cancelar → nada acontece.
- Simular falha (offline) → exibir modal de erro.
- Rodar lint/build.
