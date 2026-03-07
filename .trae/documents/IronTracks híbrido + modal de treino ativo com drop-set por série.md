## Benefícios de virar app híbrido (App Store)
- **Confiança e conversão**: presença na App Store aumenta “produto oficial”, melhora taxa de assinatura e reduz atrito de acesso.
- **Retenção**: ícone na home + notificações = volta diária (streaks, lembretes, check-ins, descanso, deload).
- **Recursos nativos que viram features pagas**:
  - Push (check-in, lembrete de treino, mensagens do coach, PRs).
  - Notificações locais e confiáveis para timer de descanso (mesmo com tela bloqueada).
  - Haptics e áudio melhor controlados (sensação premium).
  - Camera/files mais previsíveis (scanner, anexos, vídeos).
  - Offline-first (treino roda sem internet; sincroniza depois).
  - FaceID/TouchID (bloqueio do app / privacidade).
  - HealthKit (futuro): registrar treino/calorias/tempo e puxar métricas.
- **Monetização “nativa”**:
  - Assinatura via In‑App Purchase (quase obrigatório para conteúdo/funcionalidade digital). 
  - Trials, promo offers, upgrades e churn reduction.

## Pontos críticos (pra não reprovar)
- Se o que você vende é **funcionalidade digital** no app, a Apple exige **IAP**. Pagamento externo dentro do app pode reprovar.
- “Wrapper de site” puro tende a ser reprovado. O híbrido precisa entregar **valor nativo** (push, offline, timers, câmera, etc.).

## Modal de treino ativo “perfeito” (drop-set só na última série)
### Modelagem (sem perder simplicidade)
- Manter **nota livre** do exercício, mas também suportar **técnicas estruturadas por série**.
- Aproveitar o que já existe hoje no ActiveWorkout: cada série já carrega `advanced_config` via `setDetails` e replica isso no log por chave `exIdx-setIdx`.
- Propor um `advanced_config` para drop-set:
  - `drop_set: { enabled: true, drops: 2, applies_to: 'last' | 'set_index', pause_peak_sec?: 1, pre_exhaustion?: true }`
  - Resultado: “Drop-set duplo na última” vira regra automática para o último set.

### UX (o que deixa 6 estrelas)
- No header do exercício, chips rápidos: **Pré-exaustão**, **Pausa no pico (1s)**, **Drop-set (1x/2x)**.
- No set row:
  - Se a técnica for **apenas na última**, só o último set mostra um badge (ex.: “DROP×2”).
  - Ao marcar **Done** no último set, expande 2 sub-linhas “Drop 1” e “Drop 2” (cada uma com peso/reps e Done).
  - Tudo continua no mesmo fluxo, sem “tela extra”, mas com um mini drawer/modal se ficar apertado.

### Relatório/Histórico
- Exibir a técnica aplicada no histórico e no relatório (ex.: “Set 4 + Drop1 + Drop2”).
- Isso aumenta a percepção de “treino profissional” e justifica plano pago.

## Plano de implementação (técnico)
### 1) Híbrido (iOS) – caminho incremental
- **Fase 1 (rápida, baixo risco)**: Capacitor (ou similar) apontando para o app web hospedado + adicionar 2–3 features nativas obrigatórias (push/local notifications, haptics, deep links).
- **Fase 2**: offline-first para sessão ativa (cache local + fila de sync).
- **Fase 3**: integrações premium (HealthKit, widgets, Live Activities para timer).

### 2) Drop-set por série no ActiveWorkout
- Mapear como o log é salvo hoje (chave `exIdx-setIdx`, `advanced_config`).
- Criar detector `isDropSetConfig` e um renderer de set com drop-set, similar aos já existentes (rest-pause/cluster).
- Persistir sub-sets do drop em `logs[key].drops = [...]` (ou dentro de `advanced_config`) e refletir no UI.
- Ajustar relatório para renderizar drops e notas.

## Validação
- Cenário: exercício com 4 sets, drop-set duplo no último.
- Testar: marcar sets 1–3 normal; set 4 abre drops; salvar sessão; relatório mostra corretamente.
- Validar lint/build.
