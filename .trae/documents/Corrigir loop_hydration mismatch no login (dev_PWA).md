## Diagnóstico do loop
- O erro mostra **hydration mismatch** no `LoginScreen`: o server renderizou o botão com **SVG**, mas o client hidratou com um **<img data-nimg>** (versão antiga do componente). Isso acontece quando o browser está carregando **JS antigo** e recebendo **HTML novo**.
- No seu projeto, isso é compatível com **cache do Service Worker** em ambiente de desenvolvimento via IP da rede (ex.: `192.168.x.x:3000`).
  - O `ServiceWorkerRegister` só considera “local” `localhost/127.0.0.1/*.local` e, portanto, **registra SW em dev quando você acessa via IP**: [ServiceWorkerRegister.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ServiceWorkerRegister.js#L9-L18).
  - Aí o SW pode entregar chunks antigos e causar mismatch/loop.

## Correção (sem mexer no login em si)
### 1) Não registrar Service Worker em ambiente de dev/LAN
- Melhorar o `isLocal` para incluir:
  - `0.0.0.0`, `::1`
  - IPs privados: `192.168.*`, `10.*`, `172.16.*–172.31.*`
  - e/ou `window.location.port === '3000'`
  - e/ou `process.env.NODE_ENV !== 'production'` (o mais seguro).

### 2) Desinstalar SW antigo automaticamente quando estiver em dev
- Se detectar “ambiente local/dev”, executar:
  - `navigator.serviceWorker.getRegistrations()` → `unregister()`
  - `caches.keys()` → `caches.delete()`
- Isso remove o SW que já ficou instalado no iPhone/navegador e elimina o cache que está misturando versões.

### 3) Validação
- Abrir o app via IP (ex.: `192.168...:3000`) e confirmar:
  - não registra SW
  - não ocorre hydration mismatch
  - não ocorre loop de login

Se você aprovar, eu implemento apenas essas mudanças em [ServiceWorkerRegister.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ServiceWorkerRegister.js), e valido em dev server.