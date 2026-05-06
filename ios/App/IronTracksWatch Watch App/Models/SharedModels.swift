//
//  SharedModels.swift
//  IronTracksWatch
//
//  Modelos compartilhados entre o app iPhone (Capacitor) e o Watch.
//  Codable em JSON simples — protocolo de wire estável entre as duas pontas.
//

import Foundation

// MARK: - Workout (treino do dia)

struct WatchExercise: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let sets: Int
    let reps: String          // "8-12" ou "12" — string pra suportar faixa
    let restSeconds: Int      // descanso entre séries
    let weightSuggestion: String?  // "20kg" ou nil
    let muscleGroup: String?
    let notes: String?

    static let placeholder = WatchExercise(
        id: "placeholder",
        name: "Sem treino",
        sets: 0,
        reps: "0",
        restSeconds: 60,
        weightSuggestion: nil,
        muscleGroup: nil,
        notes: nil
    )
}

struct WatchWorkout: Codable, Identifiable, Equatable {
    let id: String
    let name: String           // "Peito + Tríceps" etc.
    let dayLabel: String       // "Treino A", "Hoje", etc.
    let estimatedMinutes: Int
    let exercises: [WatchExercise]
    let scheduledAt: Date?

    var totalSets: Int { exercises.reduce(0) { $0 + $1.sets } }

    static let empty = WatchWorkout(
        id: "empty",
        name: "Nenhum treino",
        dayLabel: "—",
        estimatedMinutes: 0,
        exercises: [],
        scheduledAt: nil
    )
}

// MARK: - Streak / dashboard summary

struct WatchDashboard: Codable, Equatable {
    let streakDays: Int
    let weekWorkouts: Int       // treinos completados na semana
    let weekGoal: Int           // meta de treinos da semana
    let nextWorkout: WatchWorkout?
    let userName: String

    static let placeholder = WatchDashboard(
        streakDays: 0,
        weekWorkouts: 0,
        weekGoal: 5,
        nextWorkout: nil,
        userName: "Atleta"
    )
}

// MARK: - Series logging (durante treino ativo)

struct WatchSetLog: Codable, Identifiable, Equatable {
    let id: String
    let exerciseId: String
    let setNumber: Int
    let reps: Int
    let weightKg: Double?
    let rpe: Int?               // Rate of Perceived Exertion (1-10)
    let completedAt: Date

    init(
        id: String = UUID().uuidString,
        exerciseId: String,
        setNumber: Int,
        reps: Int,
        weightKg: Double?,
        rpe: Int? = nil,
        completedAt: Date = Date()
    ) {
        self.id = id
        self.exerciseId = exerciseId
        self.setNumber = setNumber
        self.reps = reps
        self.weightKg = weightKg
        self.rpe = rpe
        self.completedAt = completedAt
    }
}

// MARK: - Cardio session

struct WatchCardioSummary: Codable, Equatable {
    let distanceMeters: Double
    let durationSeconds: Int
    let avgHeartRate: Int?
    let maxHeartRate: Int?
    let caloriesEstimated: Int
    let avgPaceMinKm: Double?
    let startedAt: Date
    let finishedAt: Date
}

// MARK: - Gym (check-in)

struct WatchGym: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let latitude: Double
    let longitude: Double
    let radiusMeters: Double
}

// MARK: - Wire protocol (mensagens entre iPhone <-> Watch)

/// Tipos de mensagens trocadas via WatchConnectivity.
/// Formato: { "kind": "<MessageKind>", "payload": <data> }
enum WatchMessageKind: String, Codable {
    // iPhone → Watch
    case dashboardUpdate    = "dashboard.update"     // Watch recebe estado completo
    case workoutPush        = "workout.push"         // Pushar treino do dia
    case nearestGym         = "gym.nearest"          // Lista de academias próximas
    case sessionAuth        = "session.auth"         // Token + userId pra Watch fazer chamadas

    // Watch → iPhone
    case requestRefresh     = "refresh.request"      // Watch pede dados atualizados
    case logSet             = "set.log"              // Watch registrou uma série
    case cardioFinish       = "cardio.finish"        // Watch terminou um cardio
    case checkinRequest     = "checkin.request"      // Watch pede check-in numa academia
}

/// Wrapper genérico — sempre kind + payload (Data JSON).
struct WatchMessage: Codable {
    let kind: WatchMessageKind
    let payload: Data?
    let sentAt: Date

    init(kind: WatchMessageKind, payload: Data? = nil) {
        self.kind = kind
        self.payload = payload
        self.sentAt = Date()
    }

    /// Constrói uma mensagem com payload Codable arbitrário.
    static func encode<T: Encodable>(_ kind: WatchMessageKind, payload: T) throws -> WatchMessage {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(payload)
        return WatchMessage(kind: kind, payload: data)
    }

    /// Decodifica o payload pra um tipo concreto.
    func decodePayload<T: Decodable>(as: T.Type) throws -> T {
        guard let data = payload else {
            throw NSError(domain: "WatchMessage", code: -1, userInfo: [NSLocalizedDescriptionKey: "Empty payload"])
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(T.self, from: data)
    }

    /// Serializa pra dicionário [String: Any] que o WatchConnectivity exige.
    func toDictionary() -> [String: Any] {
        var dict: [String: Any] = ["kind": kind.rawValue, "sentAt": sentAt.timeIntervalSince1970]
        if let payload = payload {
            dict["payload"] = payload
        }
        return dict
    }

    /// Reconstroi a partir de um dicionário recebido pelo WCSession.
    static func fromDictionary(_ dict: [String: Any]) -> WatchMessage? {
        guard let kindRaw = dict["kind"] as? String,
              let kind = WatchMessageKind(rawValue: kindRaw) else {
            return nil
        }
        let payload = dict["payload"] as? Data
        return WatchMessage(kind: kind, payload: payload)
    }
}
