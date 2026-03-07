## Objetivo
- Para passar na revisão da Apple: **no iOS nativo (Capacitor)** não pode existir **nenhum CTA/link/fluxo de compra** (Pix/MercadoPago/IAP), nem tela de planos.
- **Web e PWA** continuam exatamente como estão hoje, com MercadoPago/PIX.

## Estratégia
- Detectar **iOS nativo** via `@capacitor/core` (ex.: `Capacitor.isNativePlatform() && Capacitor.getPlatform()==='ios'`).
- Aplicar um “gate” em todos os pontos onde o app:
  - exibe “Upgrade/Assinar/Planos VIP”
  - redireciona para `/marketplace`
  - exibe a própria tela `/marketplace`
- No iOS, substituir por texto neutro tipo “Planos indisponíveis no iOS no momento” (sem CTA de pagamento).

## Mudanças no código
### 1) Centralizar detector de plataforma
- Criar util `src/utils/platform.ts` (ou similar) exportando `isIosNative()`.
- Atualizar os componentes para reutilizar a função (evita lógica duplicada).

### 2) Bloquear a rota de planos no iOS
- Alterar [marketplace/page.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/marketplace/page.tsx) para:
  - Se `isIosNative()`: renderizar uma tela simples com botão “Voltar” para `/dashboard`.
  - Caso contrário: renderizar o `MarketplaceClient` normal.

### 3) Remover CTAs de assinatura/upgrade no iOS
- [VipHub.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/VipHub.js): esconder botões “Upgrade / Ver Planos e Assinar / Fazer Upgrade” quando `isIosNative()`.
- [CoachChatModal.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/CoachChatModal.js): remover o botão “Ver Planos VIP” no iOS.
- [NutritionMixer.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/nutrition/NutritionMixer.tsx): remover o botão “Desbloquear Macros” no iOS.
- [HeaderActionsMenu.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/HeaderActionsMenu.js): ocultar itens relacionados a assinatura/upgrade (ex.: “Cancelar assinatura VIP”) no iOS para não “sinalizar compra” durante review.

## O que NÃO muda
- Web/PWA continuam com:
  - `/marketplace` completo
  - checkout MercadoPago/PIX
  - todos os CTAs de assinatura

## Validação
- Rodar `npm run build` e `npm run lint`.
- Verificação manual:
  - Em navegador normal: `/marketplace` segue com Pix/Cartão.
  - Em iOS nativo (Capacitor):
    - `/marketplace` não mostra planos nem checkout
    - nenhum lugar do app oferece “Upgrade/Assinar/Planos VIP”

## Deploy
- Commit + push na branch `deploy-20260114-160525` para disparar deploy automático na Vercel.