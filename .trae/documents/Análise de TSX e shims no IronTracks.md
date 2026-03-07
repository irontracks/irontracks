## Resultado da análise (estado atual)
- **Não está 100% “só TS/TSX” dentro de `src/`**: existem **4 arquivos JS/JSX** em `src/app/` que duplicam rotas já existentes em TSX.
  - Duplicatas encontradas (todas com JSX, portanto **não deveriam existir em `.js/.jsx`**):
    - [layout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/layout.js) (duplica [layout.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/layout.tsx))
    - [error.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/error.js) (duplica [error.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/error.tsx))
    - [global-error.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/global-error.js) (duplica [global-error.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/global-error.tsx))
    - [not-found.jsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/not-found.jsx) (duplica [not-found.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/not-found.tsx))
- **Separação TS vs TSX (ok como regra)**: o projeto tem `.ts` e `.tsx`. Isso é o correto (TSX só quando há JSX). O problema aqui é a presença de **JS/JSX duplicado** dentro de `src/app/`.

## “Sem shim” (TypeScript bypass)
- Existem “shims” no sentido de **bypass de checagem de tipo** via diretivas TypeScript:
  - `// @ts-ignore` em:
    - [VideoTrimmerImpl.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/stories/VideoTrimmerImpl.tsx)
    - [StoryComposer.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/StoryComposer.tsx)
    - [VideoCompositor.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/lib/video/VideoCompositor.ts)
  - `// @ts-nocheck` em teste:
    - [AssessmentForm.test.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/assessment/__tests__/AssessmentForm.test.tsx)
- “Shim” inevitável/normal do Next: [next-env.d.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/next-env.d.ts) (esse é esperado e não é o mesmo tipo de “bypass” de `@ts-ignore`).

## Plano para ficar “tudo TSX/TS sem shim” (após você confirmar)
1) **Remover os 4 arquivos JS/JSX duplicados em `src/app/`** (manter somente as versões `.tsx`).
2) **Eliminar `@ts-ignore`/`@ts-nocheck`**:
   - Para cada ocorrência, ajustar tipagens/refatorar trechos para passar no TS sem suprimir erro.
   - No teste com `@ts-nocheck`, migrar para tipagem correta ou (no pior caso) `@ts-expect-error` pontual e justificável.
3) **Endurecer a política de TypeScript (opcional, mas recomendado)**:
   - Ajustar `tsconfig.json` para `allowJs: false` (já que `src/` deve ser TS), e garantir que `tsc`/build continuam passando.
4) Rodar validações: `tsc --noEmit`, `npm run build`, e checar que o dev server sobe sem warnings de duplicidade.