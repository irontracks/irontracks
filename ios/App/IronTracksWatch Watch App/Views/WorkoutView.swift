//
//  WorkoutView.swift
//  IronTracksWatch
//
//  Tela 2 — Treino ativo: exercício atual, série, reps, timer de descanso.
//  Botões grandes pra ser usado durante a série (Crown não precisa).
//

import SwiftUI

struct WorkoutView: View {

    @EnvironmentObject var session: WatchSessionManager
    @EnvironmentObject var health: HealthKitManager

    @State private var exerciseIndex: Int = 0
    @State private var setNumber: Int = 1
    @State private var restSeconds: Int = 0
    @State private var restTimer: Timer?
    @State private var isResting: Bool = false
    @State private var lastReps: Int = 10
    @State private var lastWeight: Double = 0

    private var workout: WatchWorkout? { session.dashboard.nextWorkout }
    private var currentExercise: WatchExercise? {
        guard let workout = workout, !workout.exercises.isEmpty else { return nil }
        return workout.exercises[min(exerciseIndex, workout.exercises.count - 1)]
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                if let exercise = currentExercise {
                    progressHeader
                    exerciseCard(exercise)
                    if isResting {
                        restTimerView
                    } else {
                        logActionsRow(exercise)
                    }
                    if !isResting {
                        navigationRow
                    }
                } else {
                    emptyState
                }
            }
            .padding(.horizontal, 4)
        }
        .navigationTitle("Treino")
        .onAppear {
            // Inicia HealthKit em modo strength training pra trackear FC durante o treino.
            if !health.isRunning {
                health.start(activityType: .traditionalStrengthTraining, locationType: .indoor)
            }
        }
        .onDisappear {
            // Mantém o workout rodando — usuário pode trocar de aba e voltar.
        }
    }

    // ─── Header de progresso ────────────────────────────────────────────

    private var progressHeader: some View {
        HStack {
            if let workout = workout {
                Text("\(exerciseIndex + 1)/\(workout.exercises.count)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Spacer()
                if health.heartRate > 0 {
                    Label("\(health.heartRate)", systemImage: "heart.fill")
                        .foregroundStyle(.red)
                        .font(.caption.bold())
                }
            }
        }
    }

    // ─── Exercício atual ────────────────────────────────────────────────

    private func exerciseCard(_ exercise: WatchExercise) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(exercise.name)
                .font(.headline)
                .lineLimit(2)
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("SÉRIE")
                        .font(.system(size: 9))
                        .foregroundStyle(.secondary)
                    Text("\(setNumber)/\(exercise.sets)")
                        .font(.title3.bold())
                        .foregroundStyle(.yellow)
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text("REPS")
                        .font(.system(size: 9))
                        .foregroundStyle(.secondary)
                    Text(exercise.reps)
                        .font(.title3.bold())
                }
                if let suggested = exercise.weightSuggestion {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("CARGA")
                            .font(.system(size: 9))
                            .foregroundStyle(.secondary)
                        Text(suggested)
                            .font(.title3.bold())
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(Color.black.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
    }

    // ─── Botões de log ──────────────────────────────────────────────────

    private func logActionsRow(_ exercise: WatchExercise) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                stepperButton("−", color: .gray) {
                    if lastReps > 1 { lastReps -= 1 }
                }
                Text("\(lastReps) reps")
                    .font(.caption.bold())
                    .frame(maxWidth: .infinity)
                stepperButton("+", color: .gray) {
                    lastReps += 1
                }
            }
            HStack(spacing: 4) {
                stepperButton("−", color: .gray) {
                    if lastWeight >= 2.5 { lastWeight -= 2.5 }
                }
                Text(lastWeight > 0 ? "\(Int(lastWeight))kg" : "—")
                    .font(.caption.bold())
                    .frame(maxWidth: .infinity)
                stepperButton("+", color: .gray) {
                    lastWeight += 2.5
                }
            }
            Button(action: completeSet) {
                Text("CONCLUIR SÉRIE")
                    .font(.caption.bold())
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .tint(.yellow)
        }
    }

    private func stepperButton(_ label: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.title3.bold())
                .frame(width: 32, height: 24)
                .background(Color.gray.opacity(0.3), in: Capsule())
        }
        .buttonStyle(.plain)
    }

    // ─── Timer de descanso ─────────────────────────────────────────────

    private var restTimerView: some View {
        VStack(spacing: 6) {
            Text("DESCANSO")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(formatTime(restSeconds))
                .font(.system(size: 36, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(.yellow)
            Button(action: skipRest) {
                Text("PULAR")
                    .font(.caption.bold())
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
            }
            .buttonStyle(.bordered)
            .tint(.gray)
        }
        .padding(8)
        .background(Color.black.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
    }

    // ─── Navegação entre exercícios ─────────────────────────────────────

    private var navigationRow: some View {
        HStack(spacing: 4) {
            Button(action: previousExercise) {
                Image(systemName: "chevron.left")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
            }
            .buttonStyle(.bordered)
            .disabled(exerciseIndex == 0)

            Button(action: nextExercise) {
                Image(systemName: "chevron.right")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
            }
            .buttonStyle(.bordered)
            .disabled(workout.map { exerciseIndex >= $0.exercises.count - 1 } ?? true)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 6) {
            Image(systemName: "dumbbell")
                .font(.title3)
                .foregroundStyle(.secondary)
            Text("Sem treino do dia")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text("Carregue do iPhone")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.top, 20)
    }

    // ─── Ações ──────────────────────────────────────────────────────────

    private func completeSet() {
        guard let exercise = currentExercise else { return }

        // Envia o log pro iPhone (offline-safe)
        let log = WatchSetLog(
            exerciseId: exercise.id,
            setNumber: setNumber,
            reps: lastReps,
            weightKg: lastWeight > 0 ? lastWeight : nil,
            rpe: nil
        )
        session.logSet(log)

        // Avança série ou exercício
        if setNumber >= exercise.sets {
            // Próximo exercício
            setNumber = 1
            startRest(seconds: max(exercise.restSeconds, 60))  // descanso mais longo entre exercícios
            // próximo só avança após descanso pulado/ido
        } else {
            setNumber += 1
            startRest(seconds: exercise.restSeconds)
        }

        // Haptic feedback
        WKInterfaceDeviceShim.success()
    }

    private func startRest(seconds: Int) {
        restSeconds = seconds
        isResting = true
        restTimer?.invalidate()
        restTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            Task { @MainActor in
                restSeconds -= 1
                if restSeconds <= 0 {
                    finishRest()
                }
            }
        }
    }

    private func skipRest() {
        finishRest()
    }

    private func finishRest() {
        restTimer?.invalidate()
        restTimer = nil
        isResting = false
        // Se acabou o último set, avança automaticamente
        if currentExercise != nil, setNumber == 1 {
            advanceExerciseIfPossible()
        }
        WKInterfaceDeviceShim.notification()
    }

    private func advanceExerciseIfPossible() {
        guard let workout = workout else { return }
        if exerciseIndex < workout.exercises.count - 1 {
            exerciseIndex += 1
            setNumber = 1
        }
    }

    private func nextExercise() {
        guard let workout = workout else { return }
        if exerciseIndex < workout.exercises.count - 1 {
            exerciseIndex += 1
            setNumber = 1
        }
    }

    private func previousExercise() {
        if exerciseIndex > 0 {
            exerciseIndex -= 1
            setNumber = 1
        }
    }

    private func formatTime(_ seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        return String(format: "%d:%02d", m, s)
    }
}

// MARK: - Haptic helper (WKInterfaceDevice cross-version safe)

import WatchKit

enum WKInterfaceDeviceShim {
    static func success() {
        WKInterfaceDevice.current().play(.success)
    }
    static func notification() {
        WKInterfaceDevice.current().play(.notification)
    }
    static func failure() {
        WKInterfaceDevice.current().play(.failure)
    }
}

#Preview {
    WorkoutView()
        .environmentObject(WatchSessionManager.shared)
        .environmentObject(HealthKitManager.shared)
}
