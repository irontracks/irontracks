## Pré-condição recebida
- Você liberou mudanças em Auth com **OVERRIDE AUTH LOCK**.

## Plano (ordem de execução)

### 0) Snapshot (ponto de restauração)
- Executar o snapshot automático com timestamp (commit + tag) para restauração rápida.

### 1) Crash ao abrir câmera (Guideline 2.1)
- Atualizar `ios/App/App/Info.plist` adicionando:
  - `NSCameraUsageDescription`
  - `NSMicrophoneUsageDescription`
  - (se necessário) `NSPhotoLibraryUsageDescription` e `NSPhotoLibraryAddUsageDescription`
- Validar no iPad: abrir o fluxo que aciona o input `capture="environment"` ([ExecutionVideoCapture.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ExecutionVideoCapture.js#L322-L331)).

### 2) Pagamentos: migrar assinatura do iOS para IAP (Guideline 3.1.1)
- Implementar assinatura via StoreKit no iOS (recomendação prática: integrar um plugin Capacitor de IAP; prioridade para um que suporte subscriptions bem).
- Ajustar UI do iOS para:
  - remover/ocultar PIX/Asaas, MercadoPago, `invoice_url`, e qualquer CTA/link/redirect de compra externa
  - exibir plano/assinatura via IAP
- Back-end/entitlement:
  - criar endpoint para registrar/validar transação (receipt/transaction) e marcar VIP ativo no Supabase.
  - atualizar a lógica de “VIP ativo” para aceitar apenas fonte IAP no iOS.

### 3) Sign in with Apple retornando erro (Guideline 2.1)
- Reproduzir e capturar o erro exato:
  - garantir que `/auth/error` mostre claramente `error` e `error_description` (sem redirecionamentos confusos).
- Corrigir causas prováveis em ambiente iOS (WKWebView):
  - alinhar `IRONTRACKS_PUBLIC_ORIGIN`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_COOKIE_DOMAIN` e `capacitor.config.ts server.url` para que cookies/PKCE/state sobrevivam ao round-trip.
  - ajustar `cookieOptions.ts` e o fluxo `/auth/login` → `/auth/callback` para reduzir falhas de PKCE/state.
  - remover o fallback de callback que redireciona para recuperação quando o problema é PKCE, e em vez disso mandar para `/auth/error` com mensagem objetiva.
- Validar no iPad (instalação limpa): 5 tentativas seguidas de login Apple.

### 4) Validação final pré-resubmissão
- iPadOS (mesmo cenário da Apple):
  - câmera/vídeo sem crash e com prompt de permissão
  - login Apple funcionando
  - assinatura via IAP funcionando (sandbox tester)
  - nenhum fluxo de pagamento externo exposto no iOS

Se aprovar esse plano, começo pelo snapshot e em seguida faço a correção do crash da câmera (rápida), depois entro em IAP e, por fim, no Sign in with Apple.