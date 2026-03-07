## Por que você não está vendo o seletor em 3 navegadores
- O projeto tem um Service Worker em [public/sw.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/public/sw.js) com `CACHE_NAME = 'irontracks-sw-v1'` fixo e cache agressivo (cache-first para recursos). Isso pode manter HTML/JS antigos servidos do cache, mesmo após deploy/refresh.
- O seletor de modo por série já está no código em [ExerciseEditor.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ExerciseEditor.js#L1219-L1355). Se ele não aparece, é quase certo que você está carregando build antigo via cache.

## Correção (para atualização aparecer sempre)
### 1) Atualizar o Service Worker para não “prender” versões antigas
- Alterar `CACHE_NAME` para uma nova versão (ex.: `irontracks-sw-v2`) para forçar limpeza do cache antigo.
- Parar de pré-cachear páginas HTML (`/` e `/dashboard`) no `install` (isso é o que mais causa UI velha).
- Trocar estratégia de `/_next/static/*` para **network-first com fallback no cache** (assim, online sempre pega os chunks novos; offline usa cache).
- Manter `skipWaiting` e `clients.claim`.

### 2) (Opcional, mas recomendado) Forçar atualização do SW no app
- Adicionar um `postMessage` simples para o SW executar `skipWaiting` quando detectar update e pedir reload (evita “precisa fechar abas”).

## Validação
- Subir o app e checar que:
  - o seletor “Modo” aparece ao lado de cada série no editor.
  - em PWA/Safari, uma atualização nova reflete imediatamente após um refresh.

## Passo imediato para você testar agora (antes do patch)
- No PWA/Safari: apagar dados do site / remover o app da tela inicial e instalar novamente.
- No Chrome: Application → Service Workers → Unregister + Clear storage.

Se você confirmar, eu aplico o patch no `public/sw.js` e deixo o cache mais seguro para updates.