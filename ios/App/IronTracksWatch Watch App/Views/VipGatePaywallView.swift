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
        Brand.goldGradient
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
                .tint(Brand.goldLight)
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
