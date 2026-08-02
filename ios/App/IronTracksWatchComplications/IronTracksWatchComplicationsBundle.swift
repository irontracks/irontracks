//
//  IronTracksWatchComplicationsBundle.swift
//  IronTracksWatchComplications
//
//  Entry point da extensão de Complications (WidgetKit — watchOS 9+).
//  Duas complications, cada uma cobrindo as famílias onde ela faz sentido:
//   • Ofensiva  — circular / canto / inline (o número que motiva)
//   • Treino    — retangular / inline (o que fazer hoje)
//

import WidgetKit
import SwiftUI

@main
struct IronTracksWatchComplicationsBundle: WidgetBundle {
    var body: some Widget {
        StreakComplication()
        NextWorkoutComplication()
    }
}

// MARK: - Provider compartilhado

/// Uma entrada por timeline: os dados chegam por push (o app grava no App Group e
/// chama reloadAllTimelines). O `.after` só existe pra que um snapshot esquecido
/// acabe sendo reavaliado e possa se marcar como desatualizado.
struct ComplicationEntry: TimelineEntry {
    let date: Date
    let snapshot: WatchComplicationSnapshot
}

struct ComplicationProvider: TimelineProvider {

    func placeholder(in context: Context) -> ComplicationEntry {
        ComplicationEntry(date: Date(), snapshot: .sample)
    }

    /// Snapshot é o que aparece na galeria de complications: mostra a amostra
    /// (números plausíveis) em vez de zeros, que venderiam mal a feature.
    func getSnapshot(in context: Context, completion: @escaping (ComplicationEntry) -> Void) {
        let data = context.isPreview ? .sample : WatchSharedStore.loadOrPlaceholder()
        completion(ComplicationEntry(date: Date(), snapshot: data))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ComplicationEntry>) -> Void) {
        let entry = ComplicationEntry(date: Date(), snapshot: WatchSharedStore.loadOrPlaceholder())
        // Reavalia em 4h. Não é polling de dados (não temos como buscar daqui) — é só
        // pra permitir que a view marque "desatualizado" se o iPhone sumiu faz tempo.
        let next = Date().addingTimeInterval(4 * 60 * 60)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Helpers de apresentação

extension WatchComplicationSnapshot {
    /// Dados velhos demais pra confiar (iPhone longe / app sem abrir).
    var isStale: Bool {
        guard !isEmpty else { return false }
        return Date().timeIntervalSince(updatedAt) > 36 * 60 * 60
    }
}

/// watchOS 10 exige `containerBackground` pra widgets; no 9 o modificador não existe.
/// Encapsulado aqui pra não espalhar `if #available` por todas as views.
struct ComplicationContainer: ViewModifier {
    func body(content: Content) -> some View {
        if #available(watchOS 10.0, *) {
            content.containerBackground(.clear, for: .widget)
        } else {
            content
        }
    }
}

extension View {
    func complicationContainer() -> some View {
        modifier(ComplicationContainer())
    }
}

/// URLs que a watch face usa pra abrir o app já na aba certa.
enum ComplicationDeepLink {
    static let dashboard = URL(string: "irontracks://watch/dashboard")!
    static let workout = URL(string: "irontracks://watch/workout")!
}
