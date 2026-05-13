//
//  CardioOfflineQueue.swift
//  IronTracksWatch
//
//  F-009: fila local persistente de cardios não-sincronizados. Quando o iPhone
//  estiver fora de reach ou WCSession inativa, o cardio entra aqui em vez de
//  sumir silenciosamente. Drainamos automático ao reconectar.
//
//  Persistência: UserDefaults (chave dedicada com versão no nome). Volume
//  esperado é baixo (1 cardio = ~200 bytes), sem necessidade de SQLite no Watch.
//

import Foundation

@MainActor
final class CardioOfflineQueue {

    static let shared = CardioOfflineQueue()

    private let key = "cardio_offline_queue_v1"
    private let defaults = UserDefaults.standard

    private init() {}

    // ─── Persistência ──────────────────────────────────────────────────────

    private func load() -> [WatchCardioSummary] {
        guard let data = defaults.data(forKey: key) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([WatchCardioSummary].self, from: data)) ?? []
    }

    private func save(_ items: [WatchCardioSummary]) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if let data = try? encoder.encode(items) {
            defaults.set(data, forKey: key)
        }
    }

    // ─── API pública ───────────────────────────────────────────────────────

    /// Adiciona um cardio na fila. Não falha — UserDefaults é resiliente.
    func enqueue(_ summary: WatchCardioSummary) {
        var items = load()
        items.append(summary)
        save(items)
    }

    /// Quantos cardios estão pendentes de sync.
    func pendingCount() -> Int {
        load().count
    }

    /// Snapshot da fila pra UI (read-only).
    func peek() -> [WatchCardioSummary] {
        load()
    }

    /// Tenta drenar a fila: pra cada item, chama `send`. Se retornar true, remove;
    /// se retornar false, mantém pra próxima tentativa. Itens permanecem na ordem
    /// FIFO entre execuções.
    func drain(send: (WatchCardioSummary) async -> Bool) async {
        var items = load()
        guard !items.isEmpty else { return }

        var remaining: [WatchCardioSummary] = []
        for item in items {
            let ok = await send(item)
            if !ok {
                remaining.append(item)
            }
        }
        // Anexa itens enfileirados DURANTE o drain (caso outro enqueue tenha rodado).
        let current = load()
        if current.count > items.count {
            // Há novos itens após o snapshot inicial — preserva-os.
            let appended = Array(current.suffix(current.count - items.count))
            remaining.append(contentsOf: appended)
        }
        items = remaining
        save(items)
    }

    /// Limpa tudo (uso interno / debug).
    func clear() {
        defaults.removeObject(forKey: key)
    }
}
