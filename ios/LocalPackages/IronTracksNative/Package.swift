// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "IronTracksNative",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "IronTracksNative",
            targets: ["IronTracksNative"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", "7.0.0"..<"9.0.0"),
        .package(path: "../IronTracksLiveActivityShared")
    ],
    targets: [
        .target(
            name: "IronTracksNative",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "IronTracksLiveActivityShared", package: "IronTracksLiveActivityShared")
            ],
            path: "ios/Sources/IronTracksNative",
            linkerSettings: [
                .linkedFramework("HealthKit"),
                .linkedFramework("CoreMotion"),
                .linkedFramework("LocalAuthentication"),
                .linkedFramework("CoreSpotlight"),
            ]
        )
    ]
)
