## Benefícios (por que vira “oficial” e vende mais)
- **Confiança e conversão**: App Store passa credibilidade (reviews, marca “instalável”, menos fricção), tende a aumentar retenção e disposição a pagar.
- **Distribuição e reengajamento**: push notifications + badges + deep links → volta diária sem depender de e-mail/WhatsApp.
- **Experiência mais “premium”**: abertura mais rápida, sensação nativa, haptics, transições, menos “cara de site”.
- **Monetização nativa**: assinatura via In‑App Purchase (IAP) com checkout nativo e reativação fácil.
- **Acesso a recursos do iOS**: HealthKit/Apple Watch (futuro), câmera, arquivos, biometria, atalhos, widgets.

## Funcionalidades novas que um híbrido habilita (na prática)
- **Push Notifications nativas** (APNs): lembretes de treino, check‑in pré/pós, “você está em streak”, mensagens/convites.
- **Modo offline/instável**: abrir treinos e registrar sessão sem internet (sincroniza depois). Ótimo para academia.
- **Background/lockscreen**: rest timer com notificação local, vibração/sons no iOS mesmo com tela bloqueada.
- **Upload de mídia mais fluido**: câmera nativa para scanner/imagens, recorte, compressão e envio confiável.
- **Widgets e atalhos**: widget “Treino de hoje”, atalho “Iniciar sessão”, “Registrar check‑in”.
- **Login mais rápido**: Sign in with Apple + biometria para desbloquear.
- **Compartilhamento avançado**: share sheet, exportar treino para apps, links profundos para abrir direto no treino.
- **Melhor performance percebida**: cache local, pré-carregamento do dashboard, menos jank em listas grandes.

## Pontos de atenção (regras da Apple que impactam)
- **IAP obrigatório**: se você vender “recursos/assinatura digital” dentro do app, a Apple geralmente exige compra via IAP.
- **Privacidade**: precisa de telas/declarações claras (dados de saúde, câmera, notificações, analytics).
- **Review**: estabilidade, login funcional, conteúdo real, política de privacidade/termos, não pode “parecer só um site empacotado” se não trouxer valor.

## Escolha técnica recomendada (para o IronTracks)
- **Capacitor** (híbrido) tende a ser o caminho mais rápido/seguro com um app Next.js já existente.
  - Mantém grande parte do front web.
  - Permite plugins nativos (push, haptics, files, biometric, etc.).
- Alternativa: **React Native** (mais nativo), mas costuma exigir reescrever UI e aumenta tempo/custo.

## Plano de implementação (alto nível)
1. **Decidir stack e empacotamento**
   - Escolher Capacitor + iOS.
   - Definir estratégia de navegação (app shell, rotas, auth, deep links).
2. **Preparar base “app-ready”**
   - Ajustar cache local e fallback offline (mínimo: abrir treinos recentes e sessão atual).
   - Garantir que login e sessões funcionam com lifecycle do app (foreground/background).
3. **Integrar features nativas de alto impacto**
   - Push notifications (reminders + mensagens/convites).
   - Rest timer com notificação local + vibração/sons.
   - Scanner: câmera/galeria nativa + compressão.
4. **Monetização e paywall oficial**
   - Implementar IAP (assinatura) + backend de validação/assinatura.
   - Tela de planos, trial, “restaurar compras”.
5. **App Store compliance**
   - Privacy policy/terms, App Privacy details, permissões (camera/notifications).
   - TestFlight, crash reporting, checklist de review.
6. **Polimento de produto (6 estrelas)**
   - Onboarding com “primeiro treino em 60s”.
   - Widget “treino de hoje”, atalhos, deep links.
   - Performance e UX (skeletons, estados vazios, microinterações).

## Resultado esperado
- Em 30–60 dias (dependendo do ritmo), dá para ter um app híbrido com **push + offline básico + rest timer em lockscreen + IAP**, que já muda o patamar de retenção e percepção de valor.

Quer que eu adapte essa lista ao seu público principal (aluno/coach/admin) e priorize um roadmap de 10 itens “maior impacto no pagamento” primeiro?