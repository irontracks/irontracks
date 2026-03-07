# Plano — iOS: corrigir integrações existentes + implementar faltantes (uma rodada)

## Objetivo

Levantar e organizar **todas as funções exclusivas do app iOS (Capacitor)** que já existem no IronTracks:
- O que está **em funcionamento 100%**
- O que dá para **melhorar** (robustez/UX/telemetria)
- O que **ainda não temos** e vale implementar

E, nesta mesma rodada de execução:
- Fazer uma **análise completa do porquê** as integrações não estão funcionando no app iOS.
- **Corrigir** o que já existe para funcionar no device real.
- **Implementar** o que falta (deep links, push, actions, etc.) com o app pronto para produção.

Observação importante: algumas integrações (push/APNs, domínios associados, etc.) dependem de configuração no Apple Developer Portal. O plano abaixo inclui: (1) tudo de código necessário e (2) checklist do que precisa ser habilitado no portal para ficar 100% operacional.

## Escopo do levantamento

Inclui:
- Código web (React/Next) que só roda no iOS nativo via `isIosNative()`
- Ponte nativa custom (Capacitor plugin) + código Swift iOS
- Integrações iOS (Dynamic Island/Lock Screen, HealthKit, biometria, haptics, Spotlight)
- Plugins Capacitor: Sign in with Apple, RevenueCat Purchases

## Em funcionamento 100% (já existe e está integrado na UI)

### 1) Live Activity (Lock Screen + Dynamic Island) para descanso
- O que faz: mostra o **timer de descanso** na Lock Screen e Dynamic Island.
- Onde:
  - Widget Live Activity: `ios/App/RestTimerLiveActivity/RestTimerLiveActivity.swift`
  - Shared attributes: `ios/LocalPackages/IronTracksLiveActivityShared/.../RestTimerAttributes.swift`
  - Start/End via plugin: `ios/LocalPackages/IronTracksNative/.../IronTracksNative.swift`
  - Chamadas no app: `src/components/workout/RestTimerOverlay.tsx` (`startRestLiveActivity` / `endRestLiveActivity`)

### 2) Notificação local do fim do descanso + permissão + categorias
- O que faz: agenda e cancela notificação local do descanso; define categorias de ação no iOS.
- Onde:
  - Implementação iOS: `ios/LocalPackages/IronTracksNative/.../IronTracksNative.swift` (UNUserNotificationCenter)
  - Setup inicial: `src/hooks/useNativeAppSetup.ts`
  - Uso: `src/components/workout/RestTimerOverlay.tsx`

### 3) Bloqueio biométrico (FaceID/TouchID) ao voltar do background
- O que faz: tela de lock e autenticação biométrica.
- Onde:
  - Native: `ios/LocalPackages/IronTracksNative/.../IronTracksNative.swift` (LocalAuthentication)
  - UI: `src/components/BiometricLock.tsx`
  - Integração: `src/app/(app)/dashboard/IronTracksAppClientImpl.tsx`

### 4) Impedir a tela de apagar durante o descanso (Idle Timer)
- O que faz: `isIdleTimerDisabled` no iOS para manter tela ligada.
- Onde:
  - Native: `ios/LocalPackages/IronTracksNative/.../IronTracksNative.swift`
  - Wrapper: `src/utils/native/irontracksNative.ts`
  - Uso: `src/components/workout/RestTimerOverlay.tsx`

### 5) Haptics (feedback tátil)
- O que faz: gera vibração/feedback (selection/impact/notification).
- Onde:
  - Native: `ios/LocalPackages/IronTracksNative/.../IronTracksNative.swift`
  - Wrapper: `src/utils/native/irontracksNative.ts`
  - Hook: `src/hooks/useNativeFeatures.ts`

### 6) Login com Apple (Sign in with Apple)
- O que faz: login nativo Apple (plugin capacitor-community).
- Onde: `src/components/LoginScreen.tsx`

### 7) Assinaturas/compras no app via RevenueCat (StoreKit)
- O que faz: offerings, compra, restore, sincronização com backend.
- Onde:
  - UI/fluxo: `src/app/marketplace/MarketplaceClient.tsx`
  - API sync: `src/app/api/billing/revenuecat/sync/route.ts`
  - Plugin iOS: `ios/LocalPackages/RevenuecatPurchasesCapacitor/.../PurchasesPlugin.swift`

### 8) HealthKit (coleta e gravação)
- O que faz: leitura de passos e gravação de workout no HealthKit.
- Onde:
  - Native: `ios/LocalPackages/IronTracksNative/.../IronTracksNative.swift`
  - Wrapper: `src/utils/native/irontracksNative.ts`
  - Observação: existe a ponte; o consumo/fluxo de UI precisa ser confirmado em navegação real.

### 9) Spotlight (indexação)
- O que faz: indexar conteúdo no Spotlight para busca no iOS.
- Onde:
  - Native: `ios/LocalPackages/IronTracksNative/.../IronTracksNative.swift`
  - Wrapper: `src/utils/native/irontracksNative.ts`

### 10) Acelerômetro (sensor)
- O que faz: stream de dados do acelerômetro via `notifyListeners`.
- Onde:
  - Native: `ios/LocalPackages/IronTracksNative/.../IronTracksNative.swift`
  - Consumo: `src/hooks/useNativeFeatures.ts`

## Melhorias recomendadas (sem “inventar feature”, só consolidar e robustecer)

### 1) Live Activity no overtime do descanso
- Situação: quando o descanso zera, hoje a Live Activity tende a ser encerrada para evitar contagem negativa.
- Melhoria:
  - Alternativa A: manter Live Activity “congelada em 0:00” até START (melhor coerência).
  - Alternativa B: terminar Live Activity ao zerar, mas manter o overlay + overtime no app (já funciona; só alinhar UX e mensagens).

### 2) Evento de ação de notificação não consumido no JS
- Situação: o AppDelegate posta `IronTracksNotificationAction`, mas não há listener JS/TS claro consumindo.
- Melhoria:
  - Criar listener no app (Capacitor `window.addEventListener`) ou bridge no plugin para abrir tela de treino/timer ao tocar na notificação.

### 3) Deep Links (iOS está preparado, mas falta roteamento no app)
- Situação: AppDelegate encaminha URLs, mas não há handler do lado JS (ex.: `appUrlOpen`) mapeando para rotas/telas.
- Melhoria:
  - Implementar roteamento para convites, report, marketplace, etc.

### 4) Telemetria/observabilidade de features nativas
- Melhoria:
  - Eventos: request de permissão, falhas do HealthKit, falhas do Live Activity, restore purchase, etc.
  - Ajuda a descobrir gargalos do iOS em produção.

## Ainda não temos (oportunidades reais de implementação)

### 1) Push notifications completas (token + registro + backend)
- Situação: há callbacks de token/erro no AppDelegate, mas não há implementação completa no JS nem pipeline de backend.
- Possível:
  - Registro de token no Supabase
  - Push para lembretes, mensagens, treinos, coaching

### 2) Background tasks (rotinas e sincronização)
- Possível:
  - Sincronização periódica, refresh de dados, limpeza de cache, tarefas leves.

### 3) Widgets adicionais (além do Live Activity)
- Possível:
  - Widget de “Treino do dia”
  - “Streak”
  - “Próximo treino”

### 4) Integração HealthKit mais profunda (se fizer sentido)
- Possível:
  - Exportar métricas do treino (tempo, calorias estimadas) para HealthKit
  - Importar dados relevantes (freq. cardíaca se disponível via Apple Watch, etc.)

### 5) Shortcuts/Siri (AppIntents)
- Possível:
  - “Iniciar descanso 90s”
  - “Abrir treino ativo”
  - “Registrar treino concluído”

## Diagnóstico: por que “nada funciona” no iOS (plano de análise completa)

Como você reportou que nenhuma das integrações está funcionando, o plano começa por eliminar causas-raiz típicas:

### 1) Capacitor bridge não está disponível no runtime
- Sintoma: `isIosNative()` retorna false porque `window.Capacitor` não existe.
- Ações:
  - Criar uma tela interna “Diagnóstico iOS” (somente em iOS) exibindo:
    - `window.Capacitor` presente?
    - `Capacitor.getPlatform()` retorna `ios`?
    - Lista de plugins disponíveis
    - Resultado de chamadas “ping” por feature (biometria, haptics, notification permission, live activity start/end no-op)
  - Logar esse diagnóstico em endpoint server para inspeção em produção (sem expor PII).

### 2) Plugins nativos não estão registrados/embarcados no build
- Sintoma: `registerPlugin(...)` funciona no JS, mas `Capacitor.Plugins.IronTracksNative` (ou similar) não existe.
- Ações:
  - Garantir que o plugin Swift custom esteja corretamente incluído no target App (SPM/local package) e publicado no build final.
  - Adicionar no diagnóstico um “probe” de métodos do plugin para detectar ausência.

### 3) Permissões/capabilities negadas ou faltando
- Ações:
  - HealthKit: verificar capability + entitlements + request de autorização.
  - Live Activities: garantir `NSSupportsLiveActivities` e target de extension embutido.
  - Notifications: checar autorização e categories.
  - Biometria: checar disponibilidade e fallback.

### 4) Ambiente de teste incompatível (simulador / iOS versão)
- Live Activity/Dynamic Island só funciona em device e iOS suportado.
- Ações:
  - No diagnóstico, exibir iOS version e avisos quando o recurso não é suportado.

## Implementação: correções + melhorias + novas features (tudo em uma rodada)

### A) Consolidar e corrigir as integrações existentes (para ficar 100%)
1) Live Activity / descanso
   - Ajustar comportamento no overtime (congelar em 0:00 até START ou manter coerente com overlay)
   - Validar start/end e evitar “leaks” de atividades
2) Notificações locais
   - Garantir request de permissão no momento certo (setup)
   - Garantir cancelamento/limpeza e evitar duplicidade
   - Conectar actions de notificação ao app (ver item C2)

#### A.2.1) Problema específico: app não aparece em Ajustes > Notificações (iPhone físico)
- Hipóteses mais prováveis:
  - O app **nunca solicitou** permissão via `UNUserNotificationCenter.requestAuthorization(...)` (sem isso, ele não aparece na lista).
  - A ponte Capacitor/plugin não está ativa no device (logo o request não chega a acontecer).
  - A permissão foi solicitada, mas falhou silenciosamente e não há UI de diagnóstico.
- Plano de correção (código):
  1) Solicitar permissão **logo no bootstrap do app iOS** (não depender de abrir o timer de descanso):
     - Rodar `requestNativeNotifications()` no `useNativeAppSetup` quando `isIosNative()` for true.
  2) Adicionar um painel “Notificações” no app (Configurações ou Diagnóstico iOS) com:
     - Status atual (`granted/denied/notDetermined`)
     - Botão “Solicitar permissão”
     - Botão “Abrir Ajustes do iOS” (para casos negados)
  3) Após permissão concedida, opcionalmente agendar e cancelar uma notificação de teste para validar end-to-end.
- Plano de verificação no device:
  - Instalar build → abrir app → aceitar permissão → confirmar que aparece em Ajustes > Notificações.
3) Biometria
   - Garantir fallback elegante quando não disponível
   - Garantir lock ao voltar do background realmente dispara sempre
4) Haptics
   - Padronizar uso em ações críticas (START, CONCLUIR, fim do descanso)
5) HealthKit
   - Adicionar fluxo UI para:
     - pedir permissão
     - habilitar/desabilitar integração
     - exportar treino finalizado (tempo/calorias/volume quando aplicável)
6) Spotlight
   - Adicionar pontos claros de indexação (workouts, exercícios, ações rápidas)
7) Acelerômetro
   - Se for feature real: criar consumer funcional (ou remover/ocultar se ainda não pronto)

### B) Melhorias no app para ficar “observável” e fácil de validar
1) Tela “Diagnóstico iOS” no app
   - Status de permissões + capabilities
   - Botões “Testar” por feature (haptic, live activity, notification local, biometric)
2) Telemetria de falhas nativas
   - Capturar erros e enviar para endpoint interno (sem dados sensíveis)

### C) O que falta e será implementado
1) Deep Links (routing no JS)
   - Implementar listener `appUrlOpen` e mapear rotas úteis:
     - abrir treino ativo
     - abrir histórico/relatório
     - abrir marketplace
2) Actions de notificação → navegação
   - Consumir o evento que hoje é postado pelo AppDelegate e navegar para o contexto correto
3) Push Notifications (pipeline completo)
   - Implementar lado JS:
     - registro do token APNs
     - envio para backend (Supabase) com device metadata
   - Implementar backend:
     - tabela de devices/tokens
     - endpoints para registrar/remover tokens
   - Checklist Apple:
     - habilitar Push Notifications capability
     - chaves/certificados APNs
     - bundle id correto

### D) Ajustes solicitados na UI (complemento)
1) Timer flutuante/recuperação
   - Melhorar a apresentação do “Descanso/Recuperação” (inclusive overtime) e alinhamento visual.

## Critérios de aceite
- A tela de Diagnóstico iOS confirma: Capacitor + plugin custom + permissões/capabilities em OK.
- Live Activity e notificações do descanso funcionam em device suportado.
- Biometria e haptics funcionando e consistentes.
- HealthKit exportando treino (quando habilitado).
- Deep links funcionando.
- Push pronto no código e com checklist para ativação no portal.

## Entregável desta etapa
- Correções + implementações novas aplicadas no repositório.
- Tela de Diagnóstico iOS para validação em produção.
- Checklist Apple Developer Portal (para push/deep links avançados).

## Próximo passo após aprovação deste plano
- (Opcional) Priorizar 3–5 itens de melhoria e criar um roadmap de execução por impacto.
