O sintoma “abre 1s e vira tela preta” no iOS/PWA, e só resolve limpando cache, quase sempre é:
- cache/HTML antigo apontando para chunks JS que mudaram (ChunkLoadError / dynamic import falhando), ou
- erro JS fatal muito cedo (antes do React montar), que no standalone vira “tela preta” sem overlay.

Como o app não tem service worker, a causa mais provável é **cache agressivo do iOS + atualização de deploy** (HTML/chunks desencontrados) — o iOS tenta renderizar o shell e, ao baixar JS, falha e fica preto.

## Plano
## 1) Adicionar “boot recovery” bem cedo (antes da hidratação)
No [layout.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/layout.js), evoluir o script inline para:
- Registrar `window.onerror` e `window.onunhandledrejection`.
- Detectar mensagens típicas de cache quebrado:
  - `ChunkLoadError`, `Loading chunk`, `Failed to fetch dynamically imported module`, `Unexpected token <` em arquivo JS.
- Quando detectar, executar um “hard reload com cache-bust”:
  - `location.replace(location.pathname + '?v=' + Date.now() + location.hash)`
  - e bloquear loop (no máximo 2 tentativas em 30s via `sessionStorage`).
- Persistir o último erro em `localStorage` (texto curto) para que, se repetir, o app mostre uma tela de fallback com “Recarregar”/“Limpar estado do app”.

## 2) Detectar troca de versão/deploy e forçar reload
Usar o endpoint já existente [api/version](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/version/route.ts) (no-store) no boot:
- Salvar `deploymentId/commitSha/version` em `localStorage`.
- Se mudou desde a última abertura, fazer `location.replace(...?v=timestamp)`.
Isso evita o cenário clássico: PWA abriu com HTML antigo e assets novos.

## 3) Ajustar headers de cache (defensivo)
No `next.config.mjs`, adicionar `headers()` para:
- `/_next/static/*`: cache imutável (ok)
- Rotas HTML (`/`, `/dashboard`, `/community`, etc.): `cache-control: no-store`
- `manifest.json` e ícones: cache moderado
Isso protege caso haja CDN/proxy com cache incorreto.

## 4) Evitar “ping/redirect” virar loop no iOS
O ping atual roda em focus/visibility. Ajustar para:
- Não redirecionar se já estiver em `/`.
- Fazer backoff (ex.: no máximo 1 redirect a cada 15s) usando `sessionStorage`.

## 5) Validação
- `npm run build`.
- Em dev: simular erro de chunk alterando manualmente uma URL de chunk (checar se o recovery recarrega).
- Em produção/iOS:
  - abrir PWA → fechar Safari completamente → abrir PWA → confirmar que não fica preta.
  - publicar deploy novo → abrir PWA antigo → confirmar auto-reload para nova versão.

Se aprovado, implemento nos arquivos:
- `src/app/layout.js`
- `next.config.mjs`
(e, se necessário, um pequeno componente de fallback/recuperação para exibir o erro salvo).