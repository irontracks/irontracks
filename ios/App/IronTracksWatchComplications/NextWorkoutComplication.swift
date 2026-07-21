//
//  NextWorkoutComplication.swift
//  IronTracksWatchComplications
//
//  "Treino de hoje" — o que fazer, direto no mostrador. Tocar abre o app na aba Treino.
//  Famílias: retangular (a informativa) e inline.
//

import WidgetKit
import SwiftUI

struct NextWorkoutComplication: Widget {
    let kind = "IronTracksNextWorkout"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ComplicationProvider()) { entry in
            NextWorkoutComplicationView(snapshot: entry.snapshot)
                .widgetURL(ComplicationDeepLink.workout)
                .complicationContainer()
        }
        .configurationDisplayName("Treino de hoje")
        .description("O treino do dia e o progresso da semana.")
        .supportedFamilies([.accessoryRectangular, .accessoryInline])
    }
}

struct NextWorkoutComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let snapshot: WatchComplicationSnapshot

    var body: some View {
        switch family {
        case .accessoryRectangular: rectangular
        default: inline
        }
    }

    // ─── Retangular ────────────────────────────────────────────────────────

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: headerIcon)
                Text(headerText)
                    .font(.caption2.weight(.semibold))
                Spacer(minLength: 0)
            }
            .foregroundStyle(.secondary)

            Text(titleText)
                .font(.headline)
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            Text(subtitleText)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    // ─── Inline ────────────────────────────────────────────────────────────

    private var inline: some View {
        Label(inlineText, systemImage: headerIcon)
            .accessibilityLabel(accessibilityText)
    }

    // ─── Conteúdo ──────────────────────────────────────────────────────────

    private var headerIcon: String {
        if snapshot.isWorkoutActive { return "figure.run" }
        return snapshot.isEmpty ? "iphone.slash" : "dumbbell.fill"
    }

    private var headerText: String {
        if snapshot.isWorkoutActive { return "EM ANDAMENTO" }
        if snapshot.isStale { return "DESATUALIZADO" }
        return snapshot.dayLabel?.uppercased() ?? "HOJE"
    }

    private var titleText: String {
        if snapshot.isEmpty { return "Sincronize" }
        return snapshot.workoutName ?? "Sem treino hoje"
    }

    private var subtitleText: String {
        if snapshot.isEmpty { return "Abra o app no iPhone" }
        var parts: [String] = []
        if snapshot.exerciseCount > 0 {
            parts.append(snapshot.exerciseCount == 1 ? "1 exercício" : "\(snapshot.exerciseCount) exercícios")
        }
        parts.append("semana \(snapshot.weekWorkouts)/\(snapshot.weekGoal)")
        return parts.joined(separator: " · ")
    }

    private var inlineText: String {
        if snapshot.isEmpty { return "Abra no iPhone" }
        return snapshot.workoutName ?? "Sem treino hoje"
    }

    private var accessibilityText: Text {
        if snapshot.isEmpty {
            return Text("IronTracks. Sem dados. Abra o app no iPhone para sincronizar.")
        }
        if snapshot.isWorkoutActive {
            return Text("Treino em andamento: \(snapshot.workoutName ?? "sem nome").")
        }
        guard let name = snapshot.workoutName else {
            return Text("Nenhum treino programado para hoje.")
        }
        return Text("Treino de hoje: \(name), \(snapshot.exerciseCount) exercícios. \(snapshot.weekWorkouts) de \(snapshot.weekGoal) treinos nesta semana.")
    }
}
