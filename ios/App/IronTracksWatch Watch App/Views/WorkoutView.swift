//
//  WorkoutView.swift
//  IronTracksWatch
//
//  Tela 2 — Treino ativo: exercício atual, série, carga/reps e descanso.
//
//  Pensada pra ser usada COM PESO NA MÃO: a Digital Crown ajusta carga e reps sem
//  precisar acertar botõezinhos, o descanso sobrevive ao pulso abaixado, e tudo que
//  importa é legível de relance.
//

import SwiftUI
import WatchKit

struct WorkoutView: View {

    @EnvironmentObject var session: WatchSessionManager
    @EnvironmentObject var health: HealthKitManager
    @ObservedObject private var rest = RestTimerEngine.shared

    @State private var exerciseIndex: Int = 0
    @State private var setNumber: Int = 1
    @State private var reps: Double = 10
    @State private var weight: Double = 0
    @State private var showEndConfirm: Bool = false
    /// Marca que o descanso em curso é o "entre exercícios" — ao acabar, avança sozinho.
    @State private var advanceExerciseAfterRest: Bool = false
    @FocusState private var focusedField: CrownField?

    /// Qual valor a Digital Crown está controlando no momento.
    private enum CrownField: Hashable { case reps, weight }

    private var workout: WatchWorkout? { session.dashboard.nextWorkout }
    private var currentExercise: WatchExercise? {
        guard let workout = workout, !workout.exercises.isEmpty else { return nil }
        return workout.exercises[min(exerciseIndex, workout.exercises.count - 1)]
    }

    var body: some View {
        Group {
            if !session.dashboard.isVip {
                // F-022: bloqueia acesso a feature VIP — não inicia HKWorkoutSession.
                VipGatePaywallView()
            } else if let exercise = currentExercise {
                activeWorkout(exercise)
            } else {
                emptyState
            }
        }
        .navigationTitle("Treino")
        .onAppear(perform: startSessionIfNeeded)
        .onChange(of: exerciseIndex) { _ in seedFromPrescription() }
        .onChange(of: rest.isResting) { resting in
            // Descanso entre exercícios terminou (ou foi pulado) → avança sozinho.
            guard !resting, advanceExerciseAfterRest else { return }
            advanceExerciseAfterRest = false
            nextExercise()
        }
        .confirmationDialog("Encerrar treino?", isPresented: $showEndConfirm) {
            Button("Encerrar", role: .destructive) { endWorkout() }
            Button("Continuar treinando", role: .cancel) {}
        } message: {
            Text("O treino será salvo no app Saúde.")
        }
    }

    // ─── Conteúdo principal ─────────────────────────────────────────────

    private func activeWorkout(_ exercise: WatchExercise) -> some View {
        ScrollView {
            VStack(spacing: 6) {
                progressHeader
                exerciseCard(exercise)

                if rest.isResting {
                    restTimerView
                } else {
                    logActionsRow(exercise)
                    navigationRow
                }
            }
            .padding(.horizontal, 4)
        }
    }

    // ─── Header de progresso ────────────────────────────────────────────

    private var progressHeader: some View {
        HStack(spacing: 6) {
            if let workout = workout {
                Text("\(exerciseIndex + 1)/\(workout.exercises.count)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Exercício \(exerciseIndex + 1) de \(workout.exercises.count)")
            }
            Spacer(minLength: 0)
            if health.heartRate > 0 {
                Label("\(health.heartRate)", systemImage: "heart.fill")
                    .foregroundStyle(.red)
                    .font(.caption.bold())
                    .accessibilityLabel("\(health.heartRate) batimentos por minuto")
            }
            Button {
                showEndConfirm = true
            } label: {
                Image(systemName: "stop.circle")
                    .font(.caption)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .accessibilityLabel("Encerrar treino")
        }
    }

    // ─── Exercício atual ────────────────────────────────────────────────

    private func exerciseCard(_ exercise: WatchExercise) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(exercise.name)
                .font(.headline)
                .lineLimit(2)
            HStack(spacing: 10) {
                metric("SÉRIE", "\(setNumber)/\(exercise.sets)", tint: .yellow)
                metric("ALVO", exercise.reps, tint: .primary)
                if let suggested = exercise.weightSuggestion {
                    metric("SUG.", suggested, tint: .primary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(Color.black.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(exercise.name). Série \(setNumber) de \(exercise.sets). Alvo \(exercise.reps) repetições.")
    }

    private func metric(_ label: String, _ value: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label)
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title3.bold())
                .foregroundStyle(tint)
        }
    }

    // ─── Entrada de carga/reps (Digital Crown) ──────────────────────────

    private func logActionsRow(_ exercise: WatchExercise) -> some View {
        VStack(spacing: 4) {
            crownRow(
                title: "CARGA",
                value: WorkoutInputFormat.weight(weight),
                field: .weight,
                onDecrement: { weight = max(0, weight - 2.5) },
                onIncrement: { weight += 2.5 }
            )
            .focused($focusedField, equals: .weight)
            .digitalCrownRotation(
                $weight,
                from: 0, through: 500, by: 0.5,
                sensitivity: .medium,
                isContinuous: false,
                isHapticFeedbackEnabled: true
            )

            crownRow(
                title: "REPS",
                value: "\(Int(reps))",
                field: .reps,
                onDecrement: { reps = max(1, reps - 1) },
                onIncrement: { reps = min(100, reps + 1) }
            )
            .focused($focusedField, equals: .reps)
            .digitalCrownRotation(
                $reps,
                from: 1, through: 100, by: 1,
                sensitivity: .low,
                isContinuous: false,
                isHapticFeedbackEnabled: true
            )

            Button(action: { completeSet(exercise) }) {
                Text("CONCLUIR SÉRIE")
                    .font(.caption.bold())
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .tint(.yellow)
        }
    }

    /// Linha ajustável: toque nos botões OU gire a Crown depois de tocar na linha.
    private func crownRow(
        title: String,
        value: String,
        field: CrownField,
        onDecrement: @escaping () -> Void,
        onIncrement: @escaping () -> Void
    ) -> some View {
        let isFocused = focusedField == field
        return HStack(spacing: 4) {
            stepperButton("−", action: onDecrement)
            VStack(spacing: -2) {
                Text(title)
                    .font(.system(size: 8))
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.caption.bold())
                    .monospacedDigit()
            }
            .frame(maxWidth: .infinity)
            stepperButton("+", action: onIncrement)
        }
        .padding(.vertical, 2)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .stroke(isFocused ? Color.yellow : Color.clear, lineWidth: 1.5)
        )
        .focusable()
        .onTapGesture { focusedField = field }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title == "CARGA" ? "Carga" : "Repetições")
        .accessibilityValue(value)
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: onIncrement()
            case .decrement: onDecrement()
            @unknown default: break
            }
        }
    }

    private func stepperButton(_ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.title3.bold())
                .frame(width: 32, height: 26)
                .background(Color.gray.opacity(0.3), in: Capsule())
        }
        .buttonStyle(.plain)
    }

    // ─── Timer de descanso ─────────────────────────────────────────────
    //
    // TimelineView redesenha sozinha a cada segundo — inclusive em Always-On, onde
    // um Timer comum já teria congelado. O valor vem sempre do relógio (nunca desvia).

    private var restTimerView: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let left = rest.remaining(at: context.date)
            VStack(spacing: 6) {
                Text("DESCANSO")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                Text(WorkoutInputFormat.time(left))
                    .font(.system(size: 38, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(left <= 3 ? .red : .yellow)
                    .contentTransition(.numericText())
                    .accessibilityLabel("Descanso: \(left) segundos restantes")

                ProgressView(value: rest.progress(at: context.date))
                    .tint(.yellow)
                    .accessibilityHidden(true)

                HStack(spacing: 4) {
                    Button("+30s") { rest.addTime(30) }
                        .font(.caption2.bold())
                    Button("PULAR") { rest.skip() }
                        .font(.caption2.bold())
                }
                .buttonStyle(.bordered)
                .tint(.gray)
            }
            .padding(8)
            .background(Color.black.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
        }
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
            .accessibilityLabel("Exercício anterior")

            Button(action: nextExercise) {
                Image(systemName: "chevron.right")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
            }
            .buttonStyle(.bordered)
            .disabled(workout.map { exerciseIndex >= $0.exercises.count - 1 } ?? true)
            .accessibilityLabel("Próximo exercício")
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

    private func startSessionIfNeeded() {
        if !health.isRunning {
            health.start(activityType: .traditionalStrengthTraining, locationType: .indoor)
        }
        seedFromPrescription()
    }

    /// Encerra a sessão do HealthKit de verdade.
    ///
    /// Antes, o treino de força começava no onAppear e NUNCA era encerrado — a
    /// HKWorkoutSession seguia viva indefinidamente, consumindo bateria e deixando
    /// um treino aberto no app Saúde. Agora existe uma saída explícita.
    private func endWorkout() {
        rest.skip()
        Task {
            _ = await health.stop(saveToHealth: true)
            WKInterfaceDevice.current().play(.success)
        }
    }

    /// Pré-preenche carga e reps com o que foi prescrito, em vez de começar sempre
    /// em 10 reps / 0 kg e obrigar o usuário a ajustar tudo na mão.
    private func seedFromPrescription() {
        guard let exercise = currentExercise else { return }
        if let target = WorkoutInputFormat.firstInt(in: exercise.reps), target > 0 {
            reps = min(100, max(1, Double(target)))
        }
        if let suggested = exercise.weightSuggestion,
           let kg = WorkoutInputFormat.firstDouble(in: suggested), kg > 0 {
            weight = min(500, kg)
        }
    }

    private func completeSet(_ exercise: WatchExercise) {
        let log = WatchSetLog(
            exerciseId: exercise.id,
            setNumber: setNumber,
            reps: Int(reps),
            weightKg: weight > 0 ? weight : nil,
            rpe: nil
        )
        session.logSet(log)
        WKInterfaceDevice.current().play(.success)

        let isLastSet = setNumber >= exercise.sets
        if isLastSet {
            setNumber = 1
            // Descanso maior entre exercícios; ao terminar, avança sozinho.
            rest.start(seconds: max(exercise.restSeconds, 60))
            advanceExerciseAfterRest = true
        } else {
            setNumber += 1
            rest.start(seconds: exercise.restSeconds)
            advanceExerciseAfterRest = false
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

}

// MARK: - Haptics (mantido pra compatibilidade com outras telas)

enum WKInterfaceDeviceShim {
    static func success() { WKInterfaceDevice.current().play(.success) }
    static func notification() { WKInterfaceDevice.current().play(.notification) }
    static func failure() { WKInterfaceDevice.current().play(.failure) }
}

#Preview {
    WorkoutView()
        .environmentObject(WatchSessionManager.shared)
        .environmentObject(HealthKitManager.shared)
}
