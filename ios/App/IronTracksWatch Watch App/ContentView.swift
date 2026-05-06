//
//  ContentView.swift
//  IronTracksWatch
//
//  TabView raiz com paginação horizontal entre as 4 telas principais.
//

import SwiftUI

struct ContentView: View {

    @EnvironmentObject var session: WatchSessionManager

    var body: some View {
        TabView {
            DashboardView()
                .tag(0)

            WorkoutView()
                .tag(1)

            CardioView()
                .tag(2)

            CheckinView()
                .tag(3)
        }
        .tabViewStyle(.page)
    }
}

#Preview {
    ContentView()
        .environmentObject(WatchSessionManager.shared)
        .environmentObject(HealthKitManager.shared)
        .environmentObject(LocationManager.shared)
}
