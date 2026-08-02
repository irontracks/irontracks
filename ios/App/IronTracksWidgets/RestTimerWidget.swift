import ActivityKit
import WidgetKit
import SwiftUI

// ── Timer display helper ──────────────────────────────────────────────────────
// Uses Text(timerInterval:) so the system drives the countdown automatically,
// without requiring per-second JS updates.
@available(iOS 16.1, *)
private struct TimerCountdownText: View {
    /// Início do descanso (FIXO). Usado como lowerBound do range de countdown para
    /// ele NUNCA ficar inválido (ver body).
    let startDate: Date
    let endDate: Date
    let isFinished: Bool
    let font: Font
    let color: Color

    var body: some View {
        // Self-healing: se o endDate JÁ PASSOU, trata como finalizado mesmo que a flag
        // isFinished não tenha sido atualizada (o app suspenso pode não ter rodado o
        // auto-finish). O push do servidor no fim do descanso força o update; esta
        // auto-cura é a rede de segurança caso o push não chegue.
        if isFinished || endDate <= Date() {
            // Count UP from when the timer ended (shows overtime: +0:01, +0:02, …)
            Text(timerInterval: endDate...Date.distantFuture, countsDown: false)
                .font(font)
                .foregroundColor(.green)
                .monospacedDigit()
        } else {
            // Count DOWN to endDate. IMPORTANTE: o lowerBound é o startDate FIXO (não
            // Date()). Se usasse Date() e um re-render ocorresse com Date() > endDate, o
            // range `Date()...endDate` ficaria INVÁLIDO (início > fim) e o iOS desenhava
            // um SPINNER travado. Com startDate fixo (< endDate), o range é sempre válido;
            // após o fim o sistema clampa em 0:00 limpo (e a auto-cura acima assume).
            Text(timerInterval: startDate...endDate, countsDown: true)
                .font(font)
                .foregroundColor(color)
                .monospacedDigit()
        }
    }
}

// Início do descanso a partir do estado (endDate - duração). Fixo por construção.
@available(iOS 16.1, *)
private func restStartDate(_ state: RestTimerAttributes.ContentState) -> Date {
    state.endDate.addingTimeInterval(-Double(max(1, state.targetSeconds)))
}

@available(iOS 16.1, *)
struct RestTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerAttributes.self) { context in
            // ── Lock screen / banner ──────────────────────────────────────
            LockScreenBannerView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded — shown when user long-presses the Island
                DynamicIslandExpandedRegion(.leading) {
                    Label("Descanso", systemImage: "timer")
                        .font(.caption2.bold())
                        .foregroundColor(.green)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    TimerCountdownText(
                        startDate: restStartDate(context.state),
                        endDate: context.state.endDate,
                        isFinished: context.state.isFinished,
                        font: .title2.bold(),
                        color: .white
                    )
                    .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.exerciseName)
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.7))
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    // Progress bar: system-driven via timerInterval — animates every second
                    // without JS updates, same mechanism as Text(timerInterval:)
                    let startDate = restStartDate(context.state)
                    // Deriva de endDate (não só da flag): quando o descanso acaba mas o
                    // app suspenso não atualizou isFinished, a barra de timerInterval com
                    // range no passado virava spinner. Aqui mostra a barra cheia estática.
                    if context.state.isFinished || context.state.endDate <= Date() {
                        ProgressView(value: 1.0, total: 1.0)
                            .tint(.green)
                            .padding(.horizontal, 8)
                            .padding(.bottom, 4)
                    } else {
                        ProgressView(timerInterval: startDate...context.state.endDate, countsDown: false)
                            .progressViewStyle(.linear)
                            .tint(.green)
                            .labelsHidden()
                            .padding(.horizontal, 8)
                            .padding(.bottom, 4)
                    }
                }
            } compactLeading: {
                // Compact — left side pill
                Image(systemName: "timer")
                    .foregroundColor(.green)
                    .font(.caption.bold())
            } compactTrailing: {
                // Compact — right side pill (most visible spot)
                TimerCountdownText(
                    startDate: restStartDate(context.state),
                    endDate: context.state.endDate,
                    isFinished: context.state.isFinished,
                    font: .caption.bold(),
                    color: .white
                )
                .frame(minWidth: 38)
            } minimal: {
                // Minimal — tiny dot on secondary island
                Image(systemName: (context.state.isFinished || context.state.endDate <= Date()) ? "checkmark.circle.fill" : "timer")
                    .foregroundColor(.green)
            }
            .keylineTint(.green)
        }
    }
}

// ── Workout Live Activity (session-level — exercise progress, volume, elapsed) ──
//
// Coexists with RestTimerLiveActivity. The workout LA stays visible during the
// entire session; the rest timer LA appears briefly on top of it during rests.
// iOS automatically handles displaying multiple activities simultaneously.

@available(iOS 16.1, *)
struct WorkoutLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutLiveActivityAttributes.self) { context in
            WorkoutLockScreenView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("Treino", systemImage: "figure.strengthtraining.traditional")
                        .font(.caption2.bold())
                        .foregroundColor(.orange)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: context.attributes.workoutStartDate...Date.distantFuture, countsDown: false)
                        .font(.title3.bold())
                        .monospacedDigit()
                        .foregroundColor(.white)
                        .frame(minWidth: 64, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.currentExerciseName.isEmpty ? context.attributes.workoutName : context.state.currentExerciseName)
                        .font(.caption.bold())
                        .foregroundColor(.white.opacity(0.85))
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 12) {
                        Label {
                            Text("Série \(context.state.currentSetIndex)/\(max(context.state.totalSetsForExercise, context.state.currentSetIndex))")
                                .font(.caption2.bold())
                                .foregroundColor(.white)
                        } icon: {
                            Image(systemName: "list.number")
                                .font(.caption2)
                                .foregroundColor(.orange)
                        }
                        Spacer()
                        Label {
                            Text("\(Int(context.state.totalVolumeKg)) kg")
                                .font(.caption2.bold())
                                .foregroundColor(.white)
                        } icon: {
                            Image(systemName: "scalemass.fill")
                                .font(.caption2)
                                .foregroundColor(.orange)
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.bottom, 4)
                }
            } compactLeading: {
                // Descanso ATIVO → countdown decrescente (verde) do OUTRO lado; senão o
                // ícone do treino. O elapsed (count-up) segue no compactTrailing.
                if let restEnd = context.state.restEndDate, restEnd > Date() {
                    Text(timerInterval: Date()...restEnd, countsDown: true)
                        .font(.caption.bold())
                        .monospacedDigit()
                        .foregroundColor(.green)
                        .frame(minWidth: 40)
                } else {
                    Image(systemName: "figure.strengthtraining.traditional")
                        .foregroundColor(.orange)
                        .font(.caption.bold())
                }
            } compactTrailing: {
                Text(timerInterval: context.attributes.workoutStartDate...Date.distantFuture, countsDown: false)
                    .font(.caption.bold())
                    .monospacedDigit()
                    .foregroundColor(.white)
                    .frame(minWidth: 44)
            } minimal: {
                Image(systemName: "figure.strengthtraining.traditional")
                    .foregroundColor(.orange)
            }
            .keylineTint(.orange)
        }
    }
}

@available(iOS 16.1, *)
struct WorkoutLockScreenView: View {
    let context: ActivityViewContext<WorkoutLiveActivityAttributes>

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(Color.orange.opacity(0.18))
                        .frame(width: 44, height: 44)
                    Image(systemName: "figure.strengthtraining.traditional")
                        .font(.title3.bold())
                        .foregroundColor(.orange)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.workoutName)
                        .font(.caption.bold())
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                    Text(context.state.currentExerciseName.isEmpty
                         ? "Treinando…"
                         : context.state.currentExerciseName)
                        .font(.subheadline.bold())
                        .foregroundColor(.primary)
                        .lineLimit(1)
                }
                Spacer()
                Text(timerInterval: context.attributes.workoutStartDate...Date.distantFuture,
                     countsDown: false)
                    .font(.system(.title2, design: .rounded).bold())
                    .monospacedDigit()
                    .foregroundColor(.primary)
            }

            HStack(spacing: 14) {
                HStack(spacing: 4) {
                    Image(systemName: "list.number")
                        .font(.caption2)
                        .foregroundColor(.orange)
                    Text("Série \(context.state.currentSetIndex)/\(max(context.state.totalSetsForExercise, context.state.currentSetIndex))")
                        .font(.caption2.bold())
                        .foregroundColor(.secondary)
                }
                HStack(spacing: 4) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.caption2)
                        .foregroundColor(.green)
                    Text("\(context.state.totalSetsCompleted) séries")
                        .font(.caption2.bold())
                        .foregroundColor(.secondary)
                }
                HStack(spacing: 4) {
                    Image(systemName: "scalemass.fill")
                        .font(.caption2)
                        .foregroundColor(.orange)
                    Text("\(Int(context.state.totalVolumeKg)) kg")
                        .font(.caption2.bold())
                        .foregroundColor(.secondary)
                }
                Spacer()
            }
        }
        .padding(16)
        .activityBackgroundTint(Color(red: 0.05, green: 0.05, blue: 0.05))
        .activitySystemActionForegroundColor(.white)
    }
}

// ── Lock screen banner view ───────────────────────────────────────────────────

@available(iOS 16.1, *)
struct LockScreenBannerView: View {
    let context: ActivityViewContext<RestTimerAttributes>

    var body: some View {
        // Mesma lógica self-healing do TimerCountdownText: trata como finalizado se o
        // endDate já passou, pra todo o banner (ícone/label/botão) ficar coerente mesmo
        // quando o app ficou suspenso e não atualizou isFinished.
        let finished = context.state.isFinished || context.state.endDate <= Date()
        return VStack(spacing: 10) {
            // ── Top row: icon + labels + rest countdown ──────────────────
            HStack(spacing: 14) {
                // Circular icon
                ZStack {
                    Circle()
                        .fill(finished
                              ? Color.green.opacity(0.25)
                              : Color.yellow.opacity(0.15))
                        .frame(width: 44, height: 44)
                    Image(systemName: finished
                          ? "checkmark.circle.fill"
                          : "timer")
                        .font(.title3.bold())
                        .foregroundColor(finished ? .green : .yellow)
                }

                // Labels
                VStack(alignment: .leading, spacing: 2) {
                    Text(finished ? "Hora de Treinar!" : "Descansando")
                        .font(.caption.bold())
                        .foregroundColor(.secondary)
                    Text(context.attributes.exerciseName)
                        .font(.subheadline.bold())
                        .foregroundColor(.primary)
                        .lineLimit(1)
                }

                Spacer()

                // Rest countdown / count-up
                TimerCountdownText(
                    startDate: restStartDate(context.state),
                    endDate: context.state.endDate,
                    isFinished: finished,
                    font: .system(.title2, design: .rounded).bold(),
                    color: finished ? .green : .primary
                )
            }

            // ── Workout elapsed row ──────────────────────────────────────
            HStack(spacing: 4) {
                Image(systemName: "stopwatch")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Text("Treino:")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                // Count UP from workout start — system-driven, no JS updates needed
                Text(timerInterval: context.attributes.workoutStartDate...Date.distantFuture,
                     countsDown: false)
                    .font(.caption2.monospacedDigit())
                    .foregroundColor(.secondary)
                Spacer()
            }
            .padding(.top, -4)

            // ── Interactive buttons (iOS 17+) ────────────────────────────
            // INICIAR SÉRIE is always visible so users can start early from
            // the lock screen without opening the app first.
            // OK appears only when the rest is done (to dismiss the banner).
            if #available(iOS 17.0, *) {
                HStack(spacing: 10) {
                    if finished {
                        // OK — dismisses the Live Activity banner
                        Button(intent: DismissTimerIntent()) {
                            Text("OK")
                                .font(.subheadline.bold())
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 9)
                                .background(Color.white.opacity(0.12))
                                .foregroundColor(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                    }

                    // INICIAR SÉRIE — always visible, opens app to start next set
                    Button(intent: StartSetIntent()) {
                        HStack(spacing: 5) {
                            Image(systemName: "play.fill")
                            Text(finished ? "INICIAR SÉRIE" : "PULAR DESCANSO")
                        }
                        .font(.subheadline.bold())
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(finished ? Color.green : Color.white.opacity(0.15))
                        .foregroundColor(finished ? .black : .white)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(16)
        .activityBackgroundTint(Color(red: 0.05, green: 0.05, blue: 0.05))
        .activitySystemActionForegroundColor(.white)
    }
}
