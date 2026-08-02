//
//  StreakComplication.swift
//  IronTracksWatchComplications
//
//  "Ofensiva" — o número que faz o usuário não querer quebrar a sequência.
//  Famílias: circular (anel da meta semanal + dias), canto e inline.
//

import WidgetKit
import SwiftUI

struct StreakComplication: Widget {
    let kind = "IronTracksStreak"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ComplicationProvider()) { entry in
            StreakComplicationView(snapshot: entry.snapshot)
                .widgetURL(ComplicationDeepLink.dashboard)
                .complicationContainer()
        }
        .configurationDisplayName("Ofensiva")
        .description("Dias seguidos treinando e sua meta da semana.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryInline])
    }
}

struct StreakComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let snapshot: WatchComplicationSnapshot

    var body: some View {
        switch family {
        case .accessoryCircular: circular
        case .accessoryCorner: corner
        default: inline
        }
    }

    // ─── Circular: anel = progresso da semana, centro = ofensiva ────────────

    private var circular: some View {
        Gauge(value: snapshot.weekProgress) {
            Image(systemName: "flame.fill")
        } currentValueLabel: {
            Text("\(snapshot.streakDays)")
                .font(.system(.title3, design: .rounded).weight(.heavy))
                .minimumScaleFactor(0.5)
        }
        .gaugeStyle(.accessoryCircular)
        .accessibilityLabel(accessibilityText)
    }

    // ─── Canto: número grande + curva com o progresso da semana ────────────

    private var corner: some View {
        Text("\(snapshot.streakDays)")
            .font(.system(.title2, design: .rounded).weight(.heavy))
            .curvedAlongCornerIfAvailable()
            .widgetLabel {
                Gauge(value: snapshot.weekProgress) {
                    Text("Semana")
                } currentValueLabel: {
                    Text("\(snapshot.weekWorkouts)/\(snapshot.weekGoal)")
                }
                .gaugeStyle(.accessoryLinearCapacity)
            }
            .accessibilityLabel(accessibilityText)
    }

    // ─── Inline: uma linha de texto na face ────────────────────────────────

    private var inline: some View {
        Label(inlineText, systemImage: "flame.fill")
            .accessibilityLabel(accessibilityText)
    }

    private var inlineText: String {
        if snapshot.isEmpty { return "Abra no iPhone" }
        if snapshot.streakDays > 0 {
            return "\(snapshot.streakDays)d · \(snapshot.weekWorkouts)/\(snapshot.weekGoal) semana"
        }
        return "\(snapshot.weekWorkouts)/\(snapshot.weekGoal) esta semana"
    }

    private var accessibilityText: Text {
        if snapshot.isEmpty {
            return Text("IronTracks. Sem dados. Abra o app no iPhone para sincronizar.")
        }
        let dias = snapshot.streakDays == 1 ? "1 dia seguido" : "\(snapshot.streakDays) dias seguidos"
        return Text("Ofensiva de \(dias). \(snapshot.weekWorkouts) de \(snapshot.weekGoal) treinos nesta semana.")
    }
}

// MARK: - Compat

private extension View {
    /// Curva o texto acompanhando a borda no mostrador de canto. Só existe do
    /// watchOS 10 em diante; no 9 o texto fica reto (degradação silenciosa).
    /// Nome propositalmente diferente do da API do sistema — um helper chamado
    /// `widgetCurvesContent()` colidiria com ela (que tem parâmetro default) e
    /// entraria em recursão infinita.
    @ViewBuilder
    func curvedAlongCornerIfAvailable() -> some View {
        if #available(watchOS 10.0, *) {
            self.widgetCurvesContent(true)
        } else {
            self
        }
    }
}
