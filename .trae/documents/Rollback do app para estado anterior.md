## Diagnóstico do print
- A tela “branca” com texto simples indica que o CSS/Tailwind não está sendo aplicado.
- Hoje existe um [layout.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/layout.tsx) mínimo que NÃO importa `globals.css`.
- Como também existe [layout.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/layout.js) (que é o layout completo e importa `globals.css`), o Next pode estar usando o `layout.tsx` e “apagando” todo o visual.

## Objetivo
- Voltar o app para “como era antes” (visual + rotas principais), removendo os artefatos/alterações recentes.

## Plano de rollback (seguro)
### 1) Voltar o layout raiz para o original
- Remover o `src/app/layout.tsx` (ou migrar o conteúdo do `layout.js` para `layout.tsx` e remover o `layout.js`).
- Resultado esperado: `globals.css` volta a carregar e o app recupera o estilo.

### 2) Reverter mudanças recentes que não são do core do app
- Remover a rota de preview criada para UI (`/auth/ui-preview/active-workout`) e os arquivos relacionados.
- Reverter as alterações visuais feitas em `ActiveWorkout.js` e `ExecutionVideoCapture.js` para o estado anterior.

### 3) Limpar conflitos de arquivos e garantir consistência
- Verificar e remover arquivos “duplicados”/alternativos (com sufixo “2”, nomes com espaços, ou sem extensão) que possam estar sendo usados pelo bundler.
- Garantir que os entrypoints oficiais continuem sendo `src/app/page.tsx`, `src/app/layout.js` (ou layout.tsx se migrarmos), e `src/app/(app)/dashboard/page.tsx`.

### 4) Validação
- Rodar `npm run dev` e validar `/` e `/dashboard` no navegador.
- Rodar `npm run lint` e `npm run build`.

## Observação importante
- Se você quiser “voltar como era” no sentido literal (antes de qualquer mudança minha), o caminho mais seguro é: **resetar para o último commit estável via git** e só então reaplicar mudanças com cuidado. Posso executar esse rollback também (com snapshot antes).