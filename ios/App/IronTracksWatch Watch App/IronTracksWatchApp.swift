//
//  IronTracksWatchApp.swift
//  IronTracksWatch
//
//  Entry point do app Watch.
//

import SwiftUI

@main
struct IronTracksWatchApp: App {

    @StateObject private var session = WatchSessionManager.shared
    @StateObject private var health = HealthKitManager.shared
    @StateObject private var location = LocationManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(session)
                .environmentObject(health)
                .environmentObject(location)
                .task {
                    await health.requestAuthorization()
                }
        }
    }
}
