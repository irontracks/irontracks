//
//  CheckinView.swift
//  IronTracksWatch
//
//  Tela 4 — Check-in rápido na academia. iPhone manda lista de academias
//  próximas (geocercas calculadas no iPhone), Watch só dispara o check-in.
//

import SwiftUI

struct CheckinView: View {

    @EnvironmentObject var session: WatchSessionManager

    @State private var checkingInGymId: String?
    @State private var lastSuccessGymId: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                header

                if session.nearestGyms.isEmpty {
                    emptyState
                } else {
                    ForEach(session.nearestGyms) { gym in
                        gymRow(gym)
                    }
                }
            }
            .padding(.horizontal, 6)
        }
        .navigationTitle("Check-in")
        .onAppear {
            session.requestRefresh()
        }
    }

    // ─── Header ─────────────────────────────────────────────────────────

    private var header: some View {
        HStack(spacing: 4) {
            Image(systemName: "mappin.and.ellipse")
                .foregroundStyle(.yellow)
            Text("Academias por perto")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.top, 4)
    }

    // ─── Lista de academias ─────────────────────────────────────────────

    private func gymRow(_ gym: WatchGym) -> some View {
        Button(action: { checkin(gym: gym) }) {
            HStack(spacing: 8) {
                ZStack {
                    Circle()
                        .fill(checkingInGymId == gym.id ? Color.yellow.opacity(0.3) : Color.black.opacity(0.5))
                        .frame(width: 32, height: 32)
                    Image(systemName: lastSuccessGymId == gym.id ? "checkmark" : "dumbbell.fill")
                        .foregroundStyle(.yellow)
                        .font(.caption.bold())
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text(gym.name)
                        .font(.caption.bold())
                        .lineLimit(1)
                    Text("\(Int(gym.radiusMeters))m de raio")
                        .font(.system(size: 9))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if checkingInGymId == gym.id {
                    ProgressView()
                        .controlSize(.mini)
                }
            }
            .padding(6)
            .background(Color.black.opacity(0.4), in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .disabled(checkingInGymId != nil)
    }

    private var emptyState: some View {
        VStack(spacing: 4) {
            Image(systemName: "location.slash")
                .font(.title3)
                .foregroundStyle(.secondary)
            Text("Sem academias por perto")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text("Aproxime-se de uma\nacademia cadastrada")
                .font(.caption2)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 20)
    }

    // ─── Ações ──────────────────────────────────────────────────────────

    private func checkin(gym: WatchGym) {
        checkingInGymId = gym.id
        session.requestCheckin(gym: gym)
        WKInterfaceDeviceShim.success()
        // Volta o estado depois de 2.5s — o iPhone vai (eventualmente) responder
        // com novo dashboard incluindo o check-in. UX otimista.
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
            lastSuccessGymId = gym.id
            checkingInGymId = nil
        }
    }
}

#Preview {
    CheckinView()
        .environmentObject(WatchSessionManager.shared)
}
