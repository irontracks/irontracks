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
        Brand.goldGradient
    }

    var body: some View {
        Group {
            if !session.hasEverSynced {
                // F-019: cold start sem nunca ter recebido nada do iPhone — empty state honesto.
                firstSyncEmptyState
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        header
                        if session.pendingCardioCount > 0 {
                            pendingCardioBadge
                        }
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
        }
    }

    // ─── F-019: empty state pré primeira sincronização ──────────────────

    private var firstSyncEmptyState: some View {
        ScrollView {
            VStack(spacing: 10) {
                Image(systemName: "iphone.gen3")
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundStyle(goldGradient)
                    .padding(.top, 6)
                Text("Abra o IronTracks no iPhone pra sincronizar pela primeira vez")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 4)
                Button(action: { session.requestRefresh() }) {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.clockwise")
                        Text("Tentar de novo")
                            .font(.caption.bold())
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)
                .tint(Brand.goldLight)
                .accessibilityLabel("Tentar sincronizar de novo")
            }
            .padding(.horizontal, 6)
        }
        .navigationTitle("IronTracks")
    }

    // ─── F-009: badge de cardios pendentes ──────────────────────────────

    private var pendingCardioBadge: some View {
        HStack(spacing: 4) {
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.caption2)
                .foregroundStyle(Brand.warning)
            Text("\(session.pendingCardioCount) pendente\(session.pendingCardioCount == 1 ? "" : "s")")
                .font(.caption2.bold())
                .foregroundStyle(Brand.warning)
            Spacer()
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
        .background(Brand.warning.opacity(0.15), in: RoundedRectangle(cornerRadius: 6))
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
                    .foregroundStyle(Brand.warning)
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
        .brandCard()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Ofensiva")
        .accessibilityValue("\(dashboard.streakDays) dias")
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
            // Anel, não barra. Progresso no relógio quer ser anel — é o
            // vocabulário da plataforma desde os Activity Rings, e uma barra
            // linear é o componente mais genérico que existe no watchOS.
            weekRing
                .frame(height: 44)
                .frame(maxWidth: .infinity)
        }
        .padding(8)
        .brandCard()
    }

    /// Anel de progresso da semana. `animation` no `trim` faz o traço crescer
    /// quando um treino novo chega — é o único movimento da tela, e marca
    /// exatamente o momento que importa.
    private var weekRing: some View {
        let feitos = Double(min(dashboard.weekWorkouts, dashboard.weekGoal))
        let meta = Double(max(dashboard.weekGoal, 1))
        let pct = meta > 0 ? feitos / meta : 0
        return ZStack {
            Circle()
                .stroke(Brand.hairline, lineWidth: 5)
            Circle()
                .trim(from: 0, to: pct)
                .stroke(Brand.goldGradient, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.5), value: pct)
            Text("\(dashboard.weekWorkouts)")
                .font(.system(size: 17, weight: .heavy, design: .rounded))
                .foregroundStyle(Brand.goldLight)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Treinos da semana")
        .accessibilityValue("\(dashboard.weekWorkouts) de \(dashboard.weekGoal)")
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
                .brandCard()
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
                .brandCard()
            }
        }
    }

    // Card destacado quando o iPhone está executando um treino.
    private func activeWorkoutCard(workout: WatchWorkout) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Circle()
                    .fill(Brand.success)
                    .frame(width: 6, height: 6)
                Text("EM ANDAMENTO")
                    .font(.caption2.bold())
                    .foregroundStyle(Brand.success)
                Spacer()
                if !dashboard.isVip {
                    // Sinalização leve — não bloqueia a view, só comunica que features avançadas precisam VIP.
                    HStack(spacing: 2) {
                        Image(systemName: "lock.fill")
                            .font(Brand.labelFont)
                        Text("VIP")
                            .font(Brand.labelFont)
                    }
                    .foregroundStyle(goldGradient)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 1)
                    .background(Brand.surfaceRaised, in: Capsule())
                }
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
        .background(Brand.success.opacity(0.15), in: RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Brand.success.opacity(0.6), lineWidth: 1)
        )
    }
}

#Preview {
    DashboardView()
        .environmentObject(WatchSessionManager.shared)
}
