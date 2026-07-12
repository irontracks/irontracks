# Auditoria de paridade Android vs iOS — IronTracks

Auditoria completa (10 dimensões, verificação adversarial): **42 achados confirmados**.
Este doc registra cada um e o status. Corrigidos em 4 ondas (PRs #368–#371).

## ✅ Corrigido e mergeado

### Onda 1 — JS (produção via Vercel, chega aos dois)
- Push "aluno iniciou o treino": no Android o tap não fazia nada → agora assume o treino (request de controle + abre dashboard).
- Push matinal (morning_briefing): tap navega pra `/dashboard/nutrition`.
- "Abrir ajustes" (permissão negada): usava `app-settings:` (iOS-only) → agora `openAppSettings()` em qualquer nativo.
- Botão Voltar do Android fecha o overlay do Iron Rank.

### Onda 2 — Nativo (compila ✓, no AAB)
- **CAMERA + RECORD_AUDIO + MODIFY_AUDIO_SETTINGS** (crítico): destrava scanner de nutrição + captura de áudio (estavam mortos — SO auto-negava sem diálogo).
- **Rest timer FGS `health`→`specialUse`** (alto): `health` exigia permissão de sensor no Android 14+ → SecurityException matava a notificação do cronômetro.
- **GPS de cardio em background** (flagship): `CardioLocationService` (foreground service + FusedLocationProvider + buffer thread-safe), paridade com o CLLocationManager do iOS → distância não trava mais com a tela bloqueada.
- Ícone de notificação monocromático (era quadrado branco) + cor de destaque.
- `allowBackup=false` (sessão/auth fora do backup).

### Onda 3 — Release confiável
- JDK 17 automático (Java novo quebra o AGP), `npm run build` antes do sync, guard do `google-services.json`, faixa **Alpha** (fechada) em vez de `internal`, versionName alinhado ao iOS (1.14.0).

### Onda 4 — Correção de permissão
- Removido `ACCESS_BACKGROUND_LOCATION` (disparava a revisão de background location do Google e dava 403 no commit do release; o foreground service não precisa dela).

## 🔴 Precisa de decisão sua (não feito unilateralmente)

| Item | Por quê | Recomendação |
|---|---|---|
| **Play Billing / IAP Android** | O app Android mostra PIX/cartão (Asaas/MP) — risco de reprovação do Play por bens digitais fora do Play Billing. Zona de pagamentos. | (a) esconder CTAs no Android até ter Play Billing (stopgap), ou (b) implementar Play Billing (produtos no Play Console + chave RevenueCat `goog_` + gating `isNativePlatform`). |
| **Keystore + senhas no git** | `android/app/irontracks.jks` + `key.properties` (senha fraca) commitados. | Rotacionar a upload key no Play + purgar histórico (git filter-repo) + mover segredos pra fora do repo. Ação coordenada. |

## ⏭️ Follow-ups grandes (degradam sem crash hoje)

- **Health Connect** (medium ×4): Android sem dados de saúde (widget, Recovery Score, HR, sono, saveWorkout). Feature multi-dia (androidx.health.connect).
- **Botões de ação nativos no push** (FirebaseMessagingService próprio): o TAP já funciona (onda 1); faltam os BOTÕES na notificação (Assumir/Pular descanso/Vou treinar).
- **Workout Live Activity** Android: sem indicação persistente de treino em andamento fora do descanso (ongoing notification).
- **Voz nativa Android** (SpeechRecognizer) ou esconder o botão de voz.
- **Geofence de academia** (auto check-in) — iOS-only.

## 🔧 Polimento pendente (rest timer / notificações)
- Alarme sonoro alto no fim do descanso (res/raw + canal com USAGE_ALARM) — hoje é o "ding" padrão.
- Sempre agendar AlarmManager.setExactAndAllowWhileIdle (o FGS é só a notificação).
- Repetição do alarme contínuo no caminho FGS; limpar a notificação "done" ao dar START; push em foreground exibir banner local no Android.
- Canais de notificação idempotentes no onCreate.
- RevenueCat webhook: derivar provider do `store` (google vs apple) — só importa quando Android IAP existir.
- Copy da /comercial: saúde vendida como Apple-only.
