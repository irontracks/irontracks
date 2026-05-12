//
//  DashboardView.swift
//  IronTracksWatch
//
//  Tela 1 — visão geral: streak, treinos da semana, próximo treino.
//

import SwiftUI

struct DashboardView: View {

    @EnvironmentObject var session: WatchSessionManager

    private var dashboard: WatchDashboard { session.dashboard }
    private var goldGradient: LinearGradient {
        LinearGradient(
            colors: [Color(red: 0.95, green: 0.78, blue: 0.30), Color(red: 0.78, green: 0.55, blue: 0.10)],
            startPoint: .top, endPoint: .bottom
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                header
                streakCard
                weekProgressCard
                nextWorkoutCard
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
        }
        .navigationTitle("IronTracks")
        .onAppear {
            session.requestRefresh()
        }
    }

    // ─── Header ──────────────────────────────────────────────────────────

    private var header: some View {
        HStack(spacing: 4) {
            Image(systemName: "bolt.fill")
                .foregroundStyle(goldGradient)
                .font(.caption)
            Text("Olá, \(dashboard.userName)")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Spacer()
            if !session.isReachable {
                Image(systemName: "wifi.slash")
                    .font(.caption2)
                    .foregroundStyle(.orange)
            }
        }
    }

    // ─── Streak ──────────────────────────────────────────────────────────

    private var streakCard: some View {
        HStack(spacing: 8) {
            Image(systemName: "flame.fill")
                .font(.title3)
                .foregroundStyle(LinearGradient(
                    colors: [.orange, .red],
                    startPoint: .top, endPoint: .bottom
                ))
            VStack(alignment: .leading, spacing: 0) {
                Text("\(dashboard.streakDays)")
                    .font(.system(size: 22, weight: .heavy, design: .rounded))
                    .foregroundStyle(goldGradient)
                Text(dashboard.streakDays == 1 ? "dia de streak" : "dias de streak")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(8)
        .background(Color.black.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
    }

    // ─── Semana ──────────────────────────────────────────────────────────

    private var weekProgressCard: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Semana")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(dashboard.weekWorkouts)/\(dashboard.weekGoal)")
                    .font(.caption.bold())
                    .foregroundStyle(goldGradient)
            }
            ProgressView(
                value: Double(min(dashboard.weekWorkouts, dashboard.weekGoal)),
                total: Double(max(dashboard.weekGoal, 1))
            )
            .tint(.yellow)
        }
        .padding(8)
        .background(Color.black.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
    }

    // ─── Próximo treino / Treino ativo ──────────────────────────────────

    private var nextWorkoutCard: some View {
        Group {
            if dashboard.isWorkoutActive, let workout = dashboard.nextWorkout {
                // Treino em andamento no iPhone — destacar
                activeWorkoutCard(workout: workout)
            } else if let workout = dashboard.nextWorkout, !workout.exercises.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text(workout.dayLabel.uppercased())
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text(workout.name)
                        .font(.headline)
                        .lineLimit(1)
                    HStack(spacing: 8) {
                        Label("\(workout.exercises.count)", systemImage: "list.bullet")
                            .font(.caption2)
                        Label("\(workout.totalSets)x", systemImage: "repeat")
                            .font(.caption2)
                        Label("\(workout.estimatedMinutes)min", systemImage: "clock")
                            .font(.caption2)
                    }
                    .foregroundStyle(.secondary)
                }
                .padding(8)
                .background(Color.black.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
            } else {
                VStack(spacing: 4) {
                    Image(systemName: "calendar")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                    Text("Nenhum treino")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(8)
                .background(Color.black.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    // Card destacado quando o iPhone está executando um treino.
    private func activeWorkoutCard(workout: WatchWorkout) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Circle()
                    .fill(Color.green)
                    .frame(width: 6, height: 6)
                Text("EM ANDAMENTO")
                    .font(.caption2.bold())
                    .foregroundStyle(.green)
                Spacer()
            }
            Text(workout.name)
                .font(.headline)
                .lineLimit(1)
                .foregroundStyle(goldGradient)
            Text("Treino rodando no iPhone")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(8)
        .background(Color.green.opacity(0.15), in: RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.green.opacity(0.6), lineWidth: 1)
        )
    }
}

#Preview {
    DashboardView()
        .environmentObject(WatchSessionManager.shared)
}
