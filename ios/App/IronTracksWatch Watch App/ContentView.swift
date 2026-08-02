//
//  ContentView.swift
//  IronTracksWatch
//
//  TabView raiz com paginação horizontal entre as 4 telas principais.
//  A seleção é estado explícito pra que uma complication possa abrir o app já na
//  aba certa — tocar em "Treino de hoje" no mostrador cai direto no treino.
//

import SwiftUI

struct ContentView: View {

    @EnvironmentObject var session: WatchSessionManager

    @State private var selection: Tab = .dashboard

    enum Tab: Int, Hashable {
        case dashboard, workout, cardio, checkin

        /// Mapeia o último componente da URL da complication pra uma aba.
        init?(deepLink component: String) {
            switch component {
            case "dashboard": self = .dashboard
            case "workout": self = .workout
            case "cardio": self = .cardio
            case "checkin": self = .checkin
            default: return nil
            }
        }
    }

    var body: some View {
        TabView(selection: $selection) {
            DashboardView().tag(Tab.dashboard)
            WorkoutView().tag(Tab.workout)
            CardioView().tag(Tab.cardio)
            CheckinView().tag(Tab.checkin)
        }
        .tabViewStyle(.page)
        .onOpenURL { url in
            // irontracks://watch/<aba>
            guard let last = url.pathComponents.last(where: { $0 != "/" }),
                  let tab = Tab(deepLink: last) else { return }
            selection = tab
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(WatchSessionManager.shared)
        .environmentObject(HealthKitManager.shared)
        .environmentObject(LocationManager.shared)
}
