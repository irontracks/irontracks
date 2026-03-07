## Antes de qualquer mudança (obrigatório: ponto de restauração)
1) **Snapshot no GitHub (ponto de restauração)**
- Criar um commit de backup + tag com timestamp e enviar para o GitHub.
- Nome sugerido: `snapshot-YYYYMMDD-HHMMSS`.

2) **Snapshot local (para restauração offline)**
- Gerar um **git bundle** com timestamp (ex.: `snapshots/irontracks-YYYYMMDD-HHMMSS.bundle`) para restaurar mesmo sem rede.
- Opcional (extra seguro): exportar também um patch `snapshots/irontracks-YYYYMMDD-HHMMSS.patch`.

## Fase 8 — Rotas de IA + Quotas VIP (hardening)
### 1) Implementar as rotas faltantes (sem mudar UX)
- Criar rotas chamadas pela UI e hoje ausentes:
  - `POST /api/ai/coach-chat` (usada por [CoachChatModal.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/CoachChatModal.js#L90-L132))
  - `POST /api/ai/vip-coach` (usada por [VipHub.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/VipHub.js#L71-L149))
  - `POST /api/ai/workout-wizard` (usada por [IronTracksAppClientImpl.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClientImpl.js#L2935))
- Seguir o padrão de IA já existente em [post-workout-insights](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/ai/post-workout-insights/route.ts#L230-L283) (GoogleGenerativeAI, prompt pt-BR, output controlado).

### 2) Enforcement server-side de entitlements e quotas
- Em cada rota nova:
  - `requireUser`
  - `checkVipFeatureAccess` para a feature correspondente (ex.: `chat_daily`, `wizard_weekly`)
  - Bloquear com `403` e payload compatível com a UI: `{ ok:false, upgradeRequired:true, message }`
  - `incrementVipUsage` somente quando a resposta for gerada com sucesso.

### 3) Contrato único de resposta/erro
- Padronizar retorno:
  - Sucesso: `{ ok:true, answer|content|text, ... }` (mantendo compatibilidade com campos esperados)
  - Limite: `{ ok:false, error:'limit_reached', upgradeRequired:true, message }`
  - Falha técnica: `{ ok:false, error }`.

### 4) Smoke tests de alto ROI
- Adicionar testes que garantam:
  - rotas acima existem
  - enforcement de quota está presente
  - não há regressão (404/rota faltando).

### 5) Verificação final
- Rodar `npm run build` e `npm run test:smoke`.
- Validar manualmente (dev): abrir CoachChat/VipHub/Wizard e confirmar que não existe 404 e que bloqueio VIP retorna CTA corretamente.

## Critérios de aceite
- Nenhuma chamada da UI para `/api/ai/*` cai em 404.
- Quotas VIP são aplicadas no servidor para chat/wizard.
- Build + smoke verdes.

## Plano de rollback (se algo quebrar feio)
- Restaurar pela tag `snapshot-YYYYMMDD-HHMMSS` no GitHub.
- Alternativa offline: restaurar usando o arquivo `.bundle` gerado localmente.