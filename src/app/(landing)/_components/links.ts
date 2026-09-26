export const APPLE = 'https://apps.apple.com/br/app/irontracks/id6758735356'
// Android em teste FECHADO (faixa Alpha) via Grupo do Google com entrada livre.
// O testador entra no grupo (sem aprovação) e depois abre o opt-in pra virar testador.
export const GROUP = 'https://groups.google.com/g/irontracks-beta'
export const PLAY = 'https://play.google.com/apps/testing/com.irontracks.app'
export const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.irontracks.app'
// O app mora em /app desde a fase 3 da migração raiz↔/comercial (26/09/2026).
// A raiz do domínio é esta landing — link pro app aponta pra cá, nunca pra ela.
// Guard: src/app/__tests__/landingLevaAoApp.test.ts
export const APP = '/app'
