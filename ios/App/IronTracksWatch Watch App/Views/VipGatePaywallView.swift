//
//  VipGatePaywallView.swift
//  IronTracksWatch
//
//  Paywall mini exibido quando usuário sem entitlement VIP tenta acessar
//  features pagas (treinos / cardio). Compra real só rola no iPhone — aqui
//  só explicamos e damos dismiss.
//

import SwiftUI

struct VipGatePaywallView: View {

    @Environment(\.dismiss) private var dismiss

    private var goldGradient: LinearGradient {
        LinearGradient(
            colors: [Color(red: 0.95, green: 0.78, blue: 0.30), Color(red: 0.78, green: 0.55, blue: 0.10)],
            startPoint: .top, endPoint: .bottom
        )
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(goldGradient)
                    .padding(.top, 4)

                Text("Recurso VIP")
                    .font(.headline)
                    .foregroundStyle(goldGradient)

                Text("Abra o IronTracks no iPhone pra fazer o upgrade e usar treinos no Watch.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 4)

                Button(action: { dismiss() }) {
                    Text("OK")
                        .font(.caption.bold())
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)
                .tint(.yellow)
                .padding(.top, 2)
            }
            .padding(.horizontal, 6)
        }
        .navigationTitle("VIP")
    }
}

#Preview {
    VipGatePaywallView()
}
